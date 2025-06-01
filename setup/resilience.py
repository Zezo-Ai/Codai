"""
Setup Resilience Module

Provides enhanced resilience features for the setup process including:
- Dependency verification
- Setup transactions with rollback
- Environment-specific optimizations
- Interactive troubleshooting
"""

import os
import sys
import time
import functools
import logging
import importlib
import urllib.request
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Callable, Optional, Tuple, Union

from . import utils


class SetupTransaction:
    """
    Transaction-like system for setup operations that can be rolled back.
    Provides a way to define a sequence of operations and their rollback procedures,
    executing them as a group with automatic rollback on failure.
    """
    
    def __init__(self, name: str = "setup_transaction"):
        """
        Initialize a new setup transaction.
        
        Args:
            name: Name of the transaction for logging
        """
        self.name = name
        self.operations = []  # List of pending operations
        self.completed = []   # List of completed operations
        self.success = True   # Transaction success status
        self.logger = logging.getLogger(f"setup.transaction.{name}")
    
    def add_operation(self, operation: Callable, rollback: Optional[Callable] = None, 
                      description: str = ""):
        """
        Add an operation to the transaction.
        
        Args:
            operation: Function to execute
            rollback: Function to roll back the operation if needed
            description: Human-readable description of the operation
        """
        self.operations.append((operation, rollback, description))
    
    def execute(self) -> bool:
        """
        Execute all operations in the transaction.
        
        Returns:
            bool: True if all operations succeeded, False otherwise
        """
        utils.print_colored(f"\nExecuting transaction: {self.name}", "blue", bold=True)
        
        for i, (operation, rollback, description) in enumerate(self.operations, 1):
            utils.print_info(f"Step {i}/{len(self.operations)}: {description}")
            
            try:
                operation()
                self.completed.append((operation, rollback, description))
                utils.print_success(f"✓ Completed: {description}")
            except Exception as e:
                self.success = False
                utils.print_error(f"✗ Failed: {description}")
                utils.print_error(f"  Error: {str(e)}")
                
                self.logger.error(f"Operation failed: {description}", exc_info=True)
                
                # Start rollback of completed operations
                utils.print_warning("Rolling back previous operations...")
                self.rollback()
                
                return False
        
        utils.print_success(f"Transaction completed successfully: {self.name}")
        return True
    
    def rollback(self) -> None:
        """
        Roll back all completed operations in reverse order.
        """
        utils.print_colored(f"Rolling back transaction: {self.name}", "yellow", bold=True)
        
        for i, (_, rollback, description) in enumerate(reversed(self.completed), 1):
            if rollback:
                try:
                    utils.print_info(f"Rolling back: {description}")
                    rollback()
                    utils.print_success(f"✓ Rollback successful: {description}")
                except Exception as e:
                    utils.print_error(f"✗ Rollback failed: {description}")
                    utils.print_error(f"  Error: {str(e)}")
                    self.logger.error(f"Rollback failed: {description}", exc_info=True)
            else:
                utils.print_warning(f"No rollback available for: {description}")
        
        utils.print_info("Rollback complete")


