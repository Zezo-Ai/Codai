import re
from typing import Dict
from tools.collection import ToolCollection
from tools.computer import ComputerTool
from tools.edit import EditTool
from tools.system_ops import FolderOperator
from tools.web import WebSearchTool, WebFetcherTool, WebInteractionTool
from tools.pdf import PDFTool
from core.configuration import ToolConfig
from server.logging import get_logger
from ..utils import CustomAPIRoute, filter_tool_output, format_sse_data, send_screenshot_chunks

logger = get_logger("chat")

def format_numbered_code(code: str) -> str:
    """Format code with consistent line numbers."""
    # Split into lines and remove empty lines at the end
    lines = code.rstrip().split('\n')
    
    # Remove existing line numbers if present
    clean_lines = []
    for line in lines:
        # Remove leading spaces/tabs and line numbers if they exist
        match = re.match(r'^\s*\d+\s+(.*)$', line)
        if match:
            clean_lines.append(match.group(1))
        else:
            clean_lines.append(line.lstrip())

    # Add consistent line numbers
    max_line_num = len(clean_lines)
    line_num_width = len(str(max_line_num))
    numbered_lines = []
    
    for i, line in enumerate(clean_lines, 1):
        # Format: "{line_number:>width}  {code}"
        numbered_lines.append(f"{i:>{line_num_width}}  {line}")
    
    return '\n'.join(numbered_lines)

def get_tool_collection(headers: Dict[str, str], tool_callback=None) -> ToolCollection:
    """Create tool collection based on enabled features and request headers."""
    tools = []
    
    # Check computer tool access from headers first, then config
    computer_enabled = headers.get("x-computer-use-enabled", "true").lower() == "true"
    if computer_enabled and ToolConfig.computer_enabled():
        computer_tool = ComputerTool()
        if tool_callback:
            computer_tool.set_callback(tool_callback)
        tools.append(computer_tool)
    
    # Other tools are controlled by config only
    # Edit tool is always enabled
    edit_tool = EditTool()
    if tool_callback:
        edit_tool.set_callback(tool_callback)
    tools.append(edit_tool)
    
    # System operations tool is always enabled
    folder_tool = FolderOperator()
    if tool_callback:
        folder_tool.set_callback(tool_callback)
    tools.append(folder_tool)
    
    # Add PDF tool (always enabled)
    pdf_tool = PDFTool()
    if tool_callback:
        pdf_tool.set_callback(tool_callback)
    tools.append(pdf_tool)
    
    # Add web tools
    if ToolConfig.web_enabled():
        
        # Add web search tool
        web_search_tool = WebSearchTool()
        if tool_callback:
            web_search_tool.set_callback(tool_callback)
        tools.append(web_search_tool)
        
        # Add web fetcher tool
        web_fetcher_tool = WebFetcherTool()
        if tool_callback:
            web_fetcher_tool.set_callback(tool_callback)
        tools.append(web_fetcher_tool)
        
        # Add web interaction tool (for form filling, login, etc.)
        web_interaction_tool = WebInteractionTool()
        if tool_callback:
            web_interaction_tool.set_callback(tool_callback)
        tools.append(web_interaction_tool)
        
    tool_collection = ToolCollection(*tools)
    logger.info(f"Created tool collection with tools: {[type(tool).__name__ for tool in tool_collection.tools]}")
    return tool_collection