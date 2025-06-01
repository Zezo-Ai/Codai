"""
Setup Configuration Module

Manages setup configuration defaults and user preferences.
This module provides a centralized place for all setup-related configuration.
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Optional, Any, Union

from . import utils

# Default configuration
DEFAULT_CONFIG = {
    # Directories
    "project_root": str(utils.PROJECT_ROOT),
    "backend_dir": str(utils.PROJECT_ROOT),
    "frontend_dir": str(utils.PROJECT_ROOT / "frontend"),
    
    # Ports
    "backend_port": 8000,
    "frontend_port": 8001,
    
    # URLs
    "backend_host": "127.0.0.1",
    "frontend_host": "127.0.0.1",
    
    # Features
    "setup_backend": True,
    "setup_frontend": True,
    "configure_vscode": True,
    "install_dependencies": True,
    "create_poetry_venv": True,
    
    # Environment
    "environment": "development",
    "create_env_file": True,
    "check_api_key": True,
    
    # Poetry
    "poetry_version": ">=1.4.0",
    "use_existing_poetry": True,
    
    # Port management
    "auto_find_ports": True,
    "allow_kill_processes": False,
    
    # Advanced
    "timeout": 60,
    "verbose": False,
    "interactive": True,
    "use_colors": True,
    
    # Application running
    "auto_run": True  # Automatically run application after setup
}

# File paths - use temp directory inside setup folder
from pathlib import Path
temp_dir = Path(__file__).parent / "temp"
temp_dir.mkdir(exist_ok=True)
CONFIG_FILE = temp_dir / "setup_config.json"


class ConfigError(Exception):
    """Exception raised for configuration errors."""
    pass


def get_default_config() -> Dict[str, Any]:
    """
    Get default configuration.
    
    Returns:
        Dict: Default configuration
    """
    return DEFAULT_CONFIG.copy()


def load_config() -> Dict[str, Any]:
    """
    Load configuration from file or use defaults.
    
    Returns:
        Dict: Configuration
    """
    config = get_default_config()
    
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            utils.print_warning(f"Failed to load config file: {str(e)}")
    
    return config


def save_config(config: Dict[str, Any]) -> bool:
    """
    Save configuration to file.
    
    Args:
        config: Configuration to save
    
    Returns:
        bool: True if saved successfully, False otherwise
    """
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        return True
    except Exception as e:
        utils.print_error(f"Failed to save config file: {str(e)}")
        return False


def get_config_value(key: str, default: Any = None) -> Any:
    """
    Get configuration value.
    
    Args:
        key: Configuration key
        default: Default value if not found
    
    Returns:
        Any: Configuration value
    """
    config = load_config()
    return config.get(key, default)


def set_config_value(key: str, value: Any) -> bool:
    """
    Set configuration value.
    
    Args:
        key: Configuration key
        value: Configuration value
    
    Returns:
        bool: True if set successfully, False otherwise
    """
    config = load_config()
    config[key] = value
    return save_config(config)


def update_config(updates: Dict[str, Any]) -> bool:
    """
    Update multiple configuration values.
    
    Args:
        updates: Dictionary of updates
    
    Returns:
        bool: True if updated successfully, False otherwise
    """
    config = load_config()
    config.update(updates)
    return save_config(config)


def reset_config() -> bool:
    """
    Reset configuration to defaults.
    
    Returns:
        bool: True if reset successfully, False otherwise
    """
    return save_config(get_default_config())


def override_from_env(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Override configuration from environment variables.
    
    Args:
        config: Configuration to override
    
    Returns:
        Dict: Updated configuration
    """
    # Environment variables take precedence over config file
    # Format: CODAI_SETUP_KEY=value
    prefix = "CODAI_SETUP_"
    
    for key, value in os.environ.items():
        if key.startswith(prefix):
            config_key = key[len(prefix):].lower()
            
            # Convert string value to appropriate type
            if config_key in config:
                original_type = type(config[config_key])
                
                if original_type == bool:
                    config[config_key] = value.lower() in ("true", "yes", "1", "on")
                elif original_type == int:
                    try:
                        config[config_key] = int(value)
                    except ValueError:
                        pass
                elif original_type == float:
                    try:
                        config[config_key] = float(value)
                    except ValueError:
                        pass
                elif original_type == list:
                    config[config_key] = value.split(",")
                else:
                    config[config_key] = value
    
    return config