def verify_package_functionality(package_name: str) -> Tuple[bool, str]:
    """
    Verify a package is not just installed but actually works.
    
    Args:
        package_name: Name of the package to verify
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    # Define test code for each package to verify its functionality
    verification_tests = {
        # For aiohttp we'll use special handling below to ensure proper session closure
        "aiohttp": None,  
        "beautifulsoup4": "from bs4 import BeautifulSoup; BeautifulSoup('<p>test</p>', 'html.parser')",
        "brotli": "import brotli; brotli.compress(b'test')",
        "fastapi": "import fastapi; app = fastapi.FastAPI()",
        "uvicorn": "import uvicorn; uvicorn.__version__",
        "anthropic": "import anthropic; anthropic.__version__",
        "pydantic": "import pydantic; pydantic.BaseModel",
        "python-multipart": "import multipart; multipart.__version__",
        "python-dotenv": "import dotenv; dotenv.load_dotenv",
        "requests": "import requests; requests.get",
        "pyyaml": "import yaml; yaml.safe_load('key: value')",
    }
    
    # Normalize package name (e.g., python-dotenv -> dotenv)
    import_name = package_name
    if package_name == "python-multipart":
        import_name = "multipart"
    elif package_name == "python-dotenv":
        import_name = "dotenv"
    elif package_name == "beautifulsoup4":
        import_name = "bs4"
    
    # Check if the package is already imported
    if import_name in sys.modules:
        utils.print_info(f"Package {package_name} is already imported")
    
    # First check if the package can be imported at all
    try:
        if package_name == "beautifulsoup4":
            __import__("bs4")
        elif package_name == "python-multipart":
            __import__("multipart")
        elif package_name == "python-dotenv":
            __import__("dotenv")
        else:
            __import__(import_name)
    except ImportError as e:
        return False, f"Package cannot be imported: {str(e)}"
    
    # Special handling for aiohttp to prevent unclosed client sessions
    if package_name == "aiohttp":
        try:
            import aiohttp
            import asyncio
            
            async def test_aiohttp():
                # Use context manager to ensure proper closure
                async with aiohttp.ClientSession() as session:
                    # Just test if we can create the session
                    return True
            
            # Run the async test
            asyncio.run(test_aiohttp())
            return True, f"Package {package_name} is functional"
        except Exception as e:
            return False, f"Package installed but not functional: {str(e)}"
    
    # If we have a specific verification test, run it
    elif package_name in verification_tests and verification_tests[package_name]:
        try:
            test_code = verification_tests[package_name]
            
            # Create a temporary namespace for execution
            test_globals = {}
            test_locals = {}
            
            exec(test_code, test_globals, test_locals)
            return True, f"Package {package_name} is functional"
        except Exception as e:
            return False, f"Package installed but not functional: {str(e)}"
    
    # If no specific test, just confirm it can be imported
    return True, f"Package {package_name} can be imported"


def detect_environment_type() -> Dict[str, bool]:
    """
    Detect what type of environment we're in to optimize setup.
    
    Returns:
        Dict with environment type flags
    """
    env_type = {
        "corporate": False,
        "limited_permissions": False,
        "offline": False,
        "dev_container": False,
        "virtual_machine": False,
        "ci_cd": False
    }
    
    # Check for corporate proxy
    if "HTTP_PROXY" in os.environ or "HTTPS_PROXY" in os.environ:
        env_type["corporate"] = True
        
    # Check for limited permissions
    if not os.access(sys.prefix, os.W_OK):
        env_type["limited_permissions"] = True
    
    # Check for network connectivity
    try:
        urllib.request.urlopen("https://pypi.org", timeout=2)
    except:
        env_type["offline"] = True
    
    # Check for development containers
    if os.environ.get("REMOTE_CONTAINERS") or os.environ.get("CODESPACES"):
        env_type["dev_container"] = True
    
    # Check for virtual machine
    # This is a simplistic check that can be improved
    try:
        if sys.platform.startswith('win'):
            # Check for Hyper-V, VirtualBox, VMware
            vm_indicators = ["Hyper-V", "VirtualBox", "VMware"]
            result = utils.run_command("systeminfo", shell=True)
            if result["success"]:
                for indicator in vm_indicators:
                    if indicator in result["output"]:
                        env_type["virtual_machine"] = True
                        break
        else:
            # Check for common VM identifiers in Linux
            if os.path.exists("/proc/cpuinfo"):
                with open("/proc/cpuinfo", "r") as f:
                    content = f.read().lower()
                    if any(x in content for x in ["hypervisor", "vmware", "virtualbox", "xen"]):
                        env_type["virtual_machine"] = True
    except:
        # If we can't determine, assume not a VM
        pass
    
    # Check for CI/CD environments
    ci_env_vars = ["CI", "TRAVIS", "CIRCLECI", "GITHUB_ACTIONS", "GITLAB_CI", "JENKINS_URL"]
    if any(os.environ.get(var) for var in ci_env_vars):
        env_type["ci_cd"] = True
    
    return env_type


def interactive_troubleshooter(issue_type: str, context: Optional[Dict[str, Any]] = None) -> str:
    """
    Interactive troubleshooter for common issues.
    
    Args:
        issue_type: Type of issue to troubleshoot
        context: Optional context variables for formatting steps
    
    Returns:
        str: Prompt for user action
    """
    troubleshooting_steps = {
        "missing_package": [
            "Check your internet connection",
            "Try installing the package manually with pip install {package}",
            "Check if your firewall is blocking PyPI",
            "Try using a different package index: pip install {package} -i https://pypi.tuna.tsinghua.edu.cn/simple"
        ],
        "permission_error": [
            "Try running the setup as administrator/with sudo",
            "Check if your user has write permissions to {path}",
            "Try using --user mode installation: pip install --user {package}"
        ],
        "port_in_use": [
            "Check what process is using port {port} with: netstat -ano | findstr {port}",
            "Try specifying a different port with --port option",
            "Close the application that's using the port"
        ],
        "virtual_env_error": [
            "Try removing the virtual environment completely and recreating it",
            "Check for write permissions in the project directory",
            "Try creating the virtual environment manually: python -m venv .venv",
            "Check if Python's venv module is working: python -m venv test_venv"
        ],
        "poetry_error": [
            "Try updating Poetry: poetry self update",
            "Check Poetry configuration: poetry config --list",
            "Try clearing Poetry's cache: rm -rf ~/.cache/pypoetry/cache",
            "Try reinstalling Poetry from https://python-poetry.org/docs/#installation"
        ],
        "network_error": [
            "Check your internet connection",
            "Check if you're behind a proxy and set HTTP_PROXY/HTTPS_PROXY environment variables",
            "Try using an alternative DNS resolver",
            "Check your firewall settings"
        ]
    }
    
    if issue_type not in troubleshooting_steps:
        return "No troubleshooting steps available for this issue."
    
    steps = troubleshooting_steps[issue_type]
    if context:
        steps = [step.format(**context) for step in steps]
    
    utils.print_colored("\nTroubleshooting Steps:", "cyan", bold=True)
    for i, step in enumerate(steps, 1):
        utils.print_info(f"{i}. {step}")
    
    utils.print_colored("\nWould you like me to try to help with any of these steps? (y/n)", "yellow")
    return "Select a step number to execute or 'n' to continue without fixing:"


def enhanced_logging_decorator(func):
    """
    Decorator to add enhanced logging to any function.
    
    Args:
        func: Function to decorate
    
    Returns:
        Decorated function with logging
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logger = logging.getLogger(func.__module__)
        
        # Log the function call with arguments (being careful with sensitive data)
        safe_args = []
        for arg in args:
            if isinstance(arg, (str, dict)) and any(sensitive in str(arg).lower() 
                                               for sensitive in ["password", "secret", "key", "token"]):
                safe_args.append("[REDACTED]")
            else:
                safe_args.append(repr(arg))
        
        safe_kwargs = {}
        for k, v in kwargs.items():
            if any(sensitive in k.lower() for sensitive in ["password", "secret", "key", "token"]):
                safe_kwargs[k] = "[REDACTED]"
            else:
                safe_kwargs[k] = repr(v)
        
        arg_str = ", ".join(safe_args + [f"{k}={v}" for k, v in safe_kwargs.items()])
        logger.debug(f"Calling {func.__name__}({arg_str})")
        
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            elapsed = time.time() - start_time
            logger.debug(f"{func.__name__} completed in {elapsed:.2f}s")
            return result
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"{func.__name__} failed after {elapsed:.2f}s: {str(e)}")
            raise
    
    return wrapper


