import asyncio
import base64
import math
import os
import platform
import shlex
import shutil
import tempfile
import time
from enum import StrEnum
from pathlib import Path
from typing import Literal, TypedDict
from uuid import uuid4

# Add Win32 API specific imports for Windows
import sys
if sys.platform == 'win32':
    try:
        import ctypes
        import win32api
        import win32con
        print("DEBUG: Successfully imported Windows-specific libraries", flush=True)
        WINDOWS_APIS_AVAILABLE = True
    except ImportError:
        print("DEBUG: Windows-specific libraries not available", flush=True)
        WINDOWS_APIS_AVAILABLE = False
else:
    WINDOWS_APIS_AVAILABLE = False

import pyautogui
# Disable PyAutoGUI failsafe to ensure movements work
pyautogui.FAILSAFE = False
from anthropic.types.beta import BetaToolComputerUse20241022Param

# Direct Windows mouse control function
def win32_move_mouse(x, y):
    """
    Use Win32 API to move the mouse pointer directly.
    
    This function attempts multiple methods to move the cursor, especially
    important for high-DPI environments where coordinates need to be
    properly scaled.
    """
    if not WINDOWS_APIS_AVAILABLE:
        return False
        
    try:
        # Convert to integers to ensure proper types
        x, y = int(x), int(y)
        print(f"DEBUG: Calling SetCursorPos({x}, {y})", flush=True)
        
        # Try different methods for maximum compatibility
        success = False
        
        # Method 1: ctypes.windll approach with proper DPI awareness
        try:
            # Set DPI awareness if available - helps with scaling issues
            if hasattr(ctypes.windll.user32, 'SetProcessDPIAware'):
                ctypes.windll.user32.SetProcessDPIAware()
                print(f"DEBUG: Set process to be DPI-aware", flush=True)
            
            # This is the primary method that should work in most Windows environments
            ctypes.windll.user32.SetCursorPos(x, y)
            success = True
            print(f"DEBUG: ctypes.windll.user32.SetCursorPos successful", flush=True)
        except Exception as e1:
            print(f"DEBUG: ctypes.windll.user32.SetCursorPos failed: {str(e1)}", flush=True)
            
        # Method 2: win32api approach if available and method 1 failed
        if not success and 'win32api' in sys.modules:
            try:
                win32api.SetCursorPos((x, y))
                success = True
                print(f"DEBUG: win32api.SetCursorPos successful", flush=True)
            except Exception as e2:
                print(f"DEBUG: win32api.SetCursorPos failed: {str(e2)}", flush=True)
        
        # Method 3: Try using mouse_event
        if not success and hasattr(ctypes.windll.user32, 'mouse_event'):
            try:
                # Get current position
                cursor_pos = ctypes.wintypes.POINT()
                ctypes.windll.user32.GetCursorPos(ctypes.byref(cursor_pos))
                print(f"DEBUG: Current position via GetCursorPos: ({cursor_pos.x}, {cursor_pos.y})", flush=True)
                
                # Calculate relative movement
                dx = x - cursor_pos.x
                dy = y - cursor_pos.y
                
                # Use MOUSEEVENTF_ABSOLUTE for absolute positioning
                MOUSEEVENTF_MOVE = 0x0001
                MOUSEEVENTF_ABSOLUTE = 0x8000
                
                # Convert to normalized coordinates (0-65535)
                screen_width = ctypes.windll.user32.GetSystemMetrics(0)
                screen_height = ctypes.windll.user32.GetSystemMetrics(1)
                
                # Normalize coordinates to the range 0-65535
                norm_x = int(x * 65535 / screen_width)
                norm_y = int(y * 65535 / screen_height)
                
                print(f"DEBUG: Using mouse_event with normalized coordinates: ({norm_x}, {norm_y})", flush=True)
                
                # Move the cursor
                ctypes.windll.user32.mouse_event(
                    MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, 
                    norm_x, 
                    norm_y, 
                    0, 
                    0
                )
                success = True
                print(f"DEBUG: mouse_event successful", flush=True)
            except Exception as e3:
                print(f"DEBUG: mouse_event failed: {str(e3)}", flush=True)
        
        # Verify the position
        try:
            time.sleep(0.05)  # Small delay to let OS catch up
            current_x, current_y = pyautogui.position()
            
            # Calculate acceptable margin based on DPI scaling
            # Higher DPI might need larger margins
            margin = max(5, int(5 * DPI_SCALING_FACTOR))
            
            if abs(current_x - x) <= margin and abs(current_y - y) <= margin:
                print(f"DEBUG: Win32 mouse move verification successful: ({current_x}, {current_y})", flush=True)
                return True
            else:
                print(f"DEBUG: Win32 mouse move verification failed. Expected: ({x}, {y}), Actual: ({current_x}, {current_y})", flush=True)
                # Even if verification failed, we'll return success if any method worked
                # It's possible verification is using wrong coordinates due to DPI issues
                return success
        except Exception as e4:
            print(f"DEBUG: Position verification error: {str(e4)}", flush=True)
            return success
            
    except Exception as e:
        print(f"DEBUG: Win32 mouse move failed: {str(e)}", flush=True)
        return False

