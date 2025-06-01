"""
Interactive Troubleshooter Module

Provides interactive troubleshooting for common setup issues with:
- Specific, actionable steps
- Automated diagnostics for common problems
- Guided resolution process
- Self-healing capabilities
"""

import os
import sys
import time
import subprocess
import platform
import socket
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Any, Callable, Optional, Tuple, Union

from . import utils
from . import logging_config

# Get logger for this module
logger = logging_config.get_logger("setup.troubleshooter")


class Issue:
    """Represents a detected issue that can be troubleshooted."""
    
    def __init__(self, 
                 issue_id: str, 
                 name: str, 
                 description: str, 
                 severity: str = "medium",
                 can_fix_automatically: bool = False):
        """
        Initialize an issue.
        
        Args:
            issue_id: Unique ID of the issue
            name: Short name of the issue
            description: Detailed description
            severity: Issue severity (low, medium, high, critical)
            can_fix_automatically: Whether the issue can be fixed automatically
        """
        self.issue_id = issue_id
        self.name = name
        self.description = description
        self.severity = severity
        self.can_fix_automatically = can_fix_automatically
        self.steps = []
        self.context = {}
    
    def add_step(self, 
                 description: str, 
                 command: Optional[str] = None, 
                 function: Optional[Callable] = None) -> None:
        """
        Add a troubleshooting step.
        
        Args:
            description: Human-readable description of the step
            command: Optional command to run
            function: Optional function to call
        """
        self.steps.append({
            "description": description,
            "command": command,
            "function": function
        })
    
    def set_context(self, context: Dict[str, Any]) -> None:
        """
        Set context variables for the issue.
        
        Args:
            context: Dictionary of context variables
        """
        self.context = context


class TroubleshootingResult:
    """Represents the result of a troubleshooting process."""
    
    def __init__(self, issue: Issue):
        """
        Initialize a troubleshooting result.
        
        Args:
            issue: The issue being troubleshooted
        """
        self.issue = issue
        self.resolved = False
        self.steps_tried = []
        self.successful_steps = []
        self.error_message = None
    
    def add_step_tried(self, step_index: int, success: bool, output: str = "") -> None:
        """
        Add a step that was tried.
        
        Args:
            step_index: Index of the step tried
            success: Whether the step succeeded
            output: Output from the step
        """
        step_info = {
            "index": step_index,
            "description": self.issue.steps[step_index]["description"],
            "success": success,
            "output": output
        }
        self.steps_tried.append(step_info)
        
        if success:
            self.successful_steps.append(step_index)
    
    def set_resolved(self, resolved: bool) -> None:
        """
        Set whether the issue was resolved.
        
        Args:
            resolved: Whether the issue was resolved
        """
        self.resolved = resolved
    
    def set_error(self, message: str) -> None:
        """
        Set an error message.
        
        Args:
            message: Error message
        """
        self.error_message = message