def check_and_fix_common_issues() -> List[Dict[str, Any]]:
    """
    Check for and automatically fix common environment issues.
    
    Returns:
        List of issues found and fixed
    """
    fixed_issues = []
    
    # Check Python venv module
    try:
        import venv
        utils.print_info("Python venv module is available")
    except ImportError:
        utils.print_warning("Python venv module is not available, trying to install it")
        try:
            # Try to install venv
            utils.run_command(f"{sys.executable} -m pip install --upgrade pip setuptools wheel")
            fixed_issues.append({
                "type": "missing_venv",
                "fixed": True,
                "message": "Installed pip, setuptools, and wheel"
            })
        except:
            fixed_issues.append({
                "type": "missing_venv",
                "fixed": False,
                "message": "Could not install required setuptools"
            })
    
    # Check for pending Python updates
    if sys.platform.startswith('win'):
        try:
            # Check for Windows Updates that might require restart
            result = utils.run_command("wmic qfe list brief", shell=True)
            if result["success"] and "restart" in result["output"].lower():
                fixed_issues.append({
                    "type": "pending_restart",
                    "fixed": False,
                    "message": "System has pending updates that require restart"
                })
        except:
            pass
    
    # Return list of fixed issues
    return fixed_issues


# Expose main functions
__all__ = [
    'SetupTransaction',
    'verify_package_functionality',
    'detect_environment_type',
    'interactive_troubleshooter',
    'enhanced_logging_decorator',
    'check_and_fix_common_issues'
]