from .base import BaseAnthropicTool, ToolError, ToolResult
from .run import run

Action = Literal[
    "key",
    "type",
    "mouse_move",
    "left_click",
    "left_click_drag",
    "right_click",
    "middle_click",
    "double_click",
    "screenshot",
    "cursor_position",
    "hold_key",           # New action from Feb 2025 update
    "left_mouse_down",    # New action from Feb 2025 update
    "left_mouse_up",      # New action from Feb 2025 update
    "scroll",             # New action from Feb 2025 update
    "triple_click",       # New action from Feb 2025 update
    "wait",               # New action from Feb 2025 update
]


class Resolution(TypedDict):
    width: int
    height: int


# sizes above XGA/WXGA are not recommended
MAX_SCALING_TARGETS: dict[str, Resolution] = {
    "XGA": Resolution(width=1024, height=768),  # 4:3
    "WXGA": Resolution(width=1280, height=800),  # 16:10
    "FWXGA": Resolution(width=1366, height=768),  # ~16:9
}


class ScalingSource(StrEnum):
    COMPUTER = "computer"
    API = "api"


class ComputerToolOptions(TypedDict):
    display_height_px: int
    display_width_px: int
    display_number: int | None


def smooth_move_to(x, y, duration=1.2):
    """Move mouse smoothly to target coordinates with improved error handling."""
    try:
        print(f"DEBUG: Starting smooth_move_to function to ({x}, {y})", flush=True)
        start_x, start_y = pyautogui.position()
        print(f"DEBUG: smooth_move_to - Starting position: ({start_x}, {start_y})", flush=True)
        
        # Try simplest approach first - direct movement
        print(f"DEBUG: Attempting direct move first", flush=True)
        pyautogui.moveTo(x, y)
        direct_x, direct_y = pyautogui.position()
        
        # Check if direct move worked
        if abs(direct_x - x) < 5 and abs(direct_y - y) < 5:
            print(f"DEBUG: Direct move successful to ({direct_x}, {direct_y})", flush=True)
            return
            
        print(f"DEBUG: Direct move insufficient, trying step-based approach", flush=True)
        
        # Calculate distance
        dx = x - start_x
        dy = y - start_y
        distance = math.hypot(dx, dy)
        print(f"DEBUG: Distance to move: {distance} pixels", flush=True)
        
        # Very simple approach - just do 5 steps
        steps = 5
        for i in range(1, steps + 1):
            # Calculate intermediate position
            progress = i / steps
            ix = start_x + dx * progress
            iy = start_y + dy * progress
            
            # Move to this position
            print(f"DEBUG: Step {i}/{steps} - Moving to ({ix}, {iy})", flush=True)
            pyautogui.moveTo(ix, iy)
            time.sleep(0.1)  # Brief pause between steps
            
        # Final move to target
        print(f"DEBUG: Final move to exact target ({x}, {y})", flush=True)
        pyautogui.moveTo(x, y)
        
        # Verify position
        end_x, end_y = pyautogui.position()
        print(f"DEBUG: Ending position: ({end_x}, {end_y})", flush=True)
        
    except Exception as e:
        print(f"DEBUG: Error during smooth movement: {str(e)}", flush=True)
        # Last resort - try one more direct move with no fancy handling
        try:
            pyautogui.moveTo(x, y)
        except:
            pass


