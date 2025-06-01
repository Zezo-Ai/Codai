"""Export functionality for Conversation Inspector."""

from datetime import datetime
from fastapi import APIRouter
from .models import ExportRequest, ExportResponse, ExportData
from ..state import get_or_create_session
from debug.debug_logger import debug

router = APIRouter()

@router.post("/export")
async def export_messages(request: ExportRequest) -> ExportResponse:
    """
    Export all messages from a session.
    
    Args:
        request: ExportRequest with session_id
        
    Returns:
        ExportResponse with messages and metadata
    """
    try:
        debug.log(
            event="export_messages_start",
            session_id=request.session_id,
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"action": "starting_export"}
        )

        session = get_or_create_session(request.session_id)
        if not session:
            raise ValueError("Failed to get session")

        # Format messages for export
        formatted_messages = []
        for msg in session.messages:
            try:
                # Convert message to dict if needed
                if hasattr(msg, "model_dump"):  # Pydantic v2
                    msg_dict = msg.model_dump()
                elif hasattr(msg, "dict"):      # Pydantic v1
                    msg_dict = msg.dict()
                else:
                    msg_dict = msg  # Already a dict

                # Format content using utility function
                from .utils import format_message_content
                formatted_content = format_message_content(
                    msg_dict.get("content", []),
                    request.session_id
                )

                formatted_msg = {
                    "role": msg_dict.get("role", "unknown"),
                    "content": formatted_content
                }

                # Validate message structure
                from .utils import validate_message_structure
                is_valid, error = validate_message_structure(formatted_msg)
                if not is_valid:
                    debug.log(
                        event="export_message_validation_error",
                        session_id=request.session_id,
                        category="CONVERSATION_INSPECTOR_DEBUG",
                        data={"error": error}
                    )
                    continue
                formatted_messages.append(formatted_msg)

            except Exception as e:
                debug.log(
                    event="export_message_error",
                    session_id=request.session_id,
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={
                        "error": str(e),
                        "message": str(msg)[:200]
                    }
                )
                continue  # Skip problematic messages but continue with others

        export_data = ExportData(
            version="1.0.0",
            exported_at=datetime.utcnow().isoformat(),
            messages=formatted_messages
        )

        metadata = {
            "exported_at": export_data.exported_at,
            "message_count": len(formatted_messages)
        }

        debug.log(
            event="export_messages_complete",
            session_id=request.session_id,
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"metadata": metadata}
        )

        return ExportResponse(
            success=True,
            data=export_data,
            metadata=metadata
        )

    except Exception as e:
        debug.log(
            event="export_messages_error",
            session_id=request.session_id,
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={
                "error": str(e),
                "error_type": type(e).__name__
            }
        )
        return ExportResponse(
            success=False,
            error=f"Failed to export messages: {str(e)}"
        )