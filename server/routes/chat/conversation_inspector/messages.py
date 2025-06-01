"""Raw message handling for Conversation Inspector."""

import traceback
import json
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import List, Dict, Any, Union

from .models import MessageResponse
from ..state import get_or_create_session
from debug.debug_logger import debug
from .message_schema import MessageValidator, format_message_for_display, get_content_text
from .session_lock import lock_manager

def safe_format_content(content: Any) -> List[Dict[str, Any]]:
    """
    Safely format message content into a standardized structure.
    
    Args:
        content: Raw message content in various possible formats
        
    Returns:
        List of formatted content blocks
    """
    debug.log(
        event="safe_format_content_called",
        category="CONVERSATION_INSPECTOR_DEBUG",
        data={
            "content_type": type(content).__name__,
            "content_is_none": content is None,
            "content_is_list": isinstance(content, list),
            "content_sample": str(content)[:100] if content else "None"  # Truncate to first 100 chars
        }
    )
    
    formatted_content = []
    
    # Handle null/empty content
    if content is None:
        debug.log(
            event="content_is_none",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"returning": "empty text block"}
        )
        return [{"type": "text", "text": ""}]
        
    # Ensure content is a list
    if not isinstance(content, list):
        debug.log(
            event="converting_content_to_list",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"original_type": type(content).__name__}
        )
        content = [content]
        
    # Process each content block
    for i, block in enumerate(content):
        debug.log(
            event="processing_content_block",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "block_index": i,
                "block_type": type(block).__name__,
                "has_model_dump": hasattr(block, "model_dump"),
                "has_dict_method": hasattr(block, "dict"),
                "has_text_attr": hasattr(block, "text"),
                "has_type_attr": hasattr(block, "type"),
                "is_dict": isinstance(block, dict),
                "is_str": isinstance(block, str),
                "block_sample": str(block)[:100] if block else "None"  # Truncate
            }
        )
        
        try:
            # Handle various object types
            if hasattr(block, "model_dump"):
                debug.log(
                    event="using_model_dump_for_block",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={"block_index": i}
                )
                block = block.model_dump()
            elif hasattr(block, "dict"):
                debug.log(
                    event="using_dict_method_for_block",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={"block_index": i}
                )
                block = block.dict()
                
            # Special handling for BetaTextBlock objects
            if hasattr(block, 'text') and hasattr(block, 'type'):
                debug.log(
                    event="detected_beta_text_block",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "block_index": i,
                        "block_type": getattr(block, 'type', 'text'),
                        "block_text_sample": str(getattr(block, 'text', ''))[:50]
                    }
                )
                formatted_content.append({
                    "type": getattr(block, 'type', 'text'),
                    "text": getattr(block, 'text', str(block))
                })
                continue
                
            # Handle dict format
            if isinstance(block, dict):
                debug.log(
                    event="processing_dict_block",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "block_index": i,
                        "dict_keys": list(block.keys()),
                        "has_text": "text" in block,
                        "has_type": "type" in block
                    }
                )
                
                # Ensure dict has required fields
                if "text" in block and not "type" in block:
                    block["type"] = "text"
                    debug.log(
                        event="adding_type_field",
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={"block_index": i}
                    )
                
                if not "type" in block and not "text" in block:
                    # Try to extract useful information from dict
                    debug.log(
                        event="missing_text_and_type",
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={"block_index": i, "converting_to_json": True}
                    )
                    block = {
                        "type": "text",
                        "text": json.dumps(block, default=str)
                    }
                
                formatted_content.append(block)
                
            # Handle string format
            elif isinstance(block, str):
                debug.log(
                    event="processing_string_block",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "block_index": i,
                        "string_length": len(block),
                        "string_sample": block[:50] if block else ""
                    }
                )
                formatted_content.append({
                    "type": "text",
                    "text": block
                })
                
            # Handle other types
            else:
                debug.log(
                    event="processing_other_type_block",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "block_index": i,
                        "block_type": type(block).__name__
                    }
                )
                formatted_content.append({
                    "type": "text",
                    "text": str(block)
                })
                
        except Exception as e:
            # Add error block but don't fail the whole operation
            debug.log(
                event="error_formatting_block",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "block_index": i,
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "stack_trace": traceback.format_exc()
                }
            )
            formatted_content.append({
                "type": "text",
                "text": f"[Error formatting content: {str(e)}]"
            })
    
    debug.log(
        event="safe_format_content_complete",
        category="CONVERSATION_INSPECTOR_DEBUG",
        data={
            "formatted_blocks_count": len(formatted_content),
            "formatted_content_sample": str(formatted_content)[:100] if formatted_content else "None"
        }
    )
    
    return formatted_content

