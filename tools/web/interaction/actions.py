"""Implementation of web interaction actions."""

import time
import logging
from typing import Dict, Optional, Any, List

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException, NoSuchElementException, 
    StaleElementReferenceException, ElementClickInterceptedException
)

from tools.base import CLIResult

from .waiter import WaitStrategies
from .capture import ScreenshotCapture
from .constants import (
    DEFAULT_TIMEOUT, DEFAULT_WAIT_STRATEGY, DEFAULT_POST_ACTION_DELAY, 
    DEFAULT_NETWORK_IDLE_TIME, logger
)

class ElementActions:
    """Actions that can be performed on web elements."""
    
    @staticmethod
    def action_chains_click(driver, element):
        """Perform a click using ActionChains for better handling of complex scenarios.
        
        Args:
            driver: WebDriver instance
            element: The element to click
        """
        # Move to element first, then click
        actions = ActionChains(driver)
        actions.move_to_element(element)
        actions.click()
        actions.perform()
    
    @staticmethod
    def find_parent_form(driver, element):
        """Find the parent form of an element.
        
        Args:
            driver: WebDriver instance
            element: The element to find the parent form for
            
        Returns:
            The parent form element or None if not found
        """
        try:
            return driver.execute_script("""
                function getParentForm(element) {
                    while (element && element.tagName.toLowerCase() !== 'form') {
                        element = element.parentElement;
                    }
                    return element;
                }
                return getParentForm(arguments[0]);
            """, element)
        except Exception:
            return None

