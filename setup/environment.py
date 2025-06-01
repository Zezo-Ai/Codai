"""
Environment Detection Module

Detects and reports information about the current environment:
- Operating system details
- Python environment
- Shell environment
- Terminal capabilities
- Package managers
- User permissions
- Environment variables
- IDE information
- Detailed virtual environment analysis
- Potential issues detection

This information is used by other modules to adapt their behavior
to the current environment, and provides extensive debug information.
"""

import os
import sys
import re
import platform
import shutil
import subprocess
import json
import ctypes
import importlib.util
import datetime
import glob
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Union

from . import utils

# Type aliases
EnvInfo = Dict[str, Any]

# Create a debug log file path
DEBUG_LOG_FILE = Path(__file__).parent / "debug" / f"environment_debug_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log"


class EnvironmentError(Exception):
    """Exception raised for environment detection errors."""
    pass


def write_debug_log(message: str, level: str = "INFO") -> None:
    """
    Write a message to the debug log file.
    
    Args:
        message: The message to write
        level: Log level (INFO, WARNING, ERROR, DEBUG)
    """
    # Create directory if it doesn't exist
    DEBUG_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(DEBUG_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"{timestamp} - {level.upper()} - {message}\n")


def log_system_info(env_info: Dict[str, Any]) -> None:
    """
    Log detailed system information to the debug file.
    
    Args:
        env_info: Environment information dictionary
    """
    write_debug_log("=== ENVIRONMENT DETECTION DEBUG LOG ===", "INFO")
    write_debug_log(f"Log created at: {datetime.datetime.now().isoformat()}", "INFO")
    write_debug_log("", "INFO")
    
    # Log raw environment information as JSON
    try:
        env_json = json.dumps(env_info, indent=2, default=str)
        write_debug_log("Raw Environment Information:", "INFO")
        write_debug_log(env_json, "INFO")
        write_debug_log("", "INFO")
    except Exception as e:
        write_debug_log(f"Error serializing environment info: {str(e)}", "ERROR")
    
    # Log all environment variables
    write_debug_log("=== ALL ENVIRONMENT VARIABLES ===", "INFO")
    for key, value in sorted(os.environ.items()):
        # Skip sensitive information
        if any(sensitive in key.lower() for sensitive in ["key", "token", "secret", "password", "credential"]):
            write_debug_log(f"{key}=[REDACTED]", "INFO")
        else:
            write_debug_log(f"{key}={value}", "INFO")
    write_debug_log("", "INFO")


def detect_os() -> Dict[str, str]:
    """
    Detect operating system information.
    
    Returns:
        Dict containing:
        - system: Operating system name (windows, darwin, linux)
        - release: OS release version
        - version: OS version
        - name: User-friendly OS name
    """
    system = platform.system().lower()
    
    os_info = {
        "system": system,
        "release": platform.release(),
        "version": platform.version(),
        "name": platform.platform()
    }
    
    # Add more detailed information for specific OS
    if system == "windows":
        os_info["name"] = f"Windows {platform.release()}"
        try:
            # Get edition information
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                               r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") as key:
                os_info["edition"] = winreg.QueryValueEx(key, "EditionID")[0]
        except:
            pass
            
    elif system == "darwin":  # macOS
        os_info["name"] = f"macOS {platform.mac_ver()[0]}"
        os_info["darwin_version"] = platform.mac_ver()[0]
        
    elif system == "linux":
        # Try to get distribution information
        try:
            import distro
            os_info["distro"] = distro.name(pretty=True)
            os_info["distro_id"] = distro.id()
            os_info["distro_version"] = distro.version()
            os_info["name"] = os_info["distro"]
        except ImportError:
            # Fallback if distro is not available
            try:
                with open("/etc/os-release") as f:
                    lines = f.readlines()
                    for line in lines:
                        if line.startswith("PRETTY_NAME="):
                            os_info["name"] = line.split("=")[1].strip().strip('"')
                            break
            except:
                pass
    
    return os_info


def detect_ide() -> Dict[str, Any]:
    """
    Detect IDE information from environment variables and processes.
    
    Returns:
        Dict containing IDE information
    """
    ide_info = {
        "detected": False,
        "name": None,
        "version": None,
        "details": {}
    }
    
    # Check for VS Code
    if "VSCODE_CWD" in os.environ or "VSCODE_PID" in os.environ:
        ide_info["detected"] = True
        ide_info["name"] = "VS Code"
        ide_info["details"]["pid"] = os.environ.get("VSCODE_PID")
        ide_info["details"]["cwd"] = os.environ.get("VSCODE_CWD")
        ide_info["details"]["extensions_path"] = os.environ.get("VSCODE_EXTENSIONS")
        
        # Try to get VS Code version
        if os.environ.get("VSCODE_CLI") and utils.is_command_available("code"):
            result = utils.run_command("code --version", shell=True)
            if result["success"]:
                version_lines = result["output"].splitlines()
                if version_lines:
                    ide_info["version"] = version_lines[0].strip()
    
    # Check for PyCharm
    elif "PYCHARM_HOSTED" in os.environ or "JETBRAINS_IDE" in os.environ:
        ide_info["detected"] = True
        ide_info["name"] = "PyCharm"
        ide_info["details"]["hosted"] = os.environ.get("PYCHARM_HOSTED")
        ide_info["details"]["project_path"] = os.environ.get("PYCHARM_PROPERTIES")
    
    # Check for Jupyter
    elif "JUPYTER_CONFIG_DIR" in os.environ or "JUPYTER_PATH" in os.environ:
        ide_info["detected"] = True
        ide_info["name"] = "Jupyter"
        ide_info["details"]["config_dir"] = os.environ.get("JUPYTER_CONFIG_DIR")
        ide_info["details"]["path"] = os.environ.get("JUPYTER_PATH")
    
    # Add other IDEs as needed
    
    # If no IDE detected from environment variables, try to infer from process list
    if not ide_info["detected"]:
        # This would require different approaches on different OSes
        # Simple approach for Windows using tasklist
        if platform.system().lower() == "windows":
            try:
                result = utils.run_command("tasklist /FI \"IMAGENAME eq Code.exe\" /FO CSV", shell=True)
                if result["success"] and "Code.exe" in result["output"]:
                    ide_info["detected"] = True
                    ide_info["name"] = "VS Code (detected by process)"
                
                for ide_proc in ["pycharm64.exe", "pycharm.exe", "idea64.exe", "idea.exe"]:
                    result = utils.run_command(f"tasklist /FI \"IMAGENAME eq {ide_proc}\" /FO CSV", shell=True)
                    if result["success"] and ide_proc in result["output"]:
                        ide_info["detected"] = True
                        ide_info["name"] = "JetBrains IDE (detected by process)"
                        break
            except Exception as e:
                write_debug_log(f"Error detecting IDE from process list: {str(e)}", "ERROR")
    
    return ide_info


