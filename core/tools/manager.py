"""Tool management module for CODAI application."""

from typing import Dict, List, Optional, TypedDict
from tools.base import BaseAnthropicTool, ToolResult
from tools.collection import ToolCollection
from tools.computer import ComputerTool
from tools.edit import EditTool
from tools.web import WebSearchTool, WebFetcherTool, WebInteractionTool  # Import web tools


class ToolConfig(TypedDict):
    """Configuration for a single tool."""
    enabled: bool
    default_format: str
    options: Dict


class RuntimeConfig(TypedDict, total=False):
    """Runtime configuration that can override base config."""
    computer_enabled: bool
    output_format: str


class ToolManager:
    """Manages tool initialization, access, and execution."""

    def __init__(self, config: Dict[str, ToolConfig]):
        """Initialize the tool manager with configuration.
        
        Args:
            config: Dictionary of tool configurations
        """
        self.config = config
        self._tools: Dict[str, BaseAnthropicTool] = {}
        self._initialize_tools()

    def _initialize_tools(self) -> None:
        """Initialize tools based on configuration."""
        # Computer tool is optional
        if self.config.get('computer', {}).get('enabled', False):
            self._tools['computer'] = ComputerTool()
        
        # Edit tool is always available
        self._tools['edit'] = EditTool()
        
        # Initialize web tools if enabled
        if self.config.get('tools', {}).get('web', {}).get('enabled', True):
            # Web search tool
            self._tools['web_search'] = WebSearchTool()
            
            # Web fetch tool
            self._tools['web_fetch'] = WebFetcherTool()
            
            # Web interaction tool (for form filling, clicking, etc.)
            if self.config.get('tools', {}).get('web', {}).get('interaction_enabled', True):
                self._tools['web_interact'] = WebInteractionTool()

    def get_collection(
        self, 
        features: Optional[List[str]] = None,
        runtime_config: Optional[Dict[str, str]] = None
    ) -> ToolCollection:
        """Get tool collection based on enabled features and runtime configuration.
        
        Args:
            features: Optional list of feature names to include
            runtime_config: Optional runtime configuration (e.g., headers)
            
        Returns:
            ToolCollection instance with enabled tools
        """
        enabled_tools = []
        runtime_config = runtime_config or {}
        
        for tool_name, tool in self._tools.items():
            # Skip if not in requested features
            if features and tool_name not in features:
                continue
                
            # Special handling for computer tool
            if tool_name == 'computer':
                # Check header first, then config
                header_enabled = runtime_config.get('x-computer-use-enabled', 'true').lower() == 'true'
                config_enabled = self.config.get('computer', {}).get('enabled', False)
                if header_enabled and config_enabled:
                    enabled_tools.append(tool)
                continue

            # Special handling for web tools
            if tool_name in ['web_search', 'web_fetch', 'web_interact']:
                web_enabled = self.config.get('tools', {}).get('web', {}).get('enabled', True)
                
                # Additional check for web_interact
                if tool_name == 'web_interact':
                    interaction_enabled = self.config.get('tools', {}).get('web', {}).get('interaction_enabled', True)
                    if web_enabled and interaction_enabled:
                        enabled_tools.append(tool)
                # For other web tools
                elif web_enabled:
                    enabled_tools.append(tool)
                continue
            
            # Other tools use config only
            if self.config.get(tool_name, {}).get('enabled', False):
                enabled_tools.append(tool)
        
        return ToolCollection(*enabled_tools)

    async def execute_command(
        self,
        tool_name: str,
        command: str,
        params: dict,
        runtime_config: Optional[Dict[str, str]] = None,
        output_format: Optional[str] = None
    ) -> ToolResult:
        """Execute a tool command with specified parameters.
        
        Args:
            tool_name: Name of the tool to execute
            command: Command to execute
            params: Command parameters
            runtime_config: Optional runtime configuration (e.g., headers)
            output_format: Optional output format override
            
        Returns:
            ToolResult containing command output
            
        Raises:
            ValueError: If tool is not found or disabled
        """
        runtime_config = runtime_config or {}
        
        if tool_name not in self._tools:
            raise ValueError(f"Tool {tool_name} not found")
        
        # Check tool availability
        if tool_name == 'computer':
            header_enabled = runtime_config.get('x-computer-use-enabled', 'true').lower() == 'true'
            config_enabled = self.config.get('computer', {}).get('enabled', False)
            if not (header_enabled and config_enabled):
                raise ValueError(f"Tool {tool_name} is disabled")
        else:
            if not self.config.get(tool_name, {}).get('enabled', False):
                raise ValueError(f"Tool {tool_name} is disabled")

        tool = self._tools[tool_name]
        format_to_use = output_format or self.config.get(tool_name, {}).get('default_format', 'cli')
        
        return await tool.__call__(
            command=command,
            output_format=format_to_use,
            **params
        )


def get_tool_manager(
    config: Optional[Dict[str, ToolConfig]] = None,
    runtime_config: Optional[Dict[str, str]] = None
) -> ToolManager:
    """Get or create a ToolManager instance.
    
    Args:
        config: Optional configuration override
        runtime_config: Optional runtime configuration
        
    Returns:
        ToolManager instance
    """
    if not config:
        from core.configuration import ToolConfig as ConfigToolConfig
        # Create a default config structure
        config = {
            'computer': {'enabled': ConfigToolConfig.computer_enabled()},
            'edit': {'enabled': True},
            'tools': {
                'web': {'enabled': ConfigToolConfig.web_enabled()}
            }
        }
    return ToolManager(config)