def override_from_args(config: Dict[str, Any], args: List[str]) -> Dict[str, Any]:
    """
    Override configuration from command-line arguments.
    
    Args:
        config: Configuration to override
        args: Command-line arguments
    
    Returns:
        Dict: Updated configuration
    """
    # Parse simple --key=value or --key arguments
    i = 0
    while i < len(args):
        arg = args[i]
        
        if arg.startswith("--"):
            key = arg[2:]
            
            if "=" in key:
                key, value = key.split("=", 1)
                
                # Convert value to appropriate type
                if key in config:
                    original_type = type(config[key])
                    
                    if original_type == bool:
                        config[key] = value.lower() in ("true", "yes", "1", "on")
                    elif original_type == int:
                        try:
                            config[key] = int(value)
                        except ValueError:
                            pass
                    elif original_type == float:
                        try:
                            config[key] = float(value)
                        except ValueError:
                            pass
                    elif original_type == list:
                        config[key] = value.split(",")
                    else:
                        config[key] = value
            elif i + 1 < len(args) and not args[i + 1].startswith("--"):
                # Next argument is a value
                key = arg[2:]
                value = args[i + 1]
                
                # Convert value to appropriate type
                if key in config:
                    original_type = type(config[key])
                    
                    if original_type == bool:
                        config[key] = value.lower() in ("true", "yes", "1", "on")
                    elif original_type == int:
                        try:
                            config[key] = int(value)
                        except ValueError:
                            pass
                    elif original_type == float:
                        try:
                            config[key] = float(value)
                        except ValueError:
                            pass
                    elif original_type == list:
                        config[key] = value.split(",")
                    else:
                        config[key] = value
                
                i += 1  # Skip next argument
            else:
                # Flag argument
                key = arg[2:]
                
                if key in config and isinstance(config[key], bool):
                    config[key] = True
                elif "no-" + key in config and isinstance(config["no-" + key], bool):
                    config["no-" + key] = False
        
        i += 1
    
    return config


def get_complete_config(args: List[str] = None) -> Dict[str, Any]:
    """
    Get complete configuration with overrides.
    
    Args:
        args: Command-line arguments (optional)
    
    Returns:
        Dict: Complete configuration
    """
    # Start with default config
    config = get_default_config()
    
    # Load from file
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            utils.print_warning(f"Failed to load config file: {str(e)}")
    
    # Override from environment
    config = override_from_env(config)
    
    # Override from command-line args
    if args:
        config = override_from_args(config, args)
    
    return config


def print_config(config: Dict[str, Any]) -> None:
    """
    Print configuration values.
    
    Args:
        config: Configuration to print
    """
    utils.print_header("Setup Configuration")
    
    for category, items in [
        ("Directories", ["project_root", "backend_dir", "frontend_dir"]),
        ("Ports", ["backend_port", "frontend_port", "backend_host", "frontend_host"]),
        ("Features", ["setup_backend", "setup_frontend", "configure_vscode", "install_dependencies"]),
        ("Environment", ["environment", "create_env_file", "check_api_key"]),
        ("Poetry", ["poetry_version", "use_existing_poetry", "create_poetry_venv"]),
        ("Port Management", ["auto_find_ports", "allow_kill_processes"]),
        ("Advanced", ["timeout", "verbose", "interactive", "use_colors"])
    ]:
        utils.print_colored(f"\n{category}:", "cyan", bold=True)
        
        for key in items:
            if key in config:
                value = config[key]
                
                if isinstance(value, bool):
                    if value:
                        utils.print_info(f"{key}: Enabled")
                    else:
                        utils.print_info(f"{key}: Disabled")
                else:
                    utils.print_info(f"{key}: {value}")


def initialize(args: List[str] = None) -> Dict[str, Any]:
    """
    Initialize the config module.
    
    Args:
        args: Command-line arguments (optional)
    
    Returns:
        Dict: Complete configuration
    """
    return get_complete_config(args)


def check(config=None) -> List[str]:
    """
    Check configuration.
    
    Args:
        config: Configuration to check
    
    Returns:
        List of issues (empty if configuration is valid)
    """
    issues = []
    
    if config is None:
        config = get_complete_config()
    
    # Check required directories
    backend_dir = Path(config["backend_dir"])
    if not backend_dir.exists():
        issues.append(f"Backend directory does not exist: {backend_dir}")
    
    frontend_dir = Path(config["frontend_dir"])
    if config["setup_frontend"] and not frontend_dir.exists():
        issues.append(f"Frontend directory does not exist: {frontend_dir}")
    
    # Check required files
    backend_app = backend_dir / "server" / "app.py"
    if not backend_app.exists():
        issues.append(f"Backend application file does not exist: {backend_app}")
    
    # Check port configuration
    if config["backend_port"] == config["frontend_port"]:
        issues.append(f"Backend and frontend ports must be different")
    
    return issues


def configure(args: List[str] = None) -> Dict[str, Any]:
    """
    Configure the setup configuration.
    
    Args:
        args: Command-line arguments (optional)
    
    Returns:
        Dict with configuration results
    """
    config = initialize(args)
    
    # Save configuration
    save_config(config)
    
    return {
        "success": True,
        "message": "Configuration initialized successfully",
        "data": config
    }


def validate(config=None) -> Dict[str, Any]:
    """
    Validate configuration.
    
    Args:
        config: Configuration to validate
    
    Returns:
        Dict with validation results
    """
    if config is None:
        config = get_complete_config()
    
    issues = check(config)
    
    return {
        "valid": len(issues) == 0,
        "issues": issues
    }


def cleanup(config=None) -> None:
    """
    Clean up configuration resources.
    
    Args:
        config: Configuration
    """
    # Nothing to clean up for configuration
    pass


def main():
    """Print configuration."""
    config = get_complete_config()
    print_config(config)
    
    # Check for issues
    issues = check(config)
    if issues:
        utils.print_colored("\nIssues:", "red", bold=True)
        for issue in issues:
            utils.print_error(issue)
    else:
        utils.print_colored("\nConfiguration is valid!", "green", bold=True)


if __name__ == "__main__":
    main()