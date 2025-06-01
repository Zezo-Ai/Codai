"""
Utilities Module

Shared utility functions used across the setup modules.
Provides common functionality for logging, file handling, process execution,
and user interaction.
"""

import os
import sys
import subprocess
import logging
import shutil
import time
import socket
from typing import Dict, List, Optional, Union, Any, Tuple, Callable
from pathlib import Path
import platform

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("setup")

# Enhanced progress tracking
from threading import Thread, Event
import itertools
import sys

# Constants
PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_TIMEOUT = 300  # seconds (increased from 60 to 300 for long-running operations)

# Type definitions
CommandResult = Dict[str, Any]
PathLike = Union[str, Path]


class SetupError(Exception):
    """Base exception for setup-related errors."""
    pass


class CommandError(SetupError):
    """Exception raised when a command fails."""
    def __init__(self, command: str, return_code: int, output: str = "", error: str = ""):
        self.command = command
        self.return_code = return_code
        self.output = output
        self.error = error
        message = f"Command '{command}' failed with return code {return_code}"
        if error:
            message += f": {error}"
        super().__init__(message)


class ValidationError(SetupError):
    """Exception raised when validation fails."""
    def __init__(self, message: str, context: Dict[str, Any] = None):
        self.context = context or {}
        super().__init__(message)


def supports_color() -> bool:
    """
    Determine if the current terminal supports color output.
    
    Returns:
        bool: True if color is supported, False otherwise
    """
    # If NO_COLOR environment variable exists, no color
    if os.environ.get("NO_COLOR", ""):
        return False
        
    # If FORCE_COLOR exists, force color
    if os.environ.get("FORCE_COLOR", ""):
        return True
        
    # Windows detection
    if platform.system() == "Windows":
        # Windows Terminal and VS Code support colors
        if (os.environ.get("WT_SESSION") or 
            os.environ.get("TERM_PROGRAM") == "vscode"):
            return True
            
        # Check for ANSICON which enables ANSI on older Windows
        if os.environ.get("ANSICON", ""):
            return True
            
        # Check for ConEmu 
        if os.environ.get("ConEmuANSI") == "ON":
            return True
            
        # Windows 10 may support ANSI natively
        try:
            return (
                os.isatty(sys.stdout.fileno()) and 
                sys.getwindowsversion()[0] >= 10
            )
        except (AttributeError, OSError):
            return False
    
    # Check for non-Windows terminals
    if os.environ.get("TERM") == "dumb":
        return False
        
    # Most Unix terminals support color
    return os.isatty(sys.stdout.fileno())


def print_colored(message: str, color: str = None, bold: bool = False, end: str = '\n') -> None:
    """
    Print text with ANSI color codes if the terminal supports it.
    
    Args:
        message: The message to print
        color: Color name ('red', 'green', 'yellow', 'blue', 'magenta', 'cyan')
        bold: Whether to print in bold
        end: String appended after the last value, default a newline
    """
    colors = {
        "black": "\033[30m",
        "red": "\033[31m",
        "green": "\033[32m",
        "yellow": "\033[33m",
        "blue": "\033[34m", 
        "magenta": "\033[35m",
        "cyan": "\033[36m",
        "white": "\033[37m",
        None: ""
    }
    
    bold_code = "\033[1m" if bold else ""
    reset = "\033[0m"
    
    if supports_color() and color in colors:
        print(f"{bold_code}{colors[color]}{message}{reset}", end=end)
    else:
        print(message, end=end)