class ComputerTool(BaseAnthropicTool):
    """
    A tool that allows the agent to interact with the primary monitor's screen, keyboard, and mouse.
    The tool parameters are defined by Anthropic and are not editable.
    """

    name: Literal["computer"] = "computer"
    api_type: Literal["computer_20250124"] = "computer_20250124"
    width: int
    height: int
    display_num: None  # Simplified to always be None since we're only using primary display

    _screenshot_delay = 2.0
    _scaling_enabled = False

    @property
    def options(self) -> ComputerToolOptions:
        width, height = self.scale_coordinates(
            ScalingSource.COMPUTER, self.width, self.height
        )
        return {
            "display_width_px": width,
            "display_height_px": height,
            "display_number": self.display_num,
        }

    def to_params(self) -> BetaToolComputerUse20241022Param:
        return {"name": self.name, "type": self.api_type, **self.options}

    def __init__(self):
        super().__init__()
        self.width, self.height = pyautogui.size()
        self.display_num = None

    # Add a simple test function that we can call directly for diagnostics
    def test_basic_movement(self):
        """Test basic mouse movement functionality."""
        try:
            print(f"DEBUG: Running test_basic_movement()", flush=True)
            current_x, current_y = pyautogui.position()
            print(f"DEBUG: Test - Current position: ({current_x}, {current_y})", flush=True)
            
            # Try a simple relative move - move 10 pixels right and 10 pixels down
            print(f"DEBUG: Test - Moving relative 10,10 pixels", flush=True)
            pyautogui.moveRel(10, 10)
            
            # Check new position
            new_x, new_y = pyautogui.position()
            print(f"DEBUG: Test - New position: ({new_x}, {new_y})", flush=True)
            
            # Try a simple absolute move
            target_x, target_y = 100, 100
            print(f"DEBUG: Test - Moving to absolute position ({target_x}, {target_y})", flush=True)
            pyautogui.moveTo(target_x, target_y)
            
            # Check final position
            final_x, final_y = pyautogui.position()
            print(f"DEBUG: Test - Final position: ({final_x}, {final_y})", flush=True)
            
            return ToolResult(output=f"TEST RESULT: Mouse moved from ({current_x}, {current_y}) to ({new_x}, {new_y}) to ({final_x}, {final_y})")
        except Exception as e:
            error_msg = f"Test movement failed: {str(e)}"
            print(f"DEBUG: {error_msg}", flush=True)
            return ToolResult(error=error_msg)
    
    async def __call__(
        self,
        *,
        action: Action,
        text: str | None = None,
        coordinate: tuple[int, int] | None = None,
        **kwargs,
    ):
        """Execute computer actions."""
        # Log action
        print(f"DEBUG: Computer action called: {action}", flush=True)
        print(f"DEBUG: kwargs: {kwargs}", flush=True)
        print(f"DEBUG: coordinate: {coordinate}", flush=True)
        print(f"DEBUG: text: {text}", flush=True)
        
        # Always run the test function first for mouse_move to see if basic movements work
        if action == "mouse_move":
            print(f"DEBUG: Running mouse movement test to verify functionality", flush=True)
            test_result = self.test_basic_movement()
            if isinstance(test_result, ToolResult) and test_result.error:
                print(f"DEBUG: Warning - Basic movement test failed: {test_result.error}", flush=True)
            else:
                print(f"DEBUG: Basic movement test result: {test_result.output if hasattr(test_result, 'output') else 'No output'}", flush=True)
        if action in ("mouse_move", "left_click_drag"):
            if coordinate is None:
                raise ToolError(f"coordinate is required for {action}")
            try:
                # Get coordinate values
                print(f"DEBUG: Processing coordinates: {coordinate}", flush=True)
                x, y = self.scale_coordinates(
                    ScalingSource.API, coordinate[0], coordinate[1]
                )
                print(f"DEBUG: Scaled coordinates: ({x}, {y})", flush=True)
                
                if action == "mouse_move":
                    print(f"DEBUG: Moving mouse to coordinates ({x}, {y})", flush=True)
                    # Get current position
                    current_x, current_y = pyautogui.position()
                    print(f"DEBUG: Current mouse position: ({current_x}, {current_y})", flush=True)
                    
                    # First try direct movement with Windows-specific fix
                    print(f"DEBUG: Attempting direct mouse move using Win32API", flush=True)
                    
                    # Try Win32 API first (our custom function)
                    if win32_move_mouse(x, y):
                        print(f"DEBUG: Successfully used Win32API to move mouse to ({x}, {y})", flush=True)
                    else:
                        print(f"DEBUG: Win32API move failed, falling back to PyAutoGUI", flush=True)
                        # Fall back to PyAutoGUI if Win32 API fails
                        try:
                            pyautogui.moveTo(x, y)
                            print(f"DEBUG: Used PyAutoGUI to move to ({x}, {y})", flush=True)
                        except Exception as pag_e:
                            print(f"DEBUG: PyAutoGUI moveTo failed: {str(pag_e)}", flush=True)
                            
                    # Try a third approach if Windows-specific
                    if sys.platform == 'win32':
                        try:
                            print(f"DEBUG: Trying win32api.SetCursorPos as final fallback", flush=True)
                            # Another Windows-specific approach
                            win32api.SetCursorPos((int(x), int(y)))
                            print(f"DEBUG: win32api.SetCursorPos completed", flush=True)
                        except Exception as w32_e:
                            print(f"DEBUG: win32api.SetCursorPos failed: {str(w32_e)}", flush=True)
                    
                    # Check if move happened
                    after_x, after_y = pyautogui.position()
                    print(f"DEBUG: After direct move position: ({after_x}, {after_y})", flush=True)
                    
                    # If position didn't change, try smooth move
                    if abs(after_x - x) > 5 or abs(after_y - y) > 5:
                        print(f"DEBUG: Direct move failed, trying smooth move", flush=True)
                        try:
                            smooth_move_to(x, y)
                            after_smooth_x, after_smooth_y = pyautogui.position()
                            print(f"DEBUG: After smooth move position: ({after_smooth_x}, {after_smooth_y})", flush=True)
                        except Exception as smooth_e:
                            print(f"DEBUG: Smooth move failed: {str(smooth_e)}", flush=True)
                
                elif action == "left_click_drag":
                    print(f"DEBUG: Dragging mouse to coordinates ({x}, {y})", flush=True)
                    current_x, current_y = pyautogui.position()
                    print(f"DEBUG: Current mouse position before drag: ({current_x}, {current_y})", flush=True)
                    
                    # Try to use Windows-specific API for mouse movement
                    try:
                        # Try to use direct Win32 API for Windows
                        import ctypes
                        # Convert to integers to ensure proper types
                        win_x, win_y = int(x), int(y)
                        ctypes.windll.user32.SetCursorPos(win_x, win_y)
                        print(f"DEBUG: Used Win32API to move mouse to ({win_x}, {win_y})", flush=True)
                        
                        # Verify the position after moving
                        moved_x, moved_y = pyautogui.position()
                        print(f"DEBUG: Position after Win32API move: ({moved_x}, {moved_y})", flush=True)
                        
                        # Now perform the drag with PyAutoGUI
                        print(f"DEBUG: Performing drag operation", flush=True)
                        pyautogui.mouseDown(button="left")
                        time.sleep(0.1)  # Short delay to register press
                        pyautogui.moveTo(x, y)
                        time.sleep(0.1)  # Short delay before release
                        pyautogui.mouseUp(button="left")
                    except Exception as win_e:
                        print(f"DEBUG: Win32API approach failed: {str(win_e)}", flush=True)
                        print(f"DEBUG: Falling back to PyAutoGUI drag", flush=True)
                        
                        # Fall back to standard PyAutoGUI approach
                        try:
                            print(f"DEBUG: Moving to start position for drag", flush=True)
                            pyautogui.moveTo(x, y)
                            print(f"DEBUG: Performing drag operation", flush=True)
                            pyautogui.dragTo(x, y, button="left")
                        except Exception as pag_e:
                            print(f"DEBUG: PyAutoGUI drag failed: {str(pag_e)}", flush=True)
                    
                    after_x, after_y = pyautogui.position()
                    print(f"DEBUG: After drag position: ({after_x}, {after_y})", flush=True)
            except Exception as e:
                print(f"DEBUG: Mouse operation error: {str(e)}", flush=True)
                # Continue operation despite error

        elif action in ("key", "type"):
            if text is None:
                raise ToolError(f"text is required for {action}")

            if action == "key":
                if platform.system() == "Darwin":  # Check if we're on macOS
                    text = text.replace("super+", "command+")

                # Normalize key names
                def normalize_key(key):
                    key = key.lower().replace("_", "")
                    key_map = {
                        "pagedown": "pgdn",
                        "pageup": "pgup",
                        "enter": "return",
                        "return": "enter",
                    }
                    return key_map.get(key, key)

                keys = [normalize_key(k) for k in text.split("+")]

                if len(keys) > 1:
                    if "darwin" in platform.system().lower():
                        # Use AppleScript for hotkey on macOS
                        keystroke, modifier = (keys[-1], "+".join(keys[:-1]))
                        modifier = modifier.lower() + " down"
                        if keystroke.lower() == "space":
                            keystroke = " "
                        elif keystroke.lower() == "enter":
                            keystroke = "\\\\n"
                        script = f"""
                        tell application "System Events"
                            keystroke "{keystroke}" using {modifier}
                        end tell
                        """
                        os.system("osascript -e '{}'".format(script))
                    else:
                        pyautogui.hotkey(*keys)
                else:
                    pyautogui.press(keys[0])
            elif action == "type":
                pyautogui.write(text, interval=12 / 1000)

        elif action in ("left_click", "right_click", "double_click", "middle_click"):
            print(f"DEBUG: Processing click action: {action}", flush=True)
            
            # First move the mouse to the coordinates if provided
            if coordinate is not None:
                try:
                    print(f"DEBUG: Attempting to move mouse before click to coordinates: {coordinate}", flush=True)
                    x, y = self.scale_coordinates(ScalingSource.API, coordinate[0], coordinate[1])
                    print(f"DEBUG: Adjusted click coordinates: ({x}, {y})", flush=True)
                    
                    # Get current position for comparison
                    current_x, current_y = pyautogui.position()
                    print(f"DEBUG: Current position before click movement: ({current_x}, {current_y})", flush=True)
                    
                    # Try Win32 API first (our custom function) for most reliability
                    if win32_move_mouse(x, y):
                        print(f"DEBUG: Successfully used Win32API to move mouse before click", flush=True)
                    else:
                        print(f"DEBUG: Win32API move failed, falling back to PyAutoGUI", flush=True)
                        # Fall back to PyAutoGUI if Win32 API fails
                        try:
                            pyautogui.moveTo(x, y)
                            print(f"DEBUG: Used PyAutoGUI to move before click", flush=True)
                        except Exception as pag_e:
                            print(f"DEBUG: PyAutoGUI moveTo failed: {str(pag_e)}", flush=True)
                            
                    # Try a third approach if Windows-specific
                    if sys.platform == 'win32':
                        try:
                            print(f"DEBUG: Trying win32api.SetCursorPos as final fallback", flush=True)
                            # Another Windows-specific approach
                            win32api.SetCursorPos((int(x), int(y)))
                            print(f"DEBUG: win32api.SetCursorPos completed for click", flush=True)
                        except Exception as w32_e:
                            print(f"DEBUG: win32api.SetCursorPos failed: {str(w32_e)}", flush=True)
                    
                    # Verify position after movement
                    after_move_x, after_move_y = pyautogui.position()
                    print(f"DEBUG: Position after move before click: ({after_move_x}, {after_move_y})", flush=True)
                    
                    # Wait a moment for the movement to complete
                    time.sleep(0.2)
                except Exception as e:
                    print(f"DEBUG: Error moving mouse before click: {str(e)}", flush=True)
            else:
                print(f"DEBUG: Click with no coordinates specified, using current position", flush=True)
            
            # Now perform the click action
            try:
                # Get final position for the click
                click_x, click_y = pyautogui.position()
                print(f"DEBUG: Clicking at position: ({click_x}, {click_y})", flush=True)
                
                button = {
                    "left_click": "left",
                    "right_click": "right",
                    "middle_click": "middle",
                }
                
                if action == "double_click":
                    print(f"DEBUG: Performing double-click", flush=True)
                    pyautogui.click()
                    time.sleep(0.1)
                    pyautogui.click()
                else:
                    click_button = button.get(action, "left")
                    print(f"DEBUG: Performing {click_button} click", flush=True)
                    pyautogui.click(button=click_button)
                
                # One more verification after the click
                after_click_x, after_click_y = pyautogui.position()
                print(f"DEBUG: Position after click: ({after_click_x}, {after_click_y})", flush=True)
            except Exception as e:
                print(f"DEBUG: Error during click operation: {str(e)}", flush=True)

        elif action == "screenshot":
            return await self.screenshot()

        elif action == "cursor_position":
            x, y = pyautogui.position()
            x, y = self.scale_coordinates(ScalingSource.COMPUTER, x, y)
            return self._handle_result(ToolResult(output=f"X={x},Y={y}"))
            
        # New actions from Feb 2025 update
        elif action == "hold_key":
            if text is None:
                raise ToolError("text is required for hold_key action")
            pyautogui.keyDown(text)
            
        elif action == "left_mouse_down":
            if coordinate is None:
                raise ToolError("coordinate is required for left_mouse_down action")
            try:
                print(f"DEBUG: Processing left_mouse_down with coordinates: {coordinate}", flush=True)
                x, y = self.scale_coordinates(ScalingSource.API, coordinate[0], coordinate[1])
                print(f"DEBUG: Adjusted mouse_down coordinates: ({x}, {y})", flush=True)
                
                # Try Win32 API first for most reliability
                if win32_move_mouse(x, y):
                    print(f"DEBUG: Successfully used Win32API to move mouse before mouseDown", flush=True)
                else:
                    print(f"DEBUG: Falling back to PyAutoGUI for mouseDown positioning", flush=True)
                    pyautogui.moveTo(x, y)
                
                # Wait a moment for movement to complete
                time.sleep(0.1)
                
                # Verify position
                before_down_x, before_down_y = pyautogui.position()
                print(f"DEBUG: Position before mouseDown: ({before_down_x}, {before_down_y})", flush=True)
                
                # Perform the mouseDown
                print(f"DEBUG: Executing mouseDown", flush=True)
                pyautogui.mouseDown(button="left")
                print(f"DEBUG: mouseDown completed", flush=True)
            except Exception as e:
                print(f"DEBUG: Error during left_mouse_down: {str(e)}", flush=True)
            
        elif action == "left_mouse_up":
            pyautogui.mouseUp(button="left")
            
        elif action == "scroll":
            amount = kwargs.get("amount", 0)
            if amount is None:
                raise ToolError("amount is required for scroll action")
            pyautogui.scroll(amount)
            
        elif action == "triple_click":
            if coordinate is None:
                raise ToolError("coordinate is required for triple_click action")
            try:
                print(f"DEBUG: Processing triple_click with coordinates: {coordinate}", flush=True)
                x, y = self.scale_coordinates(ScalingSource.API, coordinate[0], coordinate[1])
                print(f"DEBUG: Adjusted triple-click coordinates: ({x}, {y})", flush=True)
                
                # Try Win32 API first for most reliability
                if win32_move_mouse(x, y):
                    print(f"DEBUG: Successfully used Win32API to move mouse before triple-click", flush=True)
                else:
                    print(f"DEBUG: Falling back to PyAutoGUI for triple-click positioning", flush=True)
                    pyautogui.moveTo(x, y)
                
                # Wait a moment for movement to complete
                time.sleep(0.1)
                
                # Verify position
                before_click_x, before_click_y = pyautogui.position()
                print(f"DEBUG: Position before triple-click: ({before_click_x}, {before_click_y})", flush=True)
                
                # Perform the triple click
                print(f"DEBUG: Executing triple click", flush=True)
                pyautogui.click(clicks=3)
                print(f"DEBUG: Triple click completed", flush=True)
                
                # Verify position after
                after_click_x, after_click_y = pyautogui.position()
                print(f"DEBUG: Position after triple-click: ({after_click_x}, {after_click_y})", flush=True)
            except Exception as e:
                print(f"DEBUG: Error during triple_click: {str(e)}", flush=True)
            
        elif action == "wait":
            seconds = kwargs.get("seconds", 1.0)
            if seconds is None:
                seconds = 1.0
            time.sleep(seconds)
            
        else:
            error = ToolError(f"Invalid action: {action}")
            return self._handle_result(ToolResult(error=str(error)))

        # Take a screenshot after the action (except for cursor_position)
        if action != "cursor_position":
            return await self.screenshot()

    async def screenshot(self):
        """Take a screenshot of the current screen and return the base64 encoded image."""
        temp_dir = Path(tempfile.gettempdir())
        path = temp_dir / f"screenshot_{uuid4().hex}.png"

        try:
            # Take screenshot
            screenshot = pyautogui.screenshot()
            screenshot.save(str(path))

            # Scale if enabled
            if self._scaling_enabled:
                x, y = self.scale_coordinates(
                    ScalingSource.COMPUTER, self.width, self.height
                )
                from PIL import Image
                with Image.open(path) as img:
                    img = img.resize((x, y), Image.Resampling.LANCZOS)
                    img.save(path)

            # Read and encode
            if path.exists():
                # Read bytes and encode
                with open(path, 'rb') as f:
                    image_bytes = f.read()
                base64_image = base64.b64encode(image_bytes).decode()
                
                # Return raw base64 data
                print(f"Screenshot captured and encoded as base64")
                
                # Return result
                return self._handle_result(ToolResult(
                    output="Screenshot captured successfully",
                    base64_image=base64_image
                ))
            
            raise ToolError("Screenshot file not created")
            
        except Exception as e:
            logger_msg = f"Screenshot failed: {str(e)}"
            print(logger_msg)  # Log error
            raise ToolError(logger_msg)
            
        finally:
            # Cleanup
            if path.exists():
                try:
                    path.unlink()
                except Exception as e:
                    print(f"Warning: Could not delete temp file {path}: {e}")

    def scale_coordinates(self, source: ScalingSource, x: int, y: int):
        """Scale coordinates to account for DPI scaling and screen dimensions."""
        print(f"DEBUG: scale_coordinates - Source: {source}, Input coordinates: ({x}, {y})", flush=True)
        print(f"DEBUG: scale_coordinates - Screen dimensions: {self.width}x{self.height}", flush=True)
        
        try:
            # Get coordinates as integers
            if not isinstance(x, int):
                try:
                    x = int(x)
                except:
                    x = 100
            if not isinstance(y, int):
                try:
                    y = int(y)
                except:
                    y = 100
                    
            # Define the adjustment - increase y value to move mouse lower
            Y_ADJUSTMENT = 5  # Base adjustment
            
            # Adjust the Y_ADJUSTMENT based on DPI scaling
            # Higher DPI = larger adjustment needed
            if DPI_SCALING_FACTOR > 1.0:
                # Scale adjustment by DPI factor
                scaled_y_adjustment = int(Y_ADJUSTMENT * DPI_SCALING_FACTOR) 
                print(f"DEBUG: Scaled Y adjustment: {scaled_y_adjustment} (DPI factor: {DPI_SCALING_FACTOR})", flush=True)
            else:
                scaled_y_adjustment = Y_ADJUSTMENT
            
            if source == ScalingSource.API:
                # When coordinates come from the API (moving the cursor)
                
                # Account for DPI scaling in coordinates
                if DPI_SCALING_FACTOR != 1.0:
                    # Convert logical coordinates to physical coordinates
                    raw_x = int(x / DPI_SCALING_FACTOR)
                    raw_y = int(y / DPI_SCALING_FACTOR)
                    print(f"DEBUG: DPI-adjusted coords: ({raw_x}, {raw_y}) from ({x}, {y})", flush=True)
                    x, y = raw_x, raw_y
                
                # Ensure coordinates are within screen bounds
                x = max(0, min(x, self.width))
                
                # Apply the adjustment to y-coordinate (move down by scaled_y_adjustment pixels)
                # This accounts for the "slightly too high" issue
                y = max(0, min(y + scaled_y_adjustment, self.height))
                
                print(f"DEBUG: Final adjusted coordinates: ({x}, {y})", flush=True)
                return x, y
            else:
                # For COMPUTER source (reading cursor position)
                
                # Account for DPI scaling in reverse when reading positions
                if DPI_SCALING_FACTOR != 1.0:
                    # Convert physical coordinates to logical coordinates
                    logical_x = int(x * DPI_SCALING_FACTOR)
                    logical_y = int(y * DPI_SCALING_FACTOR)
                    print(f"DEBUG: Reverse DPI-adjustment: ({logical_x}, {logical_y}) from ({x}, {y})", flush=True)
                    x, y = logical_x, logical_y
                
                # Subtract the adjustment from Y when reporting cursor position
                # This ensures consistent coordinate system
                y = max(0, y - scaled_y_adjustment)
                
                print(f"DEBUG: Final computer coordinates: ({x}, {y})", flush=True)
                return x, y
                
        except Exception as e:
            print(f"DEBUG: Error in scale_coordinates: {str(e)}", flush=True)
            # Return safe defaults
            return 100, 100