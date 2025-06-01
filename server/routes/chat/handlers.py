"""Chat completion request handlers."""

import os
import logging
import traceback
import asyncio
from typing import Dict, Any, Optional, AsyncGenerator
from fastapi import HTTPException, Request, Header
from fastapi.responses import StreamingResponse
from anthropic import Anthropic
from debug.debug_logger import debug

from core.api_client import sampling_loop
from .api_key_helper import get_api_key
# ConversationHistory import removed
from core.api.conversation import ConversationPreparator, PreparedConversation
from core.config_manager import get_config
from core.configuration import get_system_prompt
from core.types import ChatCompletionRequest, APIProvider
from core.api.expert_mode import ExpertModeAnalyzer
from tools.base import ToolResult, CLIResult, WebResult
from .utils import get_tool_collection, filter_tool_output
from .message_handler import (
    format_sse_data, format_tool_start, format_tool_complete,
    format_tool_error, format_image_data, format_text_message,
    format_message_with_type, format_file_data
)
from .web_handlers import format_web_search_result, format_web_fetch_result, format_web_interaction_result
from .message_cleaner import clean_json_prefixes, format_web_results
from .state import (
    get_session_messages, set_session_messages,
    get_session_screenshot, set_session_screenshot,
    get_session_file_content, set_session_file_content,
    get_or_create_session, initialize_session, SessionState
)

async def send_pending_tool_results(session: SessionState) -> AsyncGenerator[str, None]:
    """Check for and send any pending tool results from the session.
    This ensures tool results are always sent before token updates.
    
    Args:
        session: The current session state
        
    Yields:
        Formatted SSE data for any pending tool results
    """
    from .stream_tags import FILE_CONTENT_START, FILE_CONTENT_END, PDF_PROCESSING_START, PDF_PROCESSING_END
    
    # 1. Check for pending screenshots
    screenshot = get_session_screenshot(session)
    if screenshot:
        # First send tool result start tag
        yield format_sse_data({
            "type": "tool_result_start",
            "tool": "screenshot",
            "result_type": "image"
        })
        
        # Then send screenshot
        yield format_sse_data({
            "choices": [{
                "delta": {
                    "type": "screenshot",
                    "content": screenshot
                }
            }]
        })
        
        # End with tool result end tag
        yield format_sse_data({
            "type": "tool_result_end",
            "tool": "screenshot",
            "result_type": "image"
        })
        
        # Clear session screenshot
        set_session_screenshot(session, None)
    
    # 2. Handle any file content with proper start/end tags
    file_content = get_session_file_content(session)
    if file_content:
        try:
            # Extract metadata
            metadata = file_content.get('metadata', {})
            file_path = metadata.get('path', 'unknown_file')
            
            # 1. Send file content start tag
            yield format_sse_data({
                "type": FILE_CONTENT_START,
                "path": file_path,
                "metadata": {
                    "tool_result": True,
                    "result_type": "file",
                    "file_type": metadata.get("type", "text"),
                    "file_size": len(file_content.get('content', ''))
                }
            })
            
            # 2. Send the actual file content
            yield format_sse_data(format_file_data(
                file_content['content'],
                metadata
            ))
            
            # 3. Send file content end tag
            yield format_sse_data({
                "type": FILE_CONTENT_END,
                "path": file_path
            })
            
        except Exception as e:
            debug.log(
                event="file_content_error",
                data={
                    "error": str(e),
                    "file_content": str(type(file_content))
                },
                category="STREAM_PROCESSING"
            )
        # Clear session file content
        set_session_file_content(session, None)
        
    # 3. Handle any pending PDF data
    if hasattr(session, 'pdf_base64') and session.pdf_base64:
        try:
            # Create document block with clear formatting to ensure images are processed
            # Following the format from Anthropic's documentation
            document_block = {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": session.pdf_base64
                }
            }
            
            # First notify UI we're processing PDF
            yield format_sse_data({
                "type": PDF_PROCESSING_START,
                "metadata": {
                    "name": session.pdf_info.get('name', 'document'),
                    "size_mb": session.pdf_info.get('size_mb', 0),
                    "path": session.pdf_info.get('path', '')
                }
            })
            
            debug.log(
                event="adding_pdf_document_message",
                data={
                    "name": session.pdf_info.get('name', 'document'),
                    "path": session.pdf_info.get('path', ''),
                    "size_mb": session.pdf_info.get('size_mb', 0)
                },
                category="PDF_PROCESSING"
            )
            
            # Add document block to a user message with a clear instruction
            # Emphasize that images should be analyzed
            set_session_messages(session, [{
                "role": "user",
                "content": [
                    document_block,
                    {"type": "text", "text": "Please analyze this PDF document thoroughly, including all text, images, charts, and tables. Describe any visual elements you see."}
                ]
            }])
            
            # Notify UI that PDF is ready
            yield format_sse_data({
                "type": PDF_PROCESSING_END
            })
            
            # Clear the stored PDF data
            session.pdf_base64 = None
            session.pdf_info = None
            
        except Exception as e:
            debug.log(
                event="pdf_processing_error",
                data={"error": str(e)},
                category="PDF_PROCESSING_ERROR"
            )
            # Clear the stored PDF data even on error
            session.pdf_base64 = None
            session.pdf_info = None


