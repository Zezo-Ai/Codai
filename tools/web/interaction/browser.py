"""Browser management and initialization module."""

import logging
import threading
import time
from contextlib import contextmanager
from typing import Any

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

from .constants import (
    DEFAULT_VIEWPORT, DEFAULT_USER_AGENT, logger
)

# Initialize global driver container for thread-local storage
_driver_container = threading.local()

class BrowserManager:
    """Manages browser instances for web interaction."""
    
    @staticmethod
    @contextmanager
    def get_browser_context():
        """Get or create a browser for automation.
        
        Yields:
            A WebDriver instance for interaction
        """
        if hasattr(_driver_container, 'driver') and _driver_container.driver:
            # Reuse existing driver if available
            try:
                # Check if the driver is still responsive
                _driver_container.driver.current_url
                yield _driver_container.driver
                return
            except Exception:
                # Driver is not responsive, close it and create a new one
                try:
                    _driver_container.driver.quit()
                except Exception:
                    pass
                _driver_container.driver = None
        
        try:
            # Configure Chrome options
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument(f"--window-size={DEFAULT_VIEWPORT['width']},{DEFAULT_VIEWPORT['height']}")
            chrome_options.add_argument(f"user-agent={DEFAULT_USER_AGENT}")
            
            # Initialize Chrome WebDriver
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            
            # Store driver in thread-local storage for potential reuse
            _driver_container.driver = driver
            
            try:
                yield driver
            finally:
                # Note: We don't close the driver here to allow reuse
                pass
        except Exception as e:
            raise RuntimeError(f"Failed to initialize browser: {str(e)}")
    
    @staticmethod
    def close():
        """Close the browser and clean up resources."""
        if hasattr(_driver_container, 'driver') and _driver_container.driver:
            try:
                _driver_container.driver.quit()
            except Exception:
                pass
            _driver_container.driver = None
    
    @staticmethod
    def is_valid_url(url: str) -> bool:
        """Check if a URL is valid.
        
        Args:
            url: The URL to validate
            
        Returns:
            True if the URL is valid, False otherwise
        """
        from urllib.parse import urlparse
        
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False

# Cleanup on module unload
import atexit
atexit.register(BrowserManager.close)