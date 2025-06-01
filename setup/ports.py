"""
Ports Management Module

Handles port detection, connectivity testing, and service URL configuration.
This module ensures that services can connect to each other and that ports
are available for use.

Key features:
- Port availability checking
- Automatic port selection
- Connection testing
- Service URL configuration
- Port conflict resolution
"""

import os
import sys
import time
import socket
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from typing import Dict, List, Optional, Any, Tuple, Union, Set

from . import utils

# Default ports
DEFAULT_BACKEND_PORT = 8000
DEFAULT_FRONTEND_PORT = 8001

# Type aliases
PortConfig = Dict[str, Any]

# Track allocated ports to prevent conflicts
_allocated_ports = set()


class PortError(Exception):
    """Exception raised for port-related errors."""
    pass


def check_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """
    Check if a port is in use.
    
    Args:
        port: The port number to check
        host: The host to check
        
    Returns:
        True if port is in use, False if available
    
    Returns:
        bool: True if the port is in use, False if available
    """
    return utils.check_port_in_use(port, host)

def check_port_available(port: int, host: str = "127.0.0.1") -> bool:
    """
    Check if a port is available (not in use).
    
    Args:
        port: The port number to check
        host: The host to check
    
    Returns:
        bool: True if the port is available, False if in use
    """
    return not check_port_in_use(port, host)


def find_available_port(start_port: int, end_port: int = None, host: str = "127.0.0.1") -> int:
    """
    Find an available port in the given range, making sure it hasn't been allocated already.
    
    Args:
        start_port: The port to start searching from
        end_port: The port to stop searching at (inclusive)
        host: The host to check
    
    Returns:
        int: Available port
    
    Raises:
        PortError: If no ports are available in the range
    """
    if end_port is None:
        end_port = start_port + 100
    
    # First try to find an available port using the utils function
    port = utils.find_available_port(start_port, end_port, host)
    
    if port is None:
        raise PortError(f"No available ports in range {start_port}-{end_port}")
    
    # Check if the port is already allocated
    attempts = 0
    max_attempts = 100
    while port in _allocated_ports and attempts < max_attempts:
        # Try to find another port
        next_start = port + 1
        if next_start > end_port:
            # We've reached the end of the range, try looking in an extended range
            next_start = end_port + 1
            extended_end = next_start + 100
        else:
            extended_end = end_port
            
        port = utils.find_available_port(next_start, extended_end, host)
        if port is None:
            raise PortError(f"No available ports in range {next_start}-{extended_end}")
        
        attempts += 1
    
    if attempts >= max_attempts:
        raise PortError("Failed to find a non-conflicting port after multiple attempts")
    
    # Add port to allocated ports set
    _allocated_ports.add(port)
    
    return port


def get_backend_port(config: Dict[str, Any] = None) -> int:
    """
    Get the backend port from configuration or find an available one.
    
    Args:
        config: Configuration dictionary (optional)
    
    Returns:
        int: Backend port
    """
    # Default port
    port = DEFAULT_BACKEND_PORT
    
    # Check if port is specified in config
    if config and "backend_port" in config:
        port = config["backend_port"]
    
    # Check if port is available
    if not check_port_available(port):
        utils.print_warning(f"Port {port} is not available for backend")
        
        # Try to find an available port
        try:
            port = find_available_port(port + 1, port + 100)
            utils.print_info(f"Found available port for backend: {port}")
        except PortError as e:
            raise PortError(f"Failed to find available port for backend: {str(e)}")
    
    return port


def get_frontend_port(config: Dict[str, Any] = None) -> int:
    """
    Get the frontend port from configuration or find an available one.
    
    Args:
        config: Configuration dictionary (optional)
    
    Returns:
        int: Frontend port
    """
    # Default port
    port = DEFAULT_FRONTEND_PORT
    
    # Check if port is specified in config
    if config and "frontend_port" in config:
        port = config["frontend_port"]
    
    # Check if port is available
    if not check_port_available(port):
        utils.print_warning(f"Port {port} is not available for frontend")
        
        # Try to find an available port
        try:
            port = find_available_port(port + 1, port + 100)
            utils.print_info(f"Found available port for frontend: {port}")
        except PortError as e:
            raise PortError(f"Failed to find available port for frontend: {str(e)}")
    
    return port


def get_backend_url(port: int = None, host: str = "127.0.0.1") -> str:
    """
    Get the backend URL.
    
    Args:
        port: Backend port (if None, will detect)
        host: Backend host
    
    Returns:
        str: Backend URL
    """
    if port is None:
        port = get_backend_port()
    
    return f"http://{host}:{port}"