router = APIRouter()

@router.get("/raw")
async def get_raw_messages(
    session_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=10, le=500),
    order: str = Query("asc", enum=["asc", "desc"])
) -> List[MessageResponse]:
    """
    Retrieve raw conversation messages with pagination and ordering support.
    
    Args:
        session_id: Session identifier
        page: Page number (1-based)
        page_size: Number of messages per page (10-500, default 200)
        order: Message order ("asc" or "desc")
        
    Returns:
        List of messages with metadata
    """
    debug.log(
        event="get_raw_messages_called",
        category="CONVERSATION_INSPECTOR_DEBUG",
        data={
            "session_id": session_id,
            "page": page,
            "page_size": page_size,
            "order": order
        }
    )
    
    if not session_id:
        debug.log(
            event="error_fetch_messages",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"error": "No session_id provided"}
        )
        raise HTTPException(
            status_code=400,
            detail="session_id is required"
        )

    async def process_messages():
        """Process messages with session lock."""
        debug.log(
            event="before_get_or_create_session",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"session_id": session_id}
        )
        
        session = get_or_create_session(session_id)
        
        debug.log(
            event="after_get_or_create_session",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "session_id": session_id,
                "session_type": type(session).__name__ if session else "None",
                "session_dir": dir(session) if session else []
            }
        )
        
        debug.log(
            event="raw_messages_request",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "session_id": session_id,
                "has_session": bool(session),
                "has_messages": hasattr(session, 'messages') if session else False,
                "message_count": len(session.messages) if session and hasattr(session, 'messages') else 0,
                "session_attributes": list(vars(session).keys()) if session and hasattr(session, "__dict__") else []
            }
        )
        
        if not session:
            debug.log(
                event="session_not_found",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={"session_id": session_id}
            )
            return []
            
        if not hasattr(session, 'messages') or not session.messages:
            debug.log(
                event="no_messages_in_session",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={"session_id": session_id}
            )
            return []

        # Get all messages
        debug.log(
            event="accessing_messages_attribute",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "session_id": session_id,
                "session_type": type(session).__name__,
                "has_messages_attr": hasattr(session, "messages")
            }
        )
        
        messages = session.messages
        
        debug.log(
            event="messages_retrieved",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "messages_type": type(messages).__name__,
                "messages_length": len(messages) if messages else 0,
                "first_message_type": type(messages[0]).__name__ if messages and len(messages) > 0 else "None",
                "sample_keys": list(messages[0].keys()) if messages and len(messages) > 0 and hasattr(messages[0], "keys") else []
            }
        )

        # Calculate pagination
        total_messages = len(messages)
        total_pages = (total_messages + page_size - 1) // page_size if total_messages > 0 else 1
        
        # Log large page size request for performance monitoring
        if page_size > 200:
            debug.log(
                event="large_page_size_requested",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "page_size": page_size,
                    "total_messages": total_messages,
                    "session_id": session_id,
                    "warning": "Large page size may impact performance"
                }
            )
        
        # Validate page number
        if page > total_pages:
            page_actual = total_pages
            debug.log(
                event="page_number_adjusted",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "requested_page": page,
                    "max_pages": total_pages,
                    "adjusted_to": total_pages
                }
            )
        else:
            page_actual = page
            
        start_idx = (page_actual - 1) * page_size
        end_idx = min(start_idx + page_size, total_messages)
        
        debug.log(
            event="pagination_info",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "total_messages": total_messages,
                "total_pages": total_pages,
                "current_page": page_actual,
                "page_size": page_size,
                "start_idx": start_idx,
                "end_idx": end_idx
            }
        )

        # Apply ordering before pagination
        ordered_messages = list(reversed(messages)) if order == "desc" else messages.copy()

        # Apply pagination
        paginated_messages = ordered_messages[start_idx:end_idx] if total_messages > 0 else []
        
        # Performance monitoring for large result sets
        message_count = len(paginated_messages)
        if message_count > 200:
            debug.log(
                event="large_result_set",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "message_count": message_count,
                    "session_id": session_id,
                    "page": page_actual,
                    "page_size": page_size,
                    "warning": "Large result set may impact client performance"
                }
            )
        
        debug.log(
            event="after_pagination",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "paginated_messages_count": message_count,
                "first_message_in_page_type": type(paginated_messages[0]).__name__ if paginated_messages else "None"
            }
        )
        
        # Convert to response format
        debug.log(
            event="starting_message_processing",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"message_count_to_process": len(paginated_messages)}
        )
        
        response_messages = []
        
        for idx, msg in enumerate(paginated_messages):
            absolute_idx = start_idx + idx if order == "asc" else total_messages - start_idx - idx - 1
            
            debug.log(
                event="processing_message",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "message_index": idx,
                    "absolute_index": absolute_idx,
                    "message_type": type(msg).__name__,
                    "is_dict": isinstance(msg, dict),
                }
            )
            
            try:
                # Use the message schema validator
                display_message = format_message_for_display(msg, session_id)
                
                # Override the ID with the page-specific index
                display_message["id"] = str(absolute_idx)
                
                # Add additional metadata
                display_message["metadata"]["index"] = absolute_idx
                display_message["metadata"]["page"] = page_actual
                display_message["metadata"]["token_count"] = len(str(msg))
                
                # Create response object
                message_response = MessageResponse(
                    id=display_message["id"],
                    role=display_message["role"],
                    content=display_message["content"],
                    timestamp=display_message.get("timestamp", datetime.utcnow()),
                    metadata=display_message["metadata"]
                )
                
                debug.log(
                    event="created_message_response",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "message_index": idx,
                        "absolute_index": absolute_idx,
                        "message_id": message_response.id,
                        "message_role": message_response.role,
                        "content_blocks_count": len(message_response.content)
                    }
                )
                
                response_messages.append(message_response)
                
            except Exception as e:
                debug.log(
                    event="error_message_processing",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(e),
                        "message_index": idx,
                        "absolute_index": absolute_idx,
                        "stack_trace": traceback.format_exc()
                    }
                )
                # Return basic format on error
                response_messages.append(
                    MessageResponse(
                        id=str(absolute_idx),
                        role="unknown",
                        content=[{"type": "text", "text": f"Error processing message: {str(e)}"}],
                        timestamp=datetime.utcnow(),
                        metadata={
                            "index": absolute_idx,
                            "page": page_actual,
                            "error": str(e),
                            "error_type": type(e).__name__,
                            "has_error": True
                        }
                    )
                )

        # Include pagination metadata
        pagination_metadata = {
            "total_messages": total_messages,
            "total_pages": total_pages,
            "current_page": page_actual,
            "page_size": page_size,
            "has_next": page_actual < total_pages,
            "has_prev": page_actual > 1,
            "recommended_page_size": min(200, page_size)  # Recommend a reasonable page size
        }
        
        # Add performance warning if needed
        if page_size > 200:
            pagination_metadata["performance_warning"] = "Large page sizes may impact performance. Consider using a smaller page size (200 or less) for better performance."
        
        # Attach pagination metadata to each message
        for msg in response_messages:
            msg.metadata["pagination"] = pagination_metadata

        # Final logging before returning results
        debug.log(
            event="returning_messages",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "message_count": len(response_messages),
                "session_id": session_id,
                "current_page": page_actual,
                "total_pages": total_pages,
                "roles_summary": [msg.role for msg in response_messages]
            }
        )
        
        return response_messages
    
    try:
        # Use the session lock manager to ensure thread safety
        return await lock_manager.with_session_lock(session_id, process_messages)

    except Exception as e:
        error_trace = traceback.format_exc()
        error_details = {
            "error": str(e),
            "error_type": type(e).__name__,
            "session_id": session_id,
            "page": page,
            "page_size": page_size,
            "stack_trace": error_trace
        }
        
        # Try to get more context about the session state
        try:
            if 'session' in locals() and session is not None:
                error_details.update({
                    "session_attributes": list(vars(session).keys()) if hasattr(session, "__dict__") else "No session attributes",
                    "has_messages_attr": hasattr(session, "messages"),
                    "messages_type": type(session.messages).__name__ if hasattr(session, "messages") else "No messages attribute"
                })
        except Exception as context_error:
            error_details["context_error"] = str(context_error)
            
        debug.log(
            event="error_fetching_messages",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data=error_details
        )
        
        # Return a more detailed error
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving messages: {str(e)}\nType: {type(e).__name__}"
        )