def analyze_venv_structure(venv_path: Path) -> Dict[str, Any]:
    """
    Analyze the structure of a virtual environment.
    
    Args:
        venv_path: Path to the virtual environment
    
    Returns:
        Dict containing analysis results
    """
    if not venv_path or not venv_path.exists():
        return {
            "exists": False,
            "issues": ["Virtual environment path does not exist"]
        }
    
    analysis = {
        "exists": True,
        "path": str(venv_path),
        "files": {},
        "dirs": {},
        "issues": []
    }
    
    # Check for pyvenv.cfg which is essential
    pyvenv_cfg = venv_path / "pyvenv.cfg"
    analysis["files"]["pyvenv_cfg"] = {
        "exists": pyvenv_cfg.exists(),
        "content": None
    }
    
    if pyvenv_cfg.exists():
        try:
            with open(pyvenv_cfg, "r", encoding="utf-8") as f:
                analysis["files"]["pyvenv_cfg"]["content"] = f.read()
        except Exception as e:
            analysis["files"]["pyvenv_cfg"]["content"] = f"Error reading file: {str(e)}"
            analysis["issues"].append(f"Could not read pyvenv.cfg: {str(e)}")
    else:
        analysis["issues"].append("Missing pyvenv.cfg file")
    
    # Check bin/Scripts directory
    bin_dir = venv_path / ("Scripts" if platform.system().lower() == "windows" else "bin")
    analysis["dirs"]["bin"] = {
        "exists": bin_dir.exists(),
        "path": str(bin_dir),
        "files": []
    }
    
    if bin_dir.exists():
        # List key executables
        try:
            bin_files = list(bin_dir.glob("*"))
            analysis["dirs"]["bin"]["files"] = [f.name for f in bin_files]
            
            # Check for critical executables
            python_exe = bin_dir / ("python.exe" if platform.system().lower() == "windows" else "python")
            if not python_exe.exists():
                analysis["issues"].append(f"Python executable missing from {bin_dir}")
            
            pip_exe = bin_dir / ("pip.exe" if platform.system().lower() == "windows" else "pip")
            if not pip_exe.exists():
                analysis["issues"].append(f"Pip executable missing from {bin_dir}")
        except Exception as e:
            analysis["issues"].append(f"Error accessing bin directory: {str(e)}")
    else:
        analysis["issues"].append(f"Missing bin directory at {bin_dir}")
    
    # Check lib directory
    lib_dir = venv_path / "Lib"
    analysis["dirs"]["lib"] = {
        "exists": lib_dir.exists(),
        "path": str(lib_dir),
        "site_packages": None
    }
    
    if lib_dir.exists():
        # Check site-packages directory
        site_packages = lib_dir / "site-packages"
        analysis["dirs"]["lib"]["site_packages"] = {
            "exists": site_packages.exists(),
            "path": str(site_packages),
            "package_count": 0
        }
        
        if site_packages.exists():
            try:
                packages = list(site_packages.glob("*"))
                analysis["dirs"]["lib"]["site_packages"]["package_count"] = len(packages)
            except Exception as e:
                analysis["issues"].append(f"Error accessing site-packages: {str(e)}")
        else:
            analysis["issues"].append("Missing site-packages directory")
    else:
        analysis["issues"].append(f"Missing lib directory at {lib_dir}")
    
    return analysis


def detect_poetry_config() -> Dict[str, Any]:
    """
    Detect Poetry configuration and installation.
    
    Returns:
        Dict containing Poetry information
    """
    poetry_info = {
        "installed": utils.is_command_available("poetry"),
        "version": None,
        "config": {},
        "issues": []
    }
    
    if poetry_info["installed"]:
        # Get version
        poetry_info["version"] = utils.get_command_version("poetry")
        
        # Get configuration
        result = utils.run_command("poetry config --list", shell=True)
        if result["success"]:
            config_lines = result["output"].splitlines()
            for line in config_lines:
                if "=" in line:
                    key, value = line.split("=", 1)
                    poetry_info["config"][key.strip()] = value.strip()
        else:
            poetry_info["issues"].append(f"Failed to get Poetry config: {result.get('error', '')}")
        
        # Try to locate poetry cache and other directories
        try:
            # Poetry cache dir
            if platform.system().lower() == "windows":
                cache_dir = Path(os.path.expanduser("~")) / "AppData" / "Local" / "pypoetry" / "Cache"
            else:
                cache_dir = Path(os.path.expanduser("~")) / ".cache" / "pypoetry"
            
            poetry_info["cache_dir"] = {
                "path": str(cache_dir),
                "exists": cache_dir.exists()
            }
            
            # Try to get virtualenv settings
            result = utils.run_command("poetry config virtualenvs.path", shell=True)
            if result["success"]:
                venv_path = result["output"].strip()
                poetry_info["virtualenvs_path"] = {
                    "path": venv_path,
                    "exists": os.path.exists(venv_path)
                }
        except Exception as e:
            poetry_info["issues"].append(f"Error getting Poetry paths: {str(e)}")
    
    return poetry_info


