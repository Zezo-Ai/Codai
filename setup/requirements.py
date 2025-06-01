"""
Requirements Verification Module

Checks system requirements and prerequisites for running the application.
This includes checking:
- Python version
- Node.js version (if frontend is enabled)
- Disk space
- Required dependencies
- System permissions
- Network access
"""

import os
import sys
import shutil
import tempfile
import subprocess
import importlib.util
import time
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Union

from . import utils
from . import environment

# Minimum requirements
MIN_PYTHON_VERSION = (3, 9, 0)
MIN_NODE_VERSION = (18, 0, 0)
MIN_NPM_VERSION = (8, 0, 0)
MIN_DISK_SPACE_MB = 500  # Minimum free disk space in MB

# Required Python packages
REQUIRED_PACKAGES = [
    "fastapi",
    "uvicorn",
    "anthropic",
    "pydantic",
    "python-multipart",
    "pyyaml",
    "aiohttp",
    "beautifulsoup4",
    "brotli",
    "python-dotenv",
    "selenium",  # Required for web interaction tools
    "webdriver-manager",  # For automatic webdriver management
    "sqlalchemy",  # For database ORM (API key storage)
    "cryptography",  # For API key encryption
    "pyautogui",  # For computer use tools
    "pillow",  # Image processing (required by pyautogui)
    "requests",  # HTTP library
    "rich",  # Terminal formatting
    "psutil",  # System monitoring
    "colorama",  # Cross-platform terminal colors
    "python-json-logger",  # Structured logging
    "watchfiles",  # For hot reload
    "chardet",  # Character encoding detection
]

# Windows-specific packages
WINDOWS_PACKAGES = [
    "pywin32",  # Windows API access for computer use tools
]

# Required Node.js packages (if frontend is enabled)
REQUIRED_NODE_PACKAGES = [
    "react",
    "next",
]

# Type aliases
RequirementsResult = Dict[str, Any]


class RequirementsError(Exception):
    """Exception raised for requirements verification errors."""
    pass


def check_python_version() -> Tuple[bool, str]:
    """
    Check if Python version meets requirements.
    
    Returns:
        Tuple[bool, str]: (meets_requirements, message)
    """
    current_version = sys.version_info[:3]
    python_version_str = ".".join(map(str, current_version))
    
    if current_version < MIN_PYTHON_VERSION:
        min_version_str = ".".join(map(str, MIN_PYTHON_VERSION))
        return False, f"Python {min_version_str}+ required, found {python_version_str}"
    
    return True, f"Python version {python_version_str} meets requirements"


def check_node_version() -> Tuple[bool, str]:
    """
    Check if Node.js version meets requirements.
    
    Returns:
        Tuple[bool, str]: (meets_requirements, message)
    """
    # Check if Node.js is installed
    if not utils.is_command_available("node"):
        return False, "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    
    # Get Node.js version
    result = utils.run_command("node --version", shell=True)
    if not result["success"]:
        return False, "Failed to determine Node.js version"
    
    # Parse version string (format: vX.Y.Z)
    version_str = result["output"].strip()
    if version_str.startswith("v"):
        version_str = version_str[1:]
    
    try:
        version_parts = list(map(int, version_str.split(".")))
        while len(version_parts) < 3:
            version_parts.append(0)
        
        current_version = tuple(version_parts[:3])
        
        if current_version < MIN_NODE_VERSION:
            min_version_str = ".".join(map(str, MIN_NODE_VERSION))
            return False, f"Node.js {min_version_str}+ required, found {version_str}"
        
        return True, f"Node.js version {version_str} meets requirements"
    except ValueError:
        return False, f"Failed to parse Node.js version: {version_str}"


def check_npm_version() -> Tuple[bool, str]:
    """
    Check if npm version meets requirements.
    
    Returns:
        Tuple[bool, str]: (meets_requirements, message)
    """
    # Check if npm is installed
    if not utils.is_command_available("npm"):
        return False, "npm is not installed"
    
    # Get npm version
    result = utils.run_command("npm --version", shell=True)
    if not result["success"]:
        return False, "Failed to determine npm version"
    
    # Parse version string
    version_str = result["output"].strip()
    
    try:
        version_parts = list(map(int, version_str.split(".")))
        while len(version_parts) < 3:
            version_parts.append(0)
        
        current_version = tuple(version_parts[:3])
        
        if current_version < MIN_NPM_VERSION:
            min_version_str = ".".join(map(str, MIN_NPM_VERSION))
            return False, f"npm {min_version_str}+ required, found {version_str}"
        
        return True, f"npm version {version_str} meets requirements"
    except ValueError:
        return False, f"Failed to parse npm version: {version_str}"


def check_disk_space(path: Path = None) -> Tuple[bool, str]:
    """
    Check if there is enough disk space.
    
    Args:
        path: Path to check disk space at (defaults to current directory)
    
    Returns:
        Tuple[bool, str]: (has_enough_space, message)
    """
    if path is None:
        path = Path.cwd()
    
    try:
        total, used, free = shutil.disk_usage(path)
        free_mb = free / (1024 * 1024)  # Convert to MB
        
        if free_mb < MIN_DISK_SPACE_MB:
            return False, f"Not enough disk space: {free_mb:.2f}MB free, {MIN_DISK_SPACE_MB}MB required"
        
        return True, f"Disk space: {free_mb:.2f}MB free, meets requirements"
    except Exception as e:
        return False, f"Failed to check disk space: {str(e)}"


