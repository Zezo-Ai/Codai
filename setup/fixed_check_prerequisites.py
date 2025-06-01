"""
A fixed version of the check_prerequisites function for orchestrator.py
"""

def check_prerequisites(config=None, utils=None, environment=None, requirements=None):
    """
    Check all prerequisites before running setup.
    
    Args:
        config: Setup configuration
    
    Returns:
        bool: True if all prerequisites are met, False otherwise
    """
    utils.print_header("Prerequisites Check")
    
    # Run environment check
    env_result = environment.check(config)
    if env_result:
        utils.print_error("Environment prerequisites not met:")
        for issue in env_result:
            utils.print_error(f"- {issue}")
        return False
    
    # Run ALL requirements check - including checking for Python packages
    # Get the full raw results, not just the issues summary
    raw_results = requirements.check_all_requirements(config.get("check_frontend", True) if config else True)
    
    # Manually check for missing packages
    missing_packages = []
    for result in raw_results.get("python", []):
        if not result["passed"] and "Python Package:" in result["name"] and result.get("package_install", True):
            package_name = result["name"].replace("Python Package: ", "")
            if package_name in ["fastapi", "uvicorn", "python-multipart", "pyyaml"]:
                missing_packages.append(package_name)
    
    # Only continue with package installation if there are missing packages
    if missing_packages:
        utils.print_warning("Missing required Python packages:")
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