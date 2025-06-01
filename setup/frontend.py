"""
Frontend Configuration Module

Handles frontend setup:
- Node.js dependency installation
- Frontend environment configuration
- Integration with backend
- Development environment setup
"""

import os
import sys
import subprocess
import json
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Union

from . import utils
from . import ports
from . import config as config_module

# Default environment variables for frontend
DEFAULT_ENV_VARS = {
    "NEXT_PUBLIC_DEBUG": "true",
    "NEXT_PUBLIC_API_BASE": "http://127.0.0.1:8000",
}

# Type aliases
SetupResult = Dict[str, Any]


class FrontendError(Exception):
    """Exception raised for frontend setup errors."""
    pass


def is_npm_installed() -> bool:
    """
    Check if npm is installed.
    
    Returns:
        bool: True if installed, False otherwise
    """
    return utils.is_command_available("npm")


def check_for_react_version(frontend_dir: Path) -> Tuple[bool, str, bool]:
    """
    Check for React version in package.json and detect if it's a pre-release (alpha/beta/rc) version.
    
    Args:
        frontend_dir: Frontend directory
    
    Returns:
        Tuple[bool, str, bool]: (success, version_string, is_prerelease)
    """
    package_json_path = frontend_dir / "package.json"
    
    if not package_json_path.exists():
        return False, "", False
    
    try:
        with open(package_json_path, "r", encoding="utf-8") as f:
            import json
            package_data = json.load(f)
            
        react_version = package_data.get("dependencies", {}).get("react", "")
        
        # Check if it's a pre-release version
        is_prerelease = any(term in react_version for term in ["alpha", "beta", "rc", "next", "dev"])
        
        return True, react_version, is_prerelease
    except Exception as e:
        return False, f"Error reading package.json: {str(e)}", False


def add_react_overrides(frontend_dir: Path, react_version: str) -> Tuple[bool, str]:
    """
    Add React version overrides to package.json to fix dependency conflicts.
    
    Args:
        frontend_dir: Frontend directory
        react_version: React version string
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    package_json_path = frontend_dir / "package.json"
    
    if not package_json_path.exists():
        return False, f"package.json not found: {package_json_path}"
    
    try:
        # Read existing package.json
        with open(package_json_path, "r", encoding="utf-8") as f:
            import json
            package_data = json.load(f)
        
        # Create overrides section if it doesn't exist
        if "overrides" not in package_data:
            package_data["overrides"] = {}
        
        # Add React overrides
        react_dom_version = package_data.get("dependencies", {}).get("react-dom", react_version)
        
        # Add core React overrides
        package_data["overrides"]["react"] = react_version
        package_data["overrides"]["react-dom"] = react_dom_version
        
        # Add specific package overrides
        package_data["overrides"]["@testing-library/react"] = {
            "react": react_version,
            "react-dom": react_dom_version
        }
        
        package_data["overrides"]["@floating-ui/react-dom"] = {
            "react": react_version,
            "react-dom": react_dom_version
        }
        
        package_data["overrides"]["@radix-ui/react-primitive"] = {
            "react": react_version,
            "react-dom": react_dom_version
        }
        
        # Write updated package.json
        with open(package_json_path, "w", encoding="utf-8") as f:
            json.dump(package_data, f, indent=2)
        
        return True, "Added React overrides to package.json"
    except Exception as e:
        return False, f"Failed to add React overrides: {str(e)}"


def install_node_dependencies(frontend_dir: Path) -> Tuple[bool, str]:
    """
    Install Node.js dependencies with special handling for React pre-release versions.
    
    Args:
        frontend_dir: Frontend directory
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    package_json_path = frontend_dir / "package.json"
    
    if not package_json_path.exists():
        return False, f"package.json not found: {package_json_path}"
    
    # Check for React pre-release version
    success, react_version, is_prerelease = check_for_react_version(frontend_dir)
    
    # If using a React pre-release version, add overrides before installing
    if success and is_prerelease:
        utils.print_info(f"Detected React pre-release version: {react_version}")
        utils.print_info("Adding React version overrides to package.json...")
        
        override_success, override_msg = add_react_overrides(frontend_dir, react_version)
        if not override_success:
            utils.print_warning(f"Could not add React overrides: {override_msg}")
            utils.print_info("Will attempt installation anyway...")
    
    utils.print_info("Installing Node.js dependencies...")
    
    # Change to frontend directory
    cwd = os.getcwd()
    os.chdir(frontend_dir)
    
    try:
        # First try with standard install
        def install_deps():
            return utils.run_command("npm install", shell=True)
        
        result = utils.with_spinner(install_deps, "Installing npm packages")
        
        # Check for dependency conflicts in error output
        error_text = result.get("error", "") + result.get("output", "")
        has_dependency_conflict = any(term in error_text for term in ["ERESOLVE", "peer dependency conflict"])
        
        # If standard install failed and we detected conflicts, try with legacy-peer-deps
        if not result["success"] and has_dependency_conflict:
            utils.print_warning("Dependency conflicts detected despite overrides.")
            utils.print_warning("Retrying with --legacy-peer-deps flag...")
            
            def install_with_legacy_deps():
                return utils.run_command("npm install --legacy-peer-deps", shell=True)
            
            result = utils.with_spinner(install_with_legacy_deps, "Installing npm packages with legacy peer deps")
            
            # If that still fails, try with force as last resort
            if not result["success"] and any(term in result.get("error", "") + result.get("output", "")
                                          for term in ["ERESOLVE", "peer dependency conflict"]):
                utils.print_warning("Still encountering conflicts. Trying with --force as last resort...")
                
                def install_with_force():
                    return utils.run_command("npm install --force", shell=True)
                
                result = utils.with_spinner(install_with_force, "Installing npm packages with force option")
        
        if not result["success"]:
            error_msg = result.get("error", "") + result.get("output", "")
            
            # If we still have issues after all attempts
            if any(term in error_msg for term in ["ERESOLVE", "peer dependency conflict"]):
                utils.print_error("Dependency conflicts could not be resolved automatically.")
                if is_prerelease:
                    utils.print_info("This is likely due to using a React pre-release version.")
                    utils.print_info("The setup has already added overrides to package.json.")
                    utils.print_info("You may need to manually resolve conflicts:")
                    utils.print_info("cd frontend && npm install --force --no-audit")
                else:
                    utils.print_info("You may need to manually resolve the conflicts:")
                    utils.print_info("cd frontend && npm install --force --no-audit")
                return False, f"npm dependency conflicts: {error_msg}"
            
            return False, f"Failed to install dependencies: {error_msg}"
        
        return True, "Node.js dependencies installed successfully"
    finally:
        # Change back to original directory
        os.chdir(cwd)


