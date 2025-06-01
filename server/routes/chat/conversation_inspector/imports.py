"""Import functionality for Conversation Inspector."""

import traceback
from datetime import datetime
from fastapi import APIRouter, HTTPException
from .models import ImportRequest, ImportResponse
from ..state import get_or_create_session
from debug.debug_logger import debug

router = APIRouter()

@router.post("/import")
async def import_messages(request: ImportRequest) -> ImportResponse:
    """
    Import messages into a session.
    
    Args:
        request: ImportRequest with session_id and messages data
        
    Returns:
        ImportResponse with import status and metadata
    """
    try:
        session = get_or_create_session(request.session_id)
        
        # Session will be created if it doesn't exist

        # Basic validation
        if not request.data or not isinstance(request.data, dict):
            raise ValueError("Import data must be a valid object")
            
        if "messages" not in request.data or not isinstance(request.data["messages"], list):
            raise ValueError("Import data must contain messages array")

        errors = []
        imported_count = 0

        # Convert and validate messages
        converted_messages = []
        for idx, msg in enumerate(request.data["messages"]):
            try:
                if not isinstance(msg, dict):
                    errors.append(f"Message at index {idx} must be an object")
                    continue
                
                if "role" not in msg or "content" not in msg:
                    errors.append(f"Message at index {idx} missing required fields")
                    continue

                # Process content
                content = msg["content"]
                if not isinstance(content, list):
                    content = [content]

                converted_msg = {
                    "role": msg["role"],
                    "content": content
                }
                converted_messages.append(converted_msg)
                imported_count += 1

            except Exception as e:
                errors.append(f"Error processing message at index {idx}: {str(e)}")
                debug.log(
                    event="import_message_error",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(e),
                        "message_index": idx,
                        "message": str(msg)[:200]
                    }
                )

        # Only update if we have valid messages
        if imported_count > 0:
            try:
                # Update both message lists
                session.messages = converted_messages
                session.short_messages = converted_messages.copy()

                debug.log(
                    event="messages_imported",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "session_id": request.session_id,
                        "imported_count": imported_count,
                        "error_count": len(errors)
                    }
                )
            except Exception as e:
                errors.append(f"Error updating session messages: {str(e)}")
                debug.log(
                    event="import_update_error",
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(e),
                        "stack_trace": traceback.format_exc()
                    }
                )

        metadata = {
            "imported_at": datetime.utcnow().isoformat(),
            "imported_messages": imported_count,
            "error_count": len(errors)
        }

        return ImportResponse(
            success=imported_count > 0,
            session_id=session.session_id,
            metadata=metadata,
            error="; ".join(errors) if errors else None
        )

    except ValueError as ve:
        debug.log(
            event="import_validation_error",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"error": str(ve)}
        )
        return ImportResponse(
            success=False,
            session_id=request.session_id,
            error=str(ve)
        )
    except HTTPException:
        raise
    except Exception as e:
        debug.log(
            event="import_error",
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "error_type": type(e).__name__,
                "stack_trace": traceback.format_exc()
            }
        )
        raise HTTPException(
            status_code=500,
            detail=f"Error importing messages: {str(e)}"
        )