def check_package_installed(package: str, check_functionality: bool = False) -> Tuple[bool, Optional[str]]:
    """
    Check if a Python package is installed using multiple methods.
    
    Args:
        package: Package name
        check_functionality: Whether to verify the package actually works
    
    Returns:
        Tuple[bool, Optional[str]]: (is_installed, details_or_error)
    """
    # Method 1: Use importlib.util.find_spec (fast but sometimes unreliable)
    import_name = package
    if package == "python-multipart":
        import_name = "multipart"
    elif package == "python-dotenv":
        import_name = "dotenv"
    elif package == "beautifulsoup4":
        import_name = "bs4"
    elif package == "pyyaml":
        import_name = "yaml"
    
    try:
        spec = importlib.util.find_spec(import_name)
        if spec is not None:
            if check_functionality:
                # Import the resilience module only when needed to avoid circular imports
                from . import resilience
                success, message = resilience.verify_package_functionality(package)
                return success, message
            return True, f"Package {package} is installed (detected via importlib)"
    except (ModuleNotFoundError, ValueError, AttributeError):
        pass
    
    # Method 2: Try to import the package directly
    try:
        __import__(import_name)
        if check_functionality:
            # Import the resilience module only when needed
            from . import resilience
            success, message = resilience.verify_package_functionality(package)
            return success, message
        return True, f"Package {package} is installed (detected via direct import)"
    except (ImportError, ModuleNotFoundError):
        pass
    
    # Method 3: Use pip to check if the package is installed
    try:
        result = utils.run_command(f"{sys.executable} -m pip show {package}", shell=True)
        if result["success"] and "Version:" in result.get("output", ""):
            # Extract version from pip output
            version_line = [line for line in result["output"].splitlines() 
                           if line.startswith("Version:")][0]
            version = version_line.split(":", 1)[1].strip()
            
            if check_functionality:
                # Import the resilience module only when needed
                from . import resilience
                success, message = resilience.verify_package_functionality(package)
                return success, message
            return True, f"Package {package} is installed (version {version}, detected via pip)"
    except Exception:
        pass

    # If none of these methods detect the package, it's likely not installed or accessible
    return False, f"Package {package} is not installed"


def check_write_permissions(path: Path) -> Tuple[bool, str]:
    """
    Check if we have write permissions to a path.
    
    Args:
        path: Path to check
    
    Returns:
        Tuple[bool, str]: (has_permissions, message)
    """
    if not path.exists():
        # Check if we can create the directory
        try:
            path.mkdir(parents=True, exist_ok=True)
            return True, f"Created directory {path}"
        except Exception as e:
            return False, f"Cannot create directory {path}: {str(e)}"
    
    # Check if it's a directory
    if not path.is_dir():
        return False, f"Path is not a directory: {path}"
    
    # Check write permissions by creating a temporary file
    try:
        temp_file = path / f".setup_test_{os.getpid()}"
        temp_file.touch()
        temp_file.unlink()
        return True, f"Write permissions OK for {path}"
    except Exception as e:
        return False, f"No write permissions for {path}: {str(e)}"


def check_network_access(url: str = "https://api.anthropic.com/v1/health") -> Tuple[bool, str]:
    """
    Check if we have network access to a URL.
    
    Args:
        url: URL to check
    
    Returns:
        Tuple[bool, str]: (has_access, message)
    """
    try:
        import urllib.request
        import urllib.error
        import socket
        
        # Set a short timeout
        socket.setdefaulttimeout(5)
        
        try:
            # Try to connect
            urllib.request.urlopen(url)
            return True, f"Network access OK to {url}"
        except urllib.error.HTTPError as e:
            # For API endpoints, even a 404 or other HTTP error means we have connectivity
            # to the host, just not to the specific endpoint
            return True, f"Network access OK to {url} (HTTP status {e.code})"
    except urllib.error.URLError as e:
        return False, f"No network access to {url}: {str(e)}"
    except Exception as e:
        return False, f"Failed to check network access: {str(e)}"


def check_anthropic_api_key() -> Tuple[bool, str]:
    """
    Check if Anthropic API key is configured.
    Note: API key is now set through the UI, not environment variables.
    
    Returns:
        Tuple[bool, str]: (is_configured, message)
    """
    # API key is now managed through the UI settings, not environment variables
    return True, "Anthropic API key will be configured through the UI settings"


def check_python_requirements() -> List[Dict[str, Any]]:
    """
    Check Python-related requirements.
    
    Returns:
        List of requirement results
    """
    results = []
    
    # Check Python version
    python_ok, python_msg = check_python_version()
    results.append({
        "name": "Python Version",
        "passed": python_ok,
        "message": python_msg,
        "required": True
    })
    
    # Check required packages - we'll note the missing ones and mark as required
    # so user will be prompted to install them
    packages_to_check = REQUIRED_PACKAGES.copy()
    
    # Add Windows-specific packages on Windows
    if sys.platform == 'win32':
        packages_to_check.extend(WINDOWS_PACKAGES)
    
    for package in packages_to_check:
        is_installed = check_package_installed(package)
        results.append({
            "name": f"Python Package: {package}",
            "passed": is_installed,
            "message": f"Package {package} is {'installed' if is_installed else 'not installed'}",
            "required": True,  # Mark as required to ensure confirmation
            "package_install": True,  # Flag as installable package
            "package_name": package  # Store package name for installation
        })
    
    # Note: Anthropic API key is now set through the UI, not during setup
    # So we don't check for it here anymore
    
    return results