def create_tool_callback(session: SessionState):
    """Create a tool output callback with session support."""
    from .stream_tags import TOOL_RESULT_CONTENT, TOOL_RESULT_START, TOOL_RESULT_END
    from .tool_tagging import format_tool_result_start, format_tool_result_content, format_tool_result_end
    
    def tool_output_callback(result: ToolResult, tool_id: str) -> Optional[Dict[str, Any]]:
        # Extract tool name from tool_id
        tool_name = tool_id.split(".")[-1] if tool_id and "." in tool_id else tool_id or "unknown_tool"
        
        # Handle errors with proper tagging
        if result.error:
            # Return a complete tagged error sequence
            return {
                "sequence": [
                    format_tool_result_start(tool_name, "error"),
                    {
                        "type": "error",
                        "content": str(result.error),
                        "continue": True
                    },
                    format_tool_result_end(tool_name, "error")
                ]
            }
        
        # Handle screenshots
        if result.base64_image:
            set_session_screenshot(session, result.base64_image)
            return None
            
        # Handle PDF processing results - check if this is from PDFTool
        if tool_name == "PDFTool_0" or "pdf" in tool_name.lower():
            if isinstance(result, WebResult) and result.metadata and 'pdf_base64' in result.metadata:
                # Store PDF data for later processing after the tool result is properly added
                session.pdf_base64 = result.metadata['pdf_base64']
                session.pdf_info = result.metadata.get('pdf_info', {})
                
                debug.log(
                    event="pdf_data_stored",
                    data={
                        "tool_id": tool_id,
                        "name": session.pdf_info.get('name', 'document'),
                        "size_mb": session.pdf_info.get('size_mb', 0)
                    },
                    category="PDF_PROCESSING"
                )
                
                # Return information for UI
                pdf_info = result.metadata.get('pdf_info', {})
                return {
                    "sequence": [
                        format_tool_result_start(tool_name, "pdf_processed"),
                        {
                            "type": TOOL_RESULT_CONTENT,
                            "content": f"PDF processed successfully: {pdf_info.get('name', 'document')} ({pdf_info.get('size_mb', 0)}MB)"
                        },
                        format_tool_result_end(tool_name, "pdf_processed")
                    ]
                }
        
        # Handle web search results - special case to ensure correct formatting
        if tool_id and "WebSearchTool" in tool_id:
            # Get the base search result
            search_result = format_web_search_result(result)
            
            # Return a tagged sequence
            return {
                "sequence": [
                    format_tool_result_start(tool_name, "web_search", {
                        "query": search_result.get("query", ""),
                        "engine": search_result.get("engine", "")
                    }),
                    {
                        **search_result,
                        "type": TOOL_RESULT_CONTENT
                    },
                    format_tool_result_end(tool_name, "web_search")
                ]
            }
            
        # Handle web fetch results with proper tagging
        if tool_id and "WebFetcherTool" in tool_id:
            # Get the base fetch result
            fetch_result = format_web_fetch_result(result)
            
            # Return a tagged sequence
            return {
                "sequence": [
                    format_tool_result_start(tool_name, "web_fetch", {
                        "url": fetch_result.get("url", "")
                    }),
                    {
                        **fetch_result,
                        "type": TOOL_RESULT_CONTENT
                    },
                    format_tool_result_end(tool_name, "web_fetch")
                ]
            }
            
        # Handle web interaction results with proper tagging
        if tool_id and "WebInteractionTool" in tool_id:
            # Get the base interaction result
            interaction_result = format_web_interaction_result(result)
            
            # Handle screenshots specially
            if result.base64_image:
                set_session_screenshot(session, result.base64_image)
                # Also create a regular result for the text description
                action_description = interaction_result.get("content", "")
                
                # Return a tagged sequence for the textual description
                return {
                    "sequence": [
                        format_tool_result_start(tool_name, "web_interaction", {
                            "action": interaction_result.get("metadata", {}).get("action", "interaction"),
                            "url": interaction_result.get("metadata", {}).get("url", "")
                        }),
                        {
                            "type": TOOL_RESULT_CONTENT,
                            "content": action_description
                        },
                        format_tool_result_end(tool_name, "web_interaction")
                    ]
                }
            
            # For non-screenshot results, return a tagged sequence
            return {
                "sequence": [
                    format_tool_result_start(tool_name, "web_interaction", {
                        "action": interaction_result.get("metadata", {}).get("action", "interaction"),
                        "url": interaction_result.get("metadata", {}).get("url", "")
                    }),
                    {
                        **interaction_result,
                        "type": TOOL_RESULT_CONTENT
                    },
                    format_tool_result_end(tool_name, "web_interaction")
                ]
            }
            
        # Handle CLI/Web results with output
        if isinstance(result, (CLIResult, WebResult)) and result.output:
            # If it has metadata, treat as file
            if isinstance(result, WebResult) and result.metadata:
                # Prepare file content with proper tagging
                file_content = {
                    'content': result.output,
                    'metadata': {
                        **result.metadata,
                        'raw_content': result.output,
                        'display_content': result.metadata.get('code', {}).get('content'),
                        'yield_source': 'file_content',
                        'tool_result': True,
                        'result_type': 'file'
                    }
                }
                
                # Set for file display
                set_session_file_content(session, file_content)
                return None
            # Otherwise treat as regular tool result with start/end tags
            else:
                # Return a sequence of messages
                return {
                    "sequence": [
                        format_tool_result_start(tool_name, "command_output"),
                        {
                            "type": TOOL_RESULT_CONTENT,
                            "content": str(result.output)
                        },
                        format_tool_result_end(tool_name, "command_output")
                    ]
                }
            
        return None
    return tool_output_callback

