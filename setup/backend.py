"""
Backend Configuration Module

Handles Python environment setup and backend configuration:
- Poetry installation and configuration
- Environment file creation
- Backend configuration
- Development environment setup
"""

import os
import sys
import shutil
import subprocess
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Union

from . import utils
from . import config as config_module

# Default Poetry installation command
WINDOWS_POETRY_INSTALL = '(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -'
UNIX_POETRY_INSTALL = 'curl -sSL https://install.python-poetry.org | python3 -'

# Default environment variables
DEFAULT_ENV_VARS = {
    # API key is now set through the UI, not environment variables
    # Encryption secret is auto-generated on first run
}

# Type aliases
SetupResult = Dict[str, Any]


class BackendError(Exception):
    """Exception raised for backend setup errors."""
    pass


def cleanup_environments(project_root: Path) -> None:
    """
    Clean up any existing virtual environments.
    
    Args:
        project_root: Project root directory
    """
    venv_paths = [project_root / "venv", project_root / ".venv"]
    for path in venv_paths:
        if path.exists():
            try:
                import shutil
                shutil.rmtree(path, ignore_errors=True)
                utils.print_info(f"Removed existing environment: {path}")
            except Exception as e:
                utils.print_warning(f"Failed to remove {path}: {str(e)}")

def is_poetry_installed() -> bool:
    """
    Check if Poetry is installed and properly configured.
    
    Returns:
        bool: True if installed, False otherwise
    """
    if not utils.is_command_available("poetry"):
        return False
        
    # Ensure correct configuration
    try:
        utils.run_command("poetry config virtualenvs.in-project true", shell=True)
    except Exception:
        pass  # Ignore configuration errors, we'll try anyway
        
    return True


