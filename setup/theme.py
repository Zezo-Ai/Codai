"""
Visual Theme Module

Provides consistent visual styling for terminal outputs using:
- Color schemes with semantic meaning
- Unicode symbols for better visual cues
- Formatted headers and separators
- Progress indicators
"""

import os
import sys
import platform
from typing import Dict, List, Any, Optional, Union

from . import utils

# Define theme colors with semantic meaning
COLORS = {
    "primary": "blue",       # Main information
    "success": "green",      # Success messages
    "warning": "yellow",     # Warnings and cautions
    "error": "red",          # Errors and failures
    "info": "cyan",          # Informational content
    "muted": "white",        # Less important text
    "highlight": "magenta",  # Highlighted information
}

# Define symbols for better visual cues (with fallbacks for terminals without Unicode support)
SYMBOLS = {
    "check": "✓",            # Success
    "error": "✗",            # Error
    "warning": "⚠",          # Warning
    "info": "ℹ",             # Information
    "arrow": "→",            # Direction or result
    "bullet": "•",           # List item
    "star": "★",             # Important
    "progress": "…",         # In progress
    "pending": "○",          # Pending
    "spinner": ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],  # Animated spinner
}

# Fallbacks for terminals without Unicode support
ASCII_SYMBOLS = {
    "check": "√",
    "error": "×",
    "warning": "!",
    "info": "i",
    "arrow": "->",
    "bullet": "*",
    "star": "*",
    "progress": "...",
    "pending": "o",
    "spinner": ["-", "\\", "|", "/"],
}

# Header styling
HEADER_WIDTH = 80
HEADER_STYLE = {
    "color": COLORS["primary"],
    "bold": True,
    "fill_char": "=",
    "padding": 1,
}

# Box drawing characters for creating visual containers
BOX = {
    "top_left": "┌",
    "top_right": "┐",
    "bottom_left": "└",
    "bottom_right": "┘",
    "horizontal": "─",
    "vertical": "│",
    "t_down": "┬",
    "t_up": "┴",
    "t_right": "├",
    "t_left": "┤",
    "cross": "┼",
}

# ASCII fallback for box drawing
ASCII_BOX = {
    "top_left": "+",
    "top_right": "+",
    "bottom_left": "+",
    "bottom_right": "+",
    "horizontal": "-",
    "vertical": "|",
    "t_down": "+",
    "t_up": "+",
    "t_right": "+", 
    "t_left": "+",
    "cross": "+",
}


def supports_unicode() -> bool:
    """
    Determine if the terminal supports Unicode characters.
    
    Returns:
        bool: True if Unicode is supported, False otherwise
    """
    # Windows Terminal and modern terminals generally support Unicode
    if os.environ.get("WT_SESSION") or os.environ.get("TERM_PROGRAM") in ["vscode", "iTerm.app"]:
        return True
    
    # Check locale info on non-Windows platforms
    if platform.system() != "Windows":
        import locale
        encoding = locale.getpreferredencoding()
        return encoding.lower().startswith(("utf", "u8"))
    
    # Default for Windows 10+ (generally supports Unicode in newer versions)
    # but fall back to ASCII if not sure
    return False


def get_symbol(name: str) -> str:
    """
    Get a symbol with appropriate fallback if Unicode is not supported.
    
    Args:
        name: Symbol name
    
    Returns:
        str: The appropriate symbol
    """
    if supports_unicode():
        return SYMBOLS.get(name, "")
    else:
        return ASCII_SYMBOLS.get(name, "")


def get_box_chars() -> Dict[str, str]:
    """
    Get box drawing characters with appropriate fallbacks.
    
    Returns:
        Dict[str, str]: Box drawing characters
    """
    if supports_unicode():
        return BOX
    else:
        return ASCII_BOX