class Troubleshooter:
    """Interactive troubleshooter for common setup issues."""
    
    def __init__(self):
        """Initialize the troubleshooter."""
        self.issues = {}
        self.register_common_issues()
    
    def register_issue(self, issue: Issue) -> None:
        """
        Register an issue with the troubleshooter.
        
        Args:
            issue: Issue to register
        """
        self.issues[issue.issue_id] = issue
    
    def register_common_issues(self) -> None:
        """Register common issues that can be troubleshooted."""
        # Virtual environment issues
        venv_issue = Issue(
            issue_id="venv_creation_failed",
            name="Virtual Environment Creation Failed",
            description="Failed to create a Python virtual environment.",
            severity="high",
            can_fix_automatically=True
        )
        venv_issue.add_step(
            description="Remove any existing virtual environment",
            function=self.fix_remove_existing_venv
        )
        venv_issue.add_step(
            description="Ensure Python has venv module installed",
            function=self.fix_ensure_venv_module
        )
        venv_issue.add_step(
            description="Create a fresh virtual environment",
            function=self.fix_create_fresh_venv
        )
        self.register_issue(venv_issue)
        
        # Package installation issues
        pkg_issue = Issue(
            issue_id="package_installation_failed",
            name="Package Installation Failed",
            description="Failed to install required Python packages.",
            severity="high",
            can_fix_automatically=True
        )
        pkg_issue.add_step(
            description="Check internet connectivity",
            function=self.fix_check_internet
        )
        pkg_issue.add_step(
            description="Try alternative package source",
            function=self.fix_try_alternative_package_source
        )
        pkg_issue.add_step(
            description="Install packages one by one",
            function=self.fix_install_packages_individually
        )
        self.register_issue(pkg_issue)
        
        # Poetry issues
        poetry_issue = Issue(
            issue_id="poetry_failed",
            name="Poetry Configuration Failed",
            description="Failed to configure or use Poetry package manager.",
            severity="medium",
            can_fix_automatically=True
        )
        poetry_issue.add_step(
            description="Update Poetry installation",
            function=self.fix_update_poetry
        )
        poetry_issue.add_step(
            description="Clear Poetry cache",
            function=self.fix_clear_poetry_cache
        )
        poetry_issue.add_step(
            description="Reinstall Poetry",
            function=self.fix_reinstall_poetry
        )
        self.register_issue(poetry_issue)
        
        # Port in use issues
        port_issue = Issue(
            issue_id="port_in_use",
            name="Network Port In Use",
            description="Required network port is already in use by another process.",
            severity="medium",
            can_fix_automatically=True
        )
        port_issue.add_step(
            description="Identify process using the port",
            function=self.fix_identify_port_process
        )
        port_issue.add_step(
            description="Find an alternative port",
            function=self.fix_find_alternative_port
        )
        self.register_issue(port_issue)
        
        # Proxy environment issues
        proxy_issue = Issue(
            issue_id="proxy_configuration",
            name="Proxy Configuration Issue",
            description="Network proxy is preventing proper access to package repositories.",
            severity="medium",
            can_fix_automatically=True
        )
        proxy_issue.add_step(
            description="Detect and configure proxy settings",
            function=self.fix_detect_proxy
        )
        proxy_issue.add_step(
            description="Use alternative package repository",
            function=self.fix_use_alternative_repository
        )
        self.register_issue(proxy_issue)
    
    def troubleshoot(self, issue_id: str, context: Dict[str, Any] = None) -> TroubleshootingResult:
        """
        Troubleshoot an issue.
        
        Args:
            issue_id: ID of the issue to troubleshoot
            context: Optional context to use for troubleshooting
        
        Returns:
            TroubleshootingResult: Result of the troubleshooting process
        """
        if issue_id not in self.issues:
            utils.print_error(f"Unknown issue ID: {issue_id}")
            return None
        
        issue = self.issues[issue_id]
        if context:
            issue.set_context(context)
        
        utils.print_colored(f"Troubleshooting: {issue.name}", "cyan", bold=True)
        utils.print_info(issue.description)
        
        result = TroubleshootingResult(issue)
        
        if issue.can_fix_automatically:
            utils.print_colored("This issue can be fixed automatically.", "green", bold=True)
            fix_automatically = utils.get_user_confirmation("Would you like to attempt an automatic fix?", default=True)
            
            if fix_automatically:
                for i, step in enumerate(issue.steps):
                    utils.print_colored(f"Step {i+1}: {step['description']}", "cyan")
                    
                    try:
                        if step.get("function"):
                            # Execute function
                            success, output = step["function"](issue.context)
                        elif step.get("command"):
                            # Execute command
                            cmd_result = utils.run_command(step["command"], shell=True)
                            success = cmd_result["success"]
                            output = cmd_result.get("output", "") + cmd_result.get("error", "")
                        else:
                            success = False
                            output = "No action defined for this step"
                        
                        result.add_step_tried(i, success, output)
                        
                        if success:
                            utils.print_success(f"✓ Step completed successfully")
                            if output:
                                utils.print_info(f"Output: {output}")
                        else:
                            utils.print_error(f"✗ Step failed")
                            if output:
                                utils.print_error(f"Error: {output}")
                            
                            # Ask if user wants to continue
                            continue_troubleshooting = utils.get_user_confirmation(
                                "Continue with next step anyway?", default=True
                            )
                            if not continue_troubleshooting:
                                break
                    
                    except Exception as e:
                        utils.print_error(f"Error during troubleshooting: {str(e)}")
                        logger.exception(f"Error executing step {i} for issue {issue_id}")
                        result.set_error(str(e))
                        break
                
                # Check if issue was resolved
                if self.verify_issue_fixed(issue_id, issue.context):
                    utils.print_success(f"✓ Issue has been resolved: {issue.name}")
                    result.set_resolved(True)
                else:
                    utils.print_warning("! Issue may not be fully resolved.")
                    utils.print_info("Some steps were completed successfully. You may need to manually complete the remaining steps.")
            else:
                utils.print_info("You chose not to automatically fix the issue.")
                utils.print_info("Here are the steps you can take manually:")
                
                for i, step in enumerate(issue.steps):
                    utils.print_colored(f"{i+1}. {step['description']}", "blue")
                    if step.get("command"):
                        utils.print_info(f"   Command: {step['command']}")
        else:
            utils.print_warning("This issue cannot be fixed automatically.")
            utils.print_info("Here are the steps you can take manually:")
            
            for i, step in enumerate(issue.steps):
                utils.print_colored(f"{i+1}. {step['description']}", "blue")
                if step.get("command"):
                    utils.print_info(f"   Command: {step['command']}")
        
        return result
    
    def verify_issue_fixed(self, issue_id: str, context: Dict[str, Any]) -> bool:
        """
        Verify if an issue has been fixed.
        
        Args:
            issue_id: ID of the issue to verify
            context: Context for verification
        
        Returns:
            bool: True if the issue is fixed, False otherwise
        """
        # Specific verification logic for each issue type
        if issue_id == "venv_creation_failed":
            venv_path = context.get("venv_path")
            if not venv_path:
                return False
            
            # Check if venv exists and has key files
            venv_path = Path(venv_path)
            if not venv_path.exists():
                return False
            
            if sys.platform.startswith("win"):
                python_exe = venv_path / "Scripts" / "python.exe"
            else:
                python_exe = venv_path / "bin" / "python"
            
            return python_exe.exists()
            
        elif issue_id == "package_installation_failed":
            # Check if the specified packages are installed
            packages = context.get("packages", [])
            if not packages:
                return False
            
            from . import requirements
            all_installed = True
            
            for package in packages:
                installed, _ = requirements.check_package_installed(package)
                if not installed:
                    all_installed = False
                    break
            
            return all_installed
            
        elif issue_id == "poetry_failed":
            # Check if Poetry is working
            result = utils.run_command("poetry --version", shell=True)
            return result["success"]
            
        elif issue_id == "port_in_use":
            # Check if the port is now available or an alternative was found
            if "new_port" in context:
                # If we found an alternative port, consider it resolved
                return True
            
            port = context.get("port")
            if not port:
                return False
            
            # Check if the port is available
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                s.bind(("127.0.0.1", port))
                return True
            except:
                return False
            finally:
                s.close()
                
        elif issue_id == "proxy_configuration":
            # Check if we can access package repositories
            result = utils.run_command("pip search requests", shell=True)
            return result["success"]
            
        # Default case
        return False
    
    # Troubleshooting step implementations
    
    def fix_remove_existing_venv(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Remove any existing virtual environment."""
        venv_path = context.get("venv_path")
        if not venv_path:
            return False, "No virtual environment path specified"
        
        venv_path = Path(venv_path)
        if not venv_path.exists():
            return True, "No existing virtual environment to remove"
        
        try:
            shutil.rmtree(venv_path, ignore_errors=True)
            return True, f"Successfully removed {venv_path}"
        except Exception as e:
            return False, f"Failed to remove {venv_path}: {str(e)}"
    
    def fix_ensure_venv_module(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Ensure Python has the venv module installed."""
        try:
            # Check if venv module is available
            import venv
            return True, "venv module is already available"
        except ImportError:
            # Try to install venv
            try:
                result = utils.run_command(f"{sys.executable} -m pip install --upgrade pip setuptools wheel ensurepip", shell=True)
                if result["success"]:
                    # Try importing again
                    try:
                        import venv
                        return True, "Successfully installed venv module"
                    except ImportError:
                        return False, "Failed to install venv module"
                else:
                    return False, f"Failed to install required packages: {result.get('error', '')}"
            except Exception as e:
                return False, f"Error installing required packages: {str(e)}"
    
    def fix_create_fresh_venv(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Create a fresh virtual environment."""
        venv_path = context.get("venv_path")
        if not venv_path:
            return False, "No virtual environment path specified"
        
        venv_path = Path(venv_path)
        
        try:
            # Create fresh venv
            import venv
            venv.create(venv_path, with_pip=True)
            
            # Verify the venv was created correctly
            if sys.platform.startswith("win"):
                python_exe = venv_path / "Scripts" / "python.exe"
            else:
                python_exe = venv_path / "bin" / "python"
            
            if python_exe.exists():
                return True, f"Successfully created virtual environment at {venv_path}"
            else:
                return False, f"Virtual environment created, but Python executable not found"
        except Exception as e:
            return False, f"Failed to create virtual environment: {str(e)}"
    
    def fix_check_internet(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Check internet connectivity."""
        try:
            # Try to connect to PyPI
            import urllib.request
            urllib.request.urlopen("https://pypi.org", timeout=5)
            return True, "Internet connection is working"
        except Exception as e:
            return False, f"Internet connection issue: {str(e)}"
    
    def fix_try_alternative_package_source(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Try alternative package source."""
        # Use a different package index
        packages = " ".join(context.get("packages", []))
        if not packages:
            return False, "No packages specified"
        
        try:
            result = utils.run_command(
                f"{sys.executable} -m pip install {packages} -i https://pypi.tuna.tsinghua.edu.cn/simple",
                shell=True
            )
            if result["success"]:
                return True, "Successfully installed packages from alternative source"
            else:
                return False, f"Failed to install from alternative source: {result.get('error', '')}"
        except Exception as e:
            return False, f"Error using alternative package source: {str(e)}"
    
    def fix_install_packages_individually(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Install packages one by one."""
        packages = context.get("packages", [])
        if not packages:
            return False, "No packages specified"
        
        success_count = 0
        failed_packages = []
        
        for package in packages:
            try:
                result = utils.run_command(f"{sys.executable} -m pip install {package}", shell=True)
                if result["success"]:
                    success_count += 1
                else:
                    failed_packages.append(package)
            except Exception:
                failed_packages.append(package)
        
        if success_count == len(packages):
            return True, f"Successfully installed all {len(packages)} packages individually"
        elif success_count > 0:
            return True, f"Installed {success_count}/{len(packages)} packages. Failed: {', '.join(failed_packages)}"
        else:
            return False, f"Failed to install any packages individually"
    
    def fix_update_poetry(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Update Poetry installation."""
        try:
            result = utils.run_command("poetry self update", shell=True)
            if result["success"]:
                return True, "Successfully updated Poetry"
            else:
                return False, f"Failed to update Poetry: {result.get('error', '')}"
        except Exception as e:
            return False, f"Error updating Poetry: {str(e)}"
    
    def fix_clear_poetry_cache(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Clear Poetry cache."""
        try:
            if sys.platform.startswith("win"):
                cache_dir = Path(os.environ.get("APPDATA", "")) / "pypoetry" / "cache"
            else:
                cache_dir = Path.home() / ".cache" / "pypoetry"
            
            if cache_dir.exists():
                shutil.rmtree(cache_dir, ignore_errors=True)
                return True, f"Successfully cleared Poetry cache at {cache_dir}"
            else:
                return True, "No Poetry cache directory found to clear"
        except Exception as e:
            return False, f"Error clearing Poetry cache: {str(e)}"
    
    def fix_reinstall_poetry(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Reinstall Poetry."""
        try:
            # Uninstall Poetry first
            if sys.platform.startswith("win"):
                uninstall_cmd = "pip uninstall -y poetry"
            else:
                uninstall_cmd = "pip uninstall -y poetry"
            
            utils.run_command(uninstall_cmd, shell=True)
            
            # Install Poetry
            if sys.platform.startswith("win"):
                install_cmd = '(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -'
            else:
                install_cmd = 'curl -sSL https://install.python-poetry.org | python3 -'
            
            result = utils.run_command(install_cmd, shell=True)
            if result["success"]:
                return True, "Successfully reinstalled Poetry"
            else:
                return False, f"Failed to reinstall Poetry: {result.get('error', '')}"
        except Exception as e:
            return False, f"Error reinstalling Poetry: {str(e)}"
    
    def fix_identify_port_process(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Identify process using the port."""
        port = context.get("port")
        if not port:
            return False, "No port specified"
        
        try:
            if sys.platform.startswith("win"):
                cmd = f"netstat -ano | findstr :{port}"
                result = utils.run_command(cmd, shell=True)
                
                if result["success"] and result["output"]:
                    # Parse the output to find the PID
                    lines = result["output"].splitlines()
                    for line in lines:
                        if f":{port}" in line and "LISTENING" in line:
                            parts = line.split()
                            if parts:
                                pid = parts[-1]
                                process_result = utils.run_command(f"tasklist /fi \"PID eq {pid}\"", shell=True)
                                return True, f"Port {port} is used by PID {pid}. {process_result.get('output', '')}"
                    
                    return False, f"Could not identify process using port {port}"
                else:
                    return True, f"No process found using port {port}"
            else:
                cmd = f"lsof -i :{port}"
                result = utils.run_command(cmd, shell=True)
                
                if result["success"] and result["output"]:
                    return True, f"Process using port {port}: {result['output']}"
                else:
                    return True, f"No process found using port {port}"
        except Exception as e:
            return False, f"Error identifying process using port {port}: {str(e)}"
    
    def fix_find_alternative_port(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Find an alternative port."""
        port = context.get("port")
        if not port:
            return False, "No port specified"
        
        try:
            start_port = port + 1
            max_port = min(65535, port + 1000)  # Check up to 1000 ports
            
            for test_port in range(start_port, max_port):
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                try:
                    s.bind(("127.0.0.1", test_port))
                    context["new_port"] = test_port
                    return True, f"Found available port: {test_port}"
                except:
                    continue
                finally:
                    s.close()
            
            return False, f"Could not find an available port between {start_port} and {max_port}"
        except Exception as e:
            return False, f"Error finding alternative port: {str(e)}"
    
    def fix_detect_proxy(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Detect and configure proxy settings."""
        try:
            # Check common environment variables for proxy settings
            http_proxy = os.environ.get("HTTP_PROXY", "")
            https_proxy = os.environ.get("HTTPS_PROXY", "")
            
            if http_proxy or https_proxy:
                return True, f"Proxy settings already configured: HTTP_PROXY={http_proxy}, HTTPS_PROXY={https_proxy}"
            
            # Try to detect proxy settings from the system
            if sys.platform.startswith("win"):
                # Windows proxy detection
                try:
                    import winreg
                    key = winreg.OpenKey(
                        winreg.HKEY_CURRENT_USER,
                        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
                    )
                    proxy_enabled = winreg.QueryValueEx(key, "ProxyEnable")[0]
                    
                    if proxy_enabled:
                        proxy_server = winreg.QueryValueEx(key, "ProxyServer")[0]
                        os.environ["HTTP_PROXY"] = f"http://{proxy_server}"
                        os.environ["HTTPS_PROXY"] = f"http://{proxy_server}"
                        return True, f"Detected and configured Windows proxy: {proxy_server}"
                    else:
                        return True, "No system proxy enabled in Windows settings"
                except Exception:
                    return False, "Could not detect Windows proxy settings"
            else:
                # Linux/Mac proxy detection
                env_vars = ["http_proxy", "https_proxy", "all_proxy"]
                for var in env_vars:
                    if var in os.environ:
                        return True, f"Found proxy settings in environment: {var}={os.environ[var]}"
                
                return False, "Could not detect proxy settings on this system"
        except Exception as e:
            return False, f"Error detecting proxy settings: {str(e)}"
    
    def fix_use_alternative_repository(self, context: Dict[str, Any]) -> Tuple[bool, str]:
        """Use alternative package repository."""
        try:
            # Configure pip to use an alternative repository
            pip_conf_dir = None
            
            if sys.platform.startswith("win"):
                pip_conf_dir = Path(os.environ.get("APPDATA", "")) / "pip"
            else:
                pip_conf_dir = Path.home() / ".pip"
            
            pip_conf_dir.mkdir(exist_ok=True)
            pip_conf_file = pip_conf_dir / "pip.conf"
            
            # Write configuration
            with open(pip_conf_file, "w") as f:
                f.write("[global]\n")
                f.write("index-url = https://pypi.tuna.tsinghua.edu.cn/simple\n")
                f.write("trusted-host = pypi.tuna.tsinghua.edu.cn\n")
            
            return True, f"Configured pip to use Tsinghua mirror: {pip_conf_file}"
        except Exception as e:
            return False, f"Error configuring alternative repository: {str(e)}"


# Create a singleton instance
_troubleshooter = None

def get_troubleshooter() -> Troubleshooter:
    """Get the singleton troubleshooter instance."""
    global _troubleshooter
    if _troubleshooter is None:
        _troubleshooter = Troubleshooter()
    return _troubleshooter


def troubleshoot_issue(issue_id: str, context: Dict[str, Any] = None) -> TroubleshootingResult:
    """
    Troubleshoot a specific issue.
    
    Args:
        issue_id: ID of the issue to troubleshoot
        context: Optional context for troubleshooting
    
    Returns:
        TroubleshootingResult: Result of troubleshooting
    """
    troubleshooter = get_troubleshooter()
    return troubleshooter.troubleshoot(issue_id, context)