def install_poetry() -> Tuple[bool, str]:
    """
    Install Poetry.
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    utils.print_info("Installing Poetry...")
    
    if sys.platform.startswith("win"):
        cmd = WINDOWS_POETRY_INSTALL
    else:
        cmd = UNIX_POETRY_INSTALL
    
    result = utils.run_command(cmd, shell=True)
    
    if not result["success"]:
        return False, f"Failed to install Poetry: {result['error']}"
    
    # Add Poetry to PATH for current session
    if sys.platform.startswith("win"):
        poetry_path = os.path.join(os.environ["APPDATA"], "Python", "Scripts")
        os.environ["PATH"] = f"{poetry_path};{os.environ['PATH']}"
    else:
        poetry_path = os.path.join(os.path.expanduser("~"), ".local", "bin")
        os.environ["PATH"] = f"{poetry_path}:{os.environ['PATH']}"
    
    # Verify installation
    if not is_poetry_installed():
        return False, "Poetry installation succeeded but command is not available"
    
    return True, "Poetry installed successfully"


def configure_poetry() -> Tuple[bool, str]:
    """
    Configure Poetry.
    
    Returns:
        Tuple[bool, str]: (success, message)
    """
    utils.print_info("Configuring Poetry...")
    
    # Configure Poetry to use in-project virtual environments
    commands = [
        ("poetry config virtualenvs.in-project true", "Configure in-project virtualenvs"),
        ("poetry config virtualenvs.create true", "Enable virtualenv creation"),
    ]
    
    # Check Poetry version to determine if prefer-active-python is available
    version_result = utils.run_command("poetry --version", shell=True)
    if version_result["success"]:
        version_output = version_result.get("output", "")
        # Extract version number (e.g., "Poetry (version 1.7.1)" -> "1.7.1")
        import re
        version_match = re.search(r'(\d+\.\d+\.\d+)', version_output)
        if version_match:
            version = version_match.group(1)
            major, minor, patch = map(int, version.split('.'))
            # prefer-active-python was removed in Poetry 1.8+
            if major == 1 and minor < 8:
                commands.append(("poetry config virtualenvs.prefer-active-python true", "Prefer active Python"))
    
    for cmd, description in commands:
        result = utils.run_command(cmd, shell=True)
        if not result["success"]:
            # Only show warning if it's not the deprecated setting
            if "does not exist" not in result.get("error", ""):
                utils.print_warning(f"Failed to {description}: {result['error']}")
            # Continue anyway, as some settings might not be critical
    
    return True, "Poetry configured"


def ensure_poetry_venv_clean(project_root: Path) -> Tuple[bool, str]:
    """
    Ensure Poetry virtual environment is clean and properly set up.
    
    Args:
        project_root: Project root directory
        
    Returns:
        Tuple[bool, str]: (success, message)
    """
    venv_path = project_root / ".venv"
    
    # Check if venv exists and is incomplete
    venv_status = utils.detect_incomplete_venv(venv_path)
    
    if venv_status["exists"] and not venv_status["is_complete"]:
        utils.print_warning("Incomplete virtual environment detected")
        utils.cleanup_incomplete_venv(venv_path, force=True)
    
    # If venv exists but has no packages, remove it to start fresh
    if venv_path.exists():
        site_packages = venv_path / "Lib" / "site-packages"
        if site_packages.exists():
            # Count actual package directories (not .dist-info or __pycache__)
            package_count = sum(1 for p in site_packages.iterdir() 
                              if p.is_dir() and not p.name.endswith(('.dist-info', '__pycache__')))
            if package_count < 5:  # Arbitrary threshold
                utils.print_warning("Virtual environment exists but appears empty")
                utils.print_info("Removing empty virtual environment...")
                shutil.rmtree(venv_path, ignore_errors=True)
    
    # Remove Poetry's cache of this environment to force recreation
    try:
        result = utils.run_command("poetry env remove python", shell=True, cwd=str(project_root))
        if result["success"]:
            utils.print_info("Cleared Poetry environment cache")
    except Exception:
        pass  # Ignore if this fails
    
    return True, "Environment prepared for clean installation"


def install_dependencies(project_root: Path) -> Tuple[bool, str]:
    """
    Install Python dependencies using Poetry.
    
    Args:
        project_root: Project root directory
        
    Returns:
        Tuple[bool, str]: (success, message)
    """
    utils.print_info("Installing Python dependencies (this may take a few minutes)...")
    
    # Change to project directory
    original_cwd = os.getcwd()
    os.chdir(str(project_root))
    
    try:
        # First, ensure we have a clean environment
        ensure_poetry_venv_clean(project_root)
        
        # Check if poetry.lock exists and is up to date
        utils.print_info("Checking Poetry lock file status...")
        lock_file = project_root / "poetry.lock"
        
        if lock_file.exists():
            # Check if lock file is up to date
            check_result = utils.run_command("poetry check", shell=True)
            if not check_result["success"] or "pyproject.toml changed" in check_result.get("output", ""):
                utils.print_warning("pyproject.toml changed significantly since poetry.lock was last generated.")
                utils.print_info("Regenerating lock file...")
                
                # Try to update the lock file
                utils.print_info("Updating poetry.lock...")
                update_result = utils.run_command(
                    "poetry lock --no-update",
                    shell=True,
                    timeout=120
                )
                if update_result["success"]:
                    utils.print_success("Updated poetry.lock")
                else:
                    utils.print_warning("Failed to update poetry.lock")
                
                if not update_result["success"]:
                    utils.print_warning("Standard lock update failed, trying alternative approach...")
                    # Try removing and regenerating
                    lock_file.unlink(missing_ok=True)
                    utils.print_info("Generating new poetry.lock...")
                    regen_result = utils.run_command(
                        "poetry lock",
                        shell=True,
                        timeout=120
                    )
                    if regen_result["success"]:
                        utils.print_success("Generated new poetry.lock")
                    else:
                        utils.print_warning("Failed to generate new poetry.lock")
                    
                    if not regen_result["success"]:
                        utils.print_warning(f"Failed to regenerate lock file: {regen_result.get('error', 'Unknown error')}")
                        utils.print_info("Continuing with installation despite lock file issues...")
        
        # Install dependencies
        utils.print_info("Installing dependencies with Poetry...")
        
        # Use --no-ansi to avoid color codes in output
        # Note: --only main is the correct syntax for newer Poetry versions
        install_commands = [
            ("poetry install --no-root --no-ansi", "Installing dependencies"),
            ("poetry install --no-root --only main --no-ansi", "Installing core dependencies"),
            ("poetry install --no-root --without dev --no-ansi", "Installing without dev dependencies"),  # Fallback for older versions
        ]
        
        install_success = False
        install_error = ""
        
        for cmd, description in install_commands:
            utils.print_info(f"{description}...")
            result = utils.run_command(
                cmd,
                shell=True,
                timeout=300  # 5 minutes timeout
            )
            if result["success"]:
                utils.print_success(f"{description} - completed")
            
            if result["success"]:
                install_success = True
                break
            else:
                install_error = result.get("error", "Unknown error")
                if "--no-dev" in install_error:
                    # Handle deprecation warning
                    utils.print_warning("Standard installation failed, trying without dev dependencies...")
                    continue
                else:
                    utils.print_warning(f"Dependency installation issue: {install_error}")
        
        if not install_success:
            # Check if .venv was at least created
            if (project_root / ".venv").exists():
                utils.print_info("Virtual environment exists, attempting to continue...")
                # Try to verify critical packages are accessible
                verify_cmd = 'poetry run python -c "import fastapi, uvicorn, anthropic"'
                verify_result = utils.run_command(verify_cmd, shell=True)
                
                if verify_result["success"]:
                    utils.print_success("Critical packages are accessible despite installation warnings")
                    install_success = True
                else:
                    # Last resort: try pip install within Poetry env
                    utils.print_warning("Attempting direct pip install of requirements...")
                    pip_cmd = "poetry run pip install -r requirements.txt"
                    pip_result = utils.run_command(pip_cmd, shell=True, timeout=300)
                    
                    if pip_result["success"]:
                        utils.print_success("Dependencies installed via pip")
                        install_success = True
        
        if install_success:
            # Verify the installation
            utils.print_info("Verifying installation...")
            venv_path = project_root / ".venv"
            site_packages = venv_path / "Lib" / "site-packages"
            
            if site_packages.exists():
                # Check for key packages
                key_packages = ["fastapi", "uvicorn", "anthropic", "pydantic"]
                found_packages = []
                
                for package in key_packages:
                    if any(p.name.startswith(package) for p in site_packages.iterdir()):
                        found_packages.append(package)
                
                if len(found_packages) >= 3:  # At least 3 of 4 key packages
                    utils.print_success(f"Key packages verified: {', '.join(found_packages)}")
                    return True, "Dependencies installed successfully"
                else:
                    return False, f"Missing key packages. Only found: {', '.join(found_packages)}"
            else:
                return False, "Site-packages directory not found"
        else:
            return False, f"Failed to install dependencies: {install_error}"
            
    finally:
        os.chdir(original_cwd)


def create_pyproject_toml(project_root: Path) -> Tuple[bool, str]:
    """
    Create or verify pyproject.toml file.
    
    Args:
        project_root: Project root directory
        
    Returns:
        Tuple[bool, str]: (success, message)
    """
    pyproject_path = project_root / "pyproject.toml"
    
    if pyproject_path.exists():
        utils.print_info("Using existing pyproject.toml...")
        return True, "pyproject.toml already exists"
    
    utils.print_info("Creating pyproject.toml...")
    
    # Create basic pyproject.toml
    content = '''[tool.poetry]
name = "codai"
version = "0.1.0"
description = "Evolved Intelligence that creates complete apps and solutions"
authors = ["CODAI Team"]
readme = "README.md"
packages = [{include = "server"}, {include = "core"}, {include = "tools"}]

[tool.poetry.dependencies]
python = "^3.9"
fastapi = "^0.109.1"
uvicorn = {extras = ["standard"], version = "^0.27.0"}
anthropic = "^0.61.0"
pydantic = "^2.5.0"
python-multipart = "^0.0.6"
pyyaml = "^6.0.1"
aiohttp = "^3.9.0"
beautifulsoup4 = "^4.12.0"
brotli = "^1.1.0"
python-dotenv = "^1.0.0"
requests = "^2.31.0"
websockets = "^12.0"
sqlalchemy = "^2.0.0"
cryptography = "^41.0.0"
Pillow = "^10.0.0"
pyautogui = "^0.9.54"
selenium = "^4.16.0"
pypdf = "^4.0.0"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4.0"
pytest-asyncio = "^0.21.0"
pytest-cov = "^4.1.0"
black = "^23.9.0"
flake8 = "^6.1.0"
mypy = "^1.5.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
'''
    
    try:
        pyproject_path.write_text(content, encoding='utf-8')
        return True, "pyproject.toml created successfully"
    except Exception as e:
        return False, f"Failed to create pyproject.toml: {str(e)}"


def configure_vscode(project_root: Path) -> Tuple[bool, str]:
    """
    Configure VS Code for Python development.
    
    Args:
        project_root: Project root directory
        
    Returns:
        Tuple[bool, str]: (success, message)
    """
    vscode_dir = project_root / ".vscode"
    vscode_dir.mkdir(exist_ok=True)
    
    # Create settings.json
    settings_path = vscode_dir / "settings.json"
    settings = {
        "python.defaultInterpreterPath": "${workspaceFolder}/.venv/Scripts/python.exe" if sys.platform.startswith("win") else "${workspaceFolder}/.venv/bin/python",
        "python.terminal.activateEnvironment": True,
        "python.linting.enabled": True,
        "python.linting.pylintEnabled": False,
        "python.linting.flake8Enabled": True,
        "python.formatting.provider": "black",
        "editor.formatOnSave": True,
        "python.testing.pytestEnabled": True,
        "[python]": {
            "editor.rulers": [88],
            "editor.codeActionsOnSave": {
                "source.organizeImports": True
            }
        }
    }
    
    try:
        import json
        
        # Load existing settings if they exist
        if settings_path.exists():
            with open(settings_path, 'r', encoding='utf-8') as f:
                existing_settings = json.load(f)
            # Update with our settings
            existing_settings.update(settings)
            settings = existing_settings
        
        # Write settings
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2)
        
        return True, "VS Code configured for Python development"
    except Exception as e:
        return False, f"Failed to configure VS Code: {str(e)}"


def verify_critical_packages(project_root: Path) -> Tuple[bool, str]:
    """
    Verify that critical packages can be imported.
    
    Args:
        project_root: Project root directory
        
    Returns:
        Tuple[bool, str]: (success, message)
    """
    # Change to project directory
    original_cwd = os.getcwd()
    os.chdir(str(project_root))
    
    try:
        critical_packages = ["fastapi", "uvicorn", "anthropic", "pydantic", "brotli"]
        failed_packages = []
        
        for package in critical_packages:
            utils.print_info(f"Verifying package {package}...")
            
            # Try to import the package
            cmd = f'poetry run python -c "import {package}"'
            result = utils.run_command(cmd, shell=True)
            
            if result["success"]:
                utils.print_success(f"Package {package} is available")
            else:
                # Check if it's a known import name difference
                if package == "brotli":
                    # Try alternate import
                    alt_cmd = 'poetry run python -c "import brotli"'
                    alt_result = utils.run_command(alt_cmd, shell=True)
                    if alt_result["success"]:
                        utils.print_success(f"Package {package} is available")
                        continue
                
                failed_packages.append(package)
                utils.print_error(f"Package {package} is not available")
        
        if failed_packages:
            return False, f"Missing packages: {', '.join(failed_packages)}"
        
        # Also verify we can import our own modules
        utils.print_info("Verifying project modules...")
        module_cmd = 'poetry run python -c "import core, server, tools"'
        module_result = utils.run_command(module_cmd, shell=True)
        
        if not module_result["success"]:
            utils.print_warning("Project modules not in Python path, but this is normal during setup")
        
        return True, "All critical packages verified"
        
    finally:
        os.chdir(original_cwd)


def create_env_file(project_root: Path, config: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Create or update .env file.
    
    Args:
        project_root: Project root directory
        config: Configuration dictionary
        
    Returns:
        Tuple[bool, str]: (success, message)
    """
    env_path = project_root / ".env"
    
    # Note: API key is now managed through UI, not environment
    # Only create .env if we have other environment variables to set
    env_vars = {}
    
    # Add any custom environment variables from config
    if "env_vars" in config:
        env_vars.update(config["env_vars"])
    
    # If no environment variables, we don't need .env
    if not env_vars and not env_path.exists():
        utils.print_info("No environment variables to set, skipping .env creation")
        return True, "No .env file needed"
    
    # Create/update .env file
    lines = []
    
    # If file exists, preserve existing values not in our update
    if env_path.exists():
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key = line.split('=')[0].strip()
                    if key not in env_vars:
                        lines.append(line)
    
    # Add our variables
    for key, value in env_vars.items():
        lines.append(f"{key}={value}")
    
    # Write the file
    if lines:
        with open(env_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
        return True, ".env file created/updated"
    else:
        # Remove empty .env file
        if env_path.exists():
            env_path.unlink()
        return True, "No environment variables needed"


def initialize(config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Initialize backend configuration.
    
    Args:
        config: Configuration dictionary
        
    Returns:
        Dict with initialization results
    """
    if config is None:
        config = {}
    
    utils.print_header("Backend Setup")
    
    # Check Python version
    python_version = sys.version_info
    utils.print_info(f"Python version: {python_version.major}.{python_version.minor}.{python_version.micro}")
    
    # Check if we can create virtual environments
    try:
        import venv
        utils.print_info("Python venv module is available")
    except ImportError:
        utils.print_warning("Python venv module is not available")
        utils.print_info("Virtual environment will be managed by Poetry")
    
    # Check Poetry installation
    if is_poetry_installed():
        result = utils.run_command("poetry --version", shell=True)
        if result["success"]:
            version = result["output"].strip()
            utils.print_success(f"Poetry is already installed: {version}")
    else:
        utils.print_info("Poetry is not installed")
    
    return {
        "success": True,
        "python_version": f"{python_version.major}.{python_version.minor}.{python_version.micro}",
        "poetry_available": is_poetry_installed()
    }


def check(config: Dict[str, Any] = None) -> List[str]:
    """
    Check backend configuration.
    
    Args:
        config: Configuration dictionary
        
    Returns:
        List of issues found
    """
    issues = []
    project_root = Path(config.get("project_root", utils.PROJECT_ROOT))
    
    # Check Poetry
    if not is_poetry_installed():
        issues.append("Poetry is not installed")
    
    # Check pyproject.toml
    if not (project_root / "pyproject.toml").exists():
        issues.append("pyproject.toml is missing")
    
    # Check virtual environment
    venv_path = project_root / ".venv"
    if not venv_path.exists():
        issues.append("Virtual environment does not exist")
    else:
        # Check if it's complete
        venv_status = utils.detect_incomplete_venv(venv_path)
        if not venv_status["is_complete"]:
            issues.extend([f"Virtual environment: {issue}" for issue in venv_status["issues"]])
    
    # Check if dependencies are installed
    if venv_path.exists():
        site_packages = venv_path / "Lib" / "site-packages"
        if not site_packages.exists() or not any(site_packages.iterdir()):
            issues.append("No packages installed in virtual environment")
    
    return issues


def configure(config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Configure backend.
    
    Args:
        config: Configuration dictionary
        
    Returns:
        Dict with configuration results
    """
    if config is None:
        config = {}
    
    project_root = Path(config.get("project_root", utils.PROJECT_ROOT))
    
    utils.print_header("Backend Setup")
    
    # Step 1: Configure Poetry
    utils.print_info("Step 1/4: Configure Poetry settings")
    poetry_result, poetry_msg = configure_poetry()
    if not poetry_result:
        return {
            "success": False,
            "message": f"Failed to configure Poetry: {poetry_msg}"
        }
    
    # Step 2: Create or verify pyproject.toml
    utils.print_info("Step 2/4: Create or verify pyproject.toml file")
    pyproject_result, pyproject_msg = create_pyproject_toml(project_root)
    if not pyproject_result:
        return {
            "success": False,
            "message": f"Failed to create pyproject.toml: {pyproject_msg}"
        }
    
    # Step 3: Install dependencies
    utils.print_info("Step 3/4: Install Python dependencies")
    install_result, install_msg = install_dependencies(project_root)
    if not install_result:
        return {
            "success": False,
            "message": f"Failed to install dependencies: {install_msg}"
        }
    
    # Step 4: Configure VS Code (optional)
    if config.get("configure_vscode", True):
        utils.print_info("Step 4/4: Configure VS Code for Python development")
        vscode_result, vscode_msg = configure_vscode(project_root)
        if not vscode_result:
            utils.print_warning(f"VS Code configuration failed: {vscode_msg}")
            # Not critical, continue
    
    # Additional verification
    utils.print_info("Verifying critical packages...")
    verify_result, verify_msg = verify_critical_packages(project_root)
    
    if not verify_result:
        return {
            "success": False,
            "message": f"Package verification failed: {verify_msg}"
        }
    
    # Create env file if needed
    env_result, env_msg = create_env_file(project_root, config)
    
    utils.print_success("Backend setup completed successfully")
    
    return {
        "success": True,
        "message": "Backend setup completed successfully",
        "details": {
            "poetry_configured": poetry_result,
            "pyproject_created": pyproject_result,
            "dependencies_installed": install_result,
            "verification": verify_result,
            "env_file": env_result
        }
    }


def validate(config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Validate backend setup.
    
    Args:
        config: Configuration dictionary
        
    Returns:
        Dict with validation results
    """
    issues = check(config)
    
    # Additional validation
    project_root = Path(config.get("project_root", utils.PROJECT_ROOT))
    
    # Try to import critical packages
    if not issues:  # Only if basic checks pass
        import_test, import_msg = verify_critical_packages(project_root)
        if not import_test:
            issues.append(f"Import test failed: {import_msg}")
    
    return {
        "valid": len(issues) == 0,
        "issues": issues
    }


def cleanup(config: Dict[str, Any] = None) -> None:
    """
    Clean up any temporary resources.
    
    Args:
        config: Configuration dictionary
    """
    # Nothing to clean up for backend
    pass