def format_header(text: str, width: int = HEADER_WIDTH) -> str:
    """
    Format a header with consistent styling.
    
    Args:
        text: Header text
        width: Total width of the header
    
    Returns:
        str: Formatted header
    """
    fill_char = HEADER_STYLE["fill_char"]
    padding = HEADER_STYLE["padding"]
    
    # Calculate remaining space after text and padding
    text_length = len(text)
    remaining = width - text_length - (padding * 2)
    
    if remaining <= 0:
        # Text is too long, just center it
        return text.center(width)
    
    # Distribute remaining space evenly
    left_fill = fill_char * (remaining // 2)
    right_fill = fill_char * (remaining - len(left_fill))
    
    # Construct header
    padding_str = " " * padding
    header = f"{left_fill}{padding_str}{text}{padding_str}{right_fill}"
    
    return header


def print_header(text: str, width: int = HEADER_WIDTH) -> None:
    """
    Print a formatted header.
    
    Args:
        text: Header text
        width: Total width of the header
    """
    header = format_header(text, width)
    utils.print_colored(header, COLORS["primary"], bold=True)


def print_subheader(text: str, width: int = HEADER_WIDTH) -> None:
    """
    Print a formatted subheader.
    
    Args:
        text: Subheader text
        width: Total width of the header
    """
    utils.print_colored(f"\n{text}", COLORS["info"], bold=True)
    underline = "─" * min(len(text), width)
    utils.print_colored(underline, COLORS["info"], bold=False)


def print_step(name: str, status: str = "Starting", step_count: int = 1, total_steps: int = 1) -> None:
    """
    Print a formatted step indicator.
    
    Args:
        name: Step name
        status: Step status (e.g., "Starting", "Running", "Completed")
        step_count: Current step number
        total_steps: Total number of steps
    """
    step_str = f"Step {step_count}/{total_steps}: {name}"
    symbol = get_symbol("bullet")
    
    # Create a box around the step header
    box_chars = get_box_chars()
    
    # Define box width
    width = max(80, len(step_str) + 4)
    
    # Create the box
    top_border = f"{box_chars['top_left']}{box_chars['horizontal'] * (width - 2)}{box_chars['top_right']}"
    bottom_border = f"{box_chars['bottom_left']}{box_chars['horizontal'] * (width - 2)}{box_chars['bottom_right']}"
    
    # Create content with padding
    padding = " " * (width - len(step_str) - 6)  # 6 accounts for margins and symbol
    content = f"{box_chars['vertical']} {symbol} {step_str}{padding} {box_chars['vertical']}"
    
    # Print the box
    utils.print_colored(f"\n{top_border}", COLORS["primary"], bold=False)
    utils.print_colored(content, COLORS["primary"], bold=True)
    utils.print_colored(bottom_border, COLORS["primary"], bold=False)
    
    # Print status below the box
    utils.print_colored(f"{symbol} {status}...", COLORS["muted"], bold=False)


def print_result(success: bool, message: str) -> None:
    """
    Print a formatted result message.
    
    Args:
        success: Whether the operation succeeded
        message: Result message
    """
    color = COLORS["success"] if success else COLORS["error"]
    symbol = get_symbol("check") if success else get_symbol("error")
    utils.print_colored(f"{symbol} {message}", color, bold=success)


def create_box(content: str, title: Optional[str] = None, width: int = 70) -> str:
    """
    Create a box around content text.
    
    Args:
        content: Content to put in the box
        title: Optional title for the box
        width: Width of the box
        
    Returns:
        str: Formatted box with content
    """
    box = get_box_chars()
    
    # Split content into lines and ensure none exceeds width
    lines = []
    for line in content.split("\n"):
        # Wrap long lines
        while len(line) > width - 4:  # Account for borders and padding
            lines.append(line[:width-4])
            line = line[width-4:]
        lines.append(line)
    
    # Calculate box width based on content and title
    box_width = max(max(len(line) for line in lines) + 4, (len(title) + 4 if title else 0), width)
    
    # Create top border with title if provided
    if title:
        title_str = f" {title} "
        title_len = len(title_str)
        left_border = box["horizontal"] * 2
        right_border = box["horizontal"] * (box_width - 2 - title_len - 2)
        top_border = f"{box['top_left']}{left_border}{title_str}{right_border}{box['top_right']}"
    else:
        top_border = f"{box['top_left']}{box['horizontal'] * (box_width - 2)}{box['top_right']}"
    
    # Create bottom border
    bottom_border = f"{box['bottom_left']}{box['horizontal'] * (box_width - 2)}{box['bottom_right']}"
    
    # Create content lines with borders
    content_lines = []
    for line in lines:
        padding = " " * (box_width - 2 - len(line))
        content_lines.append(f"{box['vertical']} {line}{padding} {box['vertical']}")
    
    # Combine all parts
    result = [top_border]
    result.extend(content_lines)
    result.append(bottom_border)
    
    return "\n".join(result)


def print_box(content: str, title: Optional[str] = None, color: str = "info", width: int = 70) -> None:
    """
    Print a formatted box with content.
    
    Args:
        content: Content to put in the box
        title: Optional title for the box
        color: Color to use for the box
        width: Width of the box
    """
    box_str = create_box(content, title, width)
    utils.print_colored(box_str, COLORS.get(color, COLORS["info"]), bold=False)


def format_key_value(key: str, value: str, key_width: int = 20) -> str:
    """
    Format a key-value pair with consistent spacing.
    
    Args:
        key: Key name
        value: Value
        key_width: Width to allocate for the key
        
    Returns:
        str: Formatted key-value pair
    """
    return f"{key.ljust(key_width)}: {value}"


def print_key_value(key: str, value: str, key_width: int = 20, 
                   key_color: str = "primary", value_color: str = "muted") -> None:
    """
    Print a formatted key-value pair.
    
    Args:
        key: Key name
        value: Value
        key_width: Width to allocate for the key
        key_color: Color to use for the key
        value_color: Color to use for the value
    """
    key_str = f"{key.ljust(key_width)}:"
    utils.print_colored(key_str, COLORS.get(key_color, COLORS["primary"]), end=" ", bold=True)
    utils.print_colored(value, COLORS.get(value_color, COLORS["muted"]))


def print_success(message: str) -> None:
    """Enhanced success message with consistent styling."""
    utils.print_colored(f"{get_symbol('check')} {message}", COLORS["success"], bold=True)


def print_error(message: str) -> None:
    """Enhanced error message with consistent styling."""
    utils.print_colored(f"{get_symbol('error')} {message}", COLORS["error"], bold=True)


def print_warning(message: str) -> None:
    """Enhanced warning message with consistent styling."""
    utils.print_colored(f"{get_symbol('warning')} {message}", COLORS["warning"], bold=False)


def print_info(message: str) -> None:
    """Enhanced info message with consistent styling."""
    utils.print_colored(f"{get_symbol('info')} {message}", COLORS["info"], bold=False)


def print_summary(title: str, items: List[Dict[str, Any]], show_status: bool = True) -> None:
    """
    Print a formatted summary with items and their status.
    
    Args:
        title: Summary title
        items: List of items with at least 'name' and optionally 'status' and 'message'
        show_status: Whether to show status indicators
    """
    print_subheader(title)
    
    for item in items:
        name = item.get("name", "")
        status = item.get("status", True)
        message = item.get("message", "")
        
        if show_status:
            symbol = get_symbol("check") if status else get_symbol("error")
            color = COLORS["success"] if status else COLORS["error"]
            utils.print_colored(f"{symbol} {name}", color, bold=False, end=" ")
            if message:
                utils.print_colored(f"- {message}", COLORS["muted"])
        else:
            bullet = get_symbol("bullet")
            utils.print_colored(f"{bullet} {name}", COLORS["info"], bold=False, end=" ")
            if message:
                utils.print_colored(f"- {message}", COLORS["muted"])
            else:
                print()  # Just for a newline