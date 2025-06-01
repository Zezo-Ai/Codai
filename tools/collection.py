"""Collection classes for managing multiple tools."""

from typing import Any, List
import json

from anthropic.types.beta import BetaToolUnionParam
from debug.debug_logger import debug

from .base import BaseAnthropicTool, ToolError, ToolFailure, ToolResult


class ToolCollection:
    """A collection of anthropic-defined tools."""

    def __init__(self, *tools: BaseAnthropicTool):
        self.tools = tools
        # Set tool IDs
        for i, tool in enumerate(tools):
            tool.set_tool_id(f"{tool.__class__.__name__}_{i}")
        self.tool_map = {tool.to_params()["name"]: tool for tool in tools}  # tool.to_params() still returns individual tool params

    def to_params(self) -> list[BetaToolUnionParam]:
        """
        Convert tools to API parameters.
        Adds cache control marker to last tool which covers all previous tools.
        
        Args:
            log_cache_control: Whether to log cache control addition. Set to False for subsequent calls.
        """
        # Get base parameters from all tools
        tool_params = [tool.to_params() for tool in self.tools]
        


        # Add cache control to last tool if we have any tools
        if tool_params:
            last_tool = tool_params[-1]
            last_tool["cache_control"] = {"type": "ephemeral"}
            
            # Log cache control addition to tool
            debug.log(
                event='cache_control_added',
                module='tools/collection',
                data={
                    'context': 'tools',
                    'tool_name': last_tool['name'],
                    'tool_index': len(tool_params) - 1,
                    'total_tools': len(tool_params),
                    'cache_control_type': 'ephemeral'
                }
            )
            

        
        return tool_params

    async def run(self, *, name: str, tool_input: dict[str, Any]) -> ToolResult:
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")
        try:
            # Run the tool
            result = await tool(**tool_input)
            return result
        except ToolError as e:
            return ToolFailure(error=e.message)