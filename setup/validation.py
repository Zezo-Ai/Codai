"""
Validation Module

Performs cross-component validation to ensure that all parts of the 
system are properly configured and work together correctly.
"""

import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Union

from . import utils
from . import environment
from . import ports
from . import requirements
from . import backend
from . import frontend
from . import config as config_module

# Type aliases
ValidationResult = Dict[str, Any]


class ValidationError(Exception):
    """Exception raised for validation errors."""
    pass


def validate_environment(config: Dict[str, Any] = None) -> ValidationResult:
    """
    Validate environment configuration.
    
    Args:
        config: Setup configuration
    
    Returns:
        ValidationResult: Validation result
    """
    # Get validation result from environment module
    result = environment.validate(config)
    
    return {
        "component": "environment",
        "valid": result["valid"],
        "issues": result["issues"]
    }


def validate_ports(config: Dict[str, Any] = None) -> ValidationResult:
    """
    Validate port configuration.
    
    Args:
        config: Setup configuration
    
    Returns:
        ValidationResult: Validation result
    """
    # Get validation result from ports module
    result = ports.validate(config)
    
    return {
        "component": "ports",
        "valid": result["valid"],
        "issues": result["issues"]
    }


def validate_requirements(config: Dict[str, Any] = None) -> ValidationResult:
    """
    Validate system requirements.
    
    Args:
        config: Setup configuration
    
    Returns:
        ValidationResult: Validation result
    """
    # Get validation result from requirements module
    result = requirements.validate(config)
    
    return {
        "component": "requirements",
        "valid": result["valid"],
        "issues": result["issues"]
    }


def validate_backend(config: Dict[str, Any] = None) -> ValidationResult:
    """
    Validate backend configuration.
    
    Args:
        config: Setup configuration
    
    Returns:
        ValidationResult: Validation result
    """
    # Get validation result from backend module
    result = backend.validate(config)
    
    return {
        "component": "backend",
        "valid": result["valid"],
        "issues": result["issues"]
    }


def validate_frontend(config: Dict[str, Any] = None) -> ValidationResult:
    """
    Validate frontend configuration.
    
    Args:
        config: Setup configuration
    
    Returns:
        ValidationResult: Validation result
    """
    # Get validation result from frontend module
    result = frontend.validate(config)
    
    # Skip frontend validation if setup_frontend is False
    if config and not config.get("setup_frontend", True):
        return {
            "component": "frontend",
            "valid": True,
            "issues": [],
            "skipped": True
        }
    
    return {
        "component": "frontend",
        "valid": result["valid"],
        "issues": result["issues"]
    }


def validate_backend_frontend_connection(config: Dict[str, Any] = None) -> ValidationResult:
    """
    Validate connection between backend and frontend.
    
    Args:
        config: Setup configuration
    
    Returns:
        ValidationResult: Validation result
    """
    issues = []
    
    # Skip if frontend setup is disabled
    if config and not config.get("setup_frontend", True):
        return {
            "component": "connectivity",
            "valid": True,
            "issues": [],
            "skipped": True
        }
    
    if config is None:
        config = config_module.get_default_config()
    
    # Get port configuration (use ports module defaults)
    backend_port = config.get("backend_port", ports.DEFAULT_BACKEND_PORT)
    backend_host = config.get("backend_host", "127.0.0.1")
    frontend_dir = Path(config.get("frontend_dir", utils.PROJECT_ROOT / "frontend"))
    
    # Check if ports are available
    if ports.check_port_in_use(backend_port, backend_host):
        issues.append(f"Backend port {backend_port} is in use")
    
    # No need to check frontend environment files anymore
    # Frontend defaults to http://localhost:8000 if NEXT_PUBLIC_API_BASE is not set
    # This matches our default backend port
    
    return {
        "component": "connectivity",
        "valid": len(issues) == 0,
        "issues": issues
    }


def validate_all(config: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Validate all components.
    
    Args:
        config: Setup configuration
    
    Returns:
        Dict with combined validation results
    """
    if config is None:
        config = config_module.get_default_config()
    
    # Run all validation functions with error handling
    results = {}
    
    # Define validation functions to run
    validations = {
        "environment": validate_environment,
        "requirements": validate_requirements,
        "ports": validate_ports,
        "backend": validate_backend,
        "frontend": validate_frontend,
        "connectivity": validate_backend_frontend_connection,
    }
    
    # Run each validation with error handling
    for component, validation_func in validations.items():
        try:
            results[component] = validation_func(config)
        except Exception as e:
            utils.print_error(f"Error in {component} validation: {str(e)}")
            # Provide a valid result structure even on error
            results[component] = {
                "component": component,
                "valid": False,
                "issues": [f"Validation error: {str(e)}"],
                "error": str(e)
            }
    
    # Check if any components have issues
    all_valid = all(result["valid"] for result in results.values())
    
    # Collect all issues
    all_issues = []
    for component, result in results.items():
        if not result["valid"]:
            for issue in result.get("issues", []):
                all_issues.append(f"{component}: {issue}")
    
    return {
        "results": results,
        "valid": all_valid,
        "issues": all_issues
    }


def print_validation_results(results: Dict[str, Any]) -> None:
    """
    Print validation results.
    
    Args:
        results: Validation results from validate_all()
    """
    utils.print_header("Validation Results")
    
    # Print results for each component
    for component, result in results["results"].items():
        skipped = result.get("skipped", False)
        
        if skipped:
            utils.print_colored(f"\n{component.capitalize()} Validation:", "cyan", bold=True)
            utils.print_info("Skipped")
            continue
        
        if result["valid"]:
            utils.print_colored(f"\n{component.capitalize()} Validation:", "cyan", bold=True)
            utils.print_success("All checks passed")
        else:
            utils.print_colored(f"\n{component.capitalize()} Validation:", "cyan", bold=True)
            utils.print_error(f"Found {len(result['issues'])} issues:")
            
            for issue in result["issues"]:
                utils.print_error(f"- {issue}")
    
    # Print overall result
    utils.print_colored("\nOverall Validation:", "cyan", bold=True)
    
    if results["valid"]:
        utils.print_success("All components are properly configured!")
    else:
        utils.print_error(f"Found {len(results['issues'])} issues across all components:")
        
        for issue in results["issues"]:
            utils.print_error(f"- {issue}")


def initialize(config=None) -> Dict[str, Any]:
    """
    Initialize the validation module.
    
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
    Perform validation checks without making changes.
    
    Args:
        config: Optional configuration
    
    Returns:
        List of issues (empty if all validations pass)
    """
    results = validate_all(config)
    return results["issues"]


def configure(config=None) -> Dict[str, Any]:
    """
    Configure validation system.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with configuration results
    """
    # Validation module doesn't configure anything
    results = validate_all(config)
    
    return {
        "success": results["valid"],
        "message": "Validation complete",
        "data": results
    }


def validate(config=None) -> Dict[str, Any]:
    """
    Validate all components.
    
    Args:
        config: Optional configuration
    
    Returns:
        Dict with validation results
    """
    results = validate_all(config)
    
    return {
        "valid": results["valid"],
        "issues": results["issues"]
    }


def cleanup(config=None) -> None:
    """
    Clean up validation resources.
    
    Args:
        config: Optional configuration
    """
    # Nothing to clean up for validation module
    pass


def main():
    """Run validation and print results."""
    results = validate_all()
    print_validation_results(results)


if __name__ == "__main__":
    main()