def detect_python() -> Dict[str, Any]:
    """
    Detect Python environment information with detailed virtual environment analysis.
    
    Returns:
        Dict containing:
        - version: Python version string
        - major: Major version number
        - minor: Minor version number
        - micro: Micro version number
        - implementation: Python implementation (CPython, PyPy, etc.)
        - executable: Path to Python executable
        - is_64bit: Whether Python is 64-bit
        - is_virtual_env: Whether running in a virtual environment
        - venv_path: Path to virtual environment (if applicable)
        - venv_analysis: Detailed analysis of virtual environment (if applicable)
        - installed_packages: Selected important packages and their versions
        - available_importlib_resources: Whether importlib.resources is available
    """
    version_info = sys.version_info
    
    python_info = {
        "version": platform.python_version(),
        "major": version_info.major,
        "minor": version_info.minor,
        "micro": version_info.micro,
        "implementation": platform.python_implementation(),
        "executable": sys.executable,
        "executable_dir": os.path.dirname(sys.executable),
        "is_64bit": sys.maxsize > 2**32,
        "is_virtual_env": hasattr(sys, "real_prefix") or 
                        (hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix),
        "venv_path": sys.prefix if (hasattr(sys, "real_prefix") or 
                                (hasattr(sys, "base_prefix") and 
                                sys.base_prefix != sys.prefix)) else None,
        "sys_prefix": sys.prefix,
        "sys_base_prefix": getattr(sys, "base_prefix", sys.prefix),
        "sys_paths": sys.path,
        "issues": []
    }
    
    # Additional environment information
    python_info["pip_available"] = utils.is_command_available("pip")
    
    if python_info["pip_available"]:
        pip_version = utils.get_command_version("pip")
        python_info["pip_version"] = pip_version
        
        # Try to get more detailed pip info
        try:
            result = utils.run_command("pip -V", shell=True)
            if result["success"]:
                python_info["pip_detailed"] = result["output"].strip()
        except Exception as e:
            python_info["issues"].append(f"Error getting detailed pip info: {str(e)}")
    
    # Check installed packages (a selection of important ones)
    important_packages = [
        "fastapi", "uvicorn", "pydantic", "poetry", "dotenv", 
        "python-multipart", "requests", "anthropic"
    ]
    
    python_info["installed_packages"] = {}
    
    for package in important_packages:
        try:
            spec = importlib.util.find_spec(package.replace("-", "_"))
            if spec:
                try:
                    pkg_version = None
                    pkg = __import__(package.replace("-", "_"))
                    if hasattr(pkg, "__version__"):
                        pkg_version = pkg.__version__
                    elif hasattr(pkg, "version"):
                        pkg_version = pkg.version
                    
                    python_info["installed_packages"][package] = {
                        "installed": True,
                        "version": pkg_version,
                        "location": spec.origin
                    }
                except Exception as e:
                    python_info["installed_packages"][package] = {
                        "installed": True,
                        "error": str(e),
                        "location": spec.origin if spec else None
                    }
            else:
                python_info["installed_packages"][package] = {
                    "installed": False
                }
        except ImportError:
            python_info["installed_packages"][package] = {
                "installed": False
            }
    
    # Get available Python standard library modules
    python_info["importlib_resources_available"] = importlib.util.find_spec("importlib.resources") is not None
    
    # Analyze virtual environment if running in one
    if python_info["is_virtual_env"] and python_info["venv_path"]:
        venv_path = Path(python_info["venv_path"])
        python_info["venv_analysis"] = analyze_venv_structure(venv_path)
        
        # Look for potential issues with the virtualenv
        if python_info["venv_analysis"]["issues"]:
            python_info["issues"].extend(python_info["venv_analysis"]["issues"])
    
    # Add Poetry information
    python_info["poetry"] = detect_poetry_config()
    
    # Check for project venv even if we're not running in it
    project_root = utils.PROJECT_ROOT
    project_venv = project_root / ".venv"
    if project_venv.exists():
        python_info["project_venv"] = {
            "exists": True,
            "path": str(project_venv),
            "is_current": str(project_venv) == python_info["venv_path"],
            "analysis": analyze_venv_structure(project_venv)
        }
    else:
        python_info["project_venv"] = {
            "exists": False,
            "path": str(project_venv),
            "is_current": False
        }
    
    return python_info


