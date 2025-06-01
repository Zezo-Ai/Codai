"""Handle message ordering in chat responses."""

from typing import Dict, Any, AsyncGenerator
from server.logging import get_logger
from .message_handler import format_sse_data, format_message_with_type
from .state import get_session_screenshot, set_session_screenshot

logger = get_logger("chat.message_ordering")

async def handle_message_chunk(chunk: Dict[str, Any], session_id: str) -> AsyncGenerator[str, None]:
    """Handle message chunks in the correct order."""
    
    # First handle any pending screenshots
    screenshot = get_session_screenshot(session_id)
    if screenshot:
        try:
            logger.debug("Sending screenshot before text", extra={
                'session_id': session_id
            })
            yield format_sse_data({
                "choices": [{
                    "delta": {
                        "type": "screenshot",
                        "content": screenshot
                    }
                }]
            })
            set_session_screenshot(session_id, None)
            logger.debug("Screenshot sent successfully", extra={
                'session_id': session_id
            })
        except Exception as e:
            logger.error("Screenshot error", extra={
                'session_id': session_id,
                'error': str(e)
            })
    
    # Then handle any text content
    if chunk.get("content"):
        yield format_sse_data(format_message_with_type(chunk["content"]))