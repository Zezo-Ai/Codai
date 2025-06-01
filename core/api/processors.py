from typing import Any, Callable, List, Dict
from tools.base import ToolResult
from tools.collection import ToolCollection
from .utils import _maybe_prepend_system_tool_result

async def _process_tool_results(
    content: List[Any],
    tool_collection: ToolCollection,
    output_callback: Callable[[Any], None],
    tool_output_callback: Callable[[ToolResult, str], None],
) -> List[Any]:
    """Process tool results from the assistant's response.
    
    Args:
        content (List[Any]): The content blocks to process
        tool_collection (ToolCollection): Available tools
        output_callback (Callable): Callback for content blocks
        tool_output_callback (Callable): Callback for tool results
        
    Returns:
        List[Any]: Processed tool results
        
    Note:
        - Handles tool execution errors gracefully
        - Maintains execution order of tools
        - Processes both successful and failed tool executions
    """
    tool_result_content = []
    for content_block in content:
        output_callback(content_block)
        if content_block.type == "tool_use":
            result = await tool_collection.run(
                name=content_block.name,
                tool_input=content_block.input,
            )
            # Consistently mark as tool result
            result_dict = _make_api_tool_result(result, content_block.id)
            tool_result_content.append(result_dict)
            
            # Let callback know it's a tool result AND the tool name
            # Store tool name in session
            session = getattr(result, '_session', None)
            if session:
                session.current_tool_name = content_block.name
                
            # Pass result to callback
            callback_result = tool_output_callback(result, content_block.id)
            if callback_result:
                callback_result["type"] = "tool_result"  # Ensure type is set
                callback_result["tool"] = content_block.name  # Include the actual tool name
                
    return tool_result_content

def _make_api_tool_result(result: ToolResult, tool_use_id: str) -> Dict[str, Any]:
    """Create an API-compatible tool result dictionary.
    
    Args:
        result (ToolResult): The tool execution result
        tool_use_id (str): The ID of the tool use request
        
    Returns:
        Dict[str, Any]: Formatted tool result
        
    Note:
        Handles three types of results:
        1. Error results (sets is_error=True)
        2. Text output (formatted with system prefix if needed)
        3. Image output (properly formatted base64 data)
    """
    tool_result_content = []
    is_error = False

    if result.error:
        is_error = True
        tool_result_content = _maybe_prepend_system_tool_result(result, result.error)
    else:
        if result.output:
            tool_result_content.append({
                "type": "text",
                "text": _maybe_prepend_system_tool_result(result, result.output),
            })
        if result.base64_image:
            tool_result_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": result.base64_image,
                }
            })

    return {
        "type": "tool_result",
        "content": tool_result_content,
        "tool_use_id": tool_use_id,
        "is_error": is_error,
    }