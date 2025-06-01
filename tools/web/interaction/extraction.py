"""Element extraction and data retrieval functionality."""

from typing import Dict, List, Optional, Any

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from tools.base import CLIResult

from .waiter import WaitStrategies
from .capture import ScreenshotCapture
from .constants import DEFAULT_TIMEOUT, DEFAULT_WAIT_STRATEGY, DEFAULT_POST_ACTION_DELAY, logger

class ElementExtraction:
    """Functionality for extracting data from web elements."""
    
    @staticmethod
    def handle_extract(
        driver, 
        selector: str,
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY
    ) -> CLIResult:
        """Extract data from specified elements on the page.
        
        Args:
            driver: Selenium WebDriver instance
            selector: CSS selector for targeting elements
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            
        Returns:
            CLIResult with extracted element data
        """
        try:
            # Use enhanced element waiting for better reliability
            element = WaitStrategies.wait_for_element_ready(driver, selector, wait_strategy, timeout)
            
            # Extract elements matching the selector
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            
            if not elements:
                return CLIResult(
                    error=f"No elements found matching selector: {selector}"
                )
            
            # Process the extracted elements
            elements_data = []
            for el in elements:
                tag_name = el.tag_name.lower()
                
                # Handle different element types
                if tag_name in ['input', 'textarea', 'select']:
                    element_data = {
                        'type': tag_name,
                        'value': el.get_attribute('value') or '',
                        'name': el.get_attribute('name') or '',
                        'id': el.get_attribute('id') or '',
                        'placeholder': el.get_attribute('placeholder') or '',
                        'elementType': el.get_attribute('type') or ''
                    }
                elif tag_name == 'a':
                    element_data = {
                        'type': 'link',
                        'text': el.text or '',
                        'href': el.get_attribute('href') or '',
                        'id': el.get_attribute('id') or ''
                    }
                elif tag_name == 'img':
                    element_data = {
                        'type': 'image',
                        'src': el.get_attribute('src') or '',
                        'alt': el.get_attribute('alt') or '',
                        'id': el.get_attribute('id') or ''
                    }
                elif tag_name == 'button':
                    element_data = {
                        'type': 'button',
                        'text': el.text or '',
                        'id': el.get_attribute('id') or '',
                        'disabled': el.get_attribute('disabled') is not None
                    }
                else:
                    element_data = {
                        'type': tag_name,
                        'text': el.text or '',
                        'html': el.get_attribute('innerHTML') or '',
                        'id': el.get_attribute('id') or ''
                    }
                elements_data.append(element_data)
            
            # Format output based on number of elements
            if len(elements_data) == 1:
                # Single element - provide detailed information
                element = elements_data[0]
                output = f"Extracted {element['type']} element:\n\n"
                
                if element['type'] in ['input', 'textarea', 'select']:
                    output += f"Type: {element['elementType']}\n"
                    output += f"Value: {element['value']}\n"
                    if element['name']:
                        output += f"Name: {element['name']}\n"
                    if element['id']:
                        output += f"ID: {element['id']}\n"
                    if element['placeholder']:
                        output += f"Placeholder: {element['placeholder']}\n"
                elif element['type'] == 'link':
                    output += f"Text: {element['text']}\n"
                    output += f"URL: {element['href']}\n"
                    if element['id']:
                        output += f"ID: {element['id']}\n"
                elif element['type'] == 'image':
                    output += f"Source: {element['src']}\n"
                    output += f"Alt text: {element['alt']}\n"
                    if element['id']:
                        output += f"ID: {element['id']}\n"
                elif element['type'] == 'button':
                    output += f"Text: {element['text']}\n"
                    output += f"Disabled: {element['disabled']}\n"
                    if element['id']:
                        output += f"ID: {element['id']}\n"
                else:
                    output += f"Text: {element['text']}\n"
                    if element['id']:
                        output += f"ID: {element['id']}\n"
            else:
                # Multiple elements - provide summary
                output = f"Extracted {len(elements_data)} {elements_data[0]['type']} elements:\n\n"
                
                for i, element in enumerate(elements_data[:10], 1):  # Limit to first 10 for readability
                    if element['type'] in ['input', 'textarea', 'select']:
                        output += f"{i}. {element['type']} ({element['elementType']}): {element['value']}\n"
                    elif element['type'] == 'link':
                        output += f"{i}. Link: {element['text']} -> {element['href']}\n"
                    elif element['type'] == 'image':
                        output += f"{i}. Image: {element['alt'] or element['src']}\n"
                    elif element['type'] == 'button':
                        output += f"{i}. Button: {element['text']}\n"
                    else:
                        text = element['text'][:50] + ('...' if len(element['text']) > 50 else '')
                        output += f"{i}. {element['type']}: {text}\n"
                
                if len(elements_data) > 10:
                    output += f"\n...and {len(elements_data) - 10} more elements (use a more specific selector to narrow results)"
            
            # Take a screenshot highlighting the elements
            screenshot_data = ScreenshotCapture.capture_screenshot_with_highlight(driver, selector)
            
            return CLIResult(
                output=output,
                base64_image=screenshot_data,
                metadata={
                    "action": "extract",
                    "selector": selector,
                    "elements": elements_data,
                    "count": len(elements_data)
                }
            )
        except Exception as e:
            return CLIResult(
                error=f"Failed to extract elements with selector '{selector}': {str(e)}"
            )
    
    @staticmethod
    def handle_check(
        driver, 
        selector: str,
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY
    ) -> CLIResult:
        """Check if an element exists and is visible on the page.
        
        Args:
            driver: Selenium WebDriver instance
            selector: CSS selector for targeting elements
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            
        Returns:
            CLIResult with element check results
        """
        try:
            # Try to find the element with a short timeout
            element_exists = False
            is_visible = False
            element_properties = {}
            
            try:
                # First check if element exists at all (with shorter timeout)
                # Use a minimal wait strategy for just checking existence
                # But with the regular timeout
                element = WaitStrategies.wait_for_element_ready(driver, selector, "minimal", min(3, timeout))
                element_exists = True
                
                # Check if element is visible
                is_visible = element.is_displayed()
                
                # Get element properties
                element_properties = {
                    "tagName": element.tag_name.lower(),
                    "id": element.get_attribute("id") or "",
                    "className": element.get_attribute("class") or "",
                    "text": element.text or element.get_attribute("textContent") or "",
                    "value": element.get_attribute("value") or "",
                    "disabled": element.get_attribute("disabled") is not None,
                    "rect": {
                        "width": element.size["width"],
                        "height": element.size["height"]
                    }
                }
            except (TimeoutException, NoSuchElementException):
                # Element doesn't exist, that's fine for this action
                pass
            
            # Take a screenshot highlighting the element if it exists
            screenshot_data = None
            if element_exists:
                screenshot_data = ScreenshotCapture.capture_screenshot_with_highlight(driver, selector)
            else:
                screenshot_data = ScreenshotCapture.capture_screenshot(driver)
            
            # Format output
            tag_name = element_properties.get('tagName', 'element')
            element_id = f" with ID '{element_properties.get('id')}'" if element_properties.get('id') else ""
            status = "visible" if is_visible else ("exists but is not visible" if element_exists else "does not exist")
            
            output = f"Element '{selector}' ({tag_name}{element_id}) {status} on the page.\n\n"
            
            if element_properties:
                output += "Element properties:\n"
                for key, value in element_properties.items():
                    if key != 'rect':
                        output += f"- {key}: {value}\n"
                
                if 'rect' in element_properties:
                    output += f"- dimensions: {element_properties['rect']['width']}x{element_properties['rect']['height']} pixels\n"
            
            return CLIResult(
                output=output,
                base64_image=screenshot_data,
                metadata={
                    "action": "check",
                    "selector": selector,
                    "exists": element_exists,
                    "visible": is_visible,
                    "properties": element_properties
                }
            )
        except Exception as e:
            return CLIResult(
                error=f"Failed to check element '{selector}': {str(e)}"
            )