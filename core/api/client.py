"""API client with conversation handling and extended thinking capabilities."""

# Standard library imports
import json
import os
import re
from typing import Any, Callable, List, Dict, Optional

# Core imports
from ..types import APIProvider
from ..types.token_usage import TokenUsage
from ..config_manager import get_config
from debug.debug_logger import debug

# External API imports
from anthropic import Anthropic
from anthropic.types.beta import (
    BetaContentBlock,
    BetaRawContentBlockDeltaEvent,
    BetaRawContentBlockStartEvent,
    BetaRawContentBlockStopEvent,
)

# Server & Tools imports
from server.routes.chat.state import set_session_messages
from tools.base import ToolResult
from tools.collection import ToolCollection

# Local imports
from .conversation import (
    ConversationPreparator,
    TokenCounter
)
from .handlers import _create_response
from .processors import _process_tool_results
from .thinking_cleaner import contains_thinking_blocks, force_enable_thinking


def _determine_thinking_budget(config: Any, session: Any, messages: List[Dict]) -> int:
    """
    Dynamically determine the token budget for extended thinking based on task complexity.
    
    Args:
        config: Application configuration
        session: Current session object
        messages: Current conversation messages
        
    Returns:
        Token budget for extended thinking (integer)
    """
    # Default token budgets from config
    default_budget = config.get('ai.extended_thinking.settings.budget_tokens', 5000)
    simple_budget = config.get('ai.extended_thinking.settings.scaling_settings.simple_tasks', 1024)
    standard_budget = config.get('ai.extended_thinking.settings.scaling_settings.standard_tasks', 4000)
    complex_budget = config.get('ai.extended_thinking.settings.scaling_settings.complex_tasks', 8000)
    very_complex_budget = config.get('ai.extended_thinking.settings.scaling_settings.very_complex_tasks', 16000)
    
    # Ensure minimum budget (Anthropic requires at least 1024)
    if simple_budget < 1024:
        simple_budget = 1024
    
    # If no messages, return default budget
    if not messages or len(messages) == 0:
        return max(default_budget, 1024)
        
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if msg.get('role') == 'user':
            latest_user_message = msg
            break
            
    if not latest_user_message:
        return max(default_budget, 1024)
        
    # Extract text from the latest user message
    message_text = ""
    for content in latest_user_message.get('content', []):
        if isinstance(content, dict) and content.get('type') == 'text' and 'text' in content:
            message_text += content['text'] + "\n"
        elif isinstance(content, str):
            message_text += content + "\n"
    
    # If message is empty after processing, return default budget
    if not message_text.strip():
        return max(default_budget, 1024)
    
    # Score complexity - start with 0
    complexity_score = 0
    
    # Check for very complex task patterns (math, physics, complex coding, system design)
    very_complex_patterns = [
        r'(solve|calculate|compute|find|determine).*?(equation|integral|derivative|proof)',
        r'(complex analysis|multi-step proof|mathematical induction|theorem|lemma)',
        r'(optimize|design|architect).*?(system|algorithm|database|infrastructure)',
        r'(implementation|build from scratch|detailed design|detailed implementation)'
    ]
    
    # Check for complex task patterns
    complex_patterns = [
        r'(compare|contrast|analyze|evaluate|synthesize|critique)',
        r'(step[ -]by[ -]step|detailed plan|explain in detail)',
        r'(multiple|several|various) (approaches|solutions|methods|options)',
        r'(code|function|class|method|algorithm).*?(implement|create|write)',
        r'(debug|refactor|optimize).*?(code|algorithm|system)'
    ]
    
    # Check for standard task patterns
    standard_patterns = [
        r'(how|what|why|when|explain|describe|tell me about)',
        r'(summarize|review|provide feedback)',
        r'(generate|create|write).*?(text|content|paragraph|description)',
        r'(help.*?with|assist.*?with|guide.*?through)'
    ]
    
    # Check for very complex patterns (highest priority)
    for pattern in very_complex_patterns:
        if re.search(pattern, message_text, re.IGNORECASE):
            complexity_score += 3
            debug.log(
                event="complexity_assessment",
                data={"pattern_type": "very_complex", "pattern": pattern, "score_addition": 3},
                category="EXTENDED_THINKING"
            )
    
    # Check for complex patterns
    for pattern in complex_patterns:
        if re.search(pattern, message_text, re.IGNORECASE):
            complexity_score += 2
            debug.log(
                event="complexity_assessment",
                data={"pattern_type": "complex", "pattern": pattern, "score_addition": 2},
                category="EXTENDED_THINKING"
            )
    
    # Check for standard patterns
    for pattern in standard_patterns:
        if re.search(pattern, message_text, re.IGNORECASE):
            complexity_score += 1
            debug.log(
                event="complexity_assessment",
                data={"pattern_type": "standard", "pattern": pattern, "score_addition": 1},
                category="EXTENDED_THINKING"
            )
    
    # Message length contributes to complexity
    word_count = len(message_text.split())
    if word_count > 300:
        complexity_score += 2
    elif word_count > 150:
        complexity_score += 1
    
    # Determine budget based on complexity score
    if complexity_score >= 5:
        budget = very_complex_budget
        complexity_category = "very_complex"
    elif complexity_score >= 3:
        budget = complex_budget
        complexity_category = "complex"
    elif complexity_score >= 1:
        budget = standard_budget
        complexity_category = "standard"
    else:
        budget = simple_budget
        complexity_category = "simple"
    
    # Log the determined budget
    debug.log(
        event="thinking_budget_determined",
        data={
            "complexity_score": complexity_score,
            "complexity_category": complexity_category,
            "token_budget": budget,
            "message_word_count": word_count
        },
        category="EXTENDED_THINKING"
    )
    
    return budget