class WebActions:
    """Implementation of web interaction actions."""
    
    @staticmethod
    def handle_navigate(
        driver, 
        url: str, 
        wait_for: Optional[str],
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY,
        network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME
    ) -> CLIResult:
        """Handle navigation to URL and wait for optional element.
        
        Args:
            driver: Selenium WebDriver instance
            url: URL to navigate to
            wait_for: Optional selector to wait for after navigation
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            network_idle_time: Time to wait for network to be idle
            
        Returns:
            CLIResult with the outcome of the navigation
        """
        driver.get(url)
        
        # Inject network tracking code after navigation
        if wait_strategy in ["normal", "thorough"]:
            WaitStrategies.inject_network_tracking_code(driver, network_idle_time)
        
        # Use the improved page load waiting mechanism
        WaitStrategies.wait_for_page_to_load(driver, wait_strategy, timeout, network_idle_time)
        
        if wait_for:
            try:
                # Use enhanced element waiting based on wait strategy
                if wait_strategy == "minimal":
                    WebDriverWait(driver, timeout).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, wait_for))
                    )
                elif wait_strategy == "normal":
                    WebDriverWait(driver, timeout).until(
                        EC.visibility_of_element_located((By.CSS_SELECTOR, wait_for))
                    )
                else:  # thorough
                    WebDriverWait(driver, timeout).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, wait_for))
                    )
            except TimeoutException as e:
                return CLIResult(
                    error=f"Navigation succeeded but element '{wait_for}' was not found: {str(e)}"
                )
        
        # Apply additional delay if specified
        if post_action_delay > 0:
            time.sleep(post_action_delay)
            
        # Take a screenshot of the resulting page
        screenshot_data = ScreenshotCapture.capture_screenshot(driver)
        
        # Return success message with page information
        title = driver.title
        return CLIResult(
            output=f"Successfully navigated to {url}\nPage title: {title}",
            base64_image=screenshot_data,
            metadata={
                "action": "navigate",
                "url": driver.current_url,
                "title": title,
                "wait_strategy": wait_strategy
            }
        )
    
    @staticmethod
    def handle_fill_form(
        driver, 
        form_data: Dict[str, str], 
        submit: bool, 
        wait_for: Optional[str],
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY,
        network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME
    ) -> CLIResult:
        """Handle filling a form with the provided data.
        
        Args:
            driver: Selenium WebDriver instance
            form_data: Dictionary of form field selectors and values
            submit: Whether to submit the form after filling
            wait_for: Optional selector to wait for after form submission
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            network_idle_time: Time to wait for network to be idle
            
        Returns:
            CLIResult with the outcome of the form fill operation
        """
        # Fill form fields
        filled_fields = []
        for selector, value in form_data.items():
            try:
                # Try to find the element
                element = WebDriverWait(driver, timeout).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                
                # Determine if it's a select, checkbox, or regular input
                tag_name = element.tag_name.lower()
                element_type = element.get_attribute("type") or ""
                
                if tag_name == "select":
                    select = Select(element)
                    select.select_by_visible_text(value)
                elif element_type == "checkbox" or element_type == "radio":
                    # For checkboxes/radios, check or uncheck based on value
                    is_checked = element.is_selected()
                    should_check = value.lower() in ["true", "yes", "1", "check", "checked"]
                    
                    if should_check and not is_checked:
                        element.click()
                    elif not should_check and is_checked:
                        element.click()
                else:
                    # Regular text input
                    element.clear()
                    element.send_keys(value)
                
                filled_fields.append(selector)
            except (TimeoutException, NoSuchElementException) as e:
                return CLIResult(
                    error=f"Failed to fill field '{selector}': {str(e)}"
                )
        
        # Submit the form if required
        if submit:
            try:
                if filled_fields:
                    # Try to find the form containing the first field
                    form_element = None
                    try:
                        first_field_element = driver.find_element(By.CSS_SELECTOR, filled_fields[0])
                        form_element = ElementActions.find_parent_form(driver, first_field_element)
                    except (NoSuchElementException, Exception):
                        pass
                    
                    if form_element:
                        form_element.submit()
                    else:
                        # If we can't find the form, try to submit with Enter key on the last field
                        last_field_element = driver.find_element(By.CSS_SELECTOR, filled_fields[-1])
                        last_field_element.send_keys(Keys.ENTER)
                    
                    # Inject network tracking code after form submission
                    if wait_strategy in ["normal", "thorough"]:
                        WaitStrategies.inject_network_tracking_code(driver, network_idle_time)
                    
                    # Wait for page to load with improved waiting
                    WaitStrategies.wait_for_page_to_load(driver, wait_strategy, timeout, network_idle_time)
                    
                    # Wait for specific element if specified
                    if wait_for:
                        try:
                            WebDriverWait(driver, timeout).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, wait_for))
                            )
                        except TimeoutException as e:
                            return CLIResult(
                                error=f"Form submitted but element '{wait_for}' was not found: {str(e)}"
                            )
            except Exception as e:
                return CLIResult(
                    error=f"Form filled successfully but submission failed: {str(e)}"
                )
        
        # Take a screenshot of the result
        screenshot_data = ScreenshotCapture.capture_screenshot(driver)
        
        # Return success message
        output = f"Successfully filled {len(filled_fields)} form fields"
        if submit:
            output += " and submitted the form"
        
        return CLIResult(
            output=output,
            base64_image=screenshot_data,
            metadata={
                "action": "fill_form",
                "fields_filled": filled_fields,
                "submitted": submit,
                "current_url": driver.current_url
            }
        )
    
    @staticmethod
    def handle_click(
        driver, 
        selector: str, 
        wait_for: Optional[str],
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY,
        network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME
    ) -> CLIResult:
        """Handle clicking on an element.
        
        Args:
            driver: Selenium WebDriver instance
            selector: CSS selector for the element to click
            wait_for: Optional selector to wait for after clicking
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            network_idle_time: Time to wait for network to be idle
            
        Returns:
            CLIResult with the outcome of the click operation
        """
        try:
            # Use enhanced element waiting for better reliability
            element = WaitStrategies.wait_for_element_ready(driver, selector, wait_strategy, timeout)
            
            # Retry mechanism for flaky elements
            max_attempts = 3 if wait_strategy in ["normal", "thorough"] else 1
            success = False
            
            for attempt in range(max_attempts):
                try:
                    # Get element text before clicking
                    try:
                        element_text = element.text or element.get_attribute("value") or "No text"
                    except:
                        element_text = "No text"
                    
                    # Scroll element into view with a smoother approach
                    driver.execute_script("""
                        arguments[0].scrollIntoView({
                            behavior: 'smooth', 
                            block: 'center'
                        });
                    """, element)
                    
                    # Wait for scrolling to complete
                    time.sleep(0.5)
                    
                    # Check if element is covered by other elements
                    is_covered = driver.execute_script("""
                        var element = arguments[0];
                        var rect = element.getBoundingClientRect();
                        var centerX = rect.left + rect.width / 2;
                        var centerY = rect.top + rect.height / 2;
                        var elementAtPoint = document.elementFromPoint(centerX, centerY);
                        return !element.contains(elementAtPoint) && elementAtPoint !== element;
                    """, element)
                    
                    if is_covered and attempt < max_attempts - 1:
                        # Wait a bit and retry if element is covered
                        time.sleep(1)
                        element = WaitStrategies.wait_for_element_ready(driver, selector, wait_strategy, timeout)
                        continue
                    
                    # Try click with retry mechanism and different methods
                    click_methods = [
                        # Method 1: Standard click
                        lambda: element.click(),
                        # Method 2: JavaScript click
                        lambda: driver.execute_script("arguments[0].click();", element),
                        # Method 3: ActionChains click
                        lambda: ElementActions.action_chains_click(driver, element)
                    ]
                    
                    for click_method in click_methods:
                        try:
                            click_method()
                            success = True
                            break
                        except (ElementClickInterceptedException, StaleElementReferenceException) as e:
                            logger.warning(f"Click attempt failed: {str(e)}, trying alternative method")
                            # If element becomes stale, find it again
                            if isinstance(e, StaleElementReferenceException):
                                element = WaitStrategies.wait_for_element_ready(driver, selector, wait_strategy, timeout)
                            continue
                    
                    if success:
                        break
                        
                except (ElementClickInterceptedException, StaleElementReferenceException) as e:
                    if attempt < max_attempts - 1:
                        logger.warning(f"Click attempt {attempt+1} failed: {str(e)}, retrying...")
                        # Wait a bit and retry
                        time.sleep(1)
                        element = WaitStrategies.wait_for_element_ready(driver, selector, wait_strategy, timeout)
                    else:
                        raise e
            
            if not success:
                return CLIResult(
                    error=f"Failed to click element '{selector}' after multiple attempts"
                )
            
            # Inject network tracking code after click (may navigate)
            if wait_strategy in ["normal", "thorough"]:
                WaitStrategies.inject_network_tracking_code(driver, network_idle_time)
            
            # Use the improved waiting after action
            WaitStrategies.apply_post_action_wait(driver, wait_for, wait_strategy, timeout, post_action_delay, network_idle_time)
            
            # Take a screenshot of the result
            screenshot_data = ScreenshotCapture.capture_screenshot(driver)
            
            # Return success message
            return CLIResult(
                output=f"Successfully clicked element '{selector}' with text: '{element_text}'",
                base64_image=screenshot_data,
                metadata={
                    "action": "click",
                    "element": selector,
                    "element_text": element_text,
                    "current_url": driver.current_url,
                    "wait_strategy": wait_strategy
                }
            )
        except Exception as e:
            return CLIResult(
                error=f"Failed to click element '{selector}': {str(e)}"
            )
    
    @staticmethod
    def handle_login(
        driver, 
        form_data: Dict[str, str], 
        wait_for: Optional[str],
        timeout: int,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY,
        network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME
    ) -> CLIResult:
        """Handle form-based authentication by filling and submitting credentials.
        
        Note: This is a generic form fill and submit operation tailored for authentication.
        The AI should determine which fields to use as username/password based on the context.
        
        Args:
            driver: Selenium WebDriver instance
            form_data: Dictionary with form field selectors and values
            wait_for: Optional selector to wait for after submission
            timeout: Maximum time to wait in seconds
            wait_strategy: Level of waiting thoroughness
            post_action_delay: Time to wait after action
            network_idle_time: Time to wait for network to be idle
            
        Returns:
            CLIResult with the outcome of the form submission
        """
        # Simply use the form_data directly - we don't make assumptions about which
        # fields are for username/password - that's up to the AI caller to determine
        
        # Fill the form with the provided data
        fill_result = WebActions.handle_fill_form(
            driver, form_data, True, wait_for, timeout, wait_strategy, post_action_delay, network_idle_time
        )
        
        # Take a screenshot and return the result
        screenshot_data = ScreenshotCapture.capture_screenshot(driver)
        
        # If fill_form had an error, return that error
        if fill_result.error:
            return fill_result
            
        # Get the current URL and page title
        title = driver.title
        current_url = driver.current_url
        
        return CLIResult(
            output=f"Form submission completed. Current page: {title}",
            base64_image=screenshot_data,
            metadata={
                "action": "login",
                "current_url": current_url,
                "page_title": title
            }
        )