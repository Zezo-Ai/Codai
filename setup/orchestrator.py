"""
Orchestrator Module

Coordinates the execution of all setup modules to provide a complete
setup experience with proper sequencing and error handling.
"""

import os
import sys
import time
import subprocess
import webbrowser
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Union, Callable

from . import utils
from . import environment
from . import ports
from . import requirements
from . import backend
from . import frontend
from . import validation
from . import config as config_module

# Note: Version checking and port availability are now integrated into
# the requirements and ports modules respectively

# Type aliases
StepResult = Dict[str, Any]
SetupResult = Dict[str, Any]


class OrchestratorError(Exception):
    """Exception raised for orchestration errors."""
    pass


def run_step(
    name: str,
    step_func: Callable,
    config: Dict[str, Any],
    critical: bool = True,
    fallback: Optional[Callable] = None,
    retry_count: int = 1,
    troubleshoot: bool = True
) -> StepResult:
    """
    Run a setup step with error handling, fallback options, and retry support.
    Enhanced with logging and troubleshooting capabilities.
    
    Args:
        name: Step name
        step_func: Step function to run
        config: Configuration to pass to step function
        critical: Whether step is critical (failure stops setup)
        fallback: Optional fallback function to run if the primary function fails
        retry_count: Number of times to retry on failure
        troubleshoot: Whether to offer troubleshooting on failure
    
    Returns:
        StepResult: Step result
    """
    # Import here to avoid circular imports
    from . import logging_config
    from . import troubleshooter
    from . import theme
    
    # Get a logger for this function
    logger = logging_config.get_logger("setup.orchestrator")
    
    # Print a more visually appealing step header
    theme.print_step(name, "Starting", config.get("step_count", 1), config.get("total_steps", 1))
    
    # Log step start with enhanced details
    logging_config.log_step_start(name, f"Configuration: {config.get('name', name)}")
    
    start_time = time.time()
    attempts = 0
    last_error = None
    
    # Try the primary function with retries
    while attempts < retry_count:
        attempts += 1
        if attempts > 1:
            utils.print_info(f"Retry attempt {attempts}/{retry_count} for {name}")
            logger.info(f"Retry attempt {attempts}/{retry_count} for step '{name}'")
            
        try:
            # Run step function
            result = step_func(config)
            success = result.get("success", False)
            message = result.get("message", "")
            
            if success:
                # Calculate duration
                duration = time.time() - start_time
                
                # Create a more visually appealing completion message
                theme.print_result(True, f"{name} completed successfully in {duration:.2f}s")
                
                # If there are key results to highlight, show them
                if isinstance(result, dict) and "highlights" in result:
                    highlights = result["highlights"]
                    if highlights:
                        theme.print_subheader("Key Results")
                        for key, value in highlights.items():
                            theme.print_key_value(key, str(value))
                
                # Log successful step completion
                logging_config.log_step_end(name, True, message, duration)
                
                return {
                    "name": name,
                    "success": True,
                    "message": message,
                    "duration": duration,
                    "critical": critical,
                    "data": result,
                    "attempts": attempts
                }
            else:
                # Failed but we might retry or use fallback
                if attempts < retry_count:
                    utils.print_warning(f"{name} failed: {message}. Retrying...")
                    last_error = message
                    logger.warning(f"Step '{name}' failed with message: {message}. Retrying...")
                    continue
                
                # No more retries, report failure
                duration = time.time() - start_time
                
                # Create a more visually appealing failure message with a box
                if critical:
                    failure_content = f"{name} failed after {attempts} attempts: {message}"
                    theme.print_box(failure_content, "Error Details", color="error")
                else:
                    theme.print_result(False, f"{name} failed: {message}")
                
                # Log failure
                logging_config.log_step_end(name, False, message, duration)
                    
                # Store result for potential fallback
                last_result = {
                    "name": name,
                    "success": False,
                    "message": message,
                    "duration": duration,
                    "critical": critical,
                    "data": result,
                    "attempts": attempts
                }
                
                # Offer troubleshooting if enabled and no fallback or fallback will also likely fail
                if troubleshoot and last_result["critical"]:
                    # Determine which issue to troubleshoot based on the step name and result
                    issue_id = None
                    context = {}
                    
                    if "dependency" in name.lower() or "package" in name.lower():
                        issue_id = "package_installation_failed"
                        # Try to extract packages from result or config
                        packages = []
                        if "packages" in result:
                            packages = result["packages"]
                        elif "packages" in config:
                            packages = config["packages"]
                        context = {"packages": packages}
                    elif "poetry" in name.lower():
                        issue_id = "poetry_failed"
                    elif "venv" in name.lower() or "virtual" in name.lower():
                        issue_id = "venv_creation_failed"
                        context = {"venv_path": config.get("venv_path", ".venv")}
                    elif "port" in name.lower():
                        issue_id = "port_in_use"
                        context = {"port": config.get("port", ports.DEFAULT_BACKEND_PORT)}
                    
                    if issue_id:
                        utils.print_colored(f"\nWould you like help troubleshooting this issue?", "yellow", bold=True)
                        if utils.get_user_confirmation("Start interactive troubleshooter?", default=True):
                            logger.info(f"Starting troubleshooter for issue '{issue_id}' in step '{name}'")
                            troubleshoot_result = troubleshooter.troubleshoot_issue(issue_id, context)
                            
                            if troubleshoot_result and troubleshoot_result.resolved:
                                utils.print_success("Issue resolved by troubleshooter!")
                                logger.info(f"Issue '{issue_id}' resolved by troubleshooter")
                                
                                # Update result to indicate troubleshooting fixed the issue
                                last_result["troubleshooting"] = {
                                    "issue_id": issue_id,
                                    "resolved": True,
                                    "steps_tried": troubleshoot_result.steps_tried
                                }
                                
                                # We'll still use fallback if available, but mark as potentially fixed
                                last_result["troubleshooting_fixed"] = True
                            else:
                                logger.warning(f"Troubleshooter could not resolve issue '{issue_id}'")
                                last_result["troubleshooting"] = {
                                    "issue_id": issue_id,
                                    "resolved": False,
                                    "steps_tried": troubleshoot_result.steps_tried if troubleshoot_result else []
                                }
                
                break
                
        except Exception as e:
            last_error = str(e)
            
            # Create a visually clear exception report
            exc_type = type(e).__name__
            
            # Format the exception details in a box
            exception_details = [
                f"Step: {name}",
                f"Exception type: {exc_type}",
                f"Message: {last_error}"
            ]
            
            if config.get("verbose", False):
                import traceback
                import io
                
                # Get the traceback as a string
                tb_stream = io.StringIO()
                traceback.print_exc(file=tb_stream)
                tb_string = tb_stream.getvalue()
                
                # Add traceback to the details if verbose
                exception_details.append("\nTraceback:")
                exception_details.extend(tb_string.split('\n'))
            
            # Print the exception box
            theme.print_box('\n'.join(exception_details), "Exception Details", color="error")
            
            # Log the exception with enhanced details
            logger.exception(f"Exception in step '{name}': {str(e)}")
            
            if attempts < retry_count:
                theme.print_info(f"Retrying {name}...")
                continue
                
            # No more retries
            duration = time.time() - start_time
            logging_config.log_step_end(name, False, str(e), duration)
            
            last_result = {
                "name": name,
                "success": False,
                "message": last_error,
                "duration": duration,
                "critical": critical,
                "exception": last_error,
                "attempts": attempts
            }
            
            # Offer exception-based troubleshooting
            if troubleshoot and critical:
                # Detect which issue might be related to this exception
                issue_id = None
                context = {}
                
                error_lower = str(e).lower()
                if "connection" in error_lower or "network" in error_lower:
                    issue_id = "proxy_configuration"
                elif "permission" in error_lower:
                    if "venv" in error_lower:
                        issue_id = "venv_creation_failed"
                        context = {"venv_path": config.get("venv_path", ".venv")}
                elif "module" in error_lower and "not found" in error_lower:
                    issue_id = "package_installation_failed"
                    # Try to extract the package name
                    import re
                    match = re.search(r"module '([^']+)' not found", error_lower)
                    if match:
                        context = {"packages": [match.group(1)]}
                elif "port" in error_lower and ("use" in error_lower or "bind" in error_lower):
                    issue_id = "port_in_use"
                    # Try to extract the port number
                    import re
                    match = re.search(r"port\s+(\d+)", error_lower)
                    if match:
                        context = {"port": int(match.group(1))}
                
                if issue_id:
                    utils.print_colored(f"\nWould you like help troubleshooting this error?", "yellow", bold=True)
                    if utils.get_user_confirmation("Start interactive troubleshooter?", default=True):
                        logger.info(f"Starting troubleshooter for exception-based issue '{issue_id}' in step '{name}'")
                        troubleshoot_result = troubleshooter.troubleshoot_issue(issue_id, context)
                        
                        if troubleshoot_result and troubleshoot_result.resolved:
                            utils.print_success("Issue resolved by troubleshooter!")
                            logger.info(f"Issue '{issue_id}' resolved by troubleshooter")
                            last_result["troubleshooting"] = {
                                "issue_id": issue_id,
                                "resolved": True,
                                "steps_tried": troubleshoot_result.steps_tried
                            }
                            last_result["troubleshooting_fixed"] = True
                        else:
                            logger.warning(f"Troubleshooter could not resolve issue '{issue_id}'")
                            last_result["troubleshooting"] = {
                                "issue_id": issue_id,
                                "resolved": False,
                                "steps_tried": troubleshoot_result.steps_tried if troubleshoot_result else []
                            }
            
            break
    
    # If we get here, all attempts failed. Try fallback if available
    if fallback is not None:
        utils.print_info(f"Attempting fallback for {name}...")
        try:
            fallback_result = fallback(config)
            fallback_success = fallback_result.get("success", False)
            
            if fallback_success:
                utils.print_success(f"Fallback for {name} succeeded")
                return {
                    "name": name,
                    "success": True,
                    "message": f"Completed with fallback: {fallback_result.get('message', '')}",
                    "duration": time.time() - start_time,
                    "critical": critical,
                    "fallback_used": True,
                    "data": fallback_result,
                    "attempts": attempts
                }
            else:
                utils.print_error(f"Fallback for {name} also failed: {fallback_result.get('message', '')}")
        except Exception as fallback_error:
            utils.print_error(f"Fallback for {name} failed with exception: {str(fallback_error)}")
    
    # If we get here, both main function and fallback failed (or no fallback was provided)
    return last_result