class ChatHandler:
    """Chat completion handler"""
    
    def __init__(self, request: Request, chat_request: ChatCompletionRequest, authorization: Optional[str] = None):
        self.request = request
        self.chat_request = chat_request
        self.authorization = authorization
        self.session_id = None
        self.tool_collection = None
        self.chunks_sent = 0
        self.current_response = []  # Collect response chunks
        
        # Get config for logging and decisions
        from core.config_manager import get_config
        self.config = get_config()
    
    async def _handle_summarization(self, session: SessionState, chunk: Dict[str, Any]) -> None:
        """Handle the summarization process with proper UI feedback."""
        try:
            # Log that we're starting summarization
            debug.log(
                event="starting_summarization",
                session_id=self.session_id,
                data={
                    "token_count": chunk["token_count"],
                    "max_context_tokens": chunk["max_context_tokens"],
                    "message_count": len(session.messages) if hasattr(session, "messages") else 0
                },
                category="SUMMARIZATION"
            )
            
            # 1. Notify user we're starting
            yield format_sse_data(format_message_with_type(
                "Your conversation is approaching token limits. Processing summarization to continue...",
                "text",
                role="system"  # This is a system message
            ))

            # 2. Initialize session with summarization if needed
            try:
                # Initialize session with summarization capabilities if needed
                if not hasattr(session, 'maybe_summarize'):
                    # Initialize session with summarization capabilities
                    await initialize_session(self.session_id)
                    
                # Use the SessionState's summarization directly
                # Get API key with user key priority
                api_key = get_api_key(self.request, self.authorization)
                
                summarized = await session.maybe_summarize(
                    client=Anthropic(api_key=api_key), 
                    token_count=chunk["token_count"],
                    current_messages=get_session_messages(session)
                )
            except Exception as e:
                # Log the error but don't attempt to fall back to legacy methods
                debug.log(
                    event="summarization_method_error",
                    session_id=self.session_id,
                    data={
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "traceback": traceback.format_exc()
                    },
                    category="SUMMARIZATION_ERROR"
                )
                
                # No fallback - legacy conversation methods have been removed
                # Signal failure through a message since we can't return from an async generator
                yield format_sse_data(format_message_with_type(
                    "Failed to summarize conversation due to an internal error. Please try again or start a new conversation.",
                    "error"
                ))
                
                # Set summarized to False so we handle it properly below
                summarized = False

            # 4. Handle result
            if summarized:
                debug.log(
                    event="summarization_complete",
                    session_id=self.session_id,
                    data={
                        "success": True
                    },
                    category="SUMMARIZATION"
                )
                # No need to manually reset session messages - the SessionState's maybe_summarize 
                # method already updates messages directly
                
                # We don't need to log this again as SessionState's maybe_summarize 
                # already logs the session_messages_replaced event
                
                # Recalculate token count using the SAME method as before summarization
                # This ensures consistent token counting including system prompt, tools, etc.
                try:
                    # Get API key with user key priority
                    api_key = get_api_key(self.request, self.authorization)
                    client = Anthropic(api_key=api_key)
                    preparator = ConversationPreparator(client=client)
                    
                    # Store original token count for accurate comparison
                    original_token_count = chunk["token_count"]
                    
                    # Get messages from the session
                    session_messages = get_session_messages(session)
                    
                    # Get tools in the correct format
                    tools = self.tool_collection.to_params() if self.tool_collection else None
                    
                    # Get system prompt
                    system_prompt = get_system_prompt()
                    
                    # Instead of using prepare_for_api (which doesn't directly accept system_prompt),
                    # use the TokenCounter directly for accurate token counting
                    from core.api.conversation.tokens import TokenCounter
                    token_counter = TokenCounter(client)
                    
                    # Count tokens using the same method as the original count
                    new_token_count = token_counter.count_tokens(
                        messages=session_messages,
                        system=system_prompt,
                        tools=tools,
                        session_id=self.session_id
                    )
                    
                    # Create a PreparedConversation object with the accurate token count
                    prepared = PreparedConversation(
                        messages=session_messages,
                        token_count=new_token_count,
                        needs_summary=False,
                        has_summary=True,
                        preparation_time=0
                    )
                    
                    # Calculate true reduction percentage using consistent counting methods
                    reduction_percentage = 100 * (1 - (prepared.token_count / original_token_count))
                    
                    # Log the entire session.messages for complete visibility
                    debug.log(
                        event="session_messages_after_summarization",
                        session_id=self.session_id,
                        data={
                            "full_messages": session.messages,
                            "message_count": len(session.messages)
                        },
                        category="MESSAGE_CONTENT"
                    )
                    
                    # Log accurate metrics
                    debug.log(
                        event="summarization_complete",
                        session_id=self.session_id,
                        data={
                            "original_tokens": original_token_count,
                            "new_tokens": prepared.token_count,
                            "reduction_percentage": round(reduction_percentage, 1),
                            "includes_system_prompt": True,
                            "includes_tools": bool(self.tool_collection)
                        },
                        category="SUMMARIZATION"
                    )
                except Exception as e:
                    # Log the error but continue - this isn't critical
                    import traceback
                    error_trace = traceback.format_exc()
                    
                    debug.log(
                        event="token_recounting_error",
                        session_id=self.session_id,
                        data={
                            "error": str(e),
                            "error_type": type(e).__name__,
                            "traceback": error_trace,
                            "has_tool_collection": hasattr(self, 'tool_collection') and self.tool_collection is not None,
                            "tool_collection_type": str(type(self.tool_collection)) if hasattr(self, 'tool_collection') and self.tool_collection is not None else "None"
                        },
                        category="SUMMARIZATION_ERROR"
                    )
                    
                    # Try to get a better count using a simpler method
                    try:
                        # Get message text only for a basic count
                        session_messages = get_session_messages(session)
                        
                        # Use the TokenCounter directly if available
                        from core.api.conversation.tokens import TokenCounter
                        counter = TokenCounter(client)
                        basic_token_count = counter.count_tokens(messages=session_messages)
                        
                        # Add a buffer for system prompt and tools (approximately)
                        basic_token_count += 500  # Rough estimate for system prompt + tools
                        
                        prepared = PreparedConversation(
                            messages=session_messages,
                            token_count=basic_token_count,
                            needs_summary=False,
                            has_summary=True,
                            preparation_time=0
                        )
                    except Exception:
                        # Ultimate fallback - use original / 2 as estimate
                        prepared = PreparedConversation(
                            messages=get_session_messages(session),
                            token_count=chunk["token_count"] // 2,  # Estimate reduction
                            needs_summary=False,
                            has_summary=True,
                            preparation_time=0
                        )

                # Check for pending tool results before sending token update
                async for tool_result in send_pending_tool_results(session):
                    yield tool_result
                
                # Now send the token update AFTER any tool results
                yield format_sse_data({
                    "type": "token_update",
                    "token_count": prepared.token_count,
                    "max_context_tokens": chunk["max_context_tokens"],
                    "needs_summary": False  # Just summarized, should be false
                })
                
                # Send the fully updated message list to the client
                # The client will replace its entire message history with this
                messages_to_send = get_session_messages(session)
                
                debug.log(
                    event="sending_updated_messages_to_client",
                    session_id=self.session_id,
                    data={
                        "message_count": len(messages_to_send),
                        "message_roles": [m.get("role") for m in messages_to_send]
                    },
                    category="SUMMARIZATION"
                )
                
                yield format_sse_data({
                    "type": "messages",
                    "messages": messages_to_send
                })

                # This debug log is now redundant since we added a more accurate version above
                # Only keep as fallback if the earlier logging failed
                if not 'reduction_percentage' in locals():
                    debug.log(
                        event="summarization_complete_fallback",
                        session_id=self.session_id,
                        data={
                            "original_tokens": chunk["token_count"],
                            "new_tokens": prepared.token_count if 'prepared' in locals() else None,
                            "reduction_percentage": round(
                                (1 - (prepared.token_count / chunk["token_count"])) * 100, 1
                            ) if 'prepared' in locals() else None
                        },
                        category="SUMMARIZATION"
                    )
                
                # Then send success message with token reduction info using the accurately calculated values
                # Use the reduction_percentage calculated with consistent counting methods if available
                if 'reduction_percentage' in locals():
                    reduction_pct = reduction_percentage
                    original_count = original_token_count
                    new_count = prepared.token_count
                else:
                    # Fallback to simple calculation
                    reduction_pct = round(
                        (1 - (prepared.token_count / chunk["token_count"])) * 100, 1
                    ) if 'prepared' in locals() else None
                    original_count = chunk["token_count"]
                    new_count = prepared.token_count if 'prepared' in locals() else 0
                
                success_message = "✅ Conversation has been successfully summarized."
                if reduction_pct:
                    success_message += f" Token count reduced by {reduction_pct}% (from {original_count} to {new_count} tokens)."
                success_message += " Previous messages have been replaced with a summary to preserve context while reducing token usage."
                
                debug.log(
                    event="summarization_successful",
                    session_id=self.session_id,
                    data={
                        "message": f"SUMMARIZATION COMPLETE: Reduced tokens by {reduction_pct}% (from {original_count} to {new_count})",
                        "reduction_percentage": reduction_pct,
                        "original_tokens": original_count,
                        "new_tokens": new_count,
                        "absolute_reduction": original_count - new_count
                    },
                    category="SUMMARIZATION"
                )
                
                yield format_sse_data(format_message_with_type(
                    success_message,
                    "text"
                ))
            else:
                # Log failure
                debug.log(
                    event="summarization_failed",
                    session_id=self.session_id,
                    data={"token_count": chunk["token_count"]},
                    category="SUMMARIZATION_ERROR"
                )
                
                # Get detailed error information and log it
                error_details = "No messages to summarize" if len(session.messages) == 0 else "Token threshold not exceeded"
                error_info = {
                    "messages_count": len(session.messages) if hasattr(session, "messages") else 0,
                    "token_count": chunk["token_count"],
                    "threshold": self.config.get('ai.token_management.summary_triggers.threshold_percentage', 0.7),
                    "percentage": chunk["token_count"] / chunk["max_context_tokens"]
                }
                
                debug.log(
                    event="summarization_detailed_failure",
                    session_id=self.session_id,
                    data=error_info,
                    category="SUMMARIZATION_ERROR"
                )
                
                # Send error message with details for debugging
                yield format_sse_data(format_message_with_type(
                    f"Unable to summarize conversation: {error_details}. " +
                    f"Tokens: {chunk['token_count']}, Msgs: {len(session.messages)}. " +
                    "Please try starting a new conversation or reduce context manually.",
                    "text"
                ))

            # 5. End stream properly
            yield format_sse_data({
                "choices": [{
                    "delta": {
                        "content": "",
                        "finish_reason": "summarized" if summarized else "summarization_failed"
                    }
                }]
            })

        except Exception as e:
            yield format_sse_data(format_tool_error(str(e)))

    async def initialize(self):
        """Initialize handler state."""
        try:
            raw_data = await self.request.json()
            metadata = raw_data.get('metadata', {})
            self.model = raw_data.get('model')  # Extract model from raw request
            session_id = metadata.get('session_id')
            
            if not session_id:
                session_id = 'default'
                
            self.session_id = session_id
            
            # Log summarization settings for this conversation
            config = get_config()
            summarization_enabled = config.get('ai.token_management.enable_summarization')
            threshold_percentage = config.get('ai.token_management.summary_triggers.threshold_percentage')
            max_context_tokens = config.get('ai.models.claude3.max_context_tokens', 200000)
            first_min_pairs = config.get('ai.conversation.section.first.min_pairs', 2)
            middle_min_pairs = config.get('ai.conversation.section.middle.min_pairs', 1)
            last_min_pairs = config.get('ai.conversation.section.last.min_pairs', 2)
            
            # Calculate actual token threshold
            token_threshold = int(max_context_tokens * (threshold_percentage or 0.8))
            
            debug.log(
                event="summarization_settings",
                session_id=self.session_id,
                data={
                    "message": f"SUMMARIZATION SETTINGS: enabled={summarization_enabled}, threshold={threshold_percentage or 0.8} ({token_threshold} tokens), pairs=[first={first_min_pairs}, middle={middle_min_pairs}, last={last_min_pairs}]",
                    "enabled": summarization_enabled,
                    "threshold": threshold_percentage or 0.8,
                    "token_threshold": token_threshold,
                    "pairs": {
                        "first": first_min_pairs,
                        "middle": middle_min_pairs,
                        "last": last_min_pairs
                    }
                },
                category="SUMMARIZATION"
            )
            
            debug.log(
                event="summarization_config_details",
                session_id=self.session_id,
                data={
                    "enabled": summarization_enabled,
                    "threshold_percentage": threshold_percentage or 0.8,
                    "max_context_tokens": max_context_tokens,
                    "token_threshold": token_threshold,
                    "min_pairs": {
                        "first": first_min_pairs,
                        "middle": middle_min_pairs,
                        "last": last_min_pairs
                    }
                },
                category="SUMMARIZATION"
            )
        except Exception as e:
            self.session_id = 'default'
            debug.log(
                event="summarization_settings_error",
                session_id=self.session_id,
                data={"error": str(e)},
                category="SUMMARIZATION"
            )
    
    async def _stream_response(self):
        """Generate streaming response with session support."""
        try:
            # Ensure we have a session ID
            if not self.session_id:
                yield format_sse_data(format_tool_error("No session ID provided"))
                return

            # Get session first since we need it for tool collection
            session = get_or_create_session(self.session_id)

            # Initialize tool collection
            self.tool_collection = get_tool_collection(
                headers=dict(self.request.headers),
                tool_callback=create_tool_callback(session)
            )
            
            # Legacy conversation has been removed

            # Create new message
            current_message = {
                "role": self.chat_request.messages[-1].role,
                "content": [{
                    "type": "text",
                    "text": self.chat_request.messages[-1].content
                }]
            }
            
            # Add just the new message to both versions
            set_session_messages(session, [current_message])
            
            # Get updated messages for API
            messages = get_session_messages(session, use_short=True)
            
            # Start streaming - but first check for any pending tool results
            # Even before the first role marker, make sure we stream any pending tool results
            async for tool_result in send_pending_tool_results(session):
                yield tool_result
            
            # Now send the role marker
            yield format_sse_data({"choices": [{"delta": {"role": "assistant"}}]})
            
            # Check if we're actually using short version
            using_short = messages is session.short_messages
            
            # Filter messages for API
            filtered_messages = [m for m in messages if m.get("content")]
            

            
            # Import model configuration
            from .model_config import validate_model
            
            # Get model from request and validate
            requested_model = getattr(self, 'model', None)
            try:
                model = validate_model(requested_model)
            except Exception as e:
                debug.log(
                    event="model_validation_error",
                    session_id=self.session_id,
                    data={
                        "requested_model": requested_model,
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    category="MODEL_USAGE"
                )
                raise
            
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
            
            # Get API key with user key priority
            api_key = get_api_key(self.request, self.authorization)
            
            # Check if expert mode is enabled (both server config and client preference)
            config = get_config()
            server_expert_mode_enabled = config.get('ai.expert_mode.enabled', False)
            
            # Check client preference from metadata
            client_expert_mode_enabled = True  # Default to enabled
            try:
                # Try to read from request again (this will work since FastAPI caches it)
                raw_data = await self.request.json()
                metadata = raw_data.get('metadata', {})
                client_expert_mode_enabled = metadata.get('expert_mode_enabled', True)
            except Exception as e:
                pass  # Use default if we can't read client preference
            
            # Expert mode is enabled only if both server and client enable it
            expert_mode_enabled = server_expert_mode_enabled and client_expert_mode_enabled
            
            # Initialize variables for expert mode
            enhanced_system_prompt = get_system_prompt()
            
            if expert_mode_enabled:
                print(f"[EXPERT MODE] Enabled - Starting Phase 1 analysis")
                
                # Clear the expert mode log before starting new analysis
                debug.clear_expert_mode_log()
                
                debug.log(
                    event="expert_mode_activated",
                    session_id=self.session_id,
                    data={"starting_phase1": True},
                    category="EXPERT_MODE"
                )
                
                # Note: "preparing" status is sent immediately by frontend
                # We start directly with finding the user message and analysis
                
                # Get the last user message for analysis
                last_user_message = None
                for msg in reversed(session.messages):
                    if msg.get("role") == "user":
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
                    print(f"[EXPERT MODE] Found user message: {last_user_message[:100]}...")
                    
                    # Notify UI that expert mode is analyzing
                    yield format_sse_data({
                        "type": "expert_mode_status",
                        "status": "analyzing",
                        "message": "🎯 Analyzing request for optimal expertise...",
                        "source": "backend"
                    })
                    
                    # Create expert mode analyzer
                    anthropic_client = Anthropic(api_key=api_key)
                    analyzer = ExpertModeAnalyzer(anthropic_client)
                    
                    # Phase 1: Analyze the request
                    analysis = await analyzer.analyze_request(last_user_message, model)
                    
                    if analysis:
                        print(f"[EXPERT MODE] Analysis complete - Domain: {analysis.get('domain')}")
                        debug.log(
                            event="expert_mode_analysis_complete",
                            session_id=self.session_id,
                            data={
                                "domain": analysis.get("domain"),
                                "request_type": analysis.get("request_type")
                            },
                            category="EXPERT_MODE"
                        )
                        
                        # Send domain result status
                        domain = analysis.get("domain", "general conversation")
                        yield format_sse_data({
                            "type": "expert_mode_status",
                            "status": "activated",
                            "message": f"🎯 Analysis complete: {domain} expertise applied",
                            "domain": domain,
                            "request_type": analysis.get("request_type"),
                            "source": "backend"
                        })
                        
                        # Enhance system prompt with expert knowledge
                        enhanced_system_prompt = analyzer.enhance_system_prompt(
                            enhanced_system_prompt,
                            analysis.get("expert_prompt", "")
                        )
                    else:
                        print(f"[EXPERT MODE] Analysis failed")
                else:
                    print(f"[EXPERT MODE] No user message found")
            
            async for chunk in sampling_loop(
                model=model,
                provider=APIProvider.ANTHROPIC,
                system_prompt=enhanced_system_prompt,  # Use enhanced prompt
                session=session,  # Session contains everything we need
                output_callback=lambda x: None,
                tool_output_callback=create_tool_callback(session),
                api_key=api_key,
                tool_collection=self.tool_collection
            ):

                if await self.request.is_disconnected():
                    break
                
                self.chunks_sent += 1

                # Handle sequence of messages (for tagged tool results)
                if chunk.get("sequence"):
                    # Process each message in the sequence
                    for seq_item in chunk["sequence"]:
                        # Log the sequence item
                        debug.log(
                            event="sequence_item_processing",
                            session_id=self.session_id,
                            data={
                                "type": seq_item.get("type"),
                                "is_start": seq_item.get("type") and "start" in seq_item.get("type"),
                                "is_end": seq_item.get("type") and "end" in seq_item.get("type"),
                            },
                            category="TOOL_INTERACTION"
                        )
                        # Stream to UI
                        yield format_sse_data(seq_item)
                        
                    # No need to process further
                    continue
                
                if chunk["type"] == "tool_result":
                    # Handle tool results
                    content = filter_tool_output(chunk["chunk"])
                    
                    # Log tool result
                    preview = content[:100] + "..." if content and len(content) > 100 else content
                    debug.log(
                        event="tool_result_received",
                        session_id=self.session_id,
                        data={
                            "message": f"TOOL RESULT: {preview}",
                            "content_preview": preview,
                            "content_length": len(content) if content else 0
                        },
                        category="TOOL_INTERACTION"
                    )
                    
                    if content and content.strip():
                        # Only process if not starting with code block markers
                        if not content.strip().startswith('```'):
                            # Get the stored API name from session
                            tool_name = session.current_tool_name if hasattr(session, 'current_tool_name') and session.current_tool_name else "folder_ops"
                            
                            # Log what we're using
                            debug.log(
                                event="using_api_tool_name",
                                session_id=self.session_id,
                                category="TOOL_INTERACTION",
                                data={
                                    "tool_name": tool_name,
                                    "from_session": hasattr(session, 'current_tool_name') and session.current_tool_name is not None,
                                    "content_preview": content[:50] if content else ""
                                }
                            )
                            
                            # First send a tool_result_start tag
                            yield format_sse_data({
                                "type": "tool_result_start",
                                "tool": tool_name,
                                "result_type": "text"
                            })
                            
                            # Stream content
                            yield format_sse_data({
                                "type": "tool_result",
                                "content": content
                            })
                            
                            # Then send a tool_result_end tag
                            yield format_sse_data({
                                "type": "tool_result_end",
                                "tool": tool_name,
                                "result_type": "text"
                            })
                            
                            # Store in current response
                            self.current_response.append({
                                "type": "tool_result",
                                "text": content
                            })

                if chunk["type"] == "chunk":
                    # OPTIMIZED: Check for and send any pending file content or screenshots first
                    # This uses our helper function for consistent ordering
                    async for tool_result in send_pending_tool_results(session):
                        yield tool_result
                    
                    # 3. Regular text chunks
                    content = filter_tool_output(chunk["chunk"])
                    if content and content.strip():
                        # Clean JSON prefixes that might be in the text
                        cleaned_content = clean_json_prefixes(content)
                        
                        # Check if this is a web search result and format it properly
                        is_search_result, formatted_content = format_web_results(cleaned_content)
                        
                        if is_search_result:
                            # Create a custom format for web search results that will be properly displayed
                            yield format_sse_data({
                                "choices": [{
                                    "delta": {
                                        "type": "action",
                                        "content": formatted_content,
                                        "metadata": {
                                            "tool": "WebSearchTool",
                                            "action": "web_search",
                                            "is_tool_formatter": True  # Special flag for proper formatting
                                        }
                                    }
                                }]
                            })
                            
                            # Store as an action
                            self.current_response.append({
                                "type": "action",
                                "text": formatted_content
                            })
                        else:
                            # Stream normal text to UI
                            yield format_sse_data(format_message_with_type(cleaned_content))
                            # Store in current response
                            self.current_response.append({
                                "type": "text",
                                "text": cleaned_content
                            })

                elif chunk["type"] == "action":
                    # We'll only log the completed action once we have all the data
                    # Removing the redundant partial logs
                    
                    yield format_sse_data(format_message_with_type(
                        chunk["chunk"],
                        "action",
                        chunk.get("metadata")
                    ))
                  
                # Handle extended thinking status updates
                elif chunk["type"] == "extended_thinking_status":
                    debug.log(
                        event="extended_thinking_status",
                        session_id=self.session_id,
                        data={
                            "status": chunk.get("status"),
                            "message": chunk.get("message")
                        },
                        category="EXTENDED_THINKING"
                    )
                    # Forward the extended thinking status to the client
                    yield format_sse_data({
                        "type": "extended_thinking_status",
                        "status": chunk.get("status"),
                        "message": chunk.get("message")
                    })
                
                # Handle thinking block start
                elif chunk["type"] == "thinking_block_start":
                    debug.log(
                        event="thinking_block_start",
                        session_id=self.session_id,
                        data={
                            "prefix": chunk.get("prefix")
                        },
                        category="EXTENDED_THINKING"
                    )
                    # Forward the thinking block start to the client
                    yield format_sse_data({
                        "type": "thinking_block_start",
                        "prefix": chunk.get("prefix")
                    })
                    
                # Handle thinking chunks
                elif chunk["type"] == "thinking_chunk":
                    # Forward thinking chunks to the client
                    yield format_sse_data({
                        "type": "thinking_chunk",
                        "chunk": chunk.get("chunk")
                    })
                    
                # Handle thinking block end
                elif chunk["type"] == "thinking_block_end":
                    debug.log(
                        event="thinking_block_end",
                        session_id=self.session_id,
                        category="EXTENDED_THINKING"
                    )
                    # Forward the thinking block end to the client
                    yield format_sse_data({
                        "type": "thinking_block_end"
                    })
                    
                # Handle redacted thinking
                elif chunk["type"] == "redacted_thinking":
                    debug.log(
                        event="redacted_thinking",
                        session_id=self.session_id,
                        data={
                            "message": chunk.get("message")
                        },
                        category="EXTENDED_THINKING"
                    )
                    # Forward the redacted thinking message to the client
                    yield format_sse_data({
                        "type": "redacted_thinking",
                        "message": chunk.get("message")
                    })
                
                elif chunk["type"] == "error":
                    debug.log(
                        event="stream_error",
                        data={
                            "error": chunk.get('content'),
                            "previous_chunks": self.chunks_sent
                        },
                        category="STREAM_PROCESSING"
                    )
                    yield format_sse_data(format_tool_error(chunk.get('content')))
                elif chunk["type"] == "token_update":
                    # CRITICAL FIX: Check for pending screenshots or file content BEFORE sending token update
                    # This ensures tool results come before token updates
                    async for tool_result in send_pending_tool_results(session):
                        yield tool_result
                    
                    # Send token update AFTER any tool results
                    yield format_sse_data(chunk)

                    # If summarization needed, check if enabled first
                    if chunk["needs_summary"]:
                        # Check for null/false in config
                        summarization_enabled = get_config().get('ai.token_management.enable_summarization')
                        
                        # Calculate percentage of max and percentage of threshold
                        percentage_of_max = chunk['token_count'] / chunk['max_context_tokens']
                        threshold = 0.01  # 1% from config
                        threshold_tokens = chunk['max_context_tokens'] * threshold
                        percentage_of_threshold = chunk['token_count'] / threshold_tokens
                        
                        debug.log(
                            event="summarization_triggered",
                            session_id=self.session_id,
                            data={
                                "message": f"SUMMARIZATION TRIGGERED: Token count {chunk['token_count']} exceeds threshold ({threshold_tokens} tokens)",
                                "token_count": chunk['token_count'],
                                "max_tokens": chunk['max_context_tokens'],
                                "threshold_tokens": threshold_tokens,
                                "percentage_of_max": percentage_of_max,
                                "percentage_of_threshold": percentage_of_threshold
                            },
                            category="SUMMARIZATION"
                        )
                        
                        debug.log(
                            event="summarization_needs_check",
                            session_id=self.session_id,
                            data={
                                "token_count": chunk["token_count"],
                                "config_enabled": summarization_enabled,
                                "from_needs_summary": chunk["needs_summary"],
                                "will_proceed": summarization_enabled is None or bool(summarization_enabled)
                            },
                            category="SUMMARIZATION"
                        )
                        
                        if summarization_enabled is not None and not summarization_enabled:
                            # Log this decision
                            debug.log(
                                event="summarization_skipped_disabled",
                                session_id=self.session_id,
                                data={"token_count": chunk["token_count"]},
                                category="SUMMARIZATION"
                            )
                            continue  # Skip summarization, continue with conversation
                            
                        async for summary_response in self._handle_summarization(session, chunk):
                            yield summary_response
                            
                        return
                
                #elif chunk["type"] == "messages":
                    # Just forward to UI, don't update messages here
                    #yield format_sse_data(chunk)

            # Add complete response as one message
            if self.current_response:  # Only if we have collected content
                # Convert collected responses to proper format
                content_blocks = []
                for item in self.current_response:
                    if isinstance(item, dict):
                        # For collected tool results/structured content
                        content_blocks.append(item)
                    else:
                        # For plain text content
                        content_blocks.append({
                            "type": "text",
                            "text": str(item)
                        })
                        
                complete_response = {
                    "role": "assistant",
                    "content": content_blocks
                }
                #set_session_messages(session, [complete_response])
                self.current_response = []  # Clear for next response




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
            # Print to console for immediate visibility
            print(f"\n=== STREAM ERROR ===")
            print(f"Error: {str(e)}")
            print(f"Type: {type(e).__name__}")
            print(f"Traceback:\n{traceback.format_exc()}")
            print(f"===================\n")
            
            debug.log(
                event="stream_process_error",
                data={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "traceback": traceback.format_exc(),
                    "chunks_sent": self.chunks_sent
                },
                category="STREAM_PROCESSING"
            )
            yield format_sse_data(format_tool_error(str(e)))

async def handle_chat_completion(
    request: Request, 
    chat_request: ChatCompletionRequest,
    authorization: Optional[str] = Header(None)
):
    """Main chat completion endpoint."""
    try:
        handler = ChatHandler(request, chat_request, authorization)
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
        # Print to console for immediate visibility
        print(f"\n=== CHAT COMPLETION ERROR ===")
        print(f"Error: {str(e)}")
        print(f"Type: {type(e).__name__}")
        print(f"Traceback:\n{traceback.format_exc()}")
        print(f"============================\n")
        
        debug.log(
            event="chat_completion_error",
            data={
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc()
            },
            category="STREAM_PROCESSING"
        )
        raise HTTPException(status_code=500, detail=str(e))