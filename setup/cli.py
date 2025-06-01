"""
Command Line Interface Module

Provides a user-friendly CLI for the setup system.
"""

import sys
import argparse
import os
from typing import Dict, List, Optional, Any

from . import utils
from . import orchestrator
from . import config as config_module
from . import environment, ports, requirements, backend, frontend, validation


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments.
    
    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="CODAI Setup System",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    # Add subparsers for different commands
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Setup command
    setup_parser = subparsers.add_parser("setup", help="Run full setup process")
    
    # Add setup arguments
    setup_parser.add_argument(
        "--skip-backend", action="store_true",
        help="Skip backend setup"
    )
    setup_parser.add_argument(
        "--skip-frontend", action="store_true",
        help="Skip frontend setup"
    )
    setup_parser.add_argument(
        "--skip-vscode", action="store_true",
        help="Skip VS Code configuration"
    )
    setup_parser.add_argument(
        "--backend-port", type=int,
        help="Backend port number"
    )
    setup_parser.add_argument(
        "--frontend-port", type=int,
        help="Frontend port number"
    )
    setup_parser.add_argument(
        "--verbose", action="store_true",
        help="Enable verbose output"
    )
    setup_parser.add_argument(
        "--auto-run", action="store_true",
        help="Automatically run application after setup (default)"
    )
    setup_parser.add_argument(
        "--no-auto-run", action="store_true",
        help="Do not automatically run application after setup"
    )
    
    # Check command
    check_parser = subparsers.add_parser("check", help="Check system configuration")
    
    # Add check arguments
    check_parser.add_argument(
        "--verbose", action="store_true",
        help="Enable verbose output"
    )
    
    # Environment command
    env_parser = subparsers.add_parser("env", help="Display environment information")
    
    # Ports command
    ports_parser = subparsers.add_parser("ports", help="Display port information")
    ports_parser.add_argument(
        "--backend-port", type=int,
        help="Backend port number"
    )
    ports_parser.add_argument(
        "--frontend-port", type=int,
        help="Frontend port number"
    )
    
    # Requirements command
    req_parser = subparsers.add_parser("requirements", help="Check system requirements")
    
    # Backend command
    backend_parser = subparsers.add_parser("backend", help="Set up backend")
    backend_parser.add_argument(
        "--skip-vscode", action="store_true",
        help="Skip VS Code configuration"
    )
    
    # Frontend command
    frontend_parser = subparsers.add_parser("frontend", help="Set up frontend")
    frontend_parser.add_argument(
        "--skip-vscode", action="store_true",
        help="Skip VS Code configuration"
    )
    frontend_parser.add_argument(
        "--backend-port", type=int,
        help="Backend port number"
    )
    
    # Validation command
    validation_parser = subparsers.add_parser("validation", help="Validate system configuration")
    
    # Default to setup command if no command specified
    if len(sys.argv) == 1:
        return parser.parse_args(["setup"])
    
    return parser.parse_args()


def convert_args_to_config(args: argparse.Namespace) -> Dict[str, Any]:
    """
    Convert command-line arguments to configuration dictionary.
    
    Args:
        args: Parsed command-line arguments
    
    Returns:
        Dict with configuration overrides
    """
    overrides = {}
    
    # Common arguments
    if hasattr(args, "verbose"):
        overrides["verbose"] = args.verbose
    
    # Setup-specific arguments
    if hasattr(args, "skip_backend") and args.skip_backend:
        overrides["setup_backend"] = False
    
    if hasattr(args, "skip_frontend") and args.skip_frontend:
        overrides["setup_frontend"] = False
    
    if hasattr(args, "skip_vscode") and args.skip_vscode:
        overrides["configure_vscode"] = False
    
    if hasattr(args, "backend_port") and args.backend_port:
        overrides["backend_port"] = args.backend_port
    
    if hasattr(args, "frontend_port") and args.frontend_port:
        overrides["frontend_port"] = args.frontend_port
        
    # Auto-run settings
    if hasattr(args, "auto_run") and args.auto_run:
        overrides["auto_run"] = True
        
    if hasattr(args, "no_auto_run") and args.no_auto_run:
        overrides["auto_run"] = False
    
    return overrides


