"""Web interaction tool implementation for browser automation."""

import asyncio
import sys
import threading
import time
from typing import Dict, Any, Optional, List, Literal, Union, Tuple
from concurrent.futures import ThreadPoolExecutor

from anthropic.types.beta import BetaToolUnionParam
from tools.base import ToolError, ToolResult, WebResult, CLIResult
from tools.web.base_web import BaseWebTool

from .constants import (
    DEFAULT_TIMEOUT, DEFAULT_WAIT_STRATEGY, DEFAULT_POST_ACTION_DELAY, 
    DEFAULT_NETWORK_IDLE_TIME, WAIT_STRATEGIES, logger
)
from .browser import BrowserManager
from .waiter import WaitStrategies
from .actions import WebActions
from .extraction import ElementExtraction
from .visual import VisualInteractions
from .logger import EventLogger

# Initialize thread pool
_thread_pool = ThreadPoolExecutor(max_workers=4)

class WebInteractionTool(BaseWebTool):
    """Tool for interactive web page automation and interaction.
    
    This tool provides capabilities to interact with web pages programmatically, 
    including form filling, button clicking, login workflows, and other browser-based
    activities.
    
    The tool supports three different waiting strategies:
    - minimal: Fastest execution with basic waiting for document ready state
    - normal: Balanced approach with waiting for network idle and element visibility
    - thorough: Most reliable approach with extensive waiting for DOM stability,
               network idle, animations completion, and element position stability
    """
    
    name: Literal["web_interact"] = "web_interact"
    
    def __init__(self):
        """Initialize the web interaction tool."""
        super().__init__()
    
    def to_params(self) -> BetaToolUnionParam:
        """Get tool parameters for API consumption."""
        return {
            "name": self.name,
            "description": "General-purpose web interaction tool for automating browser actions like navigation, clicking, form filling, and element inspection.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "navigate", 
                            "fill_form", 
                            "click", 
                            "login", 
                            "extract", 
                            "screenshot",
                            "scroll",
                            "check"
                        ],
                        "description": "The action to perform on the web page."
                    },
                    "url": {
                        "type": "string",
                        "description": "The URL of the web page to interact with."
                    },
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for targeting specific elements (for click, fill, extract actions)."
                    },
                    "form_data": {
                        "type": "object",
                        "description": "Form field data as key-value pairs (for fill_form and login actions)."
                    },
                    "text": {
                        "type": "string",
                        "description": "Text to enter into a form field (for fill action)."
                    },
                    "submit": {
                        "type": "boolean",
                        "description": "Whether to submit the form after filling (for fill_form and login actions)."
                    },
                    "wait_for": {
                        "type": "string",
                        "description": "Selector to wait for after action completes (e.g., after form submission)."
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in seconds for the operation."
                    },
                    "wait_strategy": {
                        "type": "string",
                        "enum": ["minimal", "normal", "thorough"],
                        "description": "Level of waiting thoroughness: minimal (fastest), normal (balanced), or thorough (most reliable)."
                    },
                    "post_action_delay": {
                        "type": "number",
                        "description": "Additional delay in seconds to wait after an action completes."
                    },
                    "network_idle_time": {
                        "type": "number",
                        "description": "Time in seconds to wait for network to be idle before considering a page loaded."
                    }
                },
                "required": ["action", "url"]
            }
        }
    
    async def __call__(
        self,
        *,
        action: Literal[
            "navigate", "fill_form", "click", "login", "extract", "screenshot", "scroll", "check"
        ],
        url: str,
        selector: Optional[str] = None,
        form_data: Optional[Dict[str, str]] = None,
        text: Optional[str] = None,
        submit: bool = False,
        wait_for: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
        wait_strategy: Literal["minimal", "normal", "thorough"] = DEFAULT_WAIT_STRATEGY,
        post_action_delay: Optional[float] = None,
        network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME,
        **kwargs
    ) -> ToolResult:
        """Perform browser automation actions on a web page.
        
        Args:
            action: The type of interaction to perform
            url: The URL to interact with
            selector: CSS selector for targeting elements
            form_data: Data to fill into forms
            text: Text to enter into a field
            submit: Whether to submit after filling
            wait_for: Element to wait for after action
            timeout: Timeout in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Additional delay after action
            network_idle_time: Time to wait for network to be idle
            
        Returns:
            ToolResult with the results of the operation
        """
        # Start event tracking
        operation_id = EventLogger.event_start("operation", action, {
            "url": url, 
            "selector": selector, 
            "wait_for": wait_for,
            "timeout": timeout,
            "wait_strategy": wait_strategy,
            "has_form_data": form_data is not None,
            "submit": submit
        })
        
        start_time = time.time()
        
        # Log the operation parameters
        EventLogger.action_log(f"Starting {action} operation", {
            "url": url,
            "selector": selector,
            "wait_strategy": wait_strategy,
            "timeout": timeout
        })
        
        # Run the synchronous Selenium code in a thread pool to avoid blocking the event loop
        try:
            # Run the synchronous code in a thread pool
            result = await asyncio.get_event_loop().run_in_executor(
                _thread_pool, 
                self._run_web_interaction,
                action, url, selector, form_data, text, submit, wait_for, timeout, kwargs
            )
            
            # Log operation success and timing
            duration = time.time() - start_time
            EventLogger.performance_metric(f"{action}_duration", duration, {
                "url": url,
                "success": True,
                "wait_strategy": wait_strategy
            })
            
            # End event tracking with success
            result_data = {}
            if isinstance(result, CLIResult):
                result_data = {
                    "has_image": result.base64_image is not None,
                    "output_length": len(result.output) if result.output else 0,
                    "has_error": result.error is not None,
                    "has_metadata": result.metadata is not None
                }
            
            EventLogger.event_end(operation_id, "success", result_data)
            return result
            
        except Exception as e:
            # Log operation failure with details
            duration = time.time() - start_time
            EventLogger.performance_metric(f"{action}_duration", duration, {
                "url": url,
                "success": False,
                "error_type": type(e).__name__
            })
            
            # Log detailed error information
            EventLogger.error_details(e, {
                "action": action,
                "url": url,
                "selector": selector
            })
            
            # End event tracking with error
            EventLogger.event_end(operation_id, "error", None, e)
            
            # Handle any exceptions that occurred in the thread
            return self._handle_result(CLIResult(error=f"Browser interaction error: {str(e)}"))
    
    def _run_web_interaction(
        self,
        action: str,
        url: str,
        selector: Optional[str],
        form_data: Optional[Dict[str, str]],
        text: Optional[str],
        submit: bool,
        wait_for: Optional[str],
        timeout: int,
        kwargs: Dict[str, Any]
    ) -> ToolResult:
        """Synchronous implementation of web interaction to be run in a thread pool."""
        # Extract additional parameters
        wait_strategy = kwargs.get("wait_strategy", DEFAULT_WAIT_STRATEGY)
        post_action_delay = kwargs.get("post_action_delay", DEFAULT_POST_ACTION_DELAY)
        network_idle_time = kwargs.get("network_idle_time", DEFAULT_NETWORK_IDLE_TIME)
        
        # Log parameter details
        EventLogger.action_log("Processing web interaction parameters", {
            "action": action,
            "url": url,
            "wait_strategy": wait_strategy,
            "timeout": timeout,
            "network_idle_time": network_idle_time
        })
        
        # Track the internal execution time
        execution_start = time.time()
        
        # Start suboperation logging
        subop_id = EventLogger.event_start("suboperation", f"run_{action}", {
            "url": url,
            "selector": selector,
            "wait_for": wait_for,
            "wait_strategy": wait_strategy
        })
        
        # Ensure wait_strategy is a valid value
        if wait_strategy not in WAIT_STRATEGIES:
            EventLogger.action_log(f"Invalid wait_strategy: {wait_strategy}, using default", {
                "invalid_value": wait_strategy,
                "using_default": DEFAULT_WAIT_STRATEGY
            }, "warning")
            wait_strategy = DEFAULT_WAIT_STRATEGY
            
        try:
            # Validate URL
            url_validation_id = EventLogger.event_start("validation", "url", {"url": url})
            if not BrowserManager.is_valid_url(url):
                EventLogger.event_end(url_validation_id, "error")
                raise ToolError(f"Invalid URL format: {url}")
            EventLogger.event_end(url_validation_id, "success")
            
            # Validate required parameters based on action
            params_validation_id = EventLogger.event_start("validation", "parameters", {
                "action": action,
                "has_selector": selector is not None,
                "has_form_data": form_data is not None
            })
            self._validate_parameters(action, selector, form_data, text)
            EventLogger.event_end(params_validation_id, "success")
            
            # Initialize browser
            browser_id = EventLogger.event_start("browser", "initialize", {})
            with BrowserManager.get_browser_context() as driver:
                EventLogger.event_end(browser_id, "success")
                
                # Configure timeouts
                driver.set_page_load_timeout(DEFAULT_TIMEOUT * 2)  # More generous timeout for initial page load
                driver.set_script_timeout(timeout)
                EventLogger.action_log("Configured browser timeouts", {
                    "page_load_timeout": DEFAULT_TIMEOUT * 2,
                    "script_timeout": timeout
                })
                
                # Check current URL
                current_url = driver.current_url
                navigation_needed = current_url != url and not current_url.startswith(url)
                EventLogger.action_log("URL check for navigation", {
                    "current_url": current_url,
                    "target_url": url,
                    "navigation_needed": navigation_needed
                })
                
                # Navigate if needed
                if navigation_needed:
                    navigation_id = EventLogger.event_start("navigation", "initial", {
                        "url": url,
                        "wait_strategy": wait_strategy
                    })
                    
                    try:
                        driver.get(url)
                        EventLogger.state_transition("navigating", "loading", {"url": url})
                        
                        # Measure page load time
                        load_start = time.time()
                        WaitStrategies.wait_for_page_to_load(driver, wait_strategy, timeout, network_idle_time)
                        load_time = time.time() - load_start
                        
                        EventLogger.performance_metric("page_load_time", load_time, {
                            "url": url,
                            "wait_strategy": wait_strategy
                        })
                        
                        EventLogger.state_transition("loading", "ready", {"url": url})
                        EventLogger.event_end(navigation_id, "success", {
                            "load_time": load_time,
                            "title": driver.title
                        })
                    except Exception as e:
                        EventLogger.event_end(navigation_id, "error", None, e)
                        raise
                
                # Perform the requested action
                result = None
                action_id = EventLogger.event_start("action", action, {
                    "url": url,
                    "selector": selector,
                    "wait_for": wait_for,
                    "wait_strategy": wait_strategy
                })
                
                try:
                    if action == "navigate":
                        result = WebActions.handle_navigate(
                            driver, url, wait_for, timeout, wait_strategy, post_action_delay, network_idle_time
                        )
                    elif action == "fill_form":
                        result = WebActions.handle_fill_form(
                            driver, form_data, submit, wait_for, timeout, wait_strategy, post_action_delay, network_idle_time
                        )
                    elif action == "click":
                        result = WebActions.handle_click(
                            driver, selector, wait_for, timeout, wait_strategy, post_action_delay, network_idle_time
                        )
                    elif action == "login":
                        result = WebActions.handle_login(
                            driver, form_data, wait_for, timeout, wait_strategy, post_action_delay, network_idle_time
                        )
                    elif action == "extract":
                        result = ElementExtraction.handle_extract(
                            driver, selector, timeout, wait_strategy, post_action_delay
                        )
                    elif action == "screenshot":
                        result = VisualInteractions.handle_screenshot(
                            driver, selector, timeout, wait_strategy, post_action_delay
                        )
                    elif action == "scroll":
                        result = VisualInteractions.handle_scroll(
                            driver, selector, timeout, wait_strategy, post_action_delay
                        )
                    elif action == "check":
                        result = ElementExtraction.handle_check(
                            driver, selector, timeout, wait_strategy, post_action_delay
                        )
                    
                    action_result = {
                        "success": True, 
                        "has_error": result.error is not None if result else False,
                        "has_image": result.base64_image is not None if result else False
                    }
                    EventLogger.event_end(action_id, "success", action_result)
                except Exception as e:
                    EventLogger.event_end(action_id, "error", None, e)
                    raise
                
                # Get page info for metadata
                page_info_id = EventLogger.event_start("info", "page", {})
                try:
                    title = driver.title
                    current_url = driver.current_url
                    EventLogger.event_end(page_info_id, "success", {
                        "title": title,
                        "url": current_url
                    })
                except Exception as e:
                    EventLogger.event_end(page_info_id, "error", None, e)
                    # Continue even if we can't get page info
                
                # Record total execution time
                execution_time = time.time() - execution_start
                EventLogger.performance_metric("total_execution_time", execution_time, {
                    "action": action,
                    "url": url,
                    "wait_strategy": wait_strategy
                })
                
                # End suboperation tracking
                EventLogger.event_end(subop_id, "success", {
                    "execution_time": execution_time
                })
                
                # Format and return the result
                return self._handle_result(result or CLIResult(
                    output=f"Successfully performed '{action}' action on {url}",
                    metadata={
                        "action": action,
                        "url": current_url,
                        "title": title,
                        "execution_time": execution_time
                    }
                ))
                
        except ToolError as e:
            # Log the specific tool error
            EventLogger.event_end(subop_id, "error", {
                "error_type": "ToolError",
                "message": str(e)
            }, e)
            return self._handle_result(CLIResult(error=str(e)))
        except Exception as e:
            # Log the unexpected error
            EventLogger.event_end(subop_id, "error", {
                "error_type": type(e).__name__,
                "message": str(e)
            }, e)
            return self._handle_result(CLIResult(error=f"Browser interaction error: {str(e)}"))
    
    def _validate_parameters(
        self, 
        action: str, 
        selector: Optional[str], 
        form_data: Optional[Dict[str, str]], 
        text: Optional[str]
    ):
        """Validate that required parameters are provided for the given action."""
        if action in ["click", "extract", "screenshot", "check"] and not selector:
            raise ToolError(f"'{action}' action requires a selector")
        
        if action in ["fill_form", "login"] and not form_data:
            raise ToolError(f"{action} action requires form_data with field selectors and values")
    
    def close(self):
        """Close the browser and clean up resources."""
        BrowserManager.close()
    
    async def aclose(self):
        """Async version of close for compatibility with async context managers."""
        await asyncio.get_event_loop().run_in_executor(None, self.close)
    
    def __del__(self):
        """Ensure resources are cleaned up when the object is garbage collected."""
        self.close()

# Shutdown the thread pool when the module is unloaded
import atexit
atexit.register(lambda: _thread_pool.shutdown(wait=True))