def detect_shell() -> Dict[str, Any]:
    """
    Detect shell environment information.
    
    Returns:
        Dict containing:
        - type: Shell type (cmd, powershell, bash, zsh, etc.)
        - version: Shell version (if available)
        - is_powershell: Whether the shell is PowerShell
        - is_bash: Whether the shell is Bash
        - path: Path to shell executable (if available)
    """
    shell_info = {
        "type": "unknown",
        "version": "unknown",
        "is_powershell": False,
        "is_bash": False,
        "path": None
    }
    
    system = platform.system().lower()
    
    if system == "windows":
        # Check for PowerShell vs CMD
        if "PSModulePath" in os.environ:
            shell_info["type"] = "powershell"
            shell_info["is_powershell"] = True
            
            # Try to get PowerShell version
            try:
                result = utils.run_command("powershell $PSVersionTable.PSVersion", shell=True)
                if result["success"]:
                    match = re.search(r"(\d+\.\d+\.\d+)", result["output"])
                    if match:
                        shell_info["version"] = match.group(1)
                
                # Get path
                result = utils.run_command("powershell (Get-Command powershell).Path", shell=True)
                if result["success"]:
                    shell_info["path"] = result["output"].strip()
            except:
                pass
        else:
            shell_info["type"] = "cmd"
            
            # Try to get CMD version
            try:
                result = utils.run_command("cmd /c ver", shell=True)
                if result["success"]:
                    match = re.search(r"Version\s+(\d+\.\d+\.\d+)", result["output"])
                    if match:
                        shell_info["version"] = match.group(1)
                
                # Get path
                shell_info["path"] = os.environ.get("ComSpec")
            except:
                pass
    else:
        # Unix-like systems
        shell_path = os.environ.get("SHELL", "")
        shell_info["path"] = shell_path
        
        if shell_path:
            shell_name = os.path.basename(shell_path)
            shell_info["type"] = shell_name
            
            if "bash" in shell_name:
                shell_info["is_bash"] = True
                shell_info["type"] = "bash"
                
                # Try to get Bash version
                result = utils.run_command("bash --version", shell=True)
                if result["success"]:
                    match = re.search(r"version\s+(\d+\.\d+\.\d+)", result["output"], re.IGNORECASE)
                    if match:
                        shell_info["version"] = match.group(1)
            
            elif "zsh" in shell_name:
                shell_info["type"] = "zsh"
                
                # Try to get Zsh version
                result = utils.run_command("zsh --version", shell=True)
                if result["success"]:
                    match = re.search(r"(\d+\.\d+\.\d+)", result["output"])
                    if match:
                        shell_info["version"] = match.group(1)
            
            elif "fish" in shell_name:
                shell_info["type"] = "fish"
                
                # Try to get Fish version
                result = utils.run_command("fish --version", shell=True)
                if result["success"]:
                    match = re.search(r"version\s+(\d+\.\d+\.\d+)", result["output"])
                    if match:
                        shell_info["version"] = match.group(1)
    
    return shell_info


def detect_terminal() -> Dict[str, Any]:
    """
    Detect terminal capabilities.
    
    Returns:
        Dict containing:
        - supports_color: Whether the terminal supports color
        - is_vs_code: Whether running in VS Code terminal
        - width: Terminal width
        - height: Terminal height
        - is_tty: Whether stdout is a TTY
    """
    width, height = utils.get_terminal_size()
    
    terminal_info = {
        "supports_color": utils.supports_color(),
        "is_vs_code": "TERM_PROGRAM" in os.environ and os.environ["TERM_PROGRAM"] == "vscode",
        "width": width,
        "height": height,
        "is_tty": sys.stdout.isatty()
    }
    
    # Add more detailed terminal info
    terminal_info["term"] = os.environ.get("TERM", "")
    terminal_info["term_program"] = os.environ.get("TERM_PROGRAM", "")
    
    # Check if running in various terminal emulators
    terminal_info["is_windows_terminal"] = "WT_SESSION" in os.environ
    terminal_info["is_conemu"] = "ConEmuPID" in os.environ
    
    return terminal_info


def detect_package_managers() -> Dict[str, Dict[str, Any]]:
    """
    Detect available package managers.
    
    Returns:
        Dict containing information about each package manager:
        - available: Whether the package manager is available
        - version: Version of the package manager (if available)
        - path: Path to the package manager executable (if available)
    """
    package_managers = {}
    
    # Python package managers
    for pm in ["pip", "poetry", "pipenv", "conda"]:
        if utils.is_command_available(pm):
            package_managers[pm] = {
                "available": True,
                "version": utils.get_command_version(pm),
                "path": shutil.which(pm)
            }
        else:
            package_managers[pm] = {
                "available": False
            }
    
    # Node.js package managers
    for pm in ["npm", "yarn", "pnpm"]:
        if utils.is_command_available(pm):
            package_managers[pm] = {
                "available": True,
                "version": utils.get_command_version(pm),
                "path": shutil.which(pm)
            }
        else:
            package_managers[pm] = {
                "available": False
            }
    
    # Platform-specific package managers
    system = platform.system().lower()
    
    if system == "windows":
        # Windows package managers
        for pm in ["choco", "scoop"]:
            available = False
            
            if pm == "choco":
                available = utils.is_command_available("choco")
            elif pm == "scoop":
                available = utils.is_command_available("scoop")
            
            package_managers[pm] = {
                "available": available
            }
            
            if available:
                package_managers[pm]["version"] = utils.get_command_version(pm)
                package_managers[pm]["path"] = shutil.which(pm)
    
    elif system == "darwin":
        # macOS package managers
        for pm in ["brew", "port"]:
            available = utils.is_command_available(pm)
            
            package_managers[pm] = {
                "available": available
            }
            
            if available:
                package_managers[pm]["version"] = utils.get_command_version(pm)
                package_managers[pm]["path"] = shutil.which(pm)
    
    elif system == "linux":
        # Linux package managers
        for pm in ["apt", "apt-get", "yum", "dnf", "pacman", "snap", "flatpak"]:
            available = utils.is_command_available(pm)
            
            package_managers[pm] = {
                "available": available
            }
            
            if available:
                package_managers[pm]["version"] = utils.get_command_version(pm)
                package_managers[pm]["path"] = shutil.which(pm)
    
    return package_managers


