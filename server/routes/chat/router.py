from fastapi import APIRouter, Body, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from core.types import ChatCompletionRequest
from .utils import CustomAPIRoute
from .models import ChatResetRequest
from .state import (
    chat_sessions,
    get_session_messages, set_session_messages,
    get_or_create_session, delete_session
)
from debug.debug_logger import debug
from .handlers import handle_chat_completion
from .conversation_inspector import router as inspector_router
from core.config_manager import get_config


router = APIRouter(
    tags=["chat"],
    route_class=CustomAPIRoute
)

# Include sub-routers
router.include_router(inspector_router)

@router.options("/codai/chat/reset")
async def chat_reset_options():
    """Handle OPTIONS request for chat reset endpoint."""
    return JSONResponse(
        status_code=200,
        content={"detail": "OK"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        }
    )

@router.post("/codai/chat/reset")
async def reset_chat(request: ChatResetRequest = Body(...)):
    """Reset chat state for a specific session."""
    # Validate request
    if not request.session_id:
        debug.log(
            event="session_reset_error",
            category="CONVERSATION_PERSISTENCE_DEBUG",
            data={"error": "Missing session_id"}
        )
        raise ValueError("Session ID is required")

    debug.log(
        event="session_reset_request",
        session_id=request.session_id,
        category="CONVERSATION_PERSISTENCE_DEBUG",
        data={"operation": "delete_session"}
    )

    try:
        # Check if session exists to capture state before deletion
        current_session = get_or_create_session(request.session_id)
        
        # Delete the session
        delete_session(request.session_id)
        
        return JSONResponse({
            "status": "success",
            "message": "Chat session deleted successfully",
            "session_id": request.session_id
        })
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete chat session: {str(e)}"
        )

@router.options("/codai/chat/stream")
async def chat_stream_options():
    return JSONResponse(
        status_code=200,
        content={"detail": "OK"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        }
    )

@router.post("/codai/chat/stream", status_code=200)
async def chat_stream(request: Request, chat_request: ChatCompletionRequest):
    """Handle chat completion requests."""
    return await handle_chat_completion(request, chat_request)

@router.get("/codai/chat/config")
async def get_chat_config():
    """Get chat configuration settings."""
    config = get_config()
    return JSONResponse({
        "expert_mode": {
            "enabled": config.get('ai.expert_mode.enabled', False)
        }
    })

@router.post("/codai/chat/config")
async def update_chat_config(request: Request):
    """Update chat configuration settings."""
    try:
        data = await request.json()
        
        # Import config manager functions
        from core.config_manager import update_config, save_config
        
        # Update expert mode setting if provided
        if "expert_mode" in data and "enabled" in data["expert_mode"]:
            enabled = bool(data["expert_mode"]["enabled"])
            update_config('ai.expert_mode.enabled', enabled)
            
            # Save the updated configuration
            save_config()
            
            debug.log(
                event="config_updated",
                data={
                    "setting": "ai.expert_mode.enabled",
                    "value": enabled,
                    "source": "frontend_settings"
                },
                category="CONFIG_MANAGEMENT"
            )
        
        # Return updated config
        updated_config = get_config()
        return JSONResponse({
            "success": True,
            "expert_mode": {
                "enabled": updated_config.get('ai.expert_mode.enabled', False)
            }
        })
        
    except Exception as e:
        debug.log(
            event="config_update_error",
            data={
                "error": str(e),
                "error_type": type(e).__name__
            },
            category="CONFIG_MANAGEMENT"
        )
        raise HTTPException(status_code=500, detail=f"Failed to update configuration: {str(e)}")