def _should_use_extended_thinking(config: Any, session: Any, messages: List[Dict]) -> bool:
    """
    Determine if extended thinking should be used for this request.
    
    Args:
        config: Application configuration
        session: Current session object
        messages: Current conversation messages
        
    Returns:
        Boolean indicating whether extended thinking should be used
    """
    # Start logging with initial message text
    debug.log(
        event="extended_thinking_detection_start",
        data={
            "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
        },
        category="EXTENDED_THINKING"
    )
    
    # Check if extended thinking is globally enabled
    if not config.get('ai.extended_thinking.enabled', False):
        debug.log(
            event="extended_thinking_detection_failed",
            data={
                "reason": "feature_disabled",
                "message": "Extended thinking is globally disabled in configuration",
                "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
            },
            category="EXTENDED_THINKING"
        )
        return False
        
    # Check if auto-detect is disabled (manual mode)
    if not config.get('ai.extended_thinking.auto_detect', True):
        # In manual mode, check if extended thinking was explicitly requested
        result = getattr(session, 'use_extended_thinking', False)
        debug.log(
            event="extended_thinking_detection_manual",
            data={
                "auto_detect": False,
                "manual_setting": result,
                "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
            },
            category="EXTENDED_THINKING"
        )
        return result
    
    # If no messages, can't determine complexity
    if not messages or len(messages) == 0:
        debug.log(
            event="extended_thinking_detection_failed",
            data={
                "reason": "no_messages",
                "message": "No messages available for complexity detection",
                "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
            },
            category="EXTENDED_THINKING"
        )
        return False
        
    # Get the latest user message
    latest_user_message = None
    for msg in reversed(messages):
        if msg.get('role') == 'user':
            latest_user_message = msg
            break
            
    if not latest_user_message:
        debug.log(
            event="extended_thinking_detection_failed",
            data={
                "reason": "no_user_message",
                "message": "No user message found in conversation",
                "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
            },
            category="EXTENDED_THINKING"
        )
        return False
        
    # Extract text from the latest user message
    message_text = ""
    for content in latest_user_message.get('content', []):
        if isinstance(content, dict) and content.get('type') == 'text' and 'text' in content:
            message_text += content['text'] + "\n"
        elif isinstance(content, str):
            message_text += content + "\n"
    
    # If message is empty after processing, can't determine complexity
    if not message_text.strip():
        debug.log(
            event="extended_thinking_detection_failed",
            data={
                "reason": "empty_message",
                "message": "Message is empty after processing",
                "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
            },
            category="EXTENDED_THINKING"
        )
        return False
        
    # Log the message we're processing
    debug.log(
        event="extended_thinking_detection_message",
        data={
            "message_length": len(message_text),
            "word_count": len(message_text.split()),
            "message_excerpt": message_text[:100] + "..." if len(message_text) > 100 else message_text,
            "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
        },
        category="EXTENDED_THINKING"
    )
    
    # Check for complexity triggers if enabled
    if config.get('ai.extended_thinking.triggers.question_complexity', False):
        # Complex questions typically have multiple parts, analytical requirements
        complex_question_patterns = [
            r'(compare|contrast|analyze|evaluate|synthesize|critique)',
            r'(how would you|what is the best way to|what are the trade-offs)',
            r'(step[ -]by[ -]step|detailed plan|explain in detail)',
            r'(multiple|several|various) (approaches|solutions|methods|options)',
            r'(pros and cons|advantages and disadvantages)',
            r'(what if|hypothetical|scenario)'
        ]
        
        for pattern in complex_question_patterns:
            if re.search(pattern, message_text, re.IGNORECASE):
                debug.log(
                    event="extended_thinking_trigger_matched",
                    data={"trigger": "question_complexity", "pattern": pattern},
                    category="EXTENDED_THINKING"
                )
                return True
        
        debug.log(
            event="extended_thinking_trigger_check",
            data={"trigger": "question_complexity", "matched": False},
            category="EXTENDED_THINKING"
        )
    
    # Check for code generation triggers
    if config.get('ai.extended_thinking.triggers.code_generation', False):
        code_patterns = [
            r'(write|create|generate|implement).*?(code|function|class|method|algorithm)',
            r'(refactor|optimize|debug|fix|improve).*?(code|implementation)',
            r'(programming|coding|implementation).*?(challenge|problem|task)',
            r'(how to|how would you) (implement|code|program)'
        ]
        
        for pattern in code_patterns:
            if re.search(pattern, message_text, re.IGNORECASE):
                debug.log(
                    event="extended_thinking_trigger_matched",
                    data={"trigger": "code_generation", "pattern": pattern},
                    category="EXTENDED_THINKING"
                )
                return True
                
        debug.log(
            event="extended_thinking_trigger_check",
            data={"trigger": "code_generation", "matched": False},
            category="EXTENDED_THINKING"
        )
    
    # Check for analysis task triggers
    if config.get('ai.extended_thinking.triggers.analysis_tasks', False):
        analysis_patterns = [
            r'(analyze|analysis|examine|investigate|explore|study)',
            r'(identify patterns|find trends|extract insights)',
            r'(research|in-depth look|thorough examination)',
            r'(what does this mean|what are the implications|what can we learn)'
        ]
        
        for pattern in analysis_patterns:
            if re.search(pattern, message_text, re.IGNORECASE):
                debug.log(
                    event="extended_thinking_trigger_matched",
                    data={"trigger": "analysis_tasks", "pattern": pattern},
                    category="EXTENDED_THINKING"
                )
                return True
                
        debug.log(
            event="extended_thinking_trigger_check",
            data={"trigger": "analysis_tasks", "matched": False},
            category="EXTENDED_THINKING"
        )
    
    # Check for design task triggers
    if config.get('ai.extended_thinking.triggers.design_tasks', False):
        design_patterns = [
            r'(design|architect|structure|blueprint|plan)',
            r'(system design|architecture|infrastructure)',
            r'(scalable|maintainable|robust|resilient)',
            r'(high[ -]level design|detailed design)',
            r'(components|interfaces|services|modules)'
        ]
        
        for pattern in design_patterns:
            if re.search(pattern, message_text, re.IGNORECASE):
                debug.log(
                    event="extended_thinking_trigger_matched",
                    data={"trigger": "design_tasks", "pattern": pattern},
                    category="EXTENDED_THINKING"
                )
                return True
                
        debug.log(
            event="extended_thinking_trigger_check",
            data={"trigger": "design_tasks", "matched": False},
            category="EXTENDED_THINKING"
        )
    
    # Check for math and science problem triggers 
    if config.get('ai.extended_thinking.triggers.math_problems', False):
        math_patterns = [
            r'(solve|calculate|compute|find|determine).*?(equation|integral|derivative|proof)',
            r'(math|mathematical|calculus|algebra|geometry|trigonometry|statistics)',
            r'(physics|quantum|relativity|mechanics|thermodynamics)',
            r'(theorem|lemma|corollary|formula|equation)'
        ]
        
        for pattern in math_patterns:
            if re.search(pattern, message_text, re.IGNORECASE):
                debug.log(
                    event="extended_thinking_trigger_matched",
                    data={"trigger": "math_problems", "pattern": pattern},
                    category="EXTENDED_THINKING"
                )
                return True
                
        debug.log(
            event="extended_thinking_trigger_check",
            data={"trigger": "math_problems", "matched": False},
            category="EXTENDED_THINKING"
        )
    
    # Message didn't match any triggers
    debug.log(
        event="extended_thinking_detection_failed",
        data={
            "reason": "no_patterns_matched",
            "message": "Message didn't match any complexity patterns",
            "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
        },
        category="EXTENDED_THINKING"
    )
    return False



