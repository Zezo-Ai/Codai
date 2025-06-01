"""
Server Reload Handler

Responsible for handling server reload events and state management between reloads,
but doesn't create external state files.
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

# In-memory state management only
class ReloadHandler:
    """
    Handles server reload events and state persistence.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize the reload handler.
        
        Args:
            config: Optional configuration dictionary
        """
        self.config = config or {}
        
        # Initialize with empty state - we're not loading from file anymore
        self.state = {
            "reload_count": 0,
            "last_reload": 0
        }
        
        self.logger = logging.getLogger("server.reload")
        self.logger.debug("Reload handler initialized with in-memory state only")
    
    def on_reload(self) -> None:
        """
        Called when the server is reloaded.
        
        Performs state management and initialization tasks.
        """
        # Update reload counter
        self.state["reload_count"] = self.state.get("reload_count", 0) + 1
        
        # Store timestamp
        import time
        self.state["last_reload"] = time.time()
        
        # Log reload event
        self.logger.info(f"Server reloaded (count: {self.state['reload_count']})")
        
        # No file saving anymore
    
    def get_state(self) -> Dict[str, Any]:
        """
        Get the current reload state.
        
        Returns:
            Dict with reload state
        """
        return self.state
    
    def set_state_value(self, key: str, value: Any) -> None:
        """
        Set a value in the reload state.
        
        Args:
            key: State key
            value: State value
        """
        self.state[key] = value
        # No file saving anymore
    
    def get_state_value(self, key: str, default: Any = None) -> Any:
        """
        Get a value from the reload state.
        
        Args:
            key: State key
            default: Default value if key not found
        
        Returns:
            Value from state or default
        """
        return self.state.get(key, default)


# Global handler instance
_reload_handler = None

def get_reload_handler(config: Dict[str, Any] = None) -> ReloadHandler:
    """
    Get the global reload handler instance.
    
    Args:
        config: Optional configuration dictionary
    
    Returns:
        ReloadHandler instance
    """
    global _reload_handler
    if _reload_handler is None:
        _reload_handler = ReloadHandler(config)
    return _reload_handler