def detect_docker() -> Dict[str, Any]:
    """
    Detect Docker availability and information.
    
    Returns:
        Dict containing:
        - available: Whether Docker is available
        - version: Docker version (if available)
        - compose_available: Whether Docker Compose is available
        - compose_version: Docker Compose version (if available)
    """
    docker_info = {
        "available": utils.is_command_available("docker"),
        "version": None,
        "compose_available": utils.is_command_available("docker-compose"),
        "compose_version": None
    }
    
    if docker_info["available"]:
        docker_info["version"] = utils.get_command_version("docker")
        
        # Try to get more detailed Docker info
        result = utils.run_command("docker info --format '{{json .}}'", shell=True)
        if result["success"]:
            try:
                # Remove any non-JSON text (like warnings)
                output = result["output"]
                json_start = output.find('{')
                json_end = output.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = output[json_start:json_end]
                    docker_details = json.loads(json_str)
                    docker_info["details"] = docker_details
            except:
                pass
    
    if docker_info["compose_available"]:
        docker_info["compose_version"] = utils.get_command_version("docker-compose")
    
    return docker_info


def is_admin_or_root() -> bool:
    """
    Check if the current user has administrator/root privileges.
    
    Returns:
        bool: True if the user has admin/root privileges, False otherwise
    """
    system = platform.system().lower()
    
    if system == "windows":
        try:
            return ctypes.windll.shell32.IsUserAnAdmin() != 0
        except:
            return False
    else:
        # Unix-like systems
        return os.geteuid() == 0


def detect_git() -> Dict[str, Any]:
    """
    Detect Git availability and information.
    
    Returns:
        Dict containing:
        - available: Whether Git is available
        - version: Git version (if available)
        - path: Path to Git executable (if available)
        - in_repo: Whether the current directory is in a Git repository
        - user_name: Git user name (if configured)
        - user_email: Git user email (if configured)
    """
    git_info = {
        "available": utils.is_command_available("git"),
        "version": None,
        "path": None,
        "in_repo": False,
        "user_name": None,
        "user_email": None
    }
    
    if git_info["available"]:
        git_info["version"] = utils.get_command_version("git")
        git_info["path"] = shutil.which("git")
        
        # Check if current directory is in a Git repository
        result = utils.run_command("git rev-parse --is-inside-work-tree", shell=True)
        git_info["in_repo"] = result["success"] and result["output"].strip() == "true"
        
        # Get Git user name and email
        name_result = utils.run_command("git config --get user.name", shell=True)
        if name_result["success"]:
            git_info["user_name"] = name_result["output"].strip()
        
        email_result = utils.run_command("git config --get user.email", shell=True)
        if email_result["success"]:
            git_info["user_email"] = email_result["output"].strip()
    
    return git_info


def detect_node() -> Dict[str, Any]:
    """
    Detect Node.js availability and information.
    
    Returns:
        Dict containing:
        - available: Whether Node.js is available
        - version: Node.js version (if available)
        - path: Path to Node.js executable (if available)
        - npm_available: Whether npm is available
        - npm_version: npm version (if available)
    """
    node_info = {
        "available": utils.is_command_available("node"),
        "version": None,
        "path": None,
        "npm_available": utils.is_command_available("npm"),
        "npm_version": None
    }
    
    if node_info["available"]:
        node_info["version"] = utils.get_command_version("node")
        node_info["path"] = shutil.which("node")
    
    if node_info["npm_available"]:
        node_info["npm_version"] = utils.get_command_version("npm")
    
    return node_info


def detect_environment() -> Dict[str, Any]:
    """
    Detect comprehensive environment information.
    
    Returns:
        Dict containing all environment information:
        - os: Operating system information
        - python: Python environment information
        - shell: Shell environment information
        - terminal: Terminal capabilities
        - package_managers: Available package managers
        - docker: Docker availability and information
        - git: Git availability and information
        - node: Node.js availability and information
        - user: User information
        - env: Environment variables
        - ide: IDE information
        - timestamp: Time when detection was performed
        - issues: List of potential issues detected
    """
    # Log the start of environment detection
    write_debug_log("Starting environment detection", "INFO")
    
    timestamp = datetime.datetime.now().isoformat()
    
    env_info = {
        "timestamp": timestamp,
        "os": detect_os(),
        "python": detect_python(),
        "shell": detect_shell(),
        "terminal": detect_terminal(),
        "package_managers": detect_package_managers(),
        "docker": detect_docker(),
        "git": detect_git(),
        "node": detect_node(),
        "ide": detect_ide(),
        "user": {
            "home": str(Path.home()),
            "is_admin": is_admin_or_root(),
            "username": os.environ.get("USERNAME") or os.environ.get("USER")
        },
        "env": {},
        "issues": []
    }
    
    # Add select environment variables (safe ones only)
    safe_env_vars = [
        "PATH", "PYTHONPATH", "VIRTUAL_ENV", "TERM", "SHELL",
        "LANG", "LC_ALL", "EDITOR", "HOME", "USER", "USERNAME",
        "VENV_PATH", "POETRY_*"  # Also capture Poetry-related env vars
    ]
    
    for var in os.environ:
        if var in safe_env_vars or any(var.startswith(pattern.replace("*", "")) 
                                      for pattern in safe_env_vars if "*" in pattern):
            env_info["env"][var] = os.environ.get(var)
    
    # Collect any detected issues from components
    if "issues" in env_info["python"] and env_info["python"]["issues"]:
        env_info["issues"].extend([f"Python: {issue}" for issue in env_info["python"]["issues"]])
    
    if "poetry" in env_info["python"] and "issues" in env_info["python"]["poetry"] and env_info["python"]["poetry"]["issues"]:
        env_info["issues"].extend([f"Poetry: {issue}" for issue in env_info["python"]["poetry"]["issues"]])
    
    # Add specific project information
    project_root = utils.PROJECT_ROOT
    env_info["project"] = {
        "path": str(project_root),
        "name": project_root.name,
        "pyproject_exists": (project_root / "pyproject.toml").exists(),
        "requirements_exists": (project_root / "requirements.txt").exists(),
        "env_file_exists": (project_root / ".env").exists(),
        "gitignore_exists": (project_root / ".gitignore").exists()
    }
    
    # Virtual environment (venv) specific checks - more targeted to our observed issues
    venv_dir = project_root / ".venv"
    if venv_dir.exists():
        if not (venv_dir / "pyvenv.cfg").exists():
            env_info["issues"].append("Critical: Project .venv exists but missing pyvenv.cfg file")
            
            # Additional analysis of malformed venv
            venv_detail = {
                "is_empty": len(list(venv_dir.iterdir())) == 0,
                "contents": [f.name for f in venv_dir.iterdir()],
                "total_files": sum(1 for _ in venv_dir.glob("**/*")),
                "scripts_dir_exists": (venv_dir / "Scripts").exists() if platform.system().lower() == "windows" else (venv_dir / "bin").exists()
            }
            
            env_info["project"]["venv_issue_details"] = venv_detail
            
            # Log the critical venv issue
            write_debug_log(f"Critical venv issue: Project .venv exists but missing pyvenv.cfg file. Contents: {venv_detail['contents']}", "ERROR")
    
    # Log all information to debug file
    write_debug_log("Environment detection completed", "INFO")
    log_system_info(env_info)
    
    # Log the path to the debug log file
    print(f"Environment debug log created at: {DEBUG_LOG_FILE}")
    
    return env_info


