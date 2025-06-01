"""Summarization functionality for Conversation Inspector."""

import os
import traceback
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from anthropic import Anthropic
from .models import SummarizeRequest, SummarizeResponse
from ..state import get_or_create_session
from debug.debug_logger import debug
from core.api.conversation.summarizer import ConversationSummarizer
from .session_lock import lock_manager
from .message_schema import format_message_for_storage, get_content_text

router = APIRouter()

@router.post("/summarize")
async def summarize_messages(
    request: SummarizeRequest,
    authorization: Optional[str] = Header(None)
) -> SummarizeResponse:
    """
    Summarize selected messages while preserving content references.
    
    Args:
        request: SummarizeRequest with session_id and message_ids
        
    Returns:
        SummarizeResponse with summary pair and metadata
        
    Raises:
        HTTPException: If session not found or summarization fails
    """
    if not request.session_id:
        return SummarizeResponse(
            success=False,
            error="Session ID is required"
        )
        
    if not request.message_ids:
        return SummarizeResponse(
            success=False,
            error="No message IDs provided for summarization"
        )
    
    debug.log(
        event="summarize_messages_called",
        category="CONVERSATION_INSPECTOR_DEBUG",
        data={
            "session_id": request.session_id,
            "message_ids": request.message_ids
        }
    )
    
    async def perform_summarization():
        """Perform message summarization with session lock."""
        try:
            session = get_or_create_session(request.session_id)
            if not session:
                raise HTTPException(
                    status_code=404,
                    detail="Session not found"
                )

            if not hasattr(session, 'messages') or not session.messages:
                return SummarizeResponse(
                    success=False,
                    error="No messages found in session"
                )

            # Convert message IDs to indices and validate
            valid_indices = []
            errors = []
            
            for msg_id in request.message_ids:
                try:
                    idx = int(msg_id)
                    if 0 <= idx < len(session.messages):
                        valid_indices.append(idx)
                    else:
                        errors.append(f"Message ID {msg_id} out of range (valid range: 0-{len(session.messages)-1})")
                except ValueError:
                    errors.append(f"Invalid message ID format: {msg_id}, must be an integer")
            
            if not valid_indices:
                debug.log(
                    event="no_valid_indices",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "session_id": request.session_id,
                        "requested_message_ids": request.message_ids,
                        "errors": errors
                    }
                )
                return SummarizeResponse(
                    success=False,
                    error="No valid messages found to summarize"
                )
                
            # Sort indices to preserve message order
            valid_indices.sort()
            
            # Get messages to summarize using the validated indices
            messages_to_summarize = []
            for idx in valid_indices:
                if 0 <= idx < len(session.messages):  # Double-check index is still valid
                    messages_to_summarize.append(session.messages[idx])
            
            debug.log(
                event="messages_selected_for_summarization",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "session_id": request.session_id,
                    "valid_indices": valid_indices,
                    "message_count": len(messages_to_summarize),
                    "first_message_role": messages_to_summarize[0].get("role", "unknown") if messages_to_summarize else "N/A"
                }
            )

            if not messages_to_summarize:
                return SummarizeResponse(
                    success=False,
                    error="No valid messages found to summarize"
                )

            # Create summarizer with proper error handling
            try:
                # TODO: Use get_api_key helper when FastAPI Request is available
                # For now, check authorization header first, then env var
                api_key = None
                if authorization and authorization.startswith("Bearer "):
                    api_key = authorization[7:]
                    if api_key.startswith("sk-ant-"):
                        debug.log(
                            event="using_user_api_key",
                            category="CONVERSATION_INSPECTOR_DEBUG"
                        )
                    else:
                        api_key = None
                
                if not api_key:
                    api_key = os.environ.get("ANTHROPIC_API_KEY")
                    
                if not api_key:
                    return SummarizeResponse(
                        success=False,
                        error="Missing Anthropic API key. Please provide your API key in Settings."
                    )
                    
                client = Anthropic(api_key=api_key)
                summarizer = ConversationSummarizer(client)
                
                debug.log(
                    event="summarizer_created",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={"session_id": request.session_id}
                )
            except Exception as client_error:
                debug.log(
                    event="summarizer_creation_error",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(client_error),
                        "error_type": type(client_error).__name__,
                        "stack_trace": traceback.format_exc()
                    }
                )
                return SummarizeResponse(
                    success=False,
                    error=f"Failed to initialize summarizer: {str(client_error)}"
                )

            # Log messages being summarized
            for i, msg in enumerate(messages_to_summarize):
                content_text = get_content_text(msg.get("content", []))
                debug.log(
                    event="message_to_summarize",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "index": i,
                        "role": msg.get("role", "unknown"),
                        "content_preview": content_text[:100] + "..." if len(content_text) > 100 else content_text
                    }
                )

            # Generate summary with proper error handling
            try:
                debug.log(
                    event="summarization_starting",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "session_id": request.session_id,
                        "message_count": len(messages_to_summarize)
                    }
                )
                
                result = await summarizer.create_summary(
                    messages=messages_to_summarize,
                    session_id=request.session_id
                )
                
                debug.log(
                    event="summarization_completed",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "session_id": request.session_id,
                        "success": getattr(result, "was_successful", False),
                        "has_error": bool(getattr(result, "error", None)),
                        "result_messages_count": len(getattr(result, "messages", []))
                    }
                )
            except Exception as summary_error:
                debug.log(
                    event="summarization_error",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(summary_error),
                        "error_type": type(summary_error).__name__,
                        "stack_trace": traceback.format_exc()
                    }
                )
                return SummarizeResponse(
                    success=False,
                    error=f"Error during summarization: {str(summary_error)}"
                )

            # Validate summarization result
            if not hasattr(result, "was_successful"):
                debug.log(
                    event="invalid_summarization_result",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={"error": "Summarizer result missing 'was_successful' attribute"}
                )
                return SummarizeResponse(
                    success=False,
                    error="Invalid summarization result"
                )
                
            if not result.was_successful:
                debug.log(
                    event="summarization_unsuccessful",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={"error": getattr(result, "error", "Unknown error")}
                )
                return SummarizeResponse(
                    success=False,
                    error=getattr(result, "error", "Failed to generate summary")
                )
                
            if not hasattr(result, "messages") or not result.messages:
                debug.log(
                    event="empty_summary_result",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={"error": "Summarizer returned empty messages"}
                )
                return SummarizeResponse(
                    success=False,
                    error="Summarizer returned empty messages"
                )

            # Save original state for potential rollback
            original_state = {
                "messages": session.messages.copy() if session.messages else [],
                "short_messages": session.short_messages.copy() if hasattr(session, "short_messages") and session.short_messages else []
            }
            
            # Calculate insertion index
            insertion_index = min(valid_indices) if valid_indices else len(session.messages)
            
            try:
                # Remove original messages in reverse order to maintain index validity
                for idx in sorted(valid_indices, reverse=True):
                    if 0 <= idx < len(session.messages):
                        del session.messages[idx]
                        if hasattr(session, "short_messages") and session.short_messages and idx < len(session.short_messages):
                            del session.short_messages[idx]
                
                # Format summary messages for storage
                formatted_summary_messages = []
                for msg in result.messages:
                    formatted_msg = format_message_for_storage(msg, request.session_id)
                    formatted_summary_messages.append(formatted_msg)
                
                # Insert summary messages
                for msg in reversed(formatted_summary_messages):
                    # Ensure insertion index is still valid
                    valid_insertion = 0 <= insertion_index <= len(session.messages)
                    actual_index = insertion_index if valid_insertion else len(session.messages)
                    
                    session.messages.insert(actual_index, msg)
                    if hasattr(session, "short_messages") and session.short_messages is not None:
                        # Ensure short_messages insertion index is also valid
                        valid_short_insertion = 0 <= actual_index <= len(session.short_messages)
                        short_index = actual_index if valid_short_insertion else len(session.short_messages)
                        session.short_messages.insert(short_index, msg)
                
                # Log message counts after update
                debug.log(
                    event="messages_after_summarization",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "session_id": request.session_id,
                        "messages_count": len(session.messages),
                        "short_messages_count": len(session.short_messages) if hasattr(session, "short_messages") and session.short_messages else 0,
                        "summary_messages_inserted": len(formatted_summary_messages)
                    }
                )
                
                # Rebuild context
                if hasattr(session, 'rebuild_context'):
                    try:
                        session.rebuild_context()
                        debug.log(
                            event="context_rebuilt",
                            category="CONVERSATION_INSPECTOR_DEBUG",
                            data={"session_id": request.session_id}
                        )
                    except Exception as rebuild_error:
                        debug.log(
                            event="context_rebuild_error",
                            category="CONVERSATION_INSPECTOR_DEBUG",
                            data={
                                "error": str(rebuild_error),
                                "error_type": type(rebuild_error).__name__,
                                "stack_trace": traceback.format_exc()
                            }
                        )
            except Exception as update_error:
                # Rollback to original state on error
                debug.log(
                    event="summarization_update_error",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(update_error),
                        "error_type": type(update_error).__name__,
                        "stack_trace": traceback.format_exc(),
                        "action": "rolling_back"
                    }
                )
                
                # Attempt rollback
                try:
                    session.messages = original_state["messages"]
                    if hasattr(session, "short_messages"):
                        session.short_messages = original_state["short_messages"]
                    
                    debug.log(
                        event="rollback_success",
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={"session_id": request.session_id}
                    )
                except Exception as rollback_error:
                    debug.log(
                        event="rollback_error",
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={
                            "error": str(rollback_error),
                            "error_type": type(rollback_error).__name__
                        }
                    )
                
                return SummarizeResponse(
                    success=False,
                    error=f"Error updating messages with summary: {str(update_error)}"
                )

            # Extract metadata from result
            metadata = {
                "original_count": len(messages_to_summarize),
                "original_tokens": getattr(result, "original_tokens", 0),
                "summary_tokens": getattr(result, "summary_tokens", 0),
                "compression_ratio": getattr(result, "compression_ratio", 1.0),
                "insertion_index": insertion_index,
                "removed_indices": valid_indices,
                "summary_message_count": len(result.messages)
            }
            
            debug.log(
                event="summarization_success",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "session_id": request.session_id,
                    "metadata": metadata
                }
            )

            return SummarizeResponse(
                success=True,
                summary_pair=result.messages,
                metadata=metadata
            )

        except HTTPException:
            raise
        except Exception as e:
            debug.log(
                event="error_summarize_messages",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "stack_trace": traceback.format_exc(),
                    "session_id": request.session_id
                }
            )
            return SummarizeResponse(
                success=False,
                error=f"Failed to summarize messages: {str(e)}"
            )
    
    try:
        # Use session lock to ensure thread safety
        return await lock_manager.with_session_lock(request.session_id, perform_summarization)
    except Exception as e:
        debug.log(
            event="lock_error_summarize_messages",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "error_type": type(e).__name__,
                "stack_trace": traceback.format_exc(),
                "session_id": request.session_id
            }
        )
        return SummarizeResponse(
            success=False,
            error=f"Failed to acquire session lock: {str(e)}"
        )