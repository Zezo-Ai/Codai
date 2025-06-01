"""Chat completion request handlers."""

import os
import json
from typing import Dict, Any, Optional, Generator
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse
from anthropic import Anthropic

from core.api_client import sampling_loop
from core.api.conversation import ConversationPreparator, PreparedConversation
from core.config_manager import get_config
from core.configuration import get_system_prompt
from core.types import ChatCompletionRequest, APIProvider
from core.api.expert_mode import ExpertModeAnalyzer

from .utils import get_tool_collection, filter_tool_output
from .message_handler import (
    format_sse_data, format_tool_error, format_message_with_type
)
from .state import (
    get_session_messages, set_session_messages,
    ensure_session_exists, SessionState
)
from .chat_tool_handler import create_tool_callback, handle_tool_request
from debug.debug_logger import debug
from .api_key_helper import get_api_key

def _get_content_type(content: Any) -> str:
    """Safely get content type from any content object."""
    if isinstance(content, dict):
        return content.get("type", "text")
    if hasattr(content, "type"):
        return getattr(content, "type")
    return "text"

class ChatHandler:
    """Chat completion handler with focused logging."""
    
    def __init__(self, request: Request, chat_request: ChatCompletionRequest):
        self.request = request
        self.chat_request = chat_request
        self.session_id = None
        self.tool_collection = None
        self.chunks_sent = 0
        self.current_response = []  # Collect response chunks
    
    async def initialize(self):
        """Initialize handler state."""
        try:
            raw_data = await self.request.json()
            metadata = raw_data.get('metadata', {})
            self.model = raw_data.get('model')  # Extract model from raw request
            session_id = metadata.get('session_id')
            
            if not session_id:
                debug.log(
                    event="initialization_warning",
                    data={"warning": "No session_id in metadata, using default"},
                    category="CONVERSATION_TOOL_USE"
                )
                session_id = 'default'
                
            self.session_id = session_id
            
        except Exception as e:
            debug.log(
                event="initialization_error",
                data={"error": str(e)},
                category="CONVERSATION_TOOL_USE"
            )
            self.session_id = 'default'
    
    async def _stream_response(self) -> Generator:
        """Generate streaming response with session support."""
        try:
            
            # Ensure we have a session ID
            if not self.session_id:
                yield format_sse_data(format_tool_error("No session ID provided"))
                return

            # Get session first since we need it for tool collection
            session = ensure_session_exists(self.session_id)

            # Initialize tool collection
            self.tool_collection = get_tool_collection(
                headers=dict(self.request.headers),
                tool_callback=create_tool_callback(session)
            )

            # Create new message
            current_message = {
                "role": self.chat_request.messages[-1].role,
                "content": [{"type": "text", "text": self.chat_request.messages[-1].content}]
            }
            set_session_messages(session, [current_message])
            
            # Get messages for API
            messages = get_session_messages(session, use_short=True)
            
            # Start streaming
            yield format_sse_data({"choices": [{"delta": {"role": "assistant"}}]})
            
            # Filter messages
            filtered_messages = [m for m in messages if m.get("content")]
            
            # Import model configuration
            from .model_config import validate_model
            
            # Get model from request and validate
            requested_model = getattr(self, 'model', None)
            model = validate_model(requested_model)
            
            # Log which model is being used
            debug.log(
                event="model_selection",
                session_id=self.session_id,
                data={
                    "requested_model": requested_model,
                    "final_model": model,
                    "from_request": bool(requested_model),
                    "validated": requested_model == model
                },
                category="MODEL_USAGE"
            )
            
            # Check if expert mode is enabled
            config = get_config()
            expert_mode_enabled = config.get('ai.expert_mode.enabled', False)
            
            print(f"[EXPERT MODE DEBUG] Config check - enabled: {expert_mode_enabled}")
            print(f"[EXPERT MODE DEBUG] Config value: {config.get('ai.expert_mode', {})}")
            print(f"[EXPERT MODE DEBUG] Filtered messages count: {len(filtered_messages)}")
            
            debug.log(
                event="expert_mode_check",
                session_id=self.session_id,
                data={
                    "enabled": expert_mode_enabled,
                    "config_value": config.get('ai.expert_mode', {}),
                    "message_count": len(filtered_messages)
                },
                category="EXPERT_MODE"
            )
            
            # Initialize variables for expert mode
            enhanced_system_prompt = get_system_prompt()
            enhanced_messages = filtered_messages
            
            if expert_mode_enabled:
                print(f"[EXPERT MODE DEBUG] EXPERT MODE IS ENABLED - Starting Phase 1")
                
                debug.log(
                    event="expert_mode_activated",
                    session_id=self.session_id,
                    data={
                        "starting_phase1": True,
                        "filtered_messages_count": len(filtered_messages)
                    },
                    category="EXPERT_MODE"
                )
                
                # Get the last user message for analysis
                last_user_message = None
                for msg in reversed(filtered_messages):
                    if msg.get("role") == "user":
                        # Extract text content from message
                        content = msg.get("content", [])
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    last_user_message = block.get("text", "")
                                    break
                        elif isinstance(content, str):
                            last_user_message = content
                        break
                
                if last_user_message:
                    debug.log(
                        event="expert_mode_user_message_found",
                        session_id=self.session_id,
                        data={
                            "message_length": len(last_user_message),
                            "message_preview": last_user_message[:100] + "..." if len(last_user_message) > 100 else last_user_message
                        },
                        category="EXPERT_MODE"
                    )
                    
                    # Notify UI that expert mode is analyzing
                    yield format_sse_data({
                        "type": "expert_mode_status",
                        "status": "analyzing",
                        "message": "🎯 Analyzing request for optimal expertise..."
                    })
                    
                    # Create expert mode analyzer
                    api_key = get_api_key(self.request)
                    anthropic_client = Anthropic(api_key=api_key)
                    analyzer = ExpertModeAnalyzer(anthropic_client)
                    
                    # Phase 1: Analyze the request
                    analysis = await analyzer.analyze_request(last_user_message, model)
                    
                    if analysis:
                        debug.log(
                            event="expert_mode_analysis_complete",
                            session_id=self.session_id,
                            data={
                                "domain": analysis.get("domain"),
                                "request_type": analysis.get("request_type")
                            },
                            category="EXPERT_MODE"
                        )
                        
                        # Enhance system prompt with expert knowledge
                        enhanced_system_prompt = analyzer.enhance_system_prompt(
                            enhanced_system_prompt,
                            analysis.get("expert_prompt", "")
                        )
                        
                        # Replace the last user message with enhanced version
                        enhanced_request = analysis.get("enhanced_request", last_user_message)
                        enhanced_messages = filtered_messages.copy()
                        for i in range(len(enhanced_messages) - 1, -1, -1):
                            if enhanced_messages[i].get("role") == "user":
                                # Update the message content with enhanced request
                                enhanced_messages[i] = {
                                    "role": "user",
                                    "content": [{"type": "text", "text": enhanced_request}]
                                }
                                break
                    else:
                        debug.log(
                            event="expert_mode_analysis_failed",
                            session_id=self.session_id,
                            data={
                                "reason": "No analysis result returned"
                            },
                            category="EXPERT_MODE"
                        )
                else:
                    debug.log(
                        event="expert_mode_no_user_message",
                        session_id=self.session_id,
                        data={
                            "reason": "Could not find last user message",
                            "messages_checked": len(filtered_messages)
                        },
                        category="EXPERT_MODE"
                    )
            
            async for chunk in sampling_loop(
                model=model,
                provider=APIProvider.ANTHROPIC,
                system_prompt=enhanced_system_prompt,
                messages=enhanced_messages,
                output_callback=lambda x: None,
                tool_output_callback=create_tool_callback(session),
                api_key=get_api_key(self.request),
                tool_collection=self.tool_collection,
                conversation=session.conversation,
                handler_session_id=self.session_id,
                session=session
            ):
                if await self.request.is_disconnected():
                    break
                
                self.chunks_sent += 1
                
                if chunk["type"] == "chunk":
                    content = filter_tool_output(chunk["chunk"])
                    if isinstance(content, str) and content.strip():
                        self.current_response.append(content)
                        
                        # Explicitly craft a message with clear role indication
                        message = format_message_with_type(content, "text", None, role="assistant")
                        
                        # For debugging, log what we're sending in full
                        formatted_data = format_sse_data(message)
                        debug.log(
                            event="sending_to_ui",
                            data={"message": formatted_data[:200]},
                            category="CHAT_STREAM"
                        )
                        
                        # Send to client
                        yield formatted_data
                
                elif chunk["type"] == "action":
                    yield handle_tool_request(session, chunk)
                    
                elif chunk["type"] == "error":
                    yield format_sse_data(format_tool_error(chunk.get('content')))
                
                elif chunk["type"] == "messages":
                    yield format_sse_data(chunk)
                    
                # Handle thinking events to ensure they get the proper assistant role
                elif chunk["type"] in ["thinking_block_start", "thinking_block_end", "thinking_chunk", "extended_thinking_status"]:
                    # Make sure the role is explicitly set to "assistant" for thinking blocks
                    if "role" not in chunk:
                        chunk["role"] = "assistant"
                        
                    # Enhanced logging to confirm role is being sent
                    debug.log(
                        event="thinking_event",
                        data={
                            "role": chunk.get('role', 'MISSING'),
                            "type": chunk['type']
                        },
                        category="THINKING_STREAM"
                    )
                    
                    yield format_sse_data(chunk)
            
            # Add complete response if any
            if self.current_response:
                complete_response = {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "".join(self.current_response)}]
                }
                set_session_messages(session, [complete_response])
                self.current_response = []

            # Log final state
            debug.log(
                event="complete_conversation_state",
                session_id=self.session_id,
                category="CONVERSATION_TOOL_USE",
                data={
                    "session_messages": [
                        {
                            "index": idx,
                            "role": msg["role"],
                            "content": msg["content"],
                            "content_types": [_get_content_type(c) for c in msg["content"]]
                        }
                        for idx, msg in enumerate(session.messages)
                    ],
                    "counts": {
                        "session_messages": len(session.messages),
                        "conversation_turns": len(session.conversation.turns)
                    }
                }
            )

            # Send completion
            yield format_sse_data({
                "choices": [{
                    "delta": {
                        "content": "",
                        "finish_reason": "stop"
                    }
                }]
            })
            
        except Exception as e:
            yield format_sse_data(format_tool_error(str(e)))

async def handle_chat_completion(request: Request, chat_request: ChatCompletionRequest):
    """Main chat completion endpoint."""
    try:
        handler = ChatHandler(request, chat_request)
        await handler.initialize()
        
        return StreamingResponse(
            handler._stream_response(),
            media_type="text/event-stream",
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Content-Type': 'text/event-stream;charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))