def check_prerequisites(config: Dict[str, Any] = None) -> bool:
    """
    Check all prerequisites before running setup.
    
    Args:
        config: Setup configuration
    
    Returns:
        bool: True if all prerequisites are met, False otherwise
    """
    utils.print_header("Prerequisites Check")
    
    # Create a detailed list of all prerequisites to display to the user
    prerequisites_list = []
    all_passed = True
    
    # Check version requirements first using improved version checking
    utils.print_colored("\nVersion Requirements:", "blue", bold=True)
    
    # Check Python version
    py_ok, py_msg = requirements.check_python_version()
    if py_ok:
        utils.print_success(f"✓ {py_msg}")
        prerequisites_list.append(py_msg)
    else:
        utils.print_error(f"❌ {py_msg}")
        prerequisites_list.append(f"❌ {py_msg}")
        all_passed = False
    
    # Check Node.js version
    node_ok, node_msg = requirements.check_node_version()
    if node_ok:
        utils.print_success(f"✓ {node_msg}")
        prerequisites_list.append(node_msg)
    else:
        utils.print_error(f"❌ {node_msg}")
        prerequisites_list.append(f"❌ {node_msg}")
        all_passed = False
    
    # Check npm version
    npm_ok, npm_msg = requirements.check_npm_version()
    if npm_ok:
        utils.print_success(f"✓ {npm_msg}")
        prerequisites_list.append(npm_msg)
    else:
        utils.print_error(f"❌ {npm_msg}")
        prerequisites_list.append(f"❌ {npm_msg}")
        all_passed = False
    
    # Run environment detection to get detailed environment information
    env_info = environment.detect_environment()
    
    # Log the environment info for debugging purposes
    environment.log_system_info(env_info)
    
    # Print a compact but comprehensive summary of the environment
    environment.print_compact_environment_summary(env_info)
    
    # Run environment check to get issues
    env_result = environment.check(config)
    
    # Store OS details in prerequisites list
    os_description = f"{env_info['os']['name']}"
    if 'edition' in env_info['os']:
        os_description += f" {env_info['os']['edition']}"
    prerequisites_list.append(f"Operating system: {os_description} ({env_info['os']['version']})")
    
    # Show environment issues if any
    if env_result:
        utils.print_error("Environment issues found:")
        for issue in env_result:
            utils.print_error(f"- {issue}")
            prerequisites_list.append(f"❌ {issue}")
        all_passed = False
    else:
        utils.print_success("✓ Environment configuration is valid")
        prerequisites_list.append("Environment configuration is valid")
    
    # Run ALL requirements check with detailed output
    utils.print_colored("\nSystem Requirements:", "blue", bold=True)
    raw_results = requirements.check_all_requirements(config.get("check_frontend", True) if config else True)
    
    # Display disk space
    disk_checks = [r for r in raw_results.get("system", []) if "Disk Space" in r["name"]]
    if disk_checks:
        disk_result = disk_checks[0]
        if disk_result["passed"]:
            disk_message = disk_result.get("message", "Sufficient disk space available")
            utils.print_success(f"✓ {disk_message}")
            prerequisites_list.append(disk_message)
        else:
            utils.print_error(f"❌ {disk_result.get('details', 'Insufficient disk space')}")
            prerequisites_list.append(f"❌ {disk_result.get('details')}")
            all_passed = False
    
    # Display network access
    network_checks = [r for r in raw_results.get("system", []) if "Network Access" in r["name"]]
    if network_checks:
        network_result = network_checks[0]
        if network_result["passed"]:
            network_message = network_result.get("details", "Network access is available")
            utils.print_success(f"✓ {network_message}")
            prerequisites_list.append(network_message)
        else:
            utils.print_error(f"❌ {network_result.get('details', 'Network access issues detected')}")
            prerequisites_list.append(f"❌ {network_result.get('details')}")
            all_passed = False
    
    # Display Python packages with status
    utils.print_colored("\nRequired Python Packages:", "blue", bold=True)
    missing_packages = []
    
    # Sort packages alphabetically for consistent display
    python_results = sorted(raw_results.get("python", []), key=lambda x: x["name"])
    
    for result in python_results:
        if "Python Package:" in result["name"]:
            package_name = result["name"].replace("Python Package: ", "")
            if result["passed"]:
                utils.print_success(f"✓ {package_name}: {result.get('details', 'Package is installed')}")
                prerequisites_list.append(f"{package_name}: {result.get('details', 'Installed')}")
            else:
                utils.print_error(f"❌ {package_name}: {result.get('details', 'Package is missing')}")
                prerequisites_list.append(f"❌ {package_name}: Not installed")
                if result.get("package_install", True):
                    if package_name in ["fastapi", "uvicorn", "python-multipart", "pyyaml", "python-dotenv"]:
                        missing_packages.append(package_name)
                all_passed = False
    
    # Display Node.js requirements
    utils.print_colored("\nNode.js Requirements:", "blue", bold=True)
    node_results = [r for r in raw_results.get("node", []) if r["name"].startswith("Node")]
    npm_results = [r for r in raw_results.get("node", []) if r["name"].startswith("npm")]
    
    if node_results:
        node_result = node_results[0]
        if node_result["passed"]:
            node_message = node_result.get("details", "Node.js is installed")
            utils.print_success(f"✓ {node_message}")
            prerequisites_list.append(node_message)
        else:
            utils.print_error(f"❌ {node_result.get('details', 'Node.js is not properly installed')}")
            prerequisites_list.append(f"❌ {node_result.get('details')}")
            all_passed = False
    
    if npm_results:
        npm_result = npm_results[0]
        if npm_result["passed"]:
            npm_message = npm_result.get("details", "npm is installed")
            utils.print_success(f"✓ {npm_message}")
            prerequisites_list.append(npm_message)
        else:
            utils.print_error(f"❌ {npm_result.get('details', 'npm is not properly installed')}")
            prerequisites_list.append(f"❌ {npm_result.get('details')}")
            all_passed = False
    
    # Summary
    utils.print_colored("\nPrerequisites Summary:", "blue", bold=True)
    if all_passed:
        utils.print_success("✓ All prerequisites met!")
        prerequisites_list.append("All prerequisites met")
    else:
        utils.print_error("❌ Some prerequisites are not met")
        prerequisites_list.append("❌ Some prerequisites are not met")
    
    # Store the prerequisites list in the config for later reference
    if config is not None:
        config["prerequisites_details"] = prerequisites_list
    
    # Only proceed with package installation if there are missing packages
    if missing_packages:
        utils.print_warning("\nMissing required Python packages:")
        for package in missing_packages:
            utils.print_warning(f"- {package}")
            
        # Ask for confirmation to install
        try:
            from . import requirements as req_module
            
            utils.print_colored("\nThese packages are required for the application to work properly.", "yellow")
            if req_module.get_user_confirmation("Would you like to install them now?", default=True):
                # Try batch installation first if available
                utils.print_colored("\nInstalling packages...", "cyan", bold=True)
                
                installed_packages = []
                failed_packages = []
                
                if hasattr(req_module, "install_python_packages_batch"):
                    success, installed, failed, messages = req_module.install_python_packages_batch(missing_packages)
                    installed_packages = installed
                    failed_packages = failed
                    
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
                else:
                    # Fall back to individual installation
                    for package in missing_packages:
                        success, message = req_module.install_python_package(package)
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
                
                # Re-validate requirements
                utils.print_colored("\nRe-checking requirements after installation...", "cyan", bold=True)
                req_result = requirements.check(config)
                
                if req_result:
                    # If we still have issues, we fail
                    utils.print_error("Some requirements are still not met after installation:")
                    for issue in req_result:
                        utils.print_error(f"- {issue}")
                    return False
                else:
                    # All requirements met after installation
                    utils.print_success("All requirements are now met after package installation.")
                    return True
            else:
                # User declined installation
                utils.print_error("Package installation declined. Setup cannot continue without required packages.")
                return False
        except Exception as e:
            utils.print_error(f"Error during package installation: {str(e)}")
            if config and config.get("verbose", False):
                import traceback
                traceback.print_exc()
            return False
    
    # All prerequisites met
    utils.print_success("All prerequisites met")
    return True