def check_frontend_script_port(frontend_dir: Path, expected_port: int) -> bool:
    """
    Check if the frontend dev script contains the expected port.
    
    Args:
        frontend_dir: Frontend directory
        expected_port: Expected port number
    
    Returns:
        bool: True if using correct port, False otherwise
    """
    package_json_path = frontend_dir / "package.json"
    
    if not package_json_path.exists():
        return False
    
    try:
        with open(package_json_path, "r", encoding="utf-8") as f:
            import json
            package_data = json.load(f)
        
        dev_script = package_data.get("scripts", {}).get("dev", "")
        import re
        port_match = re.search(r'-p (\d+)', dev_script)
        
        if port_match:
            current_port = int(port_match.group(1))
            return current_port == expected_port
        
        return False
    except Exception:
        return False


def update_npm_scripts(frontend_dir: Path, frontend_port: int) -> Tuple[bool, str]:
    """
    Update npm scripts in package.json to use the correct port.
    
    Args:
        frontend_dir: Frontend directory
        frontend_port: Frontend port number
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    package_json_path = frontend_dir / "package.json"
    
    if not package_json_path.exists():
        return False, f"package.json not found: {package_json_path}"
    
    try:
        # Read existing package.json
        with open(package_json_path, "r", encoding="utf-8") as f:
            import json
            package_data = json.load(f)
        
        # Update the dev script port
        if "scripts" in package_data and "dev" in package_data["scripts"]:
            current_script = package_data["scripts"]["dev"]
            # Replace port in script
            if "-p " in current_script:
                import re
                new_script = re.sub(r'-p \d+', f'-p {frontend_port}', current_script)
                package_data["scripts"]["dev"] = new_script
                utils.print_info(f"Updated dev script to use port {frontend_port}")
            else:
                # Add port if not present
                package_data["scripts"]["dev"] = f"{current_script} -p {frontend_port}"
                utils.print_info(f"Added port {frontend_port} to dev script")
        
        # Write updated package.json
        with open(package_json_path, "w", encoding="utf-8") as f:
            json.dump(package_data, f, indent=2)
        
        return True, f"Updated npm scripts to use port {frontend_port}"
    except Exception as e:
        return False, f"Failed to update package.json scripts: {str(e)}"


def create_frontend_env_files(
    frontend_dir: Path,
    backend_url: str,
    env_vars: Dict[str, str] = None
) -> Tuple[bool, str]:
    """
    Create or update frontend environment files.
    
    Args:
        frontend_dir: Frontend directory
        backend_url: Backend URL
        env_vars: Additional environment variables
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    # Create environment variables dictionary
    env_vars_to_write = DEFAULT_ENV_VARS.copy()
    env_vars_to_write["NEXT_PUBLIC_API_BASE"] = backend_url
    
    if env_vars:
        env_vars_to_write.update(env_vars)
    
    # Files to create/update
    env_files = [
        frontend_dir / ".env.local",
        frontend_dir / ".env.development",
    ]
    
    for env_file in env_files:
        try:
            # Create or update environment file
            utils.print_info(f"Creating/updating {env_file.name}...")
            
            with open(env_file, "w", encoding="utf-8") as f:
                for key, value in env_vars_to_write.items():
                    f.write(f"{key}={value}\n")
            
            utils.print_success(f"{env_file.name} created/updated successfully")
        except Exception as e:
            return False, f"Failed to create/update {env_file.name}: {str(e)}"
    
    return True, "Frontend environment files created/updated successfully"


