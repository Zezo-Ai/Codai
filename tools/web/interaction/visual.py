"""Visual interaction module for screenshots and scrolling."""

import time
from typing import Optional

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

from tools.base import CLIResult

from .waiter import WaitStrategies
from .capture import ScreenshotCapture
from .constants import DEFAULT_TIMEOUT, DEFAULT_WAIT_STRATEGY, DEFAULT_POST_ACTION_DELAY, logger

class VisualInteractions:
    """Visual interaction functionality for web pages."""
    
    @staticmethod
    def handle_screenshot(
        driver, 
        selector: Optional[str],
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY
    ) -> CLIResult:
        """Capture a screenshot of the page or a specific element.
        
        Args:
            driver: Selenium WebDriver instance
            selector: Optional CSS selector for specific element
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            
        Returns:
            CLIResult with screenshot
        """
        try:
            if selector:
                # Screenshot of specific element
                try:
                    # Use enhanced element waiting for better reliability
                    element = WaitStrategies.wait_for_element_ready(driver, selector, wait_strategy, timeout)
                    # Get element count for feedback
                    elements = driver.find_elements(By.CSS_SELECTOR, selector)
                    element_count = len(elements)
                    
                    # Highlight and take screenshot
                    screenshot_data = ScreenshotCapture.capture_screenshot_with_highlight(driver, selector)
                    
                    return CLIResult(
                        output=f"Captured screenshot of {element_count} element(s) matching '{selector}'",
                        base64_image=screenshot_data,
                        metadata={
                            "action": "screenshot",
                            "selector": selector,
                            "element_count": element_count,
                            "current_url": driver.current_url
                        }
                    )
                except Exception as e:
                    return CLIResult(
                        error=f"Failed to capture element screenshot: {str(e)}"
                    )
            else:
                # Full page screenshot
                screenshot_data = ScreenshotCapture.capture_screenshot(driver)
                
                return CLIResult(
                    output=f"Captured full page screenshot of {driver.current_url}",
                    base64_image=screenshot_data,
                    metadata={
                        "action": "screenshot",
                        "current_url": driver.current_url
                    }
                )
        except Exception as e:
            return CLIResult(
                error=f"Failed to capture screenshot: {str(e)}"
            )
    
    @staticmethod
    def handle_scroll(
        driver, 
        selector: Optional[str],
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY
    ) -> CLIResult:
        """Scroll the page or to a specific element.
        
        Args:
            driver: Selenium WebDriver instance
            selector: Optional CSS selector to scroll to
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            
        Returns:
            CLIResult with scroll operation result
        """
        try:
            if selector:
                # Scroll to specific element
                # Use enhanced element waiting for better reliability
                element = WaitStrategies.wait_for_element_ready(driver, selector, wait_strategy, timeout)
                
                # Scroll element into view
                driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", element)
                
                # Get element information
                element_text = element.text or element.get_attribute("value") or "No text"
                
                # Take a screenshot highlighting the element
                screenshot_data = ScreenshotCapture.capture_screenshot_with_highlight(driver, selector)
                
                return CLIResult(
                    output=f"Scrolled to element '{selector}' with text: '{element_text}'",
                    base64_image=screenshot_data,
                    metadata={
                        "action": "scroll",
                        "selector": selector,
                        "element_text": element_text
                    }
                )
            else:
                # Scroll down the page
                driver.execute_script("window.scrollBy(0, window.innerHeight);")
                
                # Take a screenshot of the result
                screenshot_data = ScreenshotCapture.capture_screenshot(driver)
                
                return CLIResult(
                    output=f"Scrolled down the page at {driver.current_url}",
                    base64_image=screenshot_data,
                    metadata={
                        "action": "scroll",
                        "current_url": driver.current_url
                    }
                )
        except Exception as e:
            return CLIResult(
                error=f"Failed to scroll: {str(e)}"
            )