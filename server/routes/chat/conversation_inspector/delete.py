"""Delete functionality for Conversation Inspector."""

import traceback
from fastapi import APIRouter, HTTPException
from .models import DeleteRequest, DeleteResponse
from ..state import get_or_create_session
from debug.debug_logger import debug
from .session_lock import lock_manager

router = APIRouter()

@router.delete("/delete")
async def delete_messages(request: DeleteRequest) -> DeleteResponse:
    """
    Delete specific messages from a conversation.
    
    Args:
        request: Delete request containing session_id and message_ids
        
    Returns:
        Deletion result with success status and counts
    """
    if not request.session_id:
        return DeleteResponse(
            success=False,
            deleted_count=0,
            errors=["Session ID is required"]
        )
        
    if not request.message_ids:
        return DeleteResponse(
            success=False,
            deleted_count=0,
            errors=["No message IDs provided for deletion"]
        )
        
    debug.log(
        event="delete_messages_called",
        category="CONVERSATION_INSPECTOR_DEBUG",
        data={
            "session_id": request.session_id,
            "message_ids": request.message_ids
        }
    )
    
    async def perform_deletion():
        """Perform message deletion with session lock."""
        session = get_or_create_session(request.session_id)
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )
            
        if not hasattr(session, 'messages') or not session.messages:
            return DeleteResponse(
                success=False,
                deleted_count=0,
                errors=["No messages found in session"]
            )

        # Save original state for logging
        original_messages_count = len(session.messages)
        original_short_messages_count = len(session.short_messages) if hasattr(session, 'short_messages') and session.short_messages else 0
        
        deleted_count = 0
        errors = []

        # Convert message_ids to indices and validate
        indices_to_delete = set()  # Use a set to avoid duplicates
        for msg_id in request.message_ids:
            try:
                idx = int(msg_id)
                if 0 <= idx < len(session.messages):
                    indices_to_delete.add(idx)
                else:
                    errors.append(f"Message ID {msg_id} out of range (valid range: 0-{len(session.messages)-1})")
            except ValueError:
                errors.append(f"Invalid message ID format: {msg_id}, must be an integer")

        # Convert to list and sort in reverse order to avoid index shifting
        indices_to_delete = sorted(list(indices_to_delete), reverse=True)
        
        debug.log(
            event="delete_message_indices",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "session_id": request.session_id,
                "indices_to_delete": indices_to_delete,
                "original_message_count": original_messages_count,
                "original_short_message_count": original_short_messages_count
            }
        )
        
        # Track which indices were actually deleted
        deleted_indices = []
        deleted_short_indices = []
        
        try:
            # Delete messages from main messages list
            for idx in indices_to_delete:
                try:
                    if 0 <= idx < len(session.messages):
                        del session.messages[idx]
                        deleted_indices.append(idx)
                    else:
                        debug.log(
                            event="index_out_of_range",
                            category="CONVERSATION_INSPECTOR_DEBUG",
                            data={
                                "index": idx,
                                "messages_length": len(session.messages),
                                "action": "skipping"
                            }
                        )
                except Exception as idx_error:
                    errors.append(f"Error deleting message at index {idx}: {str(idx_error)}")
                    debug.log(
                        event="delete_index_error",
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={
                            "index": idx,
                            "error": str(idx_error),
                            "error_type": type(idx_error).__name__
                        }
                    )
                    
            # Delete messages from short_messages list if it exists
            if hasattr(session, 'short_messages') and session.short_messages:
                for idx in indices_to_delete:
                    try:
                        if 0 <= idx < len(session.short_messages):
                            del session.short_messages[idx]
                            deleted_short_indices.append(idx)
                        else:
                            debug.log(
                                event="short_message_index_out_of_range",
                                category="CONVERSATION_INSPECTOR_DEBUG",
                                data={
                                    "index": idx,
                                    "short_messages_length": len(session.short_messages),
                                    "action": "skipping"
                                }
                            )
                    except Exception as short_idx_error:
                        errors.append(f"Error deleting short message at index {idx}: {str(short_idx_error)}")
                        debug.log(
                            event="delete_short_index_error",
                            category="CONVERSATION_INSPECTOR_DEBUG",
                            data={
                                "index": idx,
                                "error": str(short_idx_error),
                                "error_type": type(short_idx_error).__name__
                            }
                        )

            # Count successfully deleted messages
            deleted_count = len(deleted_indices)
            
            # Verify message lists are still consistent
            current_messages_count = len(session.messages)
            current_short_messages_count = len(session.short_messages) if hasattr(session, 'short_messages') and session.short_messages else 0
            
            # Check for inconsistency
            if hasattr(session, 'short_messages') and session.short_messages and current_messages_count != current_short_messages_count:
                warning_msg = f"Warning: Message lists are inconsistent after deletion (messages: {current_messages_count}, short_messages: {current_short_messages_count})"
                errors.append(warning_msg)
                debug.log(
                    event="message_list_inconsistency",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "messages_count": current_messages_count,
                        "short_messages_count": current_short_messages_count,
                        "deleted_indices": deleted_indices,
                        "deleted_short_indices": deleted_short_indices
                    }
                )

            # Update context if needed
            if deleted_count > 0 and hasattr(session, 'rebuild_context'):
                try:
                    session.rebuild_context()
                    debug.log(
                        event="context_rebuilt",
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={"session_id": request.session_id}
                    )
                except Exception as rebuild_error:
                    errors.append(f"Warning: Failed to rebuild context: {str(rebuild_error)}")
                    debug.log(
                        event="context_rebuild_error",
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={
                            "error": str(rebuild_error),
                            "error_type": type(rebuild_error).__name__
                        }
                    )

            debug.log(
                event="messages_deleted",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "session_id": request.session_id,
                    "requested_delete_count": len(indices_to_delete),
                    "actual_deleted_count": deleted_count,
                    "original_messages_count": original_messages_count,
                    "current_messages_count": current_messages_count,
                    "deleted_indices": deleted_indices
                }
            )

        except Exception as e:
            debug.log(
                event="error_deleting_messages",
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "session_id": request.session_id,
                    "indices": indices_to_delete,
                    "stack_trace": traceback.format_exc()
                }
            )
            errors.append(f"Error during message deletion: {str(e)}")

        return DeleteResponse(
            success=deleted_count > 0,
            deleted_count=deleted_count,
            errors=errors if errors else None
        )

    try:
        # Use session lock to ensure thread safety
        return await lock_manager.with_session_lock(request.session_id, perform_deletion)
        
    except HTTPException:
        raise
    except Exception as e:
        debug.log(
            event="error_deleting_messages",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "error_type": type(e).__name__,
                "stack_trace": traceback.format_exc()
            }
        )
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting messages: {str(e)}"
        )