def check_node_requirements() -> List[Dict[str, Any]]:
    """
    Check Node.js-related requirements.
    
    Returns:
        List of requirement results
    """
    results = []
    
    # Check Node.js version
    node_ok, node_msg = check_node_version()
    results.append({
        "name": "Node.js Version",
        "passed": node_ok,
        "message": node_msg,
        "required": True
    })
    
    # Check npm version
    npm_ok, npm_msg = check_npm_version()
    results.append({
        "name": "npm Version",
        "passed": npm_ok,
        "message": npm_msg,
        "required": True
    })
    
    # We don't check for specific Node packages
    # as they should be installed by npm during setup
    
    return results


def check_system_requirements() -> List[Dict[str, Any]]:
    """
    Check system requirements.
    
    Returns:
        List of requirement results
    """
    results = []
    
    # Check disk space
    disk_ok, disk_msg = check_disk_space()
    results.append({
        "name": "Disk Space",
        "passed": disk_ok,
        "message": disk_msg,
        "required": True
    })
    
    # Check write permissions for project directory
    write_ok, write_msg = check_write_permissions(utils.PROJECT_ROOT)
    results.append({
        "name": "Write Permissions",
        "passed": write_ok,
        "message": write_msg,
        "required": True
    })
    
    # Check network access
    network_ok, network_msg = check_network_access()
    results.append({
        "name": "Network Access",
        "passed": network_ok,
        "message": network_msg,
        "required": True
    })
    
    return results


def check_all_requirements(check_frontend: bool = True) -> Dict[str, List[Dict[str, Any]]]:
    """
    Check all requirements.
    
    Args:
        check_frontend: Whether to check frontend requirements
    
    Returns:
        Dict mapping requirement categories to lists of results
    """
    results = {
        "python": check_python_requirements(),
        "system": check_system_requirements()
    }
    
    if check_frontend:
        results["node"] = check_node_requirements()
    
    return results


