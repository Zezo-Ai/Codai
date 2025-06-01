"""Screenshot and visual capture utilities."""

import base64
import logging
from typing import Optional

from selenium.webdriver.common.by import By

from .constants import logger

class ScreenshotCapture:
    """Utilities for capturing screenshots and visual information."""
    
    @staticmethod
    def capture_screenshot(driver) -> Optional[str]:
        """Capture screenshot and convert to base64.
        
        Args:
            driver: Selenium WebDriver instance
            
        Returns:
            Base64 encoded screenshot data or None on failure
        """
        try:
            screenshot_bytes = driver.get_screenshot_as_png()
            return base64.b64encode(screenshot_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to capture screenshot: {str(e)}")
            return None
    
    @staticmethod
    def capture_screenshot_with_highlight(driver, selector: str) -> Optional[str]:
        """Capture screenshot with highlighted element.
        
        Args:
            driver: Selenium WebDriver instance
            selector: CSS selector for element to highlight
            
        Returns:
            Base64 encoded screenshot data or None on failure
        """
        try:
            # Find all elements matching the selector
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            
            if not elements:
                return ScreenshotCapture.capture_screenshot(driver)
            
            # Save original styles
            original_styles = []
            for element in elements:
                style = {
                    'outline': driver.execute_script('return arguments[0].style.outline', element),
                    'boxShadow': driver.execute_script('return arguments[0].style.boxShadow', element)
                }
                original_styles.append(style)
                
                # Apply highlight style
                driver.execute_script(
                    'arguments[0].style.outline = "2px solid red"; '
                    'arguments[0].style.boxShadow = "0 0 10px rgba(255, 0, 0, 0.7)";',
                    element
                )
            
            # Capture screenshot with highlighting
            screenshot_bytes = driver.get_screenshot_as_png()
            
            # Restore original styles
            for element, style in zip(elements, original_styles):
                driver.execute_script(
                    f'arguments[0].style.outline = "{style["outline"]}"; '
                    f'arguments[0].style.boxShadow = "{style["boxShadow"]}";',
                    element
                )
            
            return base64.b64encode(screenshot_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to capture screenshot with highlight: {str(e)}")
            return ScreenshotCapture.capture_screenshot(driver)