def print_header(title: str, width: int = 80) -> None:
    """
    Print a formatted header.
    
    Args:
        title: The header title
        width: Width of the header in characters
    """
    print_colored("=" * width, "cyan", bold=True)
    padding = max(0, (width - len(title) - 4) // 2)
    print_colored(" " * padding + f"[ {title} ]" + " " * padding, "cyan", bold=True)
    print_colored("=" * width, "cyan", bold=True)


def print_step(step: int, total: int, description: str) -> None:
    """
    Print a step indicator.
    
    Args:
        step: Current step number
        total: Total number of steps
        description: Step description
    """
    print_colored(f"\n[{step}/{total}] {description}", "blue", bold=True)


def print_success(message: str) -> None:
    """
    Print a success message.
    
    Args:
        message: The success message
    """
    print_colored(f"✓ {message}", "green")


def print_warning(message: str) -> None:
    """
    Print a warning message.
    
    Args:
        message: The warning message
    """
    print_colored(f"! {message}", "yellow")


def print_error(message: str) -> None:
    """
    Print an error message.
    
    Args:
        message: The error message
    """
    print_colored(f"✗ {message}", "red", bold=True)


def print_info(message: str) -> None:
    """
    Print an informational message.
    
    Args:
        message: The information message
    """
    print_colored(f"• {message}", "cyan")


def run_command(
    command: Union[str, List[str]],
    shell: bool = True,
    capture_output: bool = True,
    timeout: int = DEFAULT_TIMEOUT,
    check: bool = False,
    cwd: PathLike = None,
    env: Dict[str, str] = None
) -> CommandResult:
    """
    Run a shell command and return the result.
    
    Args:
        command: Command string or list of arguments
        shell: Whether to run the command through the shell
        capture_output: Whether to capture stdout/stderr
        timeout: Timeout in seconds
        check: Whether to raise an exception on non-zero exit codes
        cwd: Working directory for the command
        env: Environment variables for the command
    
    Returns:
        Dictionary containing command result:
        {
            "success": bool,
            "return_code": int,
            "output": str,
            "error": str,
            "command": str
        }
    
    Raises:
        CommandError: If the command fails and check=True
        TimeoutExpired: If the command times out
    """
    environment = os.environ.copy()
    if env:
        environment.update(env)
    
    if isinstance(command, list) and shell:
        shell = False  # If command is a list, use subprocess directly

    cmd_str = command if isinstance(command, str) else " ".join(command)
    logger.debug(f"Running command: {cmd_str}")
    
    try:
        proc = subprocess.run(
            command,
            shell=shell,
            capture_output=capture_output,
            text=True,
            timeout=timeout,
            cwd=cwd,
            env=environment,
            check=False  # We'll handle errors ourselves
        )
        
        result = {
            "success": proc.returncode == 0,
            "return_code": proc.returncode,
            "output": proc.stdout if capture_output else "",
            "error": proc.stderr if capture_output else "",
            "command": cmd_str
        }
        
        if check and proc.returncode != 0:
            raise CommandError(cmd_str, proc.returncode, proc.stdout, proc.stderr)
            
        return result
    except subprocess.TimeoutExpired as e:
        logger.error(f"Command timed out after {timeout} seconds: {cmd_str}")
        if check:
            raise
        return {
            "success": False,
            "return_code": -1,
            "output": "",
            "error": f"Command timed out after {timeout} seconds",
            "command": cmd_str,
            "exception": str(e)
        }
    except Exception as e:
        logger.error(f"Error running command: {cmd_str} - {str(e)}")
        if check:
            raise
        return {
            "success": False,
            "return_code": -1,
            "output": "",
            "error": str(e),
            "command": cmd_str,
            "exception": str(e)
        }


def is_command_available(command: str) -> bool:
    """
    Check if a command is available in the system's PATH.
    
    Args:
        command: The command to check
    
    Returns:
        bool: True if the command is available, False otherwise
    """
    if platform.system() == "Windows":
        command_ext = f"{command}.exe"
        result = run_command(f"where {command}", shell=True, capture_output=True)
    else:
        command_ext = command
        result = run_command(f"which {command}", shell=True, capture_output=True)
    
    return result["success"]


def get_command_version(command: str) -> Optional[str]:
    """
    Get the version of a command.
    
    Args:
        command: The command to get the version for
    
    Returns:
        str: Version string or None if not available
    """
    result = run_command(f"{command} --version", shell=True, capture_output=True)
    if not result["success"]:
        return None
        
    # Try to extract version number
    output = result["output"]
    import re
    version_match = re.search(r"(\d+\.\d+\.\d+)", output)
    if version_match:
        return version_match.group(1)
    return output.strip()


def check_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """
    Check if a port is in use.
    
    Args:
        port: The port number to check
        host: The host to check
    
    Returns:
        bool: True if the port is in use, False otherwise
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0


def find_available_port(start_port: int, end_port: int = None, host: str = "127.0.0.1") -> Optional[int]:
    """
    Find an available port in the given range.
    
    Args:
        start_port: The port to start searching from
        end_port: The port to stop searching at (inclusive)
        host: The host to check
    
    Returns:
        int: Available port or None if no ports are available
    """
    if end_port is None:
        end_port = start_port + 100
        
    for port in range(start_port, end_port + 1):
        if not check_port_in_use(port, host):
            return port
            
    return None


def create_directory(path: PathLike, exist_ok: bool = True) -> Path:
    """
    Create a directory if it doesn't exist.
    
    Args:
        path: The directory path
        exist_ok: Whether it's okay if the directory already exists
    
    Returns:
        Path: The created directory path
    
    Raises:
        OSError: If the directory can't be created
    """
    path_obj = Path(path)
    path_obj.mkdir(parents=True, exist_ok=exist_ok)
    return path_obj


def write_file(path: PathLike, content: str, mode: str = "w") -> Path:
    """
    Write content to a file.
    
    Args:
        path: The file path
        content: The content to write
        mode: The file open mode
    
    Returns:
        Path: The file path
    
    Raises:
        OSError: If the file can't be written
    """
    path_obj = Path(path)
    with open(path_obj, mode, encoding="utf-8") as f:
        f.write(content)
    return path_obj


def read_file(path: PathLike, mode: str = "r") -> str:
    """
    Read content from a file.
    
    Args:
        path: The file path
        mode: The file open mode
    
    Returns:
        str: The file content
    
    Raises:
        OSError: If the file can't be read
    """
    path_obj = Path(path)
    with open(path_obj, mode, encoding="utf-8") as f:
        return f.read()


def copy_file(src: PathLike, dest: PathLike, overwrite: bool = True) -> Path:
    """
    Copy a file from source to destination.
    
    Args:
        src: The source file path
        dest: The destination file path
        overwrite: Whether to overwrite an existing destination
    
    Returns:
        Path: The destination path
    
    Raises:
        OSError: If the file can't be copied
    """
    src_path = Path(src)
    dest_path = Path(dest)
    
    if not src_path.exists():
        raise FileNotFoundError(f"Source file not found: {src_path}")
        
    if dest_path.exists() and not overwrite:
        raise FileExistsError(f"Destination file exists: {dest_path}")
        
    return Path(shutil.copy2(src_path, dest_path))


def is_path_writable(path: PathLike) -> bool:
    """
    Check if a path is writable.
    
    Args:
        path: The path to check
    
    Returns:
        bool: True if the path is writable, False otherwise
    """
    path_obj = Path(path)
    
    if path_obj.exists():
        return os.access(path_obj, os.W_OK)
    
    # Check if parent directory is writable
    parent = path_obj.parent
    return parent.exists() and os.access(parent, os.W_OK)


def wait_for_port(port: int, host: str = "127.0.0.1", timeout: int = 30) -> bool:
    """
    Wait for a port to become available or unavailable.
    
    Args:
        port: The port to wait for
        host: The host to check
        timeout: Maximum time to wait in seconds
    
    Returns:
        bool: True if the port became available/unavailable, False if timed out
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        if not check_port_in_use(port, host):
            return True
        time.sleep(0.5)
    return False


def get_terminal_size() -> Tuple[int, int]:
    """
    Get the terminal size.
    
    Returns:
        Tuple[int, int]: (width, height) of the terminal
    """
    try:
        columns, lines = shutil.get_terminal_size()
        return columns, lines
    except Exception:
        return 80, 24  # Default fallback values


def normalize_path(path: PathLike) -> Path:
    """
    Normalize a path for the current platform.
    
    Args:
        path: The path to normalize
    
    Returns:
        Path: The normalized path
    """
    return Path(path).expanduser().resolve()


def get_relative_path(path: PathLike, base: PathLike = None) -> Path:
    """
    Get a path relative to a base path.
    
    Args:
        path: The path to make relative
        base: The base path (defaults to current working directory)
    
    Returns:
        Path: The relative path
    """
    path_obj = Path(path).expanduser().resolve()
    base_obj = Path(base or os.getcwd()).expanduser().resolve()
    
    try:
        return path_obj.relative_to(base_obj)
    except ValueError:
        return path_obj  # Return absolute path if it can't be made relative


def get_python_executable() -> str:
    """
    Get the path to the current Python executable.
    
    Returns:
        str: Path to the Python executable
    """
    return sys.executable


class Spinner:
    """An improved spinner for showing progress during long-running operations."""
    
    def __init__(self, message="Processing", delay=0.1, chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'):
        self.spinner_cycle = itertools.cycle(chars)
        self.delay = delay
        self.busy = False
        self.spinner_visible = False
        self.thread = None
        self.stop_event = Event()
        self.message = message
        self.start_time = 0
        self.last_status = ""
    
    def set_message(self, message):
        """Change the spinner message."""
        self.message = message
    
    def append_status(self, status):
        """Add status text after the spinner message."""
        self.last_status = status
    
    def clear_status(self):
        """Clear the status text."""
        self.last_status = ""
    
    def _spin(self):
        """Spinning animation function."""
        while not self.stop_event.is_set():
            try:
                # Get terminal width
                width = get_terminal_size()[0]
                elapsed = time.time() - self.start_time
                mins, secs = divmod(int(elapsed), 60)
                
                # Format spinner line with timing
                if mins > 0:
                    time_str = f" [{mins}m {secs}s]"
                else:
                    time_str = f" [{secs}s]"
                
                # Format status text
                status_text = f" {self.last_status}" if self.last_status else ""
                
                # Calculate available space
                avail_space = width - len(self.message) - len(time_str) - 4
                if avail_space <= 0:
                    avail_space = 10  # Minimum space
                
                # Truncate status if needed
                if len(status_text) > avail_space:
                    status_text = status_text[:avail_space-3] + "..."
                
                # Write spinner and message
                spinner_char = next(self.spinner_cycle)
                sys.stdout.write("\r")
                sys.stdout.write(f"\033[36m{spinner_char}\033[0m {self.message}{time_str}{status_text}")
                sys.stdout.flush()
                
                time.sleep(self.delay)
            except Exception as e:
                # Handle exceptions gracefully
                break
    
    def __enter__(self):
        """Start spinner when entering context."""
        self.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Stop spinner when exiting context."""
        self.stop()
        if exc_type:
            # Mark failure
            sys.stdout.write("\r\033[31m✘\033[0m ")
            sys.stdout.write(f"{self.message} - Failed\n")
        else:
            # Mark success
            sys.stdout.write("\r\033[32m✓\033[0m ")
            elapsed = time.time() - self.start_time
            mins, secs = divmod(int(elapsed), 60)
            time_str = f"[{mins}m {secs}s]" if mins > 0 else f"[{secs}s]"
            sys.stdout.write(f"{self.message} - Completed {time_str}\n")
        sys.stdout.flush()
    
    def start(self):
        """Start the spinner."""
        if not supports_color() or not sys.stdout.isatty():
            sys.stdout.write(f"{self.message} ... ")
            sys.stdout.flush()
            self.start_time = time.time()
            return
            
        self.busy = True
        self.start_time = time.time()
        self.stop_event.clear()
        self.thread = Thread(target=self._spin)
        self.thread.daemon = True
        self.thread.start()
    
    def stop(self):
        """Stop the spinner."""
        if not supports_color() or not sys.stdout.isatty():
            elapsed = time.time() - self.start_time
            if elapsed > 2:  # Only show timing for operations that took more than 2 seconds
                mins, secs = divmod(int(elapsed), 60)
                time_str = f"({mins}m {secs}s)" if mins > 0 else f"({secs}s)"
                sys.stdout.write(f"Done {time_str}\n")
            else:
                sys.stdout.write("Done\n")
            sys.stdout.flush()
            return
            
        self.busy = False
        self.stop_event.set()
        if self.thread:
            self.thread.join()

def with_spinner(func: Callable, message: str, *args, **kwargs) -> Any:
    """
    Run a function with an enhanced spinner animation.
    
    Args:
        func: The function to run
        message: Message to display while running
        *args: Arguments to pass to the function
        **kwargs: Keyword arguments to pass to the function
    
    Returns:
        Any: The return value of the function
    """
    from threading import Thread
    from queue import Queue
    
    result_queue = Queue()
    error_queue = Queue()
    
    # Create spinner with the provided message
    spinner = Spinner(message)
    
    def target():
        try:
            result = func(*args, **kwargs)
            result_queue.put(result)
        except Exception as e:
            error_queue.put(e)
    
    # Start the thread and spinner
    thread = Thread(target=target)
    thread.daemon = True
    
    with spinner:
        thread.start()
        thread.join()
    
    # Check for errors
    if not error_queue.empty():
        error = error_queue.get()
        raise error
    
    # Return the result
    if not result_queue.empty():
        return result_queue.get()
    
    return None


def clear_console() -> None:
    """
    Clear the console screen.
    Works on Windows, macOS, and Linux.
    """
    try:
        # Check what platform we're on
        if platform.system() == "Windows":
            # Windows uses 'cls' command
            os.system('cls')
        else:
            # Unix, Linux, macOS use 'clear' command
            os.system('clear')
    except Exception:
        # If clearing fails for any reason, just print a newline for some spacing
        print("\n")


def get_user_confirmation(message: str, default: bool = False) -> bool:
    """
    Get user confirmation for an action.
    
    Args:
        message: Message to display
        default: Default response if user just presses Enter
    
    Returns:
        bool: True if confirmed, False otherwise
    """
    if default:
        prompt = f"{message} [Y/n]: "
        valid_responses = {"y": True, "yes": True, "": True, "n": False, "no": False}
    else:
        prompt = f"{message} [y/N]: "
        valid_responses = {"y": True, "yes": True, "": False, "n": False, "no": False}
    
    while True:
        try:
            response = input(prompt).lower()
            if response in valid_responses:
                return valid_responses[response]
            print_warning("Please answer 'y' or 'n'.")
        except KeyboardInterrupt:
            # Handle Ctrl+C gracefully
            print("\nOperation cancelled by user.")
            return False


def detect_incomplete_venv(venv_path: PathLike = None) -> Dict[str, Any]:
    """
    Detect if a virtual environment is incomplete or corrupted.
    
    Args:
        venv_path: Path to virtual environment (defaults to .venv in project root)
    
    Returns:
        Dict with:
        - exists: Whether venv folder exists
        - is_complete: Whether venv appears complete
        - issues: List of specific issues found
        - can_fix: Whether we can automatically fix it
    """
    if venv_path is None:
        venv_path = PROJECT_ROOT / ".venv"
    else:
        venv_path = Path(venv_path)
    
    result = {
        "exists": venv_path.exists(),
        "is_complete": True,
        "issues": [],
        "can_fix": True,
        "path": str(venv_path)
    }
    
    if not venv_path.exists():
        result["is_complete"] = False
        result["issues"].append("Virtual environment does not exist")
        return result
    
    # Check for essential files/directories
    essential_checks = [
        ("pyvenv.cfg", venv_path / "pyvenv.cfg", "file"),
        ("bin/Scripts directory", venv_path / ("Scripts" if platform.system() == "Windows" else "bin"), "directory"),
        ("lib directory", venv_path / "lib", "directory"),
    ]
    
    # Add platform-specific Python executable check
    bin_dir = venv_path / ("Scripts" if platform.system() == "Windows" else "bin")
    python_exe = "python.exe" if platform.system() == "Windows" else "python"
    essential_checks.append(("Python executable", bin_dir / python_exe, "file"))
    
    for name, path, path_type in essential_checks:
        if not path.exists():
            result["is_complete"] = False
            result["issues"].append(f"Missing {path_type}: {name}")
    
    # Check if venv is empty or nearly empty
    try:
        file_count = sum(1 for _ in venv_path.rglob("*") if _.is_file())
        if file_count < 10:  # Arbitrary threshold
            result["is_complete"] = False
            result["issues"].append(f"Virtual environment appears incomplete (only {file_count} files)")
    except Exception as e:
        result["issues"].append(f"Error scanning venv contents: {e}")
    
    return result


def cleanup_incomplete_venv(venv_path: PathLike = None, force: bool = False) -> bool:
    """
    Clean up an incomplete or corrupted virtual environment.
    
    Args:
        venv_path: Path to virtual environment (defaults to .venv in project root)
        force: Skip confirmation prompt
    
    Returns:
        bool: True if cleanup was successful
    """
    if venv_path is None:
        venv_path = PROJECT_ROOT / ".venv"
    else:
        venv_path = Path(venv_path)
    
    if not venv_path.exists():
        print_info("No virtual environment to clean up")
        return True
    
    # Detect issues
    venv_status = detect_incomplete_venv(venv_path)
    
    if venv_status["is_complete"]:
        print_info("Virtual environment appears to be complete")
        return True
    
    # Show issues
    print_warning("Incomplete virtual environment detected:")
    for issue in venv_status["issues"]:
        print_error(f"  - {issue}")
    
    # Confirm cleanup
    if not force:
        if not confirm(f"Remove incomplete virtual environment at {venv_path}?"):
            print_info("Cleanup cancelled")
            return False
    
    # Remove the incomplete venv
    try:
        print_info(f"Removing {venv_path}...")
        import shutil
        shutil.rmtree(venv_path, ignore_errors=True)
        
        # Double-check it's gone
        if venv_path.exists():
            # Try harder on Windows
            if platform.system() == "Windows":
                run_command(f'rmdir /s /q "{venv_path}"', shell=True)
            else:
                run_command(f'rm -rf "{venv_path}"', shell=True)
        
        if not venv_path.exists():
            print_success("Incomplete virtual environment removed successfully")
            return True
        else:
            print_error("Failed to remove virtual environment completely")
            return False
            
    except Exception as e:
        print_error(f"Error during cleanup: {e}")
        return False