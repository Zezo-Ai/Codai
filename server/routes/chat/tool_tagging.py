"""
Helper functions for tagging tool results with start/end markers.
This ensures the frontend can properly detect and visualize tool states.
"""

from typing import Dict, Any, Optional, AsyncGenerator, Callable
from .message_handler import format_sse_data
from .stream_tags import *

async def tag_tool_result(
    content_generator: AsyncGenerator[Dict[str, Any], None],
    tool_name: str,
    tool_type: str,
    metadata: Optional[Dict[str, Any]] = None
) -> AsyncGenerator[str, None]:
    """
    Wrap a tool result generator with start/end tags for proper frontend state visualization.
    
    Args:
        content_generator: Generator producing tool result content
        tool_name: Name of the tool (e.g., "file_edit", "folder_ops")
        tool_type: Type of the tool result (e.g., "file", "directory_listing")
        metadata: Additional metadata to include
        
    Yields:
        Tagged SSE data
    """
    # Send tool result start tag
    yield format_sse_data({
        "type": TOOL_RESULT_START,
        "tool": tool_name,
        "result_type": tool_type,
        "metadata": metadata or {}
    })
    
    # Stream the actual content
    try:
        async for content in content_generator:
            # If already formatted as SSE, yield as is
            if isinstance(content, str) and content.startswith("data: "):
                yield content
            else:
                # Otherwise, add tool_result type and format
                if isinstance(content, dict) and "type" not in content:
                    content["type"] = TOOL_RESULT_CONTENT
                yield format_sse_data(content)
    except Exception as e:
        # Send error if generator fails
        yield format_sse_data({
            "type": "error",
            "content": f"Error in tool result: {str(e)}"
        })
    
    # Send tool result end tag
    yield format_sse_data({
        "type": TOOL_RESULT_END,
        "tool": tool_name,
        "result_type": tool_type
    })

def format_tool_result_start(
    tool_name: str, 
    tool_type: str, 
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Format a tool result start tag."""
    return {
        "type": TOOL_RESULT_START,
        "tool": tool_name,
        "result_type": tool_type,
        "metadata": metadata or {}
    }

def format_tool_result_content(
    content: Any,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Format tool result content."""
    # If content is already a dict, add type
    if isinstance(content, dict):
        if "type" not in content:
            content["type"] = TOOL_RESULT_CONTENT
        if metadata:
            content["metadata"] = {**(content.get("metadata", {})), **metadata}
        return content
    
    # Otherwise, wrap in a dictionary
    return {
        "type": TOOL_RESULT_CONTENT,
        "content": content,
        "metadata": metadata or {}
    }

def format_tool_result_end(
    tool_name: str, 
    tool_type: str,
    summary: Optional[str] = None
) -> Dict[str, Any]:
    """Format a tool result end tag."""
    return {
        "type": TOOL_RESULT_END,
        "tool": tool_name,
        "result_type": tool_type,
        "summary": summary
    }

def format_tool_call_start(
    tool_name: str,
    action: str,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Format a tool call start tag."""
    return {
        "type": TOOL_CALL_START,
        "tool": tool_name,
        "action": action,
        "metadata": metadata or {}
    }

def format_tool_call_end(
    tool_name: str,
    action: str,
    success: bool = True,
    message: Optional[str] = None
) -> Dict[str, Any]:
    """Format a tool call end tag."""
    return {
        "type": TOOL_CALL_END,
        "tool": tool_name,
        "action": action,
        "success": success,
        "message": message
    }

# Helper for file content specifically
def format_file_content_with_tags(
    content: str,
    metadata: Dict[str, Any],
    file_path: Optional[str] = None
) -> list[Dict[str, Any]]:
    """Format file content with start/end tags."""
    path = file_path or metadata.get("path", "unknown_file")
    
    return [
        format_tool_result_start("file_edit", "file", {"path": path}),
        {
            "type": FILE_CONTENT,
            "content": content,
            "metadata": metadata
        },
        format_tool_result_end("file_edit", "file")
    ]