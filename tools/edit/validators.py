from pathlib import Path
from typing import Literal, get_args
from ..base import ToolError
from ..logging_utils import log_path_operation, PathActionLogger

Command = Literal[
    "view",
    "create",
    "str_replace",
    "insert",
]

OutputFormat = Literal["cli", "web"]

class PathValidator:
    """Handles path validation logic exactly as in original EditTool."""
    
    logger = PathActionLogger()  # Class-level logger for validation operations

    @staticmethod
    @log_path_operation("validation")
    def validate_path(command: str, path: Path):
        """Check that the path/command combination is valid."""
        PathValidator.logger.log_path_action(
            "validation_started", path, command,
            details="Starting path validation"
        )
        
        # Check if its an absolute path
        if not path.is_absolute():
            suggested_path = Path("") / path
            error_msg = f"Path {path} is not absolute, suggested: {suggested_path}"
            PathValidator.logger.log_path_action(
                "validation_failed", path, command,
                status="Failed", error=error_msg
            )
            raise ToolError(
                f"The path {path} is not an absolute path, it should start with `/`. Maybe you meant {suggested_path}?"
            )
            
        # Check if path exists
        if not path.exists() and command != "create":
            error_msg = f"Path {path} does not exist"
            PathValidator.logger.log_path_action(
                "validation_failed", path, command,
                status="Failed", error=error_msg
            )
            raise ToolError(
                f"The path {path} does not exist. Please provide a valid path."
            )
            
        if path.exists() and command == "create":
            error_msg = f"Path {path} already exists, cannot create"
            PathValidator.logger.log_path_action(
                "validation_failed", path, command,
                status="Failed", error=error_msg
            )
            raise ToolError(
                f"File already exists at: {path}. Cannot overwrite files using command `create`."
            )
            
        # Check if the path points to a directory
        if path.is_dir():
            if command != "view":
                error_msg = f"Path {path} is a directory, command {command} not allowed"
                PathValidator.logger.log_path_action(
                    "validation_failed", path, command,
                    status="Failed", error=error_msg
                )
                raise ToolError(
                    f"The path {path} is a directory and only the `view` command can be used on directories"
                )

        PathValidator.logger.log_path_action(
            "validation_success", path, command,
            details="Path validation completed successfully"
        )

    @staticmethod
    def validate_command(command: str) -> None:
        """Validate the command is supported."""
        PathValidator.logger.log_path_action(
            "command_validation", Path("."), command,
            details="Validating command"
        )
        
        if command not in get_args(Command):
            error_msg = f"Command {command} not recognized"
            PathValidator.logger.log_path_action(
                "command_validation", Path("."), command,
                status="Failed", error=error_msg
            )
            raise ToolError(
                f'Unrecognized command {command}. The allowed commands are: {", ".join(get_args(Command))}'
            )
            
        PathValidator.logger.log_path_action(
            "command_validation", Path("."), command,
            details="Command validation successful"
        )

    @staticmethod
    def validate_format(output_format: str) -> None:
        """Validate the output format is supported."""
        if output_format not in get_args(OutputFormat):
            raise ToolError(
                f'Unrecognized output format: {output_format}. '
                f'The allowed formats are: {", ".join(get_args(OutputFormat))}'
            )