def get_frontend_url(port: int = None, host: str = "127.0.0.1") -> str:
    """
    Get the frontend URL.
    
    Args:
        port: Frontend port (if None, will detect)
        host: Frontend host
    
    Returns:
        str: Frontend URL
    """
    if port is None:
        port = get_frontend_port()
    
    return f"http://{host}:{port}"


def check_backend_connectivity(url: str = None, timeout: int = 2) -> bool:
    """
    Check if the backend is reachable.
    
    Args:
        url: Backend URL (if None, will use default)
        timeout: Connection timeout in seconds
    
    Returns:
        bool: True if backend is reachable, False otherwise
    """
    if url is None:
        url = get_backend_url()
    
    health_url = f"{url}/health"
    
    try:
        req = Request(health_url)
        with urlopen(req, timeout=timeout) as response:
            return response.status == 200
    except (URLError, HTTPError, TimeoutError):
        return False


def check_frontend_connectivity(url: str = None, timeout: int = 2) -> bool:
    """
    Check if the frontend is reachable.
    
    Args:
        url: Frontend URL (if None, will use default)
        timeout: Connection timeout in seconds
    
    Returns:
        bool: True if frontend is reachable, False otherwise
    """
    if url is None:
        url = get_frontend_url()
    
    try:
        req = Request(url)
        with urlopen(req, timeout=timeout) as response:
            return response.status == 200
    except (URLError, HTTPError, TimeoutError):
        return False


def update_frontend_env(backend_url: str, frontend_dir: Path = None) -> bool:
    """
    Update frontend environment file with backend URL.
    
    Args:
        backend_url: Backend URL
        frontend_dir: Frontend directory (if None, will use default)
    
    Returns:
        bool: True if successful, False otherwise
    """
    if frontend_dir is None:
        frontend_dir = utils.PROJECT_ROOT / "frontend"
    
    env_file = frontend_dir / ".env.local"
    
    try:
        # Ensure we have a valid backend URL
        if not backend_url or not backend_url.startswith("http"):
            utils.print_error(f"Invalid backend URL: {backend_url}")
            return False
            
        utils.print_info(f"Updating frontend environment with backend URL: {backend_url}")
        
        # Create or update .env.local file
        if env_file.exists():
            try:
                # Read existing file
                with open(env_file, "r", encoding="utf-8") as f:
                    lines = f.read().splitlines()
                
                # Update or add API_BASE
                api_base_updated = False
                
                for i, line in enumerate(lines):
                    if line.startswith("NEXT_PUBLIC_API_BASE="):
                        old_value = line.split("=", 1)[1] if "=" in line else ""
                        lines[i] = f"NEXT_PUBLIC_API_BASE={backend_url}"
                        api_base_updated = True
                        utils.print_info(f"Updated frontend API URL from {old_value} to {backend_url}")
                        break
                
                if not api_base_updated:
                    lines.append(f"NEXT_PUBLIC_API_BASE={backend_url}")
                    utils.print_info(f"Added new API URL entry: {backend_url}")
                
                # Write updated content
                with open(env_file, "w", encoding="utf-8") as f:
                    f.write("\n".join(lines))
                    # Ensure file ends with a newline
                    if lines:
                        f.write("\n")
            except Exception as e:
                utils.print_error(f"Error updating existing .env.local: {str(e)}")
                # If reading or updating fails, create a new file
                with open(env_file, "w", encoding="utf-8") as f:
                    f.write(f"NEXT_PUBLIC_DEBUG=true\n")
                    f.write(f"NEXT_PUBLIC_API_BASE={backend_url}\n")
                utils.print_info(f"Created new .env.local file with backend URL: {backend_url}")
        else:
            # Create new file
            with open(env_file, "w", encoding="utf-8") as f:
                f.write(f"NEXT_PUBLIC_DEBUG=true\n")
                f.write(f"NEXT_PUBLIC_API_BASE={backend_url}\n")
            utils.print_info(f"Created new .env.local file with backend URL: {backend_url}")
        
        # Verify the update was successful
        if env_file.exists():
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    content = f.read()
                if f"NEXT_PUBLIC_API_BASE={backend_url}" in content:
                    utils.print_success(f"Successfully updated frontend environment with backend URL: {backend_url}")
                    return True
                else:
                    utils.print_warning(f"Backend URL not found in .env.local after update. File content: {content[:100]}...")
            except Exception as e:
                utils.print_warning(f"Could not verify update: {str(e)}")
        
        return True
    except Exception as e:
        utils.print_error(f"Failed to update frontend environment: {str(e)}")
        return False