def prepare_messages_for_api(messages: List[dict]) -> List[dict]:
    """Add cache control markers to messages.
    
    Treats all content blocks within a message as one logical unit.
    Only marks the last 2 complete messages as ephemeral.
    """
    result = []
    user_messages_found = 0
    
    # Go through messages in reverse to find last 2 user messages
    for msg in reversed(messages):
        msg_copy = {"role": msg["role"], "content": []}
        
        # Only mark if it's a user message and one of the last 2
        should_mark_ephemeral = msg["role"] == "user" and user_messages_found < 2
        
        if should_mark_ephemeral:
            # If marking ephemeral, mark ALL blocks EXCEPT document blocks
            msg_copy["content"] = []
            for block in msg["content"]:
                block_copy = block.copy()
                
                # Only add cache control if it's NOT a document block
                if block.get("type") != "document":
                    block_copy["cache_control"] = {"type": "ephemeral"}
                    
                    # Log when applying cache control
                    debug.log(
                        event="cache_control_applied_to_block",
                        data={
                            "block_type": block.get("type", "unknown"),
                            "role": msg["role"]
                        },
                        category="CACHE_CONTROL"
                    )
                else:
                    # Log when skipping cache control for document blocks
                    debug.log(
                        event="cache_control_skipped_for_document",
                        data={"role": msg["role"]},
                        category="CACHE_CONTROL"
                    )
                
                msg_copy["content"].append(block_copy)
                
            user_messages_found += 1
        else:
            # Otherwise just copy the blocks without marking
            msg_copy["content"] = [
                block.copy()
                for block in msg["content"]
            ]
            
        result.insert(0, msg_copy)
    
    return result

