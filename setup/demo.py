"""
Demo script to showcase the enhanced setup capabilities.

This script demonstrates:
1. Enhanced logging
2. Interactive troubleshooting
3. Transaction-based resilience
"""

import os
import sys
from pathlib import Path

# Add parent directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from setup import utils
from setup import logging_config
from setup import troubleshooter
from setup import resilience


def main():
    """Demo the enhanced setup capabilities."""
    utils.print_header("Enhanced Setup Capabilities Demo")
    
    # Initialize logging
    logger = logging_config.initialize_logging({
        "log_level": "debug",
        "log_console": True,
        "log_file": True,
        "log_json": False
    })
    
    utils.print_colored("\n1. Enhanced Logging Demonstration", "blue", bold=True)
    utils.print_info("Logging various message types at different levels...")
    
    logger.debug("This is a debug message with detailed information")
    logger.info("This is an informational message about normal operation")
    logger.warning("This is a warning message about a potential issue")
    logger.error("This is an error message about a problem")
    
    # Add some context
    logging_config.log_step_start("Demo Step", "This is a demonstration step")
    logging_config.log_step_end("Demo Step", True, "Step completed successfully", 0.5)
    
    utils.print_success("Logs have been written to: " + str(logging_config.LOG_FILEPATH))
    
    # Transaction-based resilience
    utils.print_colored("\n2. Transaction-based Resilience Demonstration", "blue", bold=True)
    
    # Create a demo transaction
    demo_transaction = resilience.SetupTransaction("demo_transaction")
    
    # Add some operations
    demo_transaction.add_operation(
        operation=lambda: utils.print_success("Operation 1 executed successfully") or True,
        rollback=lambda: utils.print_info("Rolling back operation 1"),
        description="Execute operation 1"
    )
    
    demo_transaction.add_operation(
        operation=lambda: utils.print_success("Operation 2 executed successfully") or True,
        rollback=lambda: utils.print_info("Rolling back operation 2"),
        description="Execute operation 2"
    )
    
    # Add a failing operation to demonstrate rollback
    if utils.get_user_confirmation("Add a failing operation to demonstrate rollback?", default=True):
        demo_transaction.add_operation(
            operation=lambda: utils.print_error("Operation 3 failed!") or False or True,  # Will raise an exception
            rollback=lambda: utils.print_info("Rolling back operation 3"),
            description="Execute operation 3 (will fail)"
        )
    
    # Execute the transaction
    utils.print_info("Executing the transaction...")
    demo_transaction.execute()
    
    # Interactive troubleshooting
    utils.print_colored("\n3. Interactive Troubleshooting Demonstration", "blue", bold=True)
    
    if utils.get_user_confirmation("Would you like to explore the troubleshooter?", default=True):
        # Demonstrate different troubleshooting scenarios
        issues = [
            ("package_installation_failed", {"packages": ["aiohttp", "beautifulsoup4"]}),
            ("venv_creation_failed", {"venv_path": ".venv"}),
            ("port_in_use", {"port": 3000}),
            ("poetry_failed", {})
        ]
        
        utils.print_info("Available troubleshooting scenarios:")
        for i, (issue_id, _) in enumerate(issues, 1):
            utils.print_info(f"{i}. {issue_id}")
        
        try:
            choice = int(input("Select a scenario (1-4): "))
            if 1 <= choice <= len(issues):
                issue_id, context = issues[choice-1]
                utils.print_info(f"Starting troubleshooter for: {issue_id}")
                troubleshooter.troubleshoot_issue(issue_id, context)
            else:
                utils.print_warning("Invalid choice. Skipping troubleshooting demo.")
        except ValueError:
            utils.print_warning("Invalid input. Skipping troubleshooting demo.")
    
    utils.print_colored("\nDemo Completed!", "green", bold=True)
    utils.print_info("This demo showcased:")
    utils.print_info("1. Enhanced logging with different levels and structured data")
    utils.print_info("2. Transaction-based approach with automatic rollback")
    utils.print_info("3. Interactive troubleshooting for common issues")
    utils.print_info("\nThese capabilities make the setup process more informative and resilient.")


if __name__ == "__main__":
    main()