def update_backend_config(frontend_url: str, backend_dir: Path = None) -> bool:
    """
    Update backend configuration with frontend URL.
    
    Args:
        frontend_url: Frontend URL
        backend_dir: Backend directory (if None, will use default)
    
    Returns:
        bool: True if successful, False otherwise
    """
    # The backend needs to know about the frontend for CORS
    if backend_dir is None:
        backend_dir = utils.PROJECT_ROOT
    
    config_dir = backend_dir / "config"
    local_config = config_dir / "local.yaml"
    
    try:
        # Create config directory if it doesn't exist
        config_dir.mkdir(exist_ok=True)
        
        # Since we use centralized configuration in app.yaml, 
        # we don't need to update local.yaml for CORS
        # The backend reads CORS settings from config/app.yaml
        utils.print_info(f"Backend CORS configuration uses centralized config for frontend origin: {frontend_url}")
        return True
    except Exception as e:
        utils.print_error(f"Failed to update backend configuration: {str(e)}")
        return False


def get_all_processes_on_ports() -> Dict[int, Dict[str, Any]]:
    """
    Get information about all processes using ports.
    
    Returns:
        Dict mapping port numbers to process information
    """
    port_info = {}
    
    if sys.platform.startswith("win"):
        # Windows
        try:
            result = utils.run_command("netstat -ano", shell=True)
            if result["success"]:
                lines = result["output"].splitlines()
                for line in lines:
                    if "LISTENING" in line:
                        parts = line.split()
                        if len(parts) >= 5:
                            try:
                                addr_port = parts[1]
                                if ":" in addr_port:
                                    port = int(addr_port.split(":")[-1])
                                    pid = int(parts[4])
                                    
                                    # Get process name
                                    proc_result = utils.run_command(f"tasklist /fi \"PID eq {pid}\" /fo csv /nh", shell=True)
                                    proc_name = "Unknown"
                                    
                                    if proc_result["success"] and proc_result["output"]:
                                        proc_lines = proc_result["output"].splitlines()
                                        if proc_lines:
                                            proc_parts = proc_lines[0].strip('"').split('","')
                                            if len(proc_parts) > 0:
                                                proc_name = proc_parts[0]
                                    
                                    port_info[port] = {
                                        "pid": pid,
                                        "process": proc_name
                                    }
                            except (ValueError, IndexError):
                                pass
        except Exception as e:
            utils.print_error(f"Failed to get port information: {str(e)}")
    else:
        # Unix-like
        try:
            lsof_available = utils.is_command_available("lsof")
            
            if lsof_available:
                result = utils.run_command("lsof -i -P -n", shell=True)
                if result["success"]:
                    lines = result["output"].splitlines()
                    for line in lines[1:]:  # Skip header
                        parts = line.split()
                        if len(parts) >= 9 and "(LISTEN)" in line:
                            try:
                                addr_port = parts[8]
                                if ":" in addr_port:
                                    port = int(addr_port.split(":")[-1])
                                    pid = int(parts[1])
                                    proc_name = parts[0]
                                    
                                    port_info[port] = {
                                        "pid": pid,
                                        "process": proc_name
                                    }
                            except (ValueError, IndexError):
                                pass
            else:
                # Fallback to netstat
                result = utils.run_command("netstat -tulpn 2>/dev/null | grep LISTEN", shell=True)
                if result["success"]:
                    lines = result["output"].splitlines()
                    for line in lines:
                        parts = line.split()
                        if len(parts) >= 7:
                            try:
                                addr_port = parts[3]
                                if ":" in addr_port:
                                    port = int(addr_port.split(":")[-1])
                                    pid_prog = parts[6]
                                    
                                    # Extract PID and program name
                                    if "/" in pid_prog:
                                        pid_str, proc_name = pid_prog.split("/", 1)
                                        pid = int(pid_str)
                                        
                                        port_info[port] = {
                                            "pid": pid,
                                            "process": proc_name
                                        }
                            except (ValueError, IndexError):
                                pass
        except Exception as e:
            utils.print_error(f"Failed to get port information: {str(e)}")
    
    return port_info