def setup_vscode_frontend(frontend_dir: Path) -> Tuple[bool, str]:
    """
    Set up VS Code configuration for frontend.
    
    Args:
        frontend_dir: Frontend directory
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    vscode_dir = frontend_dir / ".vscode"
    
    # Create .vscode directory if it doesn't exist
    vscode_dir.mkdir(exist_ok=True)
    
    settings_path = vscode_dir / "settings.json"
    
    # Create or update settings.json
    try:
        settings = {}
        
        if settings_path.exists():
            try:
                with open(settings_path, "r", encoding="utf-8") as f:
                    settings = json.load(f)
            except Exception:
                settings = {}
        
        # Update TypeScript/JavaScript settings
        settings.update({
            "typescript.tsdk": "node_modules/typescript/lib",
            "editor.formatOnSave": True,
            "editor.defaultFormatter": "esbenp.prettier-vscode",
            "editor.codeActionsOnSave": {
                "source.fixAll.eslint": True
            },
            "eslint.validate": [
                "javascript",
                "javascriptreact",
                "typescript",
                "typescriptreact"
            ]
        })
        
        # Write updated settings
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=4)
        
        # Create tasks.json
        tasks_path = vscode_dir / "tasks.json"
        
        tasks = {
            "version": "2.0.0",
            "tasks": [
                {
                    "label": "Start Frontend",
                    "type": "shell",
                    "command": "npm run dev",
                    "group": {
                        "kind": "build",
                        "isDefault": True
                    },
                    "presentation": {
                        "reveal": "always",
                        "panel": "new"
                    }
                }
            ]
        }
        
        with open(tasks_path, "w", encoding="utf-8") as f:
            json.dump(tasks, f, indent=4)
        
        return True, "VS Code configuration for frontend created/updated successfully"
    except Exception as e:
        return False, f"Failed to set up VS Code configuration for frontend: {str(e)}"


def setup_frontend(config: Dict[str, Any] = None) -> SetupResult:
    """
    Set up frontend.
    
    Args:
        config: Setup configuration
    
    Returns:
        SetupResult: Setup result
    """
    if config is None:
        config = config_module.get_default_config()
    
    # Extract relevant configuration
    project_root = Path(config.get("project_root", utils.PROJECT_ROOT))
    frontend_dir = Path(config.get("frontend_dir", project_root / "frontend"))
    configure_vscode = config.get("configure_vscode", True)
    
    # Get backend URL from ports module
    backend_port = config.get("backend_port", 8000)
    backend_host = config.get("backend_host", "127.0.0.1")
    backend_url = f"http://{backend_host}:{backend_port}"
    
    # Get frontend port for script update
    frontend_port = config.get("frontend_port", 8001)
    
    utils.print_header("Frontend Setup")
    
    # Check if frontend directory exists
    if not frontend_dir.exists():
        return {
            "success": False,
            "message": f"Frontend directory does not exist: {frontend_dir}",
            "steps": []
        }
    
    result = {
        "success": True,
        "steps": []
    }
    
    # Step 1: Check npm
    if not is_npm_installed():
        utils.print_error("npm is not installed")
        return {
            "success": False,
            "message": "Frontend setup failed: npm is not installed",
            "steps": [
                {
                    "name": "npm Check",
                    "success": False,
                    "message": "npm is not installed"
                }
            ]
        }
    
    utils.print_success("npm is installed")
    result["steps"].append({
        "name": "npm Check",
        "success": True,
        "message": "npm is installed"
    })
    
    # Step 2: Update npm scripts to use correct port
    if not check_frontend_script_port(frontend_dir, frontend_port):
        utils.print_info(f"Updating npm script to use port {frontend_port}...")
        script_success, script_message = update_npm_scripts(frontend_dir, frontend_port)
        result["steps"].append({
            "name": "npm Script Update",
            "success": script_success,
            "message": script_message
        })
        
        if script_success:
            utils.print_success(f"Updated npm dev script to use port {frontend_port}")
        else:
            utils.print_warning(f"Failed to update npm script: {script_message}")
            # Non-critical, continue with setup
    
    # Step 3: Install Node.js dependencies
    success, message = install_node_dependencies(frontend_dir)
    result["steps"].append({
        "name": "Node.js Dependencies",
        "success": success,
        "message": message
    })
    
    if not success:
        result["success"] = False
        result["message"] = f"Frontend setup failed: {message}"
        return result
    
    # Step 4: Create frontend environment files
    success, message = create_frontend_env_files(frontend_dir, backend_url)
    result["steps"].append({
        "name": "Environment Files",
        "success": success,
        "message": message
    })
    
    if not success:
        result["success"] = False
        result["message"] = f"Frontend setup failed: {message}"
        return result
    
    # Step 5: Set up VS Code configuration for frontend
    if configure_vscode:
        success, message = setup_vscode_frontend(frontend_dir)
        result["steps"].append({
            "name": "VS Code Configuration",
            "success": success,
            "message": message
        })
        
        if not success:
            # Non-critical step, just log warning
            utils.print_warning(message)
    
    # Set success message
    result["message"] = "Frontend setup completed successfully"
    
    utils.print_success(result["message"])
    
    return result


def initialize(config=None) -> Dict[str, Any]:
    """
    Initialize the frontend module.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with module configuration
    """
    if config is None:
        config = config_module.get_default_config()
    
    # Get centralized port configuration if available
    backend_port = 8000
    frontend_port = 8001
    
    try:
        sys.path.insert(0, str(utils.PROJECT_ROOT))
        from core.configuration import ServerConfig, BACKEND_PORT, FRONTEND_PORT
        backend_port = BACKEND_PORT
        frontend_port = FRONTEND_PORT
    except ImportError:
        # Use values from config or default
        backend_port = config.get("backend_port", 8000)
        frontend_port = config.get("frontend_port", 8001)
    
    return {
        "project_root": config.get("project_root", utils.PROJECT_ROOT),
        "frontend_dir": config.get("frontend_dir", utils.PROJECT_ROOT / "frontend"),
        "backend_port": backend_port,
        "backend_host": config.get("backend_host", "127.0.0.1"),
        "frontend_port": frontend_port,  # Ensure this key is always included
        "configure_vscode": config.get("configure_vscode", True),
    }


def check(config=None) -> List[str]:
    """
    Check frontend configuration without making changes.
    
    Args:
        config: Optional configuration
    
    Returns:
        List of issues (empty if configuration is valid)
    """
    module_config = initialize(config)
    issues = []
    
    # Check if npm is installed
    if not is_npm_installed():
        issues.append("npm is not installed")
    
    # Check if frontend directory exists
    frontend_dir = Path(module_config["frontend_dir"])
    if not frontend_dir.exists():
        issues.append(f"Frontend directory does not exist: {frontend_dir}")
    else:
        # Check if package.json exists
        package_json_path = frontend_dir / "package.json"
        if not package_json_path.exists():
            issues.append(f"package.json not found: {package_json_path}")
    
    return issues


def configure(config=None) -> Dict[str, Any]:
    """
    Configure frontend.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with configuration results
    """
    module_config = initialize(config)
    frontend_dir = Path(module_config["frontend_dir"])
    frontend_port = module_config["frontend_port"]
    
    # Run full frontend setup
    result = setup_frontend(module_config)
    
    # Double-check the npm script has been updated, even if setup_frontend didn't do it
    # This ensures the update happens even when the function is called directly
    if result["success"] and frontend_dir.exists():
        if not check_frontend_script_port(frontend_dir, frontend_port):
            utils.print_info(f"Performing final check on npm script port configuration...")
            success, message = update_npm_scripts(frontend_dir, frontend_port)
            if success:
                utils.print_success(f"Updated npm dev script to use port {frontend_port}")
                # Add to steps if it's not already there
                step_exists = any(step.get("name") == "npm Script Update" for step in result.get("steps", []))
                if not step_exists:
                    result.setdefault("steps", []).append({
                        "name": "npm Script Update",
                        "success": True,
                        "message": message
                    })
            else:
                utils.print_warning(f"Unable to update npm script: {message}")
    
    return {
        "success": result["success"],
        "message": result["message"],
        "data": result
    }


def validate(config=None) -> Dict[str, Any]:
    """
    Validate frontend configuration.
    
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
    Clean up frontend resources.
    
    Args:
        config: Optional configuration
    """
    # Nothing to clean up for frontend module
    pass


def main():
    """Run frontend setup."""
    setup_frontend()


if __name__ == "__main__":
    main()