def print_environment_summary(env_info: Dict[str, Any]) -> None:
    """
    Print a summary of the environment information.
    
    Args:
        env_info: Environment information from detect_environment()
    """
    utils.print_header("Environment Information")
    
    # Operating System
    utils.print_colored("\nOperating System:", "cyan", bold=True)
    utils.print_info(f"Name: {env_info['os']['name']}")
    utils.print_info(f"System: {env_info['os']['system']}")
    utils.print_info(f"Version: {env_info['os']['version']}")
    if 'edition' in env_info['os']:
        utils.print_info(f"Edition: {env_info['os']['edition']}")
    
    # Python
    utils.print_colored("\nPython:", "cyan", bold=True)
    utils.print_info(f"Version: {env_info['python']['version']} ({env_info['python']['implementation']})")
    utils.print_info(f"Executable: {env_info['python']['executable']}")
    utils.print_info(f"Executable Directory: {env_info['python']['executable_dir']}")
    utils.print_info(f"Virtual Environment: {'Yes' if env_info['python']['is_virtual_env'] else 'No'}")
    utils.print_info(f"Python 64-bit: {'Yes' if env_info['python']['is_64bit'] else 'No'}")
    
    if env_info['python']['is_virtual_env']:
        utils.print_info(f"Virtual Env Path: {env_info['python']['venv_path']}")
        if "venv_analysis" in env_info['python']:
            venv_analysis = env_info['python']['venv_analysis']
            if venv_analysis["issues"]:
                utils.print_colored("\nVirtual Environment Issues:", "red", bold=True)
                for issue in venv_analysis["issues"]:
                    utils.print_error(f"- {issue}")
    
    # Project virtual environment
    if "project_venv" in env_info['python'] and env_info['python']['project_venv']["exists"]:
        utils.print_colored("\nProject Virtual Environment:", "cyan", bold=True)
        project_venv = env_info['python']['project_venv']
        utils.print_info(f"Path: {project_venv['path']}")
        utils.print_info(f"Is Current: {'Yes' if project_venv['is_current'] else 'No'}")
        
        if "analysis" in project_venv and project_venv["analysis"]["issues"]:
            utils.print_colored("Project Venv Issues:", "red", bold=False)
            for issue in project_venv["analysis"]["issues"]:
                utils.print_error(f"- {issue}")
    
    # Poetry
    utils.print_colored("\nPoetry:", "cyan", bold=True)
    poetry = env_info['python']['poetry']
    if poetry["installed"]:
        utils.print_info(f"Version: {poetry['version']}")
        if "virtualenvs_path" in poetry:
            utils.print_info(f"Virtualenvs Path: {poetry['virtualenvs_path']['path']}")
        if poetry["issues"]:
            utils.print_colored("Poetry Issues:", "red", bold=False)
            for issue in poetry["issues"]:
                utils.print_error(f"- {issue}")
    else:
        utils.print_info("Not installed")
    
    # Installed packages
    if "installed_packages" in env_info['python']:
        utils.print_colored("\nImportant Python Packages:", "cyan", bold=True)
        for pkg, info in env_info['python']['installed_packages'].items():
            if info.get("installed", False):
                if "version" in info and info["version"]:
                    utils.print_info(f"{pkg}: {info['version']}")
                else:
                    utils.print_info(f"{pkg}: Installed (version unknown)")
            else:
                utils.print_warning(f"{pkg}: Not installed")
    
    # Shell
    utils.print_colored("\nShell:", "cyan", bold=True)
    utils.print_info(f"Type: {env_info['shell']['type']}")
    utils.print_info(f"Version: {env_info['shell']['version']}")
    if "path" in env_info['shell'] and env_info['shell']['path']:
        utils.print_info(f"Path: {env_info['shell']['path']}")
    
    # IDE
    utils.print_colored("\nIDE:", "cyan", bold=True)
    if env_info['ide']['detected']:
        utils.print_info(f"Name: {env_info['ide']['name']}")
        if env_info['ide']['version']:
            utils.print_info(f"Version: {env_info['ide']['version']}")
    else:
        utils.print_info("No IDE detected")
    
    # Package Managers
    utils.print_colored("\nPackage Managers:", "cyan", bold=True)
    
    for name, info in env_info['package_managers'].items():
        if info["available"]:
            utils.print_info(f"{name}: {info.get('version', 'Available')}")
    
    # Node.js
    utils.print_colored("\nNode.js:", "cyan", bold=True)
    if env_info['node']['available']:
        utils.print_info(f"Version: {env_info['node']['version']}")
        if env_info['node']['npm_available']:
            utils.print_info(f"npm Version: {env_info['node']['npm_version']}")
    else:
        utils.print_info("Not available")
    
    # Project Information
    utils.print_colored("\nProject Information:", "cyan", bold=True)
    if "project" in env_info:
        utils.print_info(f"Path: {env_info['project']['path']}")
        utils.print_info(f"Name: {env_info['project']['name']}")
        utils.print_info(f"pyproject.toml: {'Yes' if env_info['project']['pyproject_exists'] else 'No'}")
        utils.print_info(f"requirements.txt: {'Yes' if env_info['project']['requirements_exists'] else 'No'}")
        utils.print_info(f".env file: {'Yes' if env_info['project']['env_file_exists'] else 'No'}")
    
    # Docker
    utils.print_colored("\nDocker:", "cyan", bold=True)
    if env_info['docker']['available']:
        utils.print_info(f"Version: {env_info['docker']['version']}")
        if env_info['docker']['compose_available']:
            utils.print_info(f"Compose Version: {env_info['docker']['compose_version']}")
    else:
        utils.print_info("Not available")
    
    # User
    utils.print_colored("\nUser:", "cyan", bold=True)
    utils.print_info(f"Username: {env_info['user']['username']}")
    utils.print_info(f"Admin/Root: {'Yes' if env_info['user']['is_admin'] else 'No'}")
    utils.print_info(f"Home Directory: {env_info['user']['home']}")
    
    # Terminal
    utils.print_colored("\nTerminal:", "cyan", bold=True)
    utils.print_info(f"Color Support: {'Yes' if env_info['terminal']['supports_color'] else 'No'}")
    utils.print_info(f"VS Code Terminal: {'Yes' if env_info['terminal']['is_vs_code'] else 'No'}")
    utils.print_info(f"Size: {env_info['terminal']['width']}x{env_info['terminal']['height']}")
    
    # Issues list
    if "issues" in env_info and env_info["issues"]:
        utils.print_colored("\nDetected Issues:", "red", bold=True)
        for issue in env_info["issues"]:
            utils.print_error(f"- {issue}")
    
    # Debug log information
    utils.print_colored("\nDebug Information:", "cyan", bold=True)
    utils.print_info(f"Environment detection timestamp: {env_info.get('timestamp', 'Unknown')}")
    utils.print_info(f"Detailed environment log: {DEBUG_LOG_FILE}")