def get_process_on_port(port: int) -> Optional[Dict[str, Any]]:
    """
    Get information about the process using a specific port.
    
    Args:
        port: Port number
    
    Returns:
        Dict with process information or None if port is not in use
    """
    port_info = get_all_processes_on_ports()
    return port_info.get(port)


def kill_process_on_port(port: int) -> bool:
    """
    Kill the process using a specific port.
    
    Args:
        port: Port number
    
    Returns:
        bool: True if process was killed, False otherwise
    """
    process_info = get_process_on_port(port)
    
    if not process_info:
        utils.print_info(f"No process found on port {port}")
        return False
    
    pid = process_info["pid"]
    process_name = process_info["process"]
    
    utils.print_warning(f"Killing process {process_name} (PID: {pid}) on port {port}")
    
    try:
        if sys.platform.startswith("win"):
            utils.run_command(f"taskkill /F /PID {pid}", shell=True, check=True)
        else:
            utils.run_command(f"kill -9 {pid}", shell=True, check=True)
        
        # Wait for port to become available
        utils.wait_for_port(port)
        
        utils.print_success(f"Successfully killed process on port {port}")
        return True
    except Exception as e:
        utils.print_error(f"Failed to kill process on port {port}: {str(e)}")
        return False


def initialize(config=None) -> Dict[str, Any]:
    """
    Initialize the ports management module.
    
    Args:
        config: Optional configuration

    Returns:
        Dict with port configuration
    """
    # Reset allocated ports
    global _allocated_ports
    _allocated_ports = set()
    
    utils.print_colored("\nPort Configuration Details:", "blue", bold=True)
    
    # Check for existing processes on default ports
    default_backend_process = get_process_on_port(DEFAULT_BACKEND_PORT)
    default_frontend_process = get_process_on_port(DEFAULT_FRONTEND_PORT)
    
    utils.print_colored("Checking default backend port:", "cyan")
    if default_backend_process:
        utils.print_warning(f"Default backend port {DEFAULT_BACKEND_PORT} is in use by: {default_backend_process['process']} (PID: {default_backend_process['pid']})")
    else:
        utils.print_success(f"Default backend port {DEFAULT_BACKEND_PORT} is available")
    
    utils.print_colored("Checking default frontend port:", "cyan")
    if default_frontend_process:
        utils.print_warning(f"Default frontend port {DEFAULT_FRONTEND_PORT} is in use by: {default_frontend_process['process']} (PID: {default_frontend_process['pid']})")
    else:
        utils.print_success(f"Default frontend port {DEFAULT_FRONTEND_PORT} is available")
    
    # Get ports with detailed logging
    utils.print_colored("\nConfiguring backend port:", "cyan")
    if config and "backend_port" in config:
        utils.print_info(f"Using configured backend port: {config['backend_port']}")
    else:
        utils.print_info(f"Using default backend port: {DEFAULT_BACKEND_PORT}")
    
    backend_port = get_backend_port(config)
    
    if backend_port != DEFAULT_BACKEND_PORT and (config is None or "backend_port" not in config):
        utils.print_info(f"Selected different backend port: {backend_port} (default was unavailable)")
    
    utils.print_colored("\nConfiguring frontend port:", "cyan")
    if config and "frontend_port" in config:
        utils.print_info(f"Using configured frontend port: {config['frontend_port']}")
    else:
        utils.print_info(f"Using default frontend port: {DEFAULT_FRONTEND_PORT}")
    
    frontend_port = get_frontend_port(config)
    
    if frontend_port != DEFAULT_FRONTEND_PORT and (config is None or "frontend_port" not in config):
        utils.print_info(f"Selected different frontend port: {frontend_port} (default was unavailable)")
    
    # Verify ports are different
    if backend_port == frontend_port:
        utils.print_error(f"Backend and frontend ports cannot be the same: {backend_port}")
        # Find a new frontend port that's different from backend
        frontend_port = find_available_port(frontend_port + 1, frontend_port + 100)
        utils.print_info(f"Using different port for frontend: {frontend_port}")
    
    # Generate URLs
    backend_url = get_backend_url(backend_port)
    frontend_url = get_frontend_url(frontend_port)
    
    utils.print_colored("\nFinal Port Configuration:", "cyan")
    utils.print_success(f"Backend will use port {backend_port} → {backend_url}")
    utils.print_success(f"Frontend will use port {frontend_port} → {frontend_url}")
    
    return {
        "backend_port": backend_port,
        "frontend_port": frontend_port,
        "backend_url": backend_url,
        "frontend_url": frontend_url
    }