def format_requirements_results(results: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """
    Format requirements check results.
    
    Args:
        results: Requirements check results
    
    Returns:
        Dict with summary information
    """
    # Count passed and failed requirements
    passed = 0
    failed = 0
    required_failed = 0
    package_failed = 0
    
    for category, category_results in results.items():
        for result in category_results:
            if result["passed"]:
                passed += 1
            else:
                failed += 1
                
                # Special handling for package failures
                if category == "python" and "Python Package:" in result["name"] and result.get("package_install", False):
                    package_failed += 1
                elif result.get("required", False):
                    required_failed += 1
    
    # Adjust required_failed count to exclude package failures that can be handled
    actual_required_failed = required_failed - package_failed
    
    # Overall status - special handling for package failures
    if actual_required_failed == 0:
        if package_failed > 0:
            status = "warning"  # Packages are missing but can be installed
        else:
            status = "passed"   # All requirements met
    else:
        status = "failed"       # Critical requirements failed
    
    return {
        "results": results,
        "passed": passed,
        "failed": failed,
        "required_failed": required_failed,
        "package_failed": package_failed,
        "actual_required_failed": actual_required_failed,
        "status": status
    }


def detect_python_environment() -> Dict[str, Any]:
    """
    Detect the current Python environment details.
    
    Returns:
        Dict with environment information
    """
    # Initialize result
    env_info = {
        "in_venv": False,           # Generic virtual environment
        "in_poetry": False,         # Poetry environment
        "in_conda": False,          # Conda environment
        "is_windows": False,        # Windows OS
        "has_pip": False,           # pip is available
        "has_poetry": False,        # poetry is available
        "has_user_site": False,     # User site-packages directory is available
        "has_admin": False          # User has admin/root privileges
    }
    
    # Check for virtual environment
    env_info["in_venv"] = sys.prefix != sys.base_prefix
    
    # Check for Poetry
    env_info["in_poetry"] = os.environ.get("POETRY_ACTIVE") == "1"
    env_info["has_poetry"] = utils.is_command_available("poetry")
    
    # Check for Conda
    env_info["in_conda"] = os.environ.get("CONDA_PREFIX") is not None
    
    # Check OS
    env_info["is_windows"] = sys.platform.startswith("win")
    
    # Check for pip
    env_info["has_pip"] = utils.is_command_available("pip") or utils.is_command_available("pip3")
    
    # Check for user site-packages
    try:
        import site
        env_info["has_user_site"] = site.USER_SITE is not None and os.path.isdir(os.path.dirname(site.USER_SITE))
    except (ImportError, AttributeError):
        pass
    
    # Check for admin privileges (basic check)
    if env_info["is_windows"]:
        try:
            # On Windows, try to create a file in a system directory
            admin_check_path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Temp")
            admin_check_file = os.path.join(admin_check_path, f"admin_check_{os.getpid()}.tmp")
            with open(admin_check_file, "w") as f:
                f.write("admin check")
            os.remove(admin_check_file)
            env_info["has_admin"] = True
        except (IOError, OSError):
            pass
    else:
        # On Unix, check effective user ID
        env_info["has_admin"] = os.geteuid() == 0 if hasattr(os, "geteuid") else False
    
    return env_info

def install_with_poetry(package_name: str) -> Tuple[bool, str]:
    """
    Install a Python package using Poetry.
    
    Args:
        package_name: Name of the package to install
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    utils.print_info(f"Attempting to install {package_name} with Poetry...")
    
    # Try poetry add
    result = utils.run_command(f"poetry add {package_name}", shell=True)
    
    if result["success"]:
        return True, f"Successfully installed {package_name} with Poetry"
    else:
        error = result.get("error", "") + result.get("output", "")
        return False, f"Failed to install with Poetry: {error}"

def install_with_pip(package_name: str, user_mode: bool = False) -> Tuple[bool, str]:
    """
    Install a Python package using pip.
    
    Args:
        package_name: Name of the package to install
        user_mode: Whether to install in user mode
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    # Determine pip command (pip or pip3)
    pip_cmd = "pip3" if utils.is_command_available("pip3") else "pip"
    
    # Build command
    cmd = f"{pip_cmd} install {package_name}"
    if user_mode:
        cmd += " --user"
    
    utils.print_info(f"Attempting to install {package_name} with {pip_cmd}{' (--user)' if user_mode else ''}...")
    
    # Run command
    result = utils.run_command(cmd, shell=True)
    
    if result["success"]:
        return True, f"Successfully installed {package_name} with {pip_cmd}"
    else:
        error = result.get("error", "") + result.get("output", "")
        return False, f"Failed to install with {pip_cmd}: {error}"

def install_with_python_dash_m(package_name: str, user_mode: bool = False) -> Tuple[bool, str]:
    """
    Install a Python package using python -m pip.
    
    Args:
        package_name: Name of the package to install
        user_mode: Whether to install in user mode
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    # Build command
    cmd = f"{sys.executable} -m pip install {package_name}"
    if user_mode:
        cmd += " --user"
    
    utils.print_info(f"Attempting to install {package_name} with python -m pip{' (--user)' if user_mode else ''}...")
    
    # Run command
    result = utils.run_command(cmd, shell=True)
    
    if result["success"]:
        return True, f"Successfully installed {package_name} with python -m pip"
    else:
        error = result.get("error", "") + result.get("output", "")
        return False, f"Failed to install with python -m pip: {error}"

def install_with_elevated_permissions(package_name: str) -> Tuple[bool, str]:
    """
    Attempt to install a Python package with elevated permissions.
    
    Args:
        package_name: Name of the package to install
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    is_windows = sys.platform.startswith("win")
    
    if is_windows:
        # Windows - use runas
        utils.print_info(f"Attempting to install {package_name} with elevated permissions...")
        utils.print_warning("This will open a UAC prompt. Please approve it to continue installation.")
        
        # Use pythonw to avoid console window
        cmd = f'powershell -Command "Start-Process -Verb RunAs -FilePath \'{sys.executable}\' -ArgumentList \'-m pip install {package_name}\'"'
        
        # Run command
        result = utils.run_command(cmd, shell=True, timeout=120)  # Longer timeout for UAC prompt
        
        if result["success"]:
            # Wait a bit for installation to complete
            time.sleep(5)
            # Verify installation
            if check_package_installed(package_name):
                return True, f"Successfully installed {package_name} with elevated permissions"
            else:
                return False, "Installation may have failed or was cancelled in the UAC prompt"
        else:
            return False, f"Failed to launch elevated installer: {result.get('error', 'Unknown error')}"
    else:
        # Unix - use sudo
        utils.print_info(f"Attempting to install {package_name} with sudo...")
        utils.print_warning("You may be prompted for your password.")
        
        cmd = f"sudo {sys.executable} -m pip install {package_name}"
        
        # Run command
        result = utils.run_command(cmd, shell=True, timeout=120)  # Longer timeout for password prompt
        
        if result["success"]:
            return True, f"Successfully installed {package_name} with sudo"
        else:
            return False, f"Failed to install with sudo: {result.get('error', 'Unknown error')}"

def install_with_conda(package_name: str) -> Tuple[bool, str]:
    """
    Install a Python package in a Conda environment.
    
    Args:
        package_name: Name of the package to install
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    utils.print_info(f"Attempting to install {package_name} with conda...")
    
    # Try first with conda install
    conda_channels = "-c conda-forge"
    result = utils.run_command(f"conda install {conda_channels} -y {package_name}", shell=True)
    
    if result["success"]:
        return True, f"Successfully installed {package_name} with conda"
    
    # If conda install fails, try with pip in the conda environment
    utils.print_info(f"Conda install failed, trying pip within conda environment...")
    result = utils.run_command(f"pip install {package_name}", shell=True)
    
    if result["success"]:
        return True, f"Successfully installed {package_name} with pip in conda environment"
    else:
        error = result.get("error", "") + result.get("output", "")
        return False, f"Failed to install with conda: {error}"

def install_python_packages_batch(package_names: List[str]) -> Tuple[bool, List[str], List[str], List[str]]:
    """
    Install multiple Python packages at once if possible.
    This is more efficient than installing them one by one.
    
    Args:
        package_names: List of package names to install
    
    Returns:
        Tuple[bool, List[str], List[str], List[str]]: 
            (overall_success, installed_packages, failed_packages, messages)
    """
    utils.print_info(f"Installing multiple Python packages: {', '.join(package_names)}")
    
    messages = []
    installed_packages = []
    failed_packages = []
    
    # Separate problematic packages
    standard_packages = []
    problematic_packages = []
    
    for package in package_names:
        if package in ["python-multipart", "pyyaml"]:
            problematic_packages.append(package)
        else:
            standard_packages.append(package)
    
    # Install problematic packages individually first
    if problematic_packages:
        messages.append(f"Installing problematic packages individually: {', '.join(problematic_packages)}")
        for package in problematic_packages:
            success, message = install_python_package(package)
            if success:
                installed_packages.append(package)
                messages.append(f"SUCCESS: {message}")
            else:
                failed_packages.append(package)
                messages.append(f"ERROR: {message}")
    
    # Continue with batch installation for standard packages
    if not standard_packages:
        # If we only had problematic packages and they're all installed, we're done
        if not failed_packages:
            messages.append("SUCCESS: All packages installed successfully")
            return True, installed_packages, failed_packages, messages
        # If there are failed problematic packages, we'll continue with individual installation
        # for the standard packages as a fallback
        return len(failed_packages) < len(problematic_packages), installed_packages, failed_packages, messages
    
    # Detect environment
    env = detect_python_environment()
    
    # Try batch installation methods based on environment
    if env["in_poetry"] and env["has_poetry"]:
        # Poetry batch installation
        packages_str = " ".join(standard_packages)
        messages.append(f"Attempting batch installation with Poetry: {packages_str}")
        result = utils.run_command(f"poetry add {packages_str}", shell=True)
        
        if result["success"]:
            # Verify installation
            all_installed = True
            for package in standard_packages:
                if check_package_installed(package):
                    installed_packages.append(package)
                else:
                    all_installed = False
                    failed_packages.append(package)
                    messages.append(f"WARNING: Package {package} appears to be installed by Poetry but cannot be imported")
                    
            if all_installed:
                messages.append(f"SUCCESS: Successfully installed all standard packages with Poetry")
                return True, installed_packages, failed_packages, messages
            else:
                messages.append(f"WARNING: Some packages installed with Poetry could not be verified")
        else:
            messages.append(f"WARNING: Poetry batch installation failed, falling back to individual methods")
    elif env["in_conda"]:
        # Conda batch installation
        packages_str = " ".join(standard_packages)
        messages.append(f"Attempting batch installation with conda: {packages_str}")
        result = utils.run_command(f"conda install -c conda-forge -y {packages_str}", shell=True)
        
        if result["success"]:
            # Verify installation
            all_installed = True
            for package in standard_packages:
                if check_package_installed(package):
                    installed_packages.append(package)
                else:
                    all_installed = False
                    messages.append(f"WARNING: Package {package} appears to be installed by conda but cannot be imported")
                    
            if all_installed:
                messages.append(f"SUCCESS: Successfully installed all standard packages with conda")
                return len(installed_packages) > 0, installed_packages, failed_packages, messages
            else:
                messages.append(f"WARNING: Some packages installed with conda could not be verified")
        else:
            messages.append(f"WARNING: Conda batch installation failed, trying pip in conda environment")
            
            # Try pip in conda environment
            result = utils.run_command(f"pip install --no-cache-dir {' '.join(standard_packages)}", shell=True)
            if result["success"]:
                # Verify installation
                all_installed = True
                for package in standard_packages:
                    if check_package_installed(package):
                        installed_packages.append(package)
                    else:
                        all_installed = False
                        messages.append(f"WARNING: Package {package} appears to be installed by pip in conda but cannot be imported")
                        
                if all_installed:
                    messages.append(f"SUCCESS: Successfully installed all standard packages with pip in conda environment")
                    return len(installed_packages) > 0, installed_packages, failed_packages, messages
                else:
                    messages.append(f"WARNING: Some packages installed with pip in conda could not be verified")
            else:
                messages.append(f"WARNING: Pip batch installation in conda failed, falling back to individual methods")
    elif env["in_venv"]:
        # Pip in venv batch installation
        packages_str = " ".join(standard_packages)
        messages.append(f"Attempting batch installation with pip in virtual environment: {packages_str}")
        result = utils.run_command(f"pip install --no-cache-dir {packages_str}", shell=True)
        
        if result["success"]:
            # Verify installation
            all_installed = True
            for package in standard_packages:
                if check_package_installed(package):
                    installed_packages.append(package)
                else:
                    all_installed = False
                    failed_packages.append(package)
                    messages.append(f"WARNING: Package {package} appears to be installed but cannot be imported")
                    
            if all_installed:
                messages.append(f"SUCCESS: Successfully installed all standard packages with pip in virtual environment")
                return True, installed_packages, failed_packages, messages
            else:
                messages.append(f"WARNING: Some packages installed with pip could not be verified")
        else:
            messages.append(f"WARNING: Pip batch installation failed, falling back to individual methods")
    else:
        # System Python - try python -m pip with appropriate flags
        packages_str = " ".join(standard_packages)
        user_flag = "--user" if env["has_user_site"] and not env["has_admin"] else ""
        messages.append(f"Attempting batch installation with python -m pip: {packages_str}")
        result = utils.run_command(f"{sys.executable} -m pip install --no-cache-dir {user_flag} {packages_str}", shell=True)
        
        if result["success"]:
            # Verify installation
            all_installed = True
            for package in standard_packages:
                if check_package_installed(package):
                    installed_packages.append(package)
                else:
                    all_installed = False
                    failed_packages.append(package)
                    messages.append(f"WARNING: Package {package} appears to be installed but cannot be imported")
                    
            if all_installed:
                messages.append(f"SUCCESS: Successfully installed all standard packages with python -m pip")
                return True, installed_packages, failed_packages, messages
            else:
                messages.append(f"WARNING: Some packages installed with python -m pip could not be verified")
        else:
            messages.append(f"WARNING: Python -m pip batch installation failed, falling back to individual methods")
    
    # If batch methods failed, install packages individually
    messages.append("Installing packages individually:")
    
    for package in package_names:
        success, message = install_python_package(package)
        if success:
            installed_packages.append(package)
            messages.append(f"SUCCESS: {message}")
        else:
            failed_packages.append(package)
            messages.append(f"ERROR: {message}")
    
    # Return overall success if at least some packages were installed
    overall_success = len(installed_packages) > 0
    
    return overall_success, installed_packages, failed_packages, messages


def install_python_package(package_name: str) -> Tuple[bool, str]:
    """
    Install a Python package with multiple fallback methods based on environment.
    
    Args:
        package_name: Name of the package to install
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    utils.print_info(f"Installing Python package: {package_name}")
    
    # Special handling for problematic packages
    if package_name in ["python-multipart", "pyyaml"]:
        utils.print_info(f"Using direct pip installation for {package_name}...")
        
        # Map package to import name
        import_name = "multipart" if package_name == "python-multipart" else "yaml"
        
        # Try with pip directly with --no-cache-dir
        result = utils.run_command(f"pip install --no-cache-dir {package_name}", shell=True)
        if result["success"]:
            # Verify installation
            if check_package_installed(package_name):
                return True, f"Successfully installed {package_name} with pip (no-cache)"
            # Try direct import by module name
            try:
                __import__(import_name)
                return True, f"Successfully installed {package_name} (verified with direct import)"
            except (ImportError, ModuleNotFoundError):
                pass
        
        # Try with python -m pip
        result = utils.run_command(f"{sys.executable} -m pip install --no-cache-dir {package_name}", shell=True)
        if result["success"]:
            # Verify installation
            if check_package_installed(package_name):
                return True, f"Successfully installed {package_name} with python -m pip (no-cache)"
            # Try direct import by module name
            try:
                __import__(import_name)
                return True, f"Successfully installed {package_name} (verified with direct import)"
            except (ImportError, ModuleNotFoundError):
                pass
        
        # Force an install with alternative name
        if package_name == "python-multipart":
            result = utils.run_command(f"{sys.executable} -m pip install --force-reinstall multipart", shell=True)
        elif package_name == "pyyaml":
            result = utils.run_command(f"{sys.executable} -m pip install --force-reinstall yaml", shell=True)
            
        if result.get("success", False):
            try:
                __import__(import_name)
                return True, f"Successfully installed {package_name} through alternative package"
            except (ImportError, ModuleNotFoundError):
                pass
    
    # Detect environment for standard packages
    env = detect_python_environment()
    methods_tried = []
    
    # Method 1: Poetry (if in Poetry environment)
    if env["in_poetry"] and env["has_poetry"]:
        success, message = install_with_poetry(package_name)
        methods_tried.append(("Poetry", success, message))
        if success:
            return True, message
    
    # Method 2: Conda (if in Conda environment)
    if env["in_conda"]:
        success, message = install_with_conda(package_name)
        methods_tried.append(("Conda", success, message))
        if success:
            return True, message
    
    # Method 3: Regular pip in virtual environment (including Poetry's venv)
    if env["in_venv"]:
        success, message = install_with_pip(package_name)
        methods_tried.append(("Pip (venv)", success, message))
        if success:
            return True, message
    
    # Method 4: Pip with --user flag (for non-root user in system Python)
    if env["has_pip"] and env["has_user_site"] and not env["has_admin"]:
        success, message = install_with_pip(package_name, user_mode=True)
        methods_tried.append(("Pip (--user)", success, message))
        if success:
            return True, message
    
    # Method 5: Python -m pip (for cases where pip isn't in PATH)
    success, message = install_with_python_dash_m(package_name, user_mode=not env["has_admin"])
    methods_tried.append(("Python -m pip", success, message))
    if success:
        return True, message
    
    # Method 6: Regular pip without --user (might work if user has write access)
    if env["has_pip"] and not env["in_venv"]:
        success, message = install_with_pip(package_name)
        methods_tried.append(("Pip (system)", success, message))
        if success:
            return True, message
    
    # Method 7: Last resort - try with elevated permissions
    if not env["has_admin"]:
        utils.print_warning("Installation failed with regular permissions. Trying with elevated permissions...")
        
        # Ask for confirmation before proceeding with elevated permissions
        if get_user_confirmation("Try to install with administrator/root privileges?", default=False):
            success, message = install_with_elevated_permissions(package_name)
            methods_tried.append(("Elevated permissions", success, message))
            if success:
                return True, message
    
    # Method 8: Offer to manually download and install if everything else fails
    utils.print_warning("All automatic installation methods failed.")
    if get_user_confirmation("Would you like instructions for manual installation?", default=True):
        utils.print_colored("\nManual installation instructions:", "cyan", bold=True)
        utils.print_info(f"1. Open a command prompt or terminal")
        utils.print_info(f"2. Run: pip install {package_name}")
        utils.print_info(f"3. If that fails, try: python -m pip install {package_name}")
        utils.print_info(f"4. For more help, visit: https://pip.pypa.io/en/stable/installation/")
        
        # Allow the user to indicate if they installed it manually
        if get_user_confirmation("Did you manually install the package?", default=False):
            # Verify the installation
            if check_package_installed(package_name):
                return True, f"Package {package_name} was manually installed successfully"
            else:
                utils.print_warning(f"Package {package_name} still appears to be missing.")
                return False, "Manual installation reported but package not found"
    
    # If we get here, all methods failed
    utils.print_error(f"Failed to install {package_name} after trying multiple methods.")
    utils.print_error("Installation methods tried:")
    for method, success, msg in methods_tried:
        status = "Failed" if not success else "Succeeded"
        utils.print_error(f"- {method}: {status}")
    
    # If user wants details of failures
    if len(methods_tried) > 1 and get_user_confirmation("Show detailed error messages?", default=False):
        utils.print_error("Detailed error messages:")
        for method, success, msg in methods_tried:
            if not success:
                utils.print_error(f"- {method}: {msg}")
    
    return False, "Failed to install package after trying multiple methods"

def get_user_confirmation(message: str, default: bool = False) -> bool:
    """
    Get user confirmation for an action.
    
    Args:
        message: Message to display
        default: Default response if user just presses Enter
    
    Returns:
        bool: True if confirmed, False otherwise
    """
    if default:
        prompt = f"{message} [Y/n]: "
        valid_responses = {"y": True, "yes": True, "": True, "n": False, "no": False}
    else:
        prompt = f"{message} [y/N]: "
        valid_responses = {"y": True, "yes": True, "": False, "n": False, "no": False}
    
    while True:
        response = input(prompt).lower()
        if response in valid_responses:
            return valid_responses[response]
        utils.print_warning("Please answer 'y' or 'n'.")

def install_missing_requirements(results: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Install missing requirements that need user confirmation.
    
    Args:
        results: Requirements check results
    
    Returns:
        Updated requirements check results
    """
    # Collect all missing Python packages
    missing_packages = []
    for result in results.get("python", []):
        if not result["passed"] and result.get("package_install", False):
            missing_packages.append(result.get("package_name"))
    
    # If there are missing packages, ask for confirmation to install them
    if missing_packages:
        utils.print_colored("\nMissing Python Packages:", "cyan", bold=True)
        for package in missing_packages:
            utils.print_info(f"- {package}")
        
        # Ask for confirmation
        utils.print_colored("\nThese packages are required for the application to work properly.", "yellow")
        if get_user_confirmation("Would you like to install them now?", default=True):
            # Install packages
            utils.print_colored("\nInstalling packages...", "cyan", bold=True)
            
            installed_packages = []
            failed_packages = []
            
            for package in missing_packages:
                success, message = install_python_package(package)
                if success:
                    installed_packages.append(package)
                    utils.print_success(message)
                else:
                    failed_packages.append(package)
                    utils.print_error(message)
            
            # Print summary
            if installed_packages:
                utils.print_success(f"Successfully installed {len(installed_packages)} packages.")
            if failed_packages:
                utils.print_error(f"Failed to install {len(failed_packages)} packages.")
            
            # Update results
            for result in results.get("python", []):
                if result.get("package_install", False) and result.get("package_name") in installed_packages:
                    result["passed"] = True
                    result["message"] = f"Package {result.get('package_name')} is installed"
        else:
            utils.print_warning("Skipping package installation. Some features may not work properly.")
    
    return results

def print_requirements_results(results: Dict[str, List[Dict[str, Any]]]) -> None:
    """
    Print requirements check results.
    
    Args:
        results: Requirements check results
    """
    utils.print_header("Requirements Check")
    
    # Collect missing Python packages for a special message
    missing_packages = []
    for result in results.get("python", []):
        if not result["passed"] and result.get("package_install", False):
            package_name = result.get("package_name", "")
            if package_name:
                missing_packages.append(package_name)
    
    # If there are missing packages, print a special note
    if missing_packages:
        utils.print_colored("\nNOTE: The following Python packages need to be installed:", "cyan", bold=True)
        for package in missing_packages:
            utils.print_info(f"• - {package}")
    
    for category, category_results in results.items():
        utils.print_colored(f"\n{category.capitalize()} Requirements:", "cyan", bold=True)
        
        for result in category_results:
            name = result["name"]
            passed = result["passed"]
            message = result["message"]
            required = result.get("required", False)
            
            # Don't skip Python package requirements anymore
            if passed:
                utils.print_success(f"✓ {name}: {message}")
            else:
                if required:
                    utils.print_error(f"✗ {name}: {message}")
                else:
                    utils.print_warning(f"! {name}: {message}")
    
    # Print summary
    formatted = format_requirements_results(results)
    
    utils.print_colored("\nSummary:", "cyan", bold=True)
    utils.print_info(f"• Passed: {formatted['passed']}")
    utils.print_info(f"• Failed: {formatted['failed']} (Required: {formatted['actual_required_failed']}, Packages: {formatted['package_failed']})")
    
    if formatted["status"] == "passed":
        utils.print_success("✓ All required requirements passed!")
    elif formatted["status"] == "warning":
        utils.print_warning("! All critical requirements passed, but some packages need installation.")
        utils.print_warning("  You will be prompted to install these packages.")
    else:
        utils.print_error("✗ Some required requirements failed!")


def initialize(config=None) -> Dict[str, Any]:
    """
    Initialize the requirements module.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with module configuration
    """
    # Extract relevant configuration
    check_frontend = True
    
    if config:
        check_frontend = config.get("setup_frontend", True)
    
    return {
        "check_frontend": check_frontend
    }


def check(config=None) -> List[str]:
    """
    Check if system meets requirements.
    
    Args:
        config: Optional configuration
    
    Returns:
        List of requirement issues (empty if all requirements met)
    """
    # Initialize module
    module_config = initialize(config)
    
    # Check requirements
    results = check_all_requirements(module_config["check_frontend"])
    formatted = format_requirements_results(results)
    
    # Collect issues
    issues = []
    
    # Add issues for ALL requirements - don't skip Python packages anymore
    # We need these issues to be reported to ensure installation
    for category, category_results in results.items():
        for result in category_results:
            if not result["passed"] and result.get("required", False):
                issues.append(result["message"])
    
    return issues


def configure(config=None) -> Dict[str, Any]:
    """
    Configure system to meet requirements (if possible).
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with configuration results
    """
    # Initialize module
    module_config = initialize(config)
    
    # Check requirements
    results = check_all_requirements(module_config["check_frontend"])
    
    # Print initial results
    print_requirements_results(results)
    
    # Check if there are any missing packages that can be installed
    missing_packages = []
    for result in results.get("python", []):
        if not result["passed"] and result.get("package_install", False):
            package_name = result.get("package_name", "")
            if package_name and package_name not in missing_packages:
                missing_packages.append(package_name)
    
    # If there are missing packages, try to install them
    if missing_packages:
        # Install missing packages with user confirmation
        utils.print_colored("\nAttempting to resolve missing requirements...", "cyan", bold=True)
        
        utils.print_warning("Missing required Python packages:")
        for package in missing_packages:
            utils.print_warning(f"- {package}")
        
        # Ask for confirmation to install
        utils.print_colored("\nThese packages are required for the application to work properly.", "yellow")
        if get_user_confirmation("Would you like to install them now?", default=True):
            # Try batch installation first if available
            utils.print_colored("\nInstalling packages...", "cyan", bold=True)
            
            installed_packages = []
            failed_packages = []
            
            # Attempt batch installation
            success, installed, failed, messages = install_python_packages_batch(missing_packages)
            
            # Print messages
            for msg in messages:
                if msg.startswith("ERROR:"):
                    utils.print_error(msg[7:])
                elif msg.startswith("WARNING:"):
                    utils.print_warning(msg[9:])
                elif msg.startswith("SUCCESS:"):
                    utils.print_success(msg[9:])
                else:
                    utils.print_info(msg)
            
            # Print summary
            if installed:
                utils.print_success(f"Successfully installed {len(installed)} packages.")
            if failed:
                utils.print_error(f"Failed to install {len(failed)} packages.")
            
            # Re-check requirements
            utils.print_colored("\nRe-checking requirements after installation...", "cyan", bold=True)
            updated_results = check_all_requirements(module_config["check_frontend"])
            
            # Update results with new installation status
            for category, category_results in updated_results.items():
                for result in category_results:
                    if category == "python" and result.get("package_install", False):
                        package_name = result.get("package_name", "")
                        if package_name:
                            is_installed = check_package_installed(package_name)
                            result["passed"] = is_installed
                            result["message"] = f"Package {package_name} is {'installed' if is_installed else 'not installed'}"
            
            # Format and print updated results
            formatted = format_requirements_results(updated_results)
            utils.print_colored("\nUpdated requirements status:", "cyan", bold=True)
            print_requirements_results(updated_results)
            
            return {
                "success": formatted["status"] in ["passed", "warning"],
                "message": f"Requirements check {formatted['status']}",
                "data": formatted
            }
        else:
            # User declined installation
            utils.print_warning("Package installation declined. Some features may not work properly.")
    
    # Just format initial results if no installation happened
    formatted = format_requirements_results(results)
    
    return {
        "success": formatted["status"] in ["passed", "warning"],
        "message": f"Requirements check {formatted['status']}",
        "data": formatted
    }


def validate(config=None) -> Dict[str, Any]:
    """
    Validate that system meets requirements.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with validation results
    """
    issues = check(config)
    
    return {
        "valid": len(issues) == 0,
        "issues": issues
    }


def cleanup(config=None) -> None:
    """
    Clean up resources used by requirements module.
    
    Args:
        config: Optional configuration
    """
    # Nothing to clean up for requirements module
    pass


def main():
    """Run requirements check and print results."""
    results = check_all_requirements()
    print_requirements_results(results)


if __name__ == "__main__":
    main()