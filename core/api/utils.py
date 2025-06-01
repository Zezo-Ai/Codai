from typing import List
from tools.base import ToolResult

def _maybe_prepend_system_tool_result(result: ToolResult, result_text: str) -> str:
    if result.system:
        return f"<system>{result.system}</system>\n{result_text}"
    return result_text

def _maybe_filter_to_n_most_recent_images(
    messages: list[dict],
    images_to_keep: int,
    min_removal_threshold: int = 5,
):
    if images_to_keep is None:
        return messages

    tool_result_blocks = [
        item
        for message in messages
        for item in (message["content"] if isinstance(message["content"], list) else [])
        if isinstance(item, dict) and item.get("type") == "tool_result"
    ]

    total_images = sum(
        1
        for tool_result in tool_result_blocks
        for content in tool_result.get("content", [])
        if isinstance(content, dict) and content.get("type") == "image"
    )

    images_to_remove = total_images - images_to_keep
    images_to_remove -= images_to_remove % min_removal_threshold

    for tool_result in tool_result_blocks:
        if isinstance(tool_result.get("content"), list):
            new_content = []
            for content in tool_result.get("content", []):
                if isinstance(content, dict) and content.get("type") == "image":
                    if images_to_remove > 0:
                        images_to_remove -= 1
                        continue
                new_content.append(content)
            tool_result["content"] = new_content