def check(config=None) -> List[str]:
    """
    Check port availability without making changes.
    
    Args:
        config: Optional configuration

    Returns:
        List of issues (empty if all ports are available)
    """
    issues = []
    
    # Get port configuration
    backend_port = DEFAULT_BACKEND_PORT
    frontend_port = DEFAULT_FRONTEND_PORT
    
    if config:
        backend_port = config.get("backend_port", backend_port)
        frontend_port = config.get("frontend_port", frontend_port)
    
    # Check backend port
    if not check_port_available(backend_port):
        process_info = get_process_on_port(backend_port)
        if process_info:
            issues.append(
                f"Backend port {backend_port} is in use by {process_info['process']} (PID: {process_info['pid']})"
            )
        else:
            issues.append(f"Backend port {backend_port} is in use")
    
    # Check frontend port
    if not check_port_available(frontend_port):
        process_info = get_process_on_port(frontend_port)
        if process_info:
            issues.append(
                f"Frontend port {frontend_port} is in use by {process_info['process']} (PID: {process_info['pid']})"
            )
        else:
            issues.append(f"Frontend port {frontend_port} is in use")
    
    return issues


def configure(config=None) -> Dict[str, Any]:
    """
    Configure port management and update service URLs.
    
    Args:
        config: Optional configuration

    Returns:
        Dict with configuration results
    """
    # Initialize port configuration
    port_config = initialize(config)
    
    # Always update frontend environment with correct backend URL
    frontend_dir = utils.PROJECT_ROOT / "frontend"
    if frontend_dir.exists():
        utils.print_info("Backend CORS configuration uses centralized config for frontend origin: " + port_config["frontend_url"])
        # Note: Frontend env files will be created/updated in frontend.py setup
        # This ensures the correct backend URL is set
    
    # Update backend configuration with frontend URL
    update_backend_config(port_config["frontend_url"])
    
    # Note: Port configuration is now centralized in config/app.yaml
    # The setup process doesn't need to update the configuration
    # since the runtime system reads from the YAML files directly
    
    return {
        "success": True,
        "message": "Port configuration updated successfully",
        "data": port_config
    }


def validate(config=None) -> Dict[str, Any]:
    """
    Validate port configuration.
    
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
    Clean up any resources used by the ports module.
    
    Args:
        config: Optional configuration
    """
    # Nothing to clean up for ports management
    pass


def print_port_summary(port_config: Dict[str, Any]) -> None:
    """
    Print a summary of port configuration.
    
    Args:
        port_config: Port configuration from initialize()
    """
    utils.print_header("Port Configuration")
    
    utils.print_colored("\nBackend:", "cyan", bold=True)
    utils.print_info(f"Port: {port_config['backend_port']}")
    utils.print_info(f"URL: {port_config['backend_url']}")
    
    utils.print_colored("\nFrontend:", "cyan", bold=True)
    utils.print_info(f"Port: {port_config['frontend_port']}")
    utils.print_info(f"URL: {port_config['frontend_url']}")
    
    # Check port availability
    backend_available = check_port_available(port_config['backend_port'])
    frontend_available = check_port_available(port_config['frontend_port'])
    
    utils.print_colored("\nAvailability:", "cyan", bold=True)
    if backend_available:
        utils.print_success(f"Backend port {port_config['backend_port']} is available")
    else:
        process_info = get_process_on_port(port_config['backend_port'])
        if process_info:
            utils.print_error(
                f"Backend port {port_config['backend_port']} is in use by {process_info['process']} "
                f"(PID: {process_info['pid']})"
            )
        else:
            utils.print_error(f"Backend port {port_config['backend_port']} is in use")
    
    if frontend_available:
        utils.print_success(f"Frontend port {port_config['frontend_port']} is available")
    else:
        process_info = get_process_on_port(port_config['frontend_port'])
        if process_info:
            utils.print_error(
                f"Frontend port {port_config['frontend_port']} is in use by {process_info['process']} "
                f"(PID: {process_info['pid']})"
            )
        else:
            utils.print_error(f"Frontend port {port_config['frontend_port']} is in use")


def main():
    """Run port configuration and print summary."""
    port_config = initialize()
    print_port_summary(port_config)
    
    # Check for issues
    issues = check()
    if issues:
        utils.print_colored("\nIssues:", "red", bold=True)
        for issue in issues:
            utils.print_error(issue)
    else:
        utils.print_colored("\nAll ports are available!", "green", bold=True)


if __name__ == "__main__":
    main()