async def sampling_loop(
    *,
    model: str,
    provider: APIProvider,
    system_prompt: str,
    session: Any,  # Session is required - it has messages and state
    output_callback: Callable[[BetaContentBlock], None],
    tool_output_callback: Callable[[ToolResult, str], None],
    api_key: str,
    tool_collection: ToolCollection,
    only_n_most_recent_images: int | None = None,
    max_tokens: int = None,
):
    """Main conversation loop with token counting and summarization."""
    from server.routes.metrics.router import token_metrics
    # Setup components
    config = get_config()
    client = Anthropic(api_key=api_key)
    preparator = ConversationPreparator(client)
    token_counter = TokenCounter(client)
    
    # Get configuration values
    max_tokens = (
        max_tokens or 
        config.get('ai.models.claude3.max_tokens_per_message') or 
        8192
    )
    
    while True:
        try:
            # Prepare system message with cache control
            existing_cache = sum(
                1 for msg in session.messages
                for block in msg.get("content", [])
                if (isinstance(block, dict) and block.get("cache_control") is not None) or
                   (hasattr(block, "cache_control") and block.cache_control is not None)
            )

            system = [{
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"} if existing_cache < 3 else None
            }]


            # Get token count and check summarization needs
            prepared = await preparator.prepare_for_api(
                messages=session.messages,
                system=system_prompt,
                tools=tool_collection.to_params(),
                only_n_most_recent_images=only_n_most_recent_images,
                session=session  # Session has everything we need
            )



            
            # Get the actual threshold configuration
            threshold_setting = config.get('ai.token_management.summary_triggers.threshold_percentage', 0.8)
            threshold_percentage = float(threshold_setting) * 100  # Convert from decimal to percentage
            
            # Always send token info to UI with both current usage and configured threshold
            yield {
                "type": "token_update",
                "token_count": prepared.token_count,
                "max_context_tokens": token_counter.max_context_tokens,
                "needs_summary": prepared.needs_summary,
                "current_percentage": round(prepared.token_count / token_counter.max_context_tokens * 100, 1),
                "config_threshold": round(threshold_percentage, 1)  # Send the actual threshold setting
            }

            # If summarization needed, return after sending token update
            if prepared.needs_summary:
                return
            
            # Process AI response
            response_content = []
            current_block = None
            
            # Track whether thinking will be enabled for this request
            will_use_thinking = False
            
            # We'll no longer remove thinking blocks - instead we'll enable thinking
            # when needed based on message content
            
            # Add cache control markers to messages
            messages_with_cache = prepare_messages_for_api(session.messages)
            
            # Filter tools based on model capabilities (for token counting)
            tools_params = tool_collection.to_params()
            
            # Get model capabilities from config
            models_config = config.get('models', {})
            model_info = models_config.get(model, {})
            supports_text_editor = model_info.get('supports_tools', {}).get('text_editor', True)
            
            if not supports_text_editor:
                # Filter out text editor tool if not supported
                tools_params = [tool for tool in tools_params if tool.get('type') != 'text_editor_20250429']
            
            # Calculate safe max_tokens based on input size to avoid context limit errors
            input_token_count = token_counter.count_tokens(
                messages=messages_with_cache,
                system=system,
                tools=tools_params
            )
            
            context_window = config.get('ai.models.claude3.max_context_tokens', 200000)
            available_output_tokens = max(0, context_window - input_token_count)
            
            # Get model-specific max token limits from config
            models_config = config.get('models', {})
            model_info = models_config.get(model, {})
            model_max_tokens = model_info.get('max_tokens', 32000)
            
            safe_max_tokens = min(model_max_tokens, available_output_tokens)
            
            debug.log(
                event="token_calculation",
                data={
                    "model": model,
                    "model_max_tokens": model_max_tokens,
                    "input_tokens": input_token_count,
                    "context_window": context_window,
                    "available_output_tokens": available_output_tokens,
                    "safe_max_tokens": safe_max_tokens,
                    "original_max_tokens": max_tokens
                },
                category="API_REQUEST"
            )

            # Get extended thinking configuration
            extended_thinking_enabled = config.get('ai.extended_thinking.enabled', False)
            
            # Create API parameters with thinking explicitly DISABLED by default
            api_params = {
                "max_tokens": safe_max_tokens,  # Use calculated safe value instead of config value
                "messages": messages_with_cache,
                "model": model,
                "system": system,
                "tools": tools_params,
                "betas": ["computer-use-2025-01-24"] #, "output-128k-2025-02-19", "token-efficient-tools-2025-02-19"
            }
            
            # Log that we're using the original messages without sanitization
            debug.log(
                event="using_original_messages",
                data={
                    "message_count": len(session.messages) if session.messages else 0,
                    "will_check_thinking_compatibility": True
                },
                category="API_REQUEST"
            )
            
            # Log extended thinking configuration check
            debug.log(
                event="extended_thinking_check",
                data={
                    "enabled_in_config": extended_thinking_enabled,
                    "model_name": model,
                    "model_check": model.startswith("claude-3-7-sonnet"),
                    "condition_pass": extended_thinking_enabled and model.startswith("claude-3-7-sonnet")
                },
                category="EXTENDED_THINKING"
            )
            
            # We'll check for thinking blocks in the compatibility check,
            # but this initial part is just focused on active extended thinking
            
            # Check if this conversation should use active extended thinking features
            actively_use_extended = False
            if extended_thinking_enabled and model.startswith("claude-3-7-sonnet"):
                actively_use_extended = _should_use_extended_thinking(
                    config=config,
                    session=session,
                    messages=session.messages
                )
            
            # Log the extended thinking decision
            debug.log(
                event="extended_thinking_decision",
                data={
                    "actively_use_extended": actively_use_extended,
                    "thinking_initially_enabled": actively_use_extended,  # Will check for compatibility later
                    "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
                },
                category="EXTENDED_THINKING"
            )
            
            # Only enable thinking when actively using it
            if actively_use_extended:
                # Dynamically determine budget tokens based on task complexity
                budget_tokens = _determine_thinking_budget(
                    config=config, 
                    session=session, 
                    messages=session.messages
                )
                
                # Determine complexity category based on budget tokens
                complexity_category = "standard"
                if budget_tokens <= 1024:
                    complexity_category = "simple"
                elif budget_tokens <= 4000:
                    complexity_category = "standard"
                elif budget_tokens <= 8000:
                    complexity_category = "complex"
                else:
                    complexity_category = "very_complex"
                
                # Store complexity category in session for UI display
                setattr(session, "thinking_complexity", complexity_category)
                
                # Add thinking parameter to API params
                api_params["thinking"] = {
                    "type": "enabled",
                    "budget_tokens": budget_tokens
                }
                
                # Mark that thinking is enabled for this request
                will_use_thinking = True
                
                debug.log(
                    event="extended_thinking_enabled",
                    data={
                        "session_id": session.session_id if hasattr(session, "session_id") else "unknown",
                        "budget_tokens": budget_tokens,
                        "model": model,
                        "complexity_category": complexity_category
                    },
                    category="API_REQUEST"
                )
                
                # Notify UI about active extended thinking
                thinking_indicator = config.get('ai.extended_thinking.ui.thinking_indicator', "Thinking deeply...")
                yield {
                    "type": "extended_thinking_status",
                    "status": "started",
                    "message": thinking_indicator,
                    "role": "assistant" # Explicitly set role to assistant
                }
            
            # CRITICAL FIX: Check if messages contain thinking blocks
            has_thinking = contains_thinking_blocks(api_params["messages"])
            
            # If thinking blocks exist in messages, ensure thinking is enabled
            if has_thinking:
                # Only modify API params if thinking is not already enabled
                if not will_use_thinking or "thinking" not in api_params:
                    debug.log(
                        event="CRITICAL_FIX_thinking_blocks_detected",
                        data={
                            "reason": "Messages contain thinking blocks, forcing thinking parameter",
                            "action": "will_use_thinking was " + ("True" if will_use_thinking else "False"),
                            "thinking_in_params": "thinking" in api_params,
                            "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
                        },
                        category="THINKING_FIX"
                    )
                    
                    # Force enable thinking
                    api_params = force_enable_thinking(api_params)
                    
                    # Only update the flag if it wasn't already true
                    if not will_use_thinking:
                        will_use_thinking = True
            
            # Log the exact system prompt being sent to AI API
            debug.log(
                event="system_prompt_sent_to_api",
                data={
                    "system_prompt": api_params.get("system"),
                    "system_prompt_length": len(str(api_params.get("system", ""))),
                    "system_prompt_preview": str(api_params.get("system", ""))[:200] + "..." if len(str(api_params.get("system", ""))) > 200 else str(api_params.get("system", "")),
                    "model": api_params.get("model"),
                    "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
                },
                category="EXPERT_MODE"
            )
            
            # Start API stream using a context manager with the configured parameters
            stream_context = client.beta.messages.stream(**api_params)
            

            
            # Use the context manager pattern to handle streaming
            with stream_context as stream:
                # Wrap the iteration in a try/except block for error handling
                try:
                    # Use standard for loop as the stream object is properly iterable
                    for chunk_index, chunk in enumerate(stream):
                        
                        # Handle token usage from response chunks
                        if hasattr(chunk, 'usage'):
                            usage = TokenUsage.from_api_usage(chunk.usage)
                            token_metrics.update_from_usage(usage)
                        elif hasattr(chunk, 'message') and hasattr(chunk.message, 'usage'):
                            usage = TokenUsage.from_api_usage(chunk.message.usage)
                            token_metrics.update_from_usage(usage)
                        
                        # Process content blocks
                        if isinstance(chunk, BetaRawContentBlockStartEvent):
                            current_block = chunk.content_block
                            
                            # Handle start of thinking blocks for native extended thinking
                            if current_block.type == "thinking":
                                # Check if we should show thinking blocks
                                show_thinking = config.get('ai.extended_thinking.settings.show_thinking', True)
                                thinking_prefix = config.get('ai.extended_thinking.ui.thinking_prefix', '🧠')
                                
                                # Add complexity metadata to thinking block
                                complexity = getattr(session, "thinking_complexity", "standard")
                                token_budget = int(api_params.get("thinking", {}).get("budget_tokens", 0))
                                
                                # Don't add unsupported metadata to the block
                                # API is rejecting these extra fields
                                # Just use the metadata for the UI notification only
                                
                                # Notify UI that we're starting a thinking block
                                if show_thinking:
                                    yield {
                                        "type": "thinking_block_start",
                                        "prefix": thinking_prefix,
                                        "complexity": complexity,
                                        "token_budget": token_budget,
                                        "role": "assistant" # Explicitly set role to assistant
                                    }
                                    
                                # Mark that we're in a thinking block
                                setattr(session, 'in_thinking_block', True)
                                
                            elif current_block.type == "redacted_thinking":
                                # Handle redacted thinking blocks
                                show_thinking = config.get('ai.extended_thinking.settings.show_thinking', True)
                                redacted_indicator = config.get(
                                    'ai.extended_thinking.ui.redacted_indicator', 
                                    "Some thinking has been temporarily obscured for safety purposes."
                                )
                                
                                if show_thinking:
                                    yield {
                                        "type": "redacted_thinking",
                                        "message": redacted_indicator
                                    }
                                    
                            # Reset thinking flag when entering a regular text block
                            elif current_block.type == "text":
                                setattr(session, 'in_thinking_block', False)
                            
                        elif isinstance(chunk, BetaRawContentBlockDeltaEvent):
                            # Skip initial role message
                            if hasattr(chunk.delta, 'role'):
                                continue
                                
                            # Handle extended thinking delta events
                            if hasattr(chunk.delta, 'type'):
                                # Handle thinking delta content for native extended thinking
                                if chunk.delta.type == "thinking_delta":
                                    # Check if we should show thinking blocks
                                    show_thinking = config.get('ai.extended_thinking.settings.show_thinking', True)
                                    
                                    if show_thinking and hasattr(chunk.delta, 'thinking'):
                                        yield {
                                            "type": "thinking_chunk",
                                            "chunk": chunk.delta.thinking,
                                            "role": "assistant" # Explicitly set role to assistant
                                        }
                                        
                                    # Always update the current block
                                    if current_block and current_block.type == "thinking":
                                        if not hasattr(current_block, "thinking"):
                                            current_block.thinking = ""
                                        current_block.thinking += chunk.delta.thinking
                                        
                                # Handle signature_delta for thinking blocks
                                elif chunk.delta.type == "signature_delta":
                                    # Just store the signature, don't yield to client
                                    if current_block and (current_block.type == "thinking" or current_block.type == "redacted_thinking"):
                                        current_block.signature = chunk.delta.signature
                                        
                                        # Log signature capture for debugging
                                        debug.log(
                                            event="thinking_signature_received",
                                            data={
                                                "block_type": current_block.type,
                                                "signature_length": len(chunk.delta.signature) if chunk.delta.signature else 0,
                                                "session_id": session.session_id if hasattr(session, "session_id") else "unknown"
                                            },
                                            category="EXTENDED_THINKING"
                                        )
                                        
                                # Handle regular text delta
                                elif chunk.delta.type == "text_delta":
                                    # Always yield text chunks for regular text blocks with role
                                    text_chunk = {
                                        "type": "chunk", 
                                        "chunk": chunk.delta.text,
                                        "role": "assistant"  # Explicitly set role for all text chunks
                                    }
                                    
                                    # Debug log to confirm role
                                    debug.log(
                                        event="text_chunk_with_role",
                                        data={
                                            "role": text_chunk["role"],
                                            "content_length": len(chunk.delta.text),
                                            "content_sample": chunk.delta.text[:20] if len(chunk.delta.text) > 20 else chunk.delta.text
                                        },
                                        category="TEXT_DELTA"
                                    )
                                    
                                    yield text_chunk
                                    
                                    # Update the current block
                                    if current_block and current_block.type == "text":
                                        if not hasattr(current_block, "text"):
                                            current_block.text = ""
                                        current_block.text += chunk.delta.text
                                        
                                # Handle tool use (input_json_delta)
                                elif chunk.delta.type == "input_json_delta":
                                    # Track if this is the first tool call
                                    is_first_tool = not any(item.type == 'tool_use' for item in response_content)
                                    
                                    # Only yield action for first tool
                                    if is_first_tool:
                                        yield {
                                            "type": "action", 
                                            "chunk": chunk.delta.partial_json,
                                            "role": "assistant"  # Explicitly set role for all tool/action chunks
                                        }
                                    
                                    # Update the current block
                                    if current_block and current_block.type == "tool_use":
                                        if not hasattr(current_block, "partial_json"):
                                            current_block.partial_json = ""
                                        current_block.partial_json += chunk.delta.partial_json
                                    
                        elif isinstance(chunk, BetaRawContentBlockStopEvent):
                            if current_block:
                                # Handle the completion of a thinking block
                                if current_block.type == "thinking":
                                    # Signal the UI that we're ending a thinking block
                                    show_thinking = config.get('ai.extended_thinking.settings.show_thinking', True)
                                    if show_thinking:
                                        yield {
                                            "type": "thinking_block_end",
                                            "role": "assistant" # Explicitly set role to assistant
                                        }
                                    
                                    # Add to response content to be stored
                                    response_content.append(current_block)
                                
                                # Handle redacted thinking blocks
                                elif current_block.type == "redacted_thinking":
                                    # Add to response content to be stored
                                    response_content.append(current_block)
                                
                                # Handle tool use blocks
                                elif hasattr(current_block, "partial_json"):
                                    current_block.input = json.loads(current_block.partial_json)
                                    delattr(current_block, "partial_json")
                                    
                                    # Only add tool_use block if it's the first one
                                    if current_block.type == 'tool_use':
                                        is_first_tool = not any(item.type == 'tool_use' for item in response_content)
                                        if not is_first_tool:
                                            current_block = None
                                            continue
                                
                                # Add all other block types to response
                                if current_block.type != "thinking" and current_block.type != "redacted_thinking":
                                    response_content.append(current_block)
                                    
                                current_block = None
                except Exception as e:
                    raise
            
            # Create and add response
            response = _create_response(response_content, model)
            
            # Handle response content
            if response.content:
                # Separate text content and tools
                text_content = []
                all_tools = []
                
                # Collect all text content and tools
                for item in response.content:
                    if hasattr(item, 'type'):
                        if item.type == 'tool_use':
                            all_tools.append(item)
                        else:
                            text_content.append(item)
                            


                # Store complete response with all content
                if response.content:
                    # Store complete response
                    set_session_messages(session, [{
                        "role": "assistant",
                        "content": response.content
                    }])
                    
                    # Prepare content to yield
                    if all_tools:
                        # Include everything up to the first tool - we'll process all tools,
                        # but we don't want to show all tool UI elements at once
                        yield_content = []
                        for item in response.content:
                            if hasattr(item, 'type') and item.type == 'tool_use':
                                yield_content.append(item)
                                break
                            yield_content.append(item)
                    else:
                        # No tools, yield everything
                        yield_content = response.content
                    
                    # Yield the content
                    yield {
                        "type": "messages",
                        "messages": [{
                            "role": "assistant",
                            "content": yield_content
                        }]
                    }

                    

                # Process tools if any exist
                if all_tools:
                    # Get the first tool for initial processing
                    first_tool = all_tools[0]
                    remaining_tools = all_tools[1:] if len(all_tools) > 1 else []
                    
                    # Process the first tool
                    tool_result_content = await _process_tool_results(
                        [first_tool],
                        tool_collection,
                        output_callback,
                        tool_output_callback
                    )
                    

                    # Handle result if any
                    if tool_result_content:
                        if isinstance(tool_result_content, (str, list)):
                            tool_use_id = first_tool.id if hasattr(first_tool, 'id') else None
                            
                            if isinstance(tool_result_content, list) and len(tool_result_content) > 0:
                                # Stream tool results with their own type
                                tool_content = tool_result_content[0].get('content', [])
                                if tool_content:
                                    text_content = None
                                    if isinstance(tool_content, list):
                                        # If list of items, look for dictionary with text type
                                        text_content = next((c for c in tool_content if isinstance(c, dict) and c.get('type') == 'text'), None)
                                    elif isinstance(tool_content, str):
                                        # If string, use it directly
                                        text_content = {'type': 'text', 'text': tool_content}
                                    
                                    if text_content:
                                        yield {
                                            "type": "tool_result",  # Mark as tool result
                                            "chunk": text_content.get('text', '')
                                        }

                            # Store the first tool result in session
                            set_session_messages(session, [{
                                "role": "user",
                                "content": tool_result_content
                            }])
                            
                            # Process remaining tools sequentially
                            for tool in remaining_tools:
                                debug.log(
                                    event="processing_remaining_tool",
                                    data={"tool_name": tool.name, "input": str(tool.input)[:100]},
                                    category="TOOL_PROCESSING"
                                )
                                
                                # Process this tool
                                next_tool_result = await _process_tool_results(
                                    [tool],
                                    tool_collection,
                                    output_callback,
                                    tool_output_callback
                                )
                                
                                # Add this tool's result to session
                                if next_tool_result:
                                    set_session_messages(session, [{
                                        "role": "user",
                                        "content": next_tool_result
                                    }])
                            
                            # CRITICAL FIX: Before continuing, check if we need to persist thinking state
                            # This is where the 'When thinking is disabled...' error occurs
                            # Check if any message contains thinking blocks before making the next API call
                            debug.log(
                                event="starting_next_api_call_after_tool",
                                data={
                                    "will_check_for_thinking_blocks": True,
                                    "processed_tools_count": len(all_tools)
                                },
                                category="THINKING_FIX"
                            )
                            
                            # Reset will_use_thinking for the next iteration
                            # We'll determine it again based on active use and message content
                            will_use_thinking = False
                            
                            # Continue the loop to get next AI response
                            continue

                else:
                    # If we reach here, there were no tool calls in the response
                    yield {
                        "type": "messages",
                        "messages": session.messages
                    }
                    break  # Break when no tools in response






        except Exception as e:
            error_dict = e.__dict__ if hasattr(e, '__dict__') else {}
            error_response = error_dict.get('response', {})
            
            # Handle API overload errors
            if (isinstance(error_response, dict) and 
                error_response.get('type') == 'error' and
                error_response.get('error', {}).get('type') == 'overloaded_error'):
                
                raise type(e)({
                    'type': 'error',
                    'error': {
                        'type': 'overloaded_error',
                        'message': 'Anthropic API is currently overloaded',
                        'details': error_response.get('error', {}).get('details')
                    }
                }) from e
            # Re-raise other exceptions
            raise