def print_compact_environment_summary(env_info: Dict[str, Any]) -> None:
    """
    Print a compact but comprehensive summary of the environment information.
    This is designed for display during setup and prerequisites check.
    
    Args:
        env_info: Environment information from detect_environment()
    """
    from . import theme
    
    # Create a new box with environment summary
    theme.print_subheader("Environment Summary")
    
    # Operating System (with proper Windows edition)
    os_info = env_info['os']
    os_description = f"{os_info['name']}"
    if 'edition' in os_info:
        os_description += f" {os_info['edition']}"
    theme.print_key_value("OS", f"{os_description} ({os_info['version']})", key_width=12)
    
    # Python with implementation and bitness
    python_info = env_info['python']
    python_description = f"{python_info['version']} ({python_info['implementation']}, "
    python_description += "64-bit" if python_info['is_64bit'] else "32-bit"
    python_description += ")"
    theme.print_key_value("Python", python_description, key_width=12)
    
    # Shell information
    shell_info = env_info['shell']
    shell_description = f"{shell_info['type'].capitalize()}"
    if shell_info['version'] and shell_info['version'] != "unknown":
        shell_description += f" {shell_info['version']}"
    theme.print_key_value("Shell", shell_description, key_width=12)
    
    # IDE information
    ide_info = env_info['ide']
    if ide_info['detected']:
        ide_description = f"{ide_info['name']}"
        if ide_info['version']:
            ide_description += f" {ide_info['version']}"
        theme.print_key_value("IDE", ide_description, key_width=12)
    
    # Node.js and npm
    node_info = env_info['node']
    if node_info['available']:
        node_description = f"{node_info['version']}"
        if node_info['npm_available']:
            node_description += f", npm {node_info['npm_version']}"
        theme.print_key_value("Node.js", node_description, key_width=12)
    
    # Environment Management
    env_section = []
    
    # Virtual Environment status
    if python_info['is_virtual_env']:
        env_section.append(("Active venv", python_info['venv_path']))
    elif "project_venv" in python_info and python_info["project_venv"]["exists"]:
        env_section.append(("Project venv", f"{python_info['project_venv']['path']} (not active)"))
    
    # Poetry status
    poetry_info = python_info['poetry']
    if poetry_info['installed']:
        env_section.append(("Poetry", poetry_info['version']))
    
    # Print environment management section if there's anything to show
    if env_section:
        theme.print_subheader("Environment Management")
        for key, value in env_section:
            theme.print_key_value(key, value, key_width=12)
    
    # Package Information
    theme.print_subheader("Key Packages")
    
    # Important packages
    key_packages = ["fastapi", "uvicorn", "anthropic", "aiohttp", "beautifulsoup4", "brotli"]
    installed_packages = []
    missing_packages = []
    
    for pkg in key_packages:
        if pkg in python_info.get('installed_packages', {}):
            pkg_info = python_info['installed_packages'][pkg]
            if pkg_info.get('installed', False):
                version = pkg_info.get('version', '?')
                installed_packages.append((pkg, version if version else "Installed"))
            else:
                missing_packages.append(pkg)
    
    # Print installed packages in a table-like format
    for pkg, version in installed_packages:
        status_symbol = theme.get_symbol("check")
        utils.print_colored(f"{status_symbol} {pkg.ljust(15)}", "green", end=" ")
        utils.print_colored(f"{version}", "white")
    
    # Show missing packages
    if missing_packages:
        theme.print_subheader("Missing Packages")
        for pkg in missing_packages:
            status_symbol = theme.get_symbol("error")
            utils.print_colored(f"{status_symbol} {pkg}", "red")
    
    # Project information
    if "project" in env_info:
        project_info = env_info["project"]
        theme.print_subheader("Project")
        theme.print_key_value("Name", project_info['name'], key_width=12)
        if "path" in project_info:
            theme.print_key_value("Path", str(project_info['path']), key_width=12)
    
    # Show detected issues
    if "issues" in env_info and env_info["issues"]:
        theme.print_subheader("Detected Issues")
        for i, issue in enumerate(env_info["issues"][:3], 1):  # Show only first 3 issues for compactness
            theme.print_error(f"{i}. {issue}")
        if len(env_info["issues"]) > 3:
            theme.print_warning(f"...and {len(env_info['issues']) - 3} more issues")
    
    # Log file information
    theme.print_subheader("Debug Information")
    theme.print_info(f"Environment log: {DEBUG_LOG_FILE}")
    
    # Draw a separator line
    utils.print_colored("\n" + "─" * 80, "blue")