def run_env_command() -> int:
    """
    Run environment command.
    
    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    env_info = environment.detect_environment()
    environment.print_environment_summary(env_info)
    return 0


def run_ports_command(config: Dict[str, Any]) -> int:
    """
    Run ports command.
    
    Args:
        config: Setup configuration
    
    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    port_config = ports.initialize(config)
    ports.print_port_summary(port_config)
    return 0


def run_requirements_command() -> int:
    """
    Run requirements command.
    
    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    results = requirements.check_all_requirements()
    requirements.print_requirements_results(results)
    return 0


def run_backend_command(config: Dict[str, Any]) -> int:
    """
    Run backend command.
    
    Args:
        config: Setup configuration
    
    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    result = backend.configure(config)
    return 0 if result["success"] else 1


def run_frontend_command(config: Dict[str, Any]) -> int:
    """
    Run frontend command.
    
    Args:
        config: Setup configuration
    
    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    result = frontend.configure(config)
    return 0 if result["success"] else 1


def run_validation_command(config: Dict[str, Any]) -> int:
    """
    Run validation command.
    
    Args:
        config: Setup configuration
    
    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    results = validation.validate_all(config)
    validation.print_validation_results(results)
    return 0 if results["valid"] else 1


def main() -> int:
    """
    Main entry point for CLI.
    
    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    # Initialize config to ensure it's defined even in error cases
    config = {"verbose": False}
    
    try:
        # Clear the console for a clean start
        utils.clear_console()
        
        # Re-enable console logging with our cleaner format
        from . import logging_config
        logging_config.initialize_logging({
            "log_level": "info",
            "log_console": True,  # Enable console logging
            "log_file": True,
            "log_json": False
        })
        
        # Parse arguments
        args = parse_args()
        
        # Get configuration with overrides
        arg_overrides = convert_args_to_config(args)
        config = config_module.get_complete_config()
        config.update(arg_overrides)
        
        # Run appropriate command
        if args.command == "setup":
            return orchestrator.run_setup_mode(config)
        elif args.command == "check":
            return orchestrator.run_check(config)
        elif args.command == "env":
            return run_env_command()
        elif args.command == "ports":
            return run_ports_command(config)
        elif args.command == "requirements":
            return run_requirements_command()
        elif args.command == "backend":
            return run_backend_command(config)
        elif args.command == "frontend":
            return run_frontend_command(config)
        elif args.command == "validation":
            return run_validation_command(config)
        else:
            # Default to setup command
            return orchestrator.run_setup_mode(config)
    
    except KeyboardInterrupt:
        # Try to use themed output but fall back to simple print if needed
        try:
            from . import theme
            theme.print_box("Setup cancelled by user", "Operation Cancelled", color="warning")
        except Exception:
            utils.print_colored("\nSetup cancelled by user.", "yellow", bold=True)
        return 1
    
    except Exception as e:
        # Try to use themed error display but fall back to simpler methods if needed
        try:
            from . import theme
            error_details = [
                f"Error type: {type(e).__name__}",
                f"Message: {str(e)}",
            ]
            
            if config.get("verbose", False):
                import traceback
                import io
                tb_stream = io.StringIO()
                traceback.print_exc(file=tb_stream)
                tb_string = tb_stream.getvalue()
                error_details.append("\nTraceback:")
                error_details.extend(tb_string.split('\n'))
                
            theme.print_box("\n".join(error_details), "Setup Error", color="error")
        except Exception:
            # Ultimate fallback if themed output fails
            utils.print_error(f"Error during setup: {str(e)}")
            if config.get("verbose", False):
                import traceback
                traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())