def run_setup(config: Dict[str, Any] = None) -> SetupResult:
    """
    Run full setup process with detailed progress information.
    
    Args:
        config: Setup configuration
    
    Returns:
        SetupResult: Setup result
    """
    from . import theme
    import sys
    from . import __version__
    
    # Clear the console for a clean start - make sure utils is imported
    try:
        utils.clear_console()
    except Exception as e:
        # If clearing fails, log the error but continue
        print(f"Note: Could not clear console: {str(e)}")
    
    if config is None:
        config = config_module.get_default_config()
    
    # Display a formatted initialization message
    python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    
    # Create a nice initialization box
    init_info = []
    init_info.append(f"CODAI Setup System v{__version__}")
    init_info.append("")
    init_info.append(f"Python: {python_version}")
    init_info.append(f"Platform: {sys.platform}")
    init_info.append(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    theme.print_box("\n".join(init_info), "Initialization", color="primary")
    
    theme.print_header("CODAI Setup")
    
    # Print setup overview in a nice box
    setup_overview = """
This wizard will guide you through setting up the CODAI application:

1. Detect and validate your environment
2. Configure network ports for services
3. Verify all software requirements
4. Set up the backend server
5. Set up the frontend application
6. Validate the complete configuration
7. Start the application automatically
"""
    
    theme.print_box(setup_overview.strip(), "Setup Overview", color="primary")
    
    # Check for incomplete virtual environment before starting
    venv_status = utils.detect_incomplete_venv()
    if venv_status["exists"] and not venv_status["is_complete"]:
        utils.print_warning("\nIncomplete virtual environment detected!")
        for issue in venv_status["issues"]:
            utils.print_error(f"  - {issue}")
        
        if utils.confirm("\nWould you like to remove the incomplete virtual environment?", default=True):
            if utils.cleanup_incomplete_venv(force=True):
                utils.print_success("Incomplete virtual environment cleaned up successfully")
            else:
                utils.print_error("Failed to clean up virtual environment")
                utils.print_info("You may need to manually remove the .venv folder")
    
    start_time = time.time()
    
    # Track all step results
    steps = []
    total_steps = 6  # total number of main steps
    
    # Step 1: Environment detection
    # Use our enhanced step display
    step_number = 1
    config["step_count"] = step_number
    config["total_steps"] = total_steps
    config["name"] = "Environment Detection"
    
    env_step = run_step(
        "Environment Detection",
        environment.configure,
        config,
        critical=True
    )
    steps.append(env_step)
    
    if not env_step["success"]:
        return {
            "success": False,
            "message": f"Setup failed: Environment detection failed: {env_step['message']}",
            "steps": steps,
            "duration": time.time() - start_time
        }
    
    # Show environment summary
    if "data" in env_step and "env_info" in env_step["data"]:
        env_info = env_step["data"]["env_info"]
        # Use our enhanced compact summary function to display environment details
        environment.print_compact_environment_summary(env_info)
    
    # Step 2: Port configuration
    step_number = 2
    config["step_count"] = step_number
    config["total_steps"] = total_steps
    config["name"] = "Port Configuration"
    
    ports_step = run_step(
        "Port Configuration",
        ports.configure,
        config,
        critical=True
    )
    steps.append(ports_step)
    
    if not ports_step["success"]:
        return {
            "success": False,
            "message": f"Setup failed: Port configuration failed: {ports_step['message']}",
            "steps": steps,
            "duration": time.time() - start_time
        }
    
    # Update config with port information from ports_step
    if ports_step["success"] and "data" in ports_step and "data" in ports_step["data"]:
        port_config = ports_step["data"]["data"]
        # Update configuration with detected ports
        config.update({
            "backend_port": port_config.get("backend_port", config.get("backend_port")),
            "frontend_port": port_config.get("frontend_port", config.get("frontend_port")),
            "backend_url": port_config.get("backend_url", ""),
            "frontend_url": port_config.get("frontend_url", "")
        })
        utils.print_colored("Port Configuration Summary:", "cyan")
        utils.print_info(f"• Backend: http://127.0.0.1:{config['backend_port']}")
        utils.print_info(f"• Frontend: http://127.0.0.1:{config['frontend_port']}")
    
    # Step 3: Requirements verification (installation is now done in prerequisites)
    step_number = 3
    config["step_count"] = step_number
    config["total_steps"] = total_steps
    config["name"] = "Requirements Check"
    
    req_step = run_step(
        "Requirements Check",
        requirements.configure,
        config,
        critical=True
    )
    steps.append(req_step)
    
    if not req_step["success"]:
        return {
            "success": False,
            "message": f"Setup failed: Requirements check failed: {req_step['message']}",
            "steps": steps,
            "duration": time.time() - start_time
        }
    
    # Step 4: Backend setup
    if config.get("setup_backend", True):
        step_number = 4
        config["step_count"] = step_number
        config["total_steps"] = total_steps
        config["name"] = "Backend Setup"
        
        backend_step = run_step(
            "Backend Setup",
            backend.configure,
            config,
            critical=True
        )
        steps.append(backend_step)
        
        if not backend_step["success"]:
            return {
                "success": False,
                "message": f"Setup failed: Backend setup failed: {backend_step['message']}",
                "steps": steps,
                "duration": time.time() - start_time
            }
        
        # Show backend summary if available
        if "data" in backend_step and "env_path" in backend_step["data"]:
            utils.print_colored("Backend Setup Summary:", "cyan")
            utils.print_info(f"• Virtual Environment: {backend_step['data']['env_path']}")
            if "packages" in backend_step["data"]:
                utils.print_info(f"• Installed Packages: {len(backend_step['data']['packages'])}")
            utils.print_info(f"• Configuration: .env file updated with application settings")
    else:
        utils.print_info("Skipping backend setup as per configuration")
    
    # Step 5: Frontend setup
    if config.get("setup_frontend", True):
        step_number = 5
        config["step_count"] = step_number
        config["total_steps"] = total_steps
        config["name"] = "Frontend Setup"
        
        frontend_step = run_step(
            "Frontend Setup",
            frontend.configure,
            config,
            critical=False  # Changed to non-critical so setup can continue
        )
        steps.append(frontend_step)
        
        if not frontend_step["success"]:
            utils.print_warning(
                "Frontend setup encountered issues. The backend may still work, "
                "but the frontend might require manual setup."
            )
            # Record the issue but continue with setup
            utils.print_info("Continuing with validation despite frontend issues...")
        else:
            # Show frontend summary if available
            utils.print_colored("Frontend Setup Summary:", "cyan")
            utils.print_info(f"• Configuration: Environment files updated with backend URL")
            utils.print_info(f"• Ready to serve on: http://localhost:{config['frontend_port']}")
    else:
        utils.print_info("Skipping frontend setup as per configuration")
    
    # Step 6: Validation
    step_number = 6
    config["step_count"] = step_number
    config["total_steps"] = total_steps
    config["name"] = "Validation"
    
    validation_step = run_step(
        "Validation",
        validation.configure,
        config,
        critical=False
    )
    steps.append(validation_step)
    
    if not validation_step["success"]:
        utils.print_warning(
            "Validation completed with issues. The application might still work, "
            "but some features may not function correctly."
        )
        
        # Show validation issues if available
        if "data" in validation_step and "issues" in validation_step["data"]:
            utils.print_colored("Validation Issues:", "yellow")
            for issue in validation_step["data"]["issues"]:
                utils.print_warning(f"• {issue}")
    else:
        utils.print_colored("Validation Summary:", "cyan")
        utils.print_success("• All components validated successfully")
        utils.print_success("• Application is ready to run")
    
    # Calculate total duration
    duration = time.time() - start_time
    
    # Format duration as minutes and seconds
    minutes = int(duration // 60)
    seconds = int(duration % 60)
    
    # Final success message
    theme.print_header("Setup Complete")
    
    # Create a summary with components and configuration
    summary_content = []
    summary_content.append(f"✓ CODAI has been successfully set up in {minutes}m {seconds}s!")
    summary_content.append("")
    summary_content.append("Components Configured:")
    summary_content.append(f"• Backend Server:      http://localhost:{config.get('backend_port', ports.DEFAULT_BACKEND_PORT)}")
    summary_content.append(f"• Frontend Application: http://localhost:{config.get('frontend_port', ports.DEFAULT_FRONTEND_PORT)}")
    summary_content.append("")
    summary_content.append("Configuration Details:")
    summary_content.append(f"• Backend API Port:    {config.get('backend_port', ports.DEFAULT_BACKEND_PORT)}")
    summary_content.append(f"• Frontend Web Port:   {config.get('frontend_port', ports.DEFAULT_FRONTEND_PORT)}")
    summary_content.append(f"• Environment:         .env file in project root")
    
    # Display the summary in a box
    theme.print_box("\n".join(summary_content), "Setup Success", color="success")
    
    # Check if application should be automatically launched
    auto_run = config.get("auto_run", True)
    
    if auto_run:
        # Run the application automatically
        # Create a visually distinct launch box
        launch_content = """Starting both backend and frontend services:

• Backend will serve the API endpoints
• Frontend will serve the web interface
• Your browser will open automatically when ready
• Press Ctrl+C when you want to stop the application"""
        
        theme.print_box(launch_content, "Step 7: Launching Application", color="highlight")
        
        run_application(config)
    else:
        # Display next steps if not auto-running
        next_steps = []
        next_steps.append("To start the application manually:")
        next_steps.append("")
        
        next_steps.append("1. Start the backend server:")
        if config.get("setup_backend", True):
            if utils.is_command_available("poetry"):
                next_steps.append("   poetry run python run_server.py")
            else:
                next_steps.append("   python run_server.py")
        
        if config.get("setup_frontend", True):
            next_steps.append("")
            next_steps.append("2. Start the frontend server (in a separate terminal):")
            next_steps.append("   cd frontend")
            next_steps.append("   npm run dev")
        
        next_steps.append("")
        next_steps.append("3. Access the application:")
        # Use the actual configured frontend port
        frontend_port = config.get("frontend_port", ports.DEFAULT_FRONTEND_PORT)
        next_steps.append(f"   Open your browser to: http://localhost:{frontend_port}")
        
        next_steps.append("")
        next_steps.append("Troubleshooting:")
        next_steps.append("• If the backend fails to start, check logs in the 'logs' directory")
        next_steps.append("• If the frontend fails, ensure Node.js is properly installed")
        next_steps.append("• For port conflicts, edit the .env file to change port numbers")
        
        # Display the next steps in a nicely formatted box
        theme.print_box("\n".join(next_steps), "Next Steps", color="info")
    
    # Return detailed result with all steps
    return {
        "success": True,
        "message": "Setup completed successfully",
        "steps": steps,
        "duration": duration,
        "config": {
            "backend_port": config.get("backend_port", ports.DEFAULT_BACKEND_PORT),
            "frontend_port": config.get("frontend_port", ports.DEFAULT_FRONTEND_PORT),
            "backend_url": config.get("backend_url", ""),
            "frontend_url": config.get("frontend_url", "")
        },
        "auto_run": auto_run
    }


def run_check_only(config: Dict[str, Any] = None) -> SetupResult:
    """
    Run all checks without making changes.
    
    Args:
        config: Setup configuration
    
    Returns:
        SetupResult: Check result
    """
    if config is None:
        config = config_module.get_default_config()
    
    utils.print_header("CODAI Configuration Check")
    
    # Check for incomplete virtual environment first
    venv_status = utils.detect_incomplete_venv()
    if venv_status["exists"] and not venv_status["is_complete"]:
        utils.print_warning("\nIncomplete virtual environment detected!")
        for issue in venv_status["issues"]:
            utils.print_error(f"  - {issue}")
        utils.print_info("\nRun 'python -m setup' to clean up and proceed with setup")
    
    start_time = time.time()
    
    # Track all step results
    steps = []
    issues = []
    
    # Environment check
    env_issues = environment.check(config)
    steps.append({
        "name": "Environment Check",
        "success": len(env_issues) == 0,
        "issues": env_issues
    })
    issues.extend([f"Environment: {issue}" for issue in env_issues])
    
    # Port check
    port_issues = ports.check(config)
    steps.append({
        "name": "Port Check",
        "success": len(port_issues) == 0,
        "issues": port_issues
    })
    issues.extend([f"Ports: {issue}" for issue in port_issues])
    
    # Requirements check
    req_issues = requirements.check(config)
    steps.append({
        "name": "Requirements Check",
        "success": len(req_issues) == 0,
        "issues": req_issues
    })
    issues.extend([f"Requirements: {issue}" for issue in req_issues])
    
    # Backend check
    if config.get("setup_backend", True):
        backend_issues = backend.check(config)
        steps.append({
            "name": "Backend Check",
            "success": len(backend_issues) == 0,
            "issues": backend_issues
        })
        issues.extend([f"Backend: {issue}" for issue in backend_issues])
    
    # Frontend check
    if config.get("setup_frontend", True):
        frontend_issues = frontend.check(config)
        steps.append({
            "name": "Frontend Check",
            "success": len(frontend_issues) == 0,
            "issues": frontend_issues
        })
        issues.extend([f"Frontend: {issue}" for issue in frontend_issues])
    
    # Validation check
    validation_issues = validation.check(config)
    steps.append({
        "name": "Validation Check",
        "success": len(validation_issues) == 0,
        "issues": validation_issues
    })
    issues.extend([f"Validation: {issue}" for issue in validation_issues])
    
    # Calculate total duration
    duration = time.time() - start_time
    
    # Print results
    utils.print_header("Check Results")
    
    if issues:
        utils.print_error(f"Found {len(issues)} issues:")
        for issue in issues:
            utils.print_error(f"- {issue}")
    else:
        utils.print_success("No issues found. System is ready for setup!")
    
    return {
        "success": len(issues) == 0,
        "message": f"Configuration check {'passed' if len(issues) == 0 else 'failed'}",
        "steps": steps,
        "issues": issues,
        "duration": duration
    }


def initialize(config=None) -> Dict[str, Any]:
    """
    Initialize the orchestrator module.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with module configuration
    """
    if config is None:
        config = config_module.get_default_config()
    
    return config


def check(config=None) -> List[str]:
    """
    Check orchestrator configuration.
    
    Args:
        config: Optional configuration
    
    Returns:
        List of issues (empty if configuration is valid)
    """
    # Orchestrator doesn't have its own configuration to check
    return []


def configure(config=None) -> Dict[str, Any]:
    """
    Run the full setup process.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with setup results
    """
    if config is None:
        config = config_module.get_default_config()
    
    # Check prerequisites
    if not check_prerequisites(config):
        return {
            "success": False,
            "message": "Prerequisites not met. Setup cannot continue."
        }
    
    # Run full setup
    result = run_setup(config)
    
    return {
        "success": result["success"],
        "message": result["message"],
        "data": result
    }


def validate(config=None) -> Dict[str, Any]:
    """
    Validate orchestrator configuration.
    
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
    Clean up orchestrator resources.
    
    Args:
        config: Optional configuration
    """
    # Clean up all modules
    environment.cleanup(config)
    ports.cleanup(config)
    requirements.cleanup(config)
    backend.cleanup(config)
    frontend.cleanup(config)
    validation.cleanup(config)


def run_check(config: Dict[str, Any] = None) -> int:
    """
    Run check mode and return exit code.
    
    Args:
        config: Setup configuration
    
    Returns:
        int: Exit code (0 for success, non-zero for failure)
    """
    result = run_check_only(config)
    return 0 if result["success"] else 1


def update_port_configuration(project_root: Path, backend_port: int, frontend_port: int) -> bool:
    """
    Update port configuration if using non-default ports.
    
    Since we have centralized configuration in config/app.yaml,
    we only need to update frontend environment if using non-default ports.
    
    Args:
        project_root: Project root directory
        backend_port: Backend port number
        frontend_port: Frontend port number
    
    Returns:
        bool: True if successful, False otherwise
    """
    # The ports are already configured in config/app.yaml
    # We only need to update frontend .env if using non-default backend port
    
    from . import ports
    
    if backend_port != ports.DEFAULT_BACKEND_PORT:
        # Update frontend environment file
        frontend_dir = project_root / "frontend"
        if frontend_dir.exists():
            return ports.update_frontend_env(f"http://127.0.0.1:{backend_port}", frontend_dir)
    
    # For default ports, no configuration needed
    return True


def run_application(config: Dict[str, Any] = None) -> bool:
    """
    Run the application after setup is complete.
    
    Args:
        config: Setup configuration
    
    Returns:
        bool: True if application started successfully, False otherwise
    """
    if config is None:
        config = config_module.get_default_config()
    
    # Create temp directory inside setup folder if it doesn't exist
    temp_dir = Path(__file__).parent / "temp"
    temp_dir.mkdir(exist_ok=True)
    
    success = True
    backend_process = None
    frontend_process = None
    
    try:
        # Get configured ports
        backend_port = config.get("backend_port", ports.DEFAULT_BACKEND_PORT)
        frontend_port = config.get("frontend_port", ports.DEFAULT_FRONTEND_PORT)
        
        # Update port configuration in all necessary places
        project_root = Path(config.get("project_root", utils.PROJECT_ROOT))
        update_port_configuration(project_root, backend_port, frontend_port)
        
        utils.print_info("Starting backend server...")
        
        # Start backend server as background process
        if sys.platform.startswith('win'):
            # Windows
            # The run_server.py script doesn't accept --port parameter directly
            # We'll set the port only through environment variables
            backend_cmd = "poetry run python run_server.py"
            
            # Set environment variables to help with Unicode encoding issues
            # and pass the port configuration through environment
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"  # Force Python to use UTF-8 for stdin/stdout/stderr
            
            # Set all possible port environment variables
            env["PORT"] = str(backend_port)
            env["SERVER_PORT"] = str(backend_port)
            env["API_PORT"] = str(backend_port)
            env["BACKEND_PORT"] = str(backend_port)
            env["CODAI_BACKEND_PORT"] = str(backend_port)
            env["CODAI_FRONTEND_PORT"] = str(frontend_port)
            env["FRONTEND_PORT"] = str(frontend_port)
            
            backend_process = subprocess.Popen(
                backend_cmd, 
                shell=True,
                env=env,
                # Redirect output to files instead of hiding the window
                stdout=open(temp_dir / "backend_output.log", "w", encoding="utf-8"),
                stderr=open(temp_dir / "backend_error.log", "w", encoding="utf-8")
            )
        else:
            # Unix-like
            backend_cmd = "poetry run python run_server.py"
            backend_process = subprocess.Popen(
                backend_cmd,
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                preexec_fn=os.setpgrp if hasattr(os, 'setpgrp') else None
            )
        
        # Store process ID for later
        if backend_process:
            with open(temp_dir / "backend_pid", "w") as f:
                f.write(str(backend_process.pid))
            utils.print_success(f"Backend started with PID: {backend_process.pid}")
        
        # Wait a moment for backend to start
        utils.print_info("Waiting for backend to initialize...")
        time.sleep(5)
        
        # Start frontend server
        if config.get("setup_frontend", True):
            utils.print_info("Starting frontend server...")
            
            # Change to frontend directory
            os.chdir("frontend")
            
            # First import the frontend module to access its functions
            from . import frontend as frontend_module
            
            # Check if the frontend script has the correct port and update if needed
            if not frontend_module.check_frontend_script_port(Path("."), frontend_port):
                utils.print_info(f"Updating npm script to use port {frontend_port} before launching...")
                success, message = frontend_module.update_npm_scripts(Path("."), frontend_port)
                if success:
                    utils.print_success(f"Updated npm dev script to use port {frontend_port}")
                else:
                    utils.print_warning(f"Could not update npm script: {message}")
            
            if sys.platform.startswith('win'):
                # Windows
                frontend_cmd = "npm run dev"
                # NOTE: Removing STARTF_USESHOWWINDOW flag to prevent console clearing
                # Instead, create a process that shares the current console
                
                # Set environment variables to help with Unicode/color output
                # and pass port configuration
                env = os.environ.copy()
                env["FORCE_COLOR"] = "1"  # Force color in npm output
                
                # Set port environment variables
                env["PORT"] = str(frontend_port)
                env["FRONTEND_PORT"] = str(frontend_port)
                env["BACKEND_PORT"] = str(backend_port)
                env["CODAI_FRONTEND_PORT"] = str(frontend_port)
                env["CODAI_BACKEND_PORT"] = str(backend_port)
                env["REACT_APP_BACKEND_PORT"] = str(backend_port)
                env["REACT_APP_BACKEND_URL"] = f"http://localhost:{backend_port}"
                
                frontend_process = subprocess.Popen(
                    frontend_cmd, 
                    shell=True,
                    env=env,
                    # Redirect output to files instead of hiding the window
                    stdout=open(temp_dir / "frontend_output.log", "w", encoding="utf-8"),
                    stderr=open(temp_dir / "frontend_error.log", "w", encoding="utf-8")
                )
            else:
                # Unix-like
                frontend_cmd = "npm run dev"
                frontend_process = subprocess.Popen(
                    frontend_cmd,
                    shell=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    preexec_fn=os.setpgrp if hasattr(os, 'setpgrp') else None
                )
            
            # Store process ID for later
            if frontend_process:
                with open(temp_dir / "frontend_pid", "w") as f:
                    f.write(str(frontend_process.pid))
                utils.print_success(f"Frontend started with PID: {frontend_process.pid}")
            
            # Change back to project root
            os.chdir("..")
            
            # Wait a moment for frontend to start
            utils.print_info("Waiting for frontend to initialize...")
            time.sleep(7)
            
            # Open browser to frontend URL
            frontend_url = f"http://localhost:{frontend_port}"
            utils.print_info(f"Opening browser to {frontend_url}...")
            try:
                webbrowser.open(frontend_url)
            except Exception as e:
                utils.print_warning(f"Could not open browser automatically: {str(e)}")
                utils.print_info(f"Please open {frontend_url} manually in your browser.")
        
        utils.print_success("Application started successfully!")
        utils.print_info("The application is now running in the background.")
        
        # Add information about logs
        if sys.platform.startswith('win'):
            utils.print_info(f"Server logs are being saved to:")
            utils.print_info(f"  - Backend: {temp_dir/'backend_output.log'}")
            utils.print_info(f"  - Frontend: {temp_dir/'frontend_output.log'}")
        
        # Add cleanup info
        utils.print_info(f"Process IDs have been saved to {temp_dir}/backend_pid and {temp_dir}/frontend_pid files.")
        
        utils.print_colored("\nPress Ctrl+C to stop the application and return to the command prompt...", "yellow", bold=True)
        print()  # Extra line for readability
        
        # Keep the main process running until user interrupts with Ctrl+C
        try:
            # Initial delay to allow processes to fully start
            time.sleep(5)
            
            # Monitor processes
            while True:
                # Check if processes are still running
                backend_running = backend_process and backend_process.poll() is None
                frontend_running = frontend_process and frontend_process.poll() is None
                
                # Check process status
                if not backend_running and not frontend_running:
                    utils.print_error("Both backend and frontend processes have stopped.")
                    
                    # Read error logs to provide more information
                    try:
                        with open(temp_dir / "backend_error.log", "r", encoding="utf-8") as f:
                            backend_errors = f.read().strip()
                        if backend_errors:
                            utils.print_info("Backend error log:")
                            print(f"\n{backend_errors[:500]}..." if len(backend_errors) > 500 else f"\n{backend_errors}")
                    except Exception as e:
                        utils.print_warning(f"Could not read backend error log: {str(e)}")
                    
                    try:
                        with open(temp_dir / "frontend_error.log", "r", encoding="utf-8") as f:
                            frontend_errors = f.read().strip()
                        if frontend_errors:
                            utils.print_info("Frontend error log:")
                            print(f"\n{frontend_errors[:500]}..." if len(frontend_errors) > 500 else f"\n{frontend_errors}")
                    except Exception as e:
                        utils.print_warning(f"Could not read frontend error log: {str(e)}")
                    
                    break
                elif not backend_running:
                    utils.print_error("Backend process has stopped.")
                    
                    # Check backend exit code
                    if hasattr(backend_process, 'returncode') and backend_process.returncode is not None:
                        utils.print_info(f"Backend exit code: {backend_process.returncode}")
                    
                    # Read backend error log
                    try:
                        with open(temp_dir / "backend_error.log", "r", encoding="utf-8") as f:
                            backend_errors = f.read().strip()
                        if backend_errors:
                            utils.print_info("Backend error log:")
                            print(f"\n{backend_errors[:500]}..." if len(backend_errors) > 500 else f"\n{backend_errors}")
                    except Exception as e:
                        utils.print_warning(f"Could not read backend error log: {str(e)}")
                    
                    # Let the user decide whether to continue with just the frontend
                    if frontend_running:
                        utils.print_warning("Frontend is still running. Press Ctrl+C to stop completely.")
                        utils.print_info(f"Frontend is available at: http://localhost:{frontend_port}")
                        
                        # Adjust monitoring to only check frontend since we know backend is down
                        while True:
                            frontend_still_running = frontend_process and frontend_process.poll() is None
                            if not frontend_still_running:
                                utils.print_error("Frontend process has also stopped.")
                                break
                            
                            # Wait for user to press Ctrl+C
                            try:
                                time.sleep(5)
                            except KeyboardInterrupt:
                                utils.print_colored("\nStopping remaining processes...", "yellow", bold=True)
                                if frontend_process and frontend_process.poll() is None:
                                    frontend_process.terminate()
                                    utils.print_info("Frontend process terminated.")
                                utils.print_success("Application stopped successfully.")
                                return True
                        
                        # Only reach here if frontend also stopped on its own
                        break
                    else:
                        break
                
                elif not frontend_running:
                    utils.print_error("Frontend process has stopped.")
                    
                    # Check frontend exit code
                    if hasattr(frontend_process, 'returncode') and frontend_process.returncode is not None:
                        utils.print_info(f"Frontend exit code: {frontend_process.returncode}")
                    
                    # Read frontend error log
                    try:
                        with open(temp_dir / "frontend_error.log", "r", encoding="utf-8") as f:
                            frontend_errors = f.read().strip()
                        if frontend_errors:
                            utils.print_info("Frontend error log:")
                            print(f"\n{frontend_errors[:500]}..." if len(frontend_errors) > 500 else f"\n{frontend_errors}")
                    except Exception as e:
                        utils.print_warning(f"Could not read frontend error log: {str(e)}")
                    
                    # Let the user decide whether to continue with just the backend
                    if backend_running:
                        utils.print_warning("Backend is still running. Press Ctrl+C to stop completely.")
                        utils.print_info(f"Backend API is available at: http://localhost:{backend_port}")
                        
                        # Adjust monitoring to only check backend since we know frontend is down
                        while True:
                            backend_still_running = backend_process and backend_process.poll() is None
                            if not backend_still_running:
                                utils.print_error("Backend process has also stopped.")
                                break
                            
                            # Wait for user to press Ctrl+C
                            try:
                                time.sleep(5)
                            except KeyboardInterrupt:
                                utils.print_colored("\nStopping remaining processes...", "yellow", bold=True)
                                if backend_process and backend_process.poll() is None:
                                    backend_process.terminate()
                                    utils.print_info("Backend process terminated.")
                                utils.print_success("Application stopped successfully.")
                                return True
                        
                        # Only reach here if backend also stopped on its own
                        break
                    else:
                        break
                
                # Sleep to avoid high CPU usage
                time.sleep(2)
        except KeyboardInterrupt:
            utils.print_colored("\nStopping application processes...", "yellow", bold=True)
            
            # Terminate processes if they're still running
            if backend_process and backend_process.poll() is None:
                backend_process.terminate()
                utils.print_info("Backend process terminated.")
            
            if frontend_process and frontend_process.poll() is None:
                frontend_process.terminate()
                utils.print_info("Frontend process terminated.")
            
            utils.print_success("Application stopped successfully.")
        
        return True
    except Exception as e:
        utils.print_error(f"Failed to start application: {str(e)}")
        
        # Show more detailed error if verbose is enabled
        if config.get("verbose", False):
            import traceback
            traceback.print_exc()
        
        # Try to clean up processes
        if backend_process and backend_process.poll() is None:
            backend_process.terminate()
            utils.print_info("Backend process terminated.")
            
        if frontend_process and frontend_process.poll() is None:
            frontend_process.terminate()
            utils.print_info("Frontend process terminated.")
            
        utils.print_error("Application failed to start properly.")
        return False

def run_setup_mode(config: Dict[str, Any] = None) -> int:
    """
    Run setup mode and return exit code.
    
    Args:
        config: Setup configuration
    
    Returns:
        int: Exit code (0 for success, non-zero for failure)
    """
    # Check prerequisites
    if not check_prerequisites(config):
        return 1
    
    # Run full setup
    result = run_setup(config)
    return 0 if result["success"] else 1


def main():
    """Run orchestrator in setup mode."""
    config = config_module.get_complete_config()
    
    if config.get("check_only", False):
        sys.exit(run_check(config))
    else:
        sys.exit(run_setup_mode(config))


if __name__ == "__main__":
    main()