def check_environment_compatibility() -> List[str]:
    """
    Check if the current environment is compatible with the application.
    
    Returns:
        List of compatibility issues (empty if compatible)
    """
    issues = []
    env_info = detect_environment()
    
    # Check Python version
    python_version = (
        env_info["python"]["major"],
        env_info["python"]["minor"],
        env_info["python"]["micro"]
    )
    
    if python_version < (3, 9, 0):
        issues.append(f"Python 3.9+ required, found {env_info['python']['version']}")
    
    # Check for required package managers
    if not env_info["package_managers"].get("pip", {}).get("available", False):
        issues.append("pip is required but not available")
    
    # Check for Node.js if needed for frontend
    frontend_path = utils.PROJECT_ROOT / "frontend"
    if frontend_path.exists() and not env_info["node"]["available"]:
        issues.append("Node.js is required for frontend but not available")
    
    # Try to load environment variables from .env file
    env_file = utils.PROJECT_ROOT / ".env"
    if env_file.exists():
        try:
            # First, try to use python-dotenv if it's installed
            try:
                from dotenv import load_dotenv
                load_dotenv(dotenv_path=env_file)
            except ImportError:
                # If python-dotenv is not installed, use a simple parsing
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, value = line.split("=", 1)
                            key = key.strip()
                            value = value.strip()
                            # Remove quotes if present
                            if value.startswith('"') and value.endswith('"'):
                                value = value[1:-1]
                            elif value.startswith("'") and value.endswith("'"):
                                value = value[1:-1]
                            # Set environment variable if not already set
                            if key and not os.environ.get(key):
                                os.environ[key] = value
        except Exception as e:
            issues.append(f"Failed to load .env file: {str(e)}")
    
    # Note: ANTHROPIC_API_KEY is now set through the UI, not environment variables
    # Encryption secret is auto-generated on first run
    # So we don't need to check for any required environment variables here
    
    return issues


def initialize() -> EnvInfo:
    """
    Initialize the environment module.
    
    Returns:
        Environment information
    """
    return detect_environment()


def check(config=None) -> List[str]:
    """
    Check environment compatibility without making changes.
    
    Args:
        config: Optional configuration

    Returns:
        List of compatibility issues (empty if compatible)
    """
    return check_environment_compatibility()


def configure(config=None) -> Dict[str, Any]:
    """
    Configure environment detection.
    
    Args:
        config: Optional configuration

    Returns:
        Dictionary with configuration results
    """
    env_info = detect_environment()
    
    # No actual configuration needed for detection module
    return {
        "success": True,
        "message": "Environment detection configured",
        "data": env_info
    }


def validate(config=None) -> Dict[str, Any]:
    """
    Validate environment configuration.
    
    Args:
        config: Optional configuration

    Returns:
        Dictionary with validation results
    """
    issues = check_environment_compatibility()
    
    return {
        "valid": len(issues) == 0,
        "issues": issues
    }


def cleanup(config=None) -> None:
    """
    Clean up any temporary resources.
    
    Args:
        config: Optional configuration
    """
    # No cleanup needed for environment detection
    pass


def main():
    """Run environment detection and print summary."""
    # Ensure debug directory exists
    debug_dir = Path(__file__).parent / "debug"
    debug_dir.mkdir(exist_ok=True)
    
    utils.print_header("Enhanced Environment Detection")
    utils.print_colored("Collecting detailed environment information...", "blue", bold=True)
    
    env_info = detect_environment()
    
    # Log the detailed information
    log_system_info(env_info)
    
    # Display both summary formats
    utils.print_colored("\n=== Compact Environment Summary ===", "blue", bold=True)
    print_compact_environment_summary(env_info)
    
    utils.print_colored("\n=== Detailed Environment Information ===", "blue", bold=True)
    print_environment_summary(env_info)
    
    issues = check_environment_compatibility()
    if issues:
        utils.print_colored("\nCompatibility Issues:", "red", bold=True)
        for issue in issues:
            utils.print_error(issue)
    else:
        utils.print_colored("\nEnvironment is compatible!", "green", bold=True)
    
    utils.print_colored(f"\nDetailed environment information has been logged to:", "blue", bold=True)
    utils.print_info(f"{DEBUG_LOG_FILE}")
    utils.print_info("You can share this file to help with debugging environment issues.")


if __name__ == "__main__":
    main()