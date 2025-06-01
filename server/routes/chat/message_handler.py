"""Message formatting utilities for chat responses."""

from typing import Dict, Any, Optional
import json
from server.logging import get_logger
from .state import get_session_messages, set_session_messages

logger = get_logger("chat")

class MessageEncoder(json.JSONEncoder):
    """Custom encoder for Anthropic message types."""
    def default(self, obj):
        # Handle any object with text attribute
        if hasattr(obj, 'text'):
            return {"type": "text", "text": obj.text}
        # Handle objects with model_dump
        if hasattr(obj, 'model_dump'):
            return obj.model_dump()
        return super().default(obj)

def format_sse_data(data: Dict[str, Any]) -> str:
    """Format data for SSE transmission."""
    try:
        formatted = json.dumps(data, cls=MessageEncoder)
        logger.debug(f"Formatting SSE data: {formatted[:200]}...")  # Log first 200 chars
        return f"data: {formatted}\n\n"
    except Exception as e:
        logger.error(f"Error formatting SSE data: {e}")
        return f"data: {json.dumps({'error': str(e)}, cls=MessageEncoder)}\n\n"

def format_message_with_type(content: str, message_type: str = "text", metadata: Optional[Dict] = None, role: str = "assistant") -> Dict[str, Any]:
    """Format messages with proper type preservation for session storage."""
    return {
        "choices": [{
            "delta": {
                "content": content,
                "type": message_type,
                "metadata": metadata or {},
                "role": role
            }
        }]
    }

def format_tool_start(tool: str, action: str) -> Dict[str, Any]:
    """Format tool start message."""
    return format_message_with_type(
        content=f"🔧 Using {tool}: {action}\n",
        message_type="action",
        metadata={"tool": tool, "action": action},
        role="assistant"  # Tools are executed by the assistant
    )
    
def format_web_search(query: str, results: list, engine: str) -> Dict[str, Any]:
    """Format web search results."""
    return format_message_with_type(
        content=f"Search results for '{query}' from {engine}",
        message_type="web_search",
        metadata={
            "query": query,
            "engine": engine,
            "num_results": len(results),
            "results": results
        },
        role="assistant"  # Web search results are part of assistant responses
    )

def format_tool_complete(message: str) -> Dict[str, Any]:
    """Format tool completion message."""
    return format_message_with_type(
        content=f"✨ {message}\n",
        message_type="action",
        role="assistant"  # Tool completions are from the assistant
    )

def format_tool_error(error: str) -> Dict[str, Any]:
    """Format tool error message."""
    return format_message_with_type(
        content=f"❌ Error: {error}\n",
        message_type="error",
        role="system"  # Errors are system messages
    )

def format_image_data(image_data: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
    """Format image data for display."""
    return {
        "choices": [{
            "delta": {
                "type": "screenshot",
                "content": image_data,
                "metadata": metadata or {},
                "role": "assistant"  # Screenshots are taken by the assistant
            }
        }]
    }

def format_file_data(content: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Format file content for display."""
    from .stream_tags import FILE_CONTENT
    
    # First, prepare the main file content message
    file_message = format_message_with_type(
        content=content,
        message_type=FILE_CONTENT,  # Use consistent tag from stream_tags
        metadata=metadata,
        role="assistant"  # File data is part of assistant responses
    )
    
    # Add special flags to help frontend detect this is file content
    if "choices" in file_message and len(file_message["choices"]) > 0:
        # Add a clear "tool_result: true" flag
        if "metadata" not in file_message["choices"][0]["delta"]:
            file_message["choices"][0]["delta"]["metadata"] = {}
        
        # Mark as both tool result and file
        file_message["choices"][0]["delta"]["metadata"]["tool_result"] = True
        file_message["choices"][0]["delta"]["metadata"]["result_type"] = "file"
    
    return file_message

def format_text_message(content: str, metadata: Optional[Dict] = None, role: str = "assistant") -> Dict[str, Any]:
    """Format regular text message."""
    return format_message_with_type(content, "text", metadata, role)

async def send_screenshot_response(screenshot_data: str):
    """Generate screenshot response messages."""
    try:
        # Send start notification
        yield format_sse_data(format_tool_start("Screenshot", "capture"))
        
        # Send image data
        yield format_sse_data(format_image_data(screenshot_data))
        
        # Send completion
        yield format_sse_data(format_tool_complete("Screenshot captured"))
        
    except Exception as e:
        logger.error(f"Error sending screenshot: {e}")
        yield format_sse_data(format_tool_error(str(e)))