"""Waiting strategies for web page and element loading."""

import time
import logging
from typing import Any, Optional

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, StaleElementReferenceException

from .constants import (
    DEFAULT_TIMEOUT, DEFAULT_NETWORK_IDLE_TIME, DEFAULT_WAIT_STRATEGY,
    DEFAULT_POST_ACTION_DELAY, logger
)
from .logger import EventLogger

class WaitStrategies:
    """Implementation of various waiting strategies for web interaction."""
    
    @staticmethod
    def inject_network_tracking_code(driver, network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME) -> None:
        """Inject JavaScript code to track network requests.
        
        Args:
            driver: Selenium WebDriver instance
            network_idle_time: Time in seconds to wait for network to be idle
        """
        # Wait for AJAX requests to complete (jQuery if available)
        driver.execute_script("""
            // Reset tracking variables
            window.seleniumNetworkCounter = 0;
            window.seleniumNetworkComplete = false;
            window.seleniumNetworkRequests = {};
            window.seleniumNetworkDebug = true;
            window.seleniumNetworkLog = function(msg) {
                if (window.seleniumNetworkDebug && console && console.log) {
                    console.log('[Selenium Network] ' + msg);
                }
            };
            
            // Track XMLHttpRequest with better error handling
            (function(open) {
                XMLHttpRequest.prototype.open = function(method, url) {
                    var reqId = 'xhr_' + Math.random().toString(36).substr(2, 9);
                    this._seleniumReqId = reqId;
                    
                    window.seleniumNetworkCounter++;
                    window.seleniumNetworkRequests[reqId] = {
                        type: 'xhr',
                        method: method,
                        url: url,
                        start: new Date().getTime()
                    };
                    
                    window.seleniumNetworkLog('Started XHR: ' + method + ' ' + url + ' (counter: ' + window.seleniumNetworkCounter + ')');
                    
                    // Add multiple listeners to ensure we catch all outcomes
                    var decrementCounter = function() {
                        if (window.seleniumNetworkRequests[reqId]) {
                            window.seleniumNetworkCounter--;
                            window.seleniumNetworkRequests[reqId].end = new Date().getTime();
                            window.seleniumNetworkRequests[reqId].duration = 
                                window.seleniumNetworkRequests[reqId].end - 
                                window.seleniumNetworkRequests[reqId].start;
                            window.seleniumNetworkLog('Completed XHR: ' + method + ' ' + url + 
                                ' (counter: ' + window.seleniumNetworkCounter + 
                                ', duration: ' + window.seleniumNetworkRequests[reqId].duration + 'ms)');
                            delete window.seleniumNetworkRequests[reqId];
                        }
                    };
                    
                    this.addEventListener('load', decrementCounter);
                    this.addEventListener('error', decrementCounter);
                    this.addEventListener('abort', decrementCounter);
                    this.addEventListener('timeout', decrementCounter);
                    
                    return open.apply(this, arguments);
                };
            })(XMLHttpRequest.prototype.open);
            
            // Track fetch API with proper Promise handling
            (function(originalFetch) {
                window.fetch = function() {
                    var reqId = 'fetch_' + Math.random().toString(36).substr(2, 9);
                    var method = arguments[1] && arguments[1].method ? arguments[1].method : 'GET';
                    var url = arguments[0] || 'unknown';
                    
                    window.seleniumNetworkCounter++;
                    window.seleniumNetworkRequests[reqId] = {
                        type: 'fetch',
                        method: method,
                        url: url,
                        start: new Date().getTime()
                    };
                    
                    window.seleniumNetworkLog('Started fetch: ' + method + ' ' + url + ' (counter: ' + window.seleniumNetworkCounter + ')');
                    
                    function handleCompletion() {
                        if (window.seleniumNetworkRequests[reqId]) {
                            window.seleniumNetworkCounter--;
                            window.seleniumNetworkRequests[reqId].end = new Date().getTime();
                            window.seleniumNetworkRequests[reqId].duration = 
                                window.seleniumNetworkRequests[reqId].end - 
                                window.seleniumNetworkRequests[reqId].start;
                            window.seleniumNetworkLog('Completed fetch: ' + method + ' ' + url + 
                                ' (counter: ' + window.seleniumNetworkCounter + 
                                ', duration: ' + window.seleniumNetworkRequests[reqId].duration + 'ms)');
                            delete window.seleniumNetworkRequests[reqId];
                        }
                    }
                    
                    return originalFetch.apply(this, arguments)
                        .then(function(response) {
                            handleCompletion();
                            return response;
                        })
                        .catch(function(error) {
                            handleCompletion();
                            throw error;
                        });
                };
            })(window.fetch);
            
            // Track jQuery AJAX if available
            if (typeof jQuery !== 'undefined') {
                jQuery(document).ajaxSend(function(event, jqXHR, settings) {
                    var reqId = 'jquery_' + Math.random().toString(36).substr(2, 9);
                    jqXHR._seleniumReqId = reqId;
                    
                    window.seleniumNetworkCounter++;
                    window.seleniumNetworkRequests[reqId] = {
                        type: 'jquery',
                        method: settings.type || 'GET',
                        url: settings.url || 'unknown',
                        start: new Date().getTime()
                    };
                    
                    window.seleniumNetworkLog('Started jQuery: ' + settings.type + ' ' + settings.url + ' (counter: ' + window.seleniumNetworkCounter + ')');
                });
                
                jQuery(document).ajaxComplete(function(event, jqXHR, settings) {
                    var reqId = jqXHR._seleniumReqId;
                    if (reqId && window.seleniumNetworkRequests[reqId]) {
                        window.seleniumNetworkCounter--;
                        window.seleniumNetworkRequests[reqId].end = new Date().getTime();
                        window.seleniumNetworkRequests[reqId].duration = 
                            window.seleniumNetworkRequests[reqId].end - 
                            window.seleniumNetworkRequests[reqId].start;
                        window.seleniumNetworkLog('Completed jQuery: ' + settings.type + ' ' + settings.url + 
                            ' (counter: ' + window.seleniumNetworkCounter + 
                            ', duration: ' + window.seleniumNetworkRequests[reqId].duration + 'ms)');
                        delete window.seleniumNetworkRequests[reqId];
                    }
                });
            }
            
            // Set timer for network idle
            window.seleniumNetworkLog('Setting network idle timeout: ' + """ + str(int(network_idle_time * 1000)) + """ + 'ms');
            setTimeout(function() {
                window.seleniumNetworkComplete = true;
                window.seleniumNetworkLog('Network idle timeout complete. Active requests: ' + window.seleniumNetworkCounter);
                
                // Log any pending requests
                if (window.seleniumNetworkCounter > 0) {
                    window.seleniumNetworkLog('Pending requests:');
                    for (var reqId in window.seleniumNetworkRequests) {
                        var req = window.seleniumNetworkRequests[reqId];
                        var duration = new Date().getTime() - req.start;
                        window.seleniumNetworkLog(' - ' + req.type + ': ' + req.method + ' ' + req.url + 
                            ' (running for ' + duration + 'ms)');
                    }
                }
            }, """ + str(int(network_idle_time * 1000)) + """);
        """)
    
    @staticmethod
    def wait_for_page_to_load(
        driver,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        timeout: int = DEFAULT_TIMEOUT,
        network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME
    ) -> None:
        """Wait for page to be fully loaded based on the selected strategy.
        
        Args:
            driver: Selenium WebDriver instance
            wait_strategy: Level of waiting thoroughness ("minimal", "normal", or "thorough")
            timeout: Maximum time to wait in seconds
            network_idle_time: Time to wait for network to be idle
        """
        wait_id = EventLogger.event_start("wait", "page_load", {
            "wait_strategy": wait_strategy,
            "timeout": timeout,
            "network_idle_time": network_idle_time
        })
        
        try:
            # Start timing for readyState
            ready_state_id = EventLogger.event_start("wait", "ready_state", {})
            
            # Basic document ready state
            ready_state_start = time.time()
            WebDriverWait(driver, timeout).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            ready_state_time = time.time() - ready_state_start
            
            EventLogger.performance_metric("ready_state_wait_time", ready_state_time, {
                "wait_strategy": wait_strategy
            })
            EventLogger.event_end(ready_state_id, "success", {"duration": ready_state_time})
            
            EventLogger.state_transition("waiting", "document_ready", {
                "wait_strategy": wait_strategy
            })
            
            if wait_strategy == "minimal":
                # Just wait a minimal fixed amount after document ready
                EventLogger.action_log("Using minimal wait strategy, skipping additional waits", {
                    "delay": 0.5
                })
                time.sleep(0.5)
                EventLogger.event_end(wait_id, "success", {"strategy": "minimal"})
                return
                
            # For normal and thorough strategies, wait for network idle
            if wait_strategy in ["normal", "thorough"]:
                network_id = EventLogger.event_start("wait", "network_idle", {
                    "network_idle_time": network_idle_time
                })
                
                # Inject network tracking code
                EventLogger.action_log("Injecting network tracking code", {
                    "idle_time": network_idle_time
                })
                WaitStrategies.inject_network_tracking_code(driver, network_idle_time)
                
                # Wait for network to be idle with detailed diagnostics
                try:
                    # Add diagnostic script to monitor network activity during wait
                    driver.execute_script("""
                        window.seleniumNetworkLogs = [];
                        window.seleniumLogNetworkStatus = function() {
                            var status = {
                                counter: window.seleniumNetworkCounter || 0,
                                complete: window.seleniumNetworkComplete || false,
                                timestamp: new Date().toISOString()
                            };
                            window.seleniumNetworkLogs.push(status);
                            // Keep log size manageable
                            if (window.seleniumNetworkLogs.length > 50) {
                                window.seleniumNetworkLogs.shift();
                            }
                            return status;
                        };
                        setInterval(window.seleniumLogNetworkStatus, 1000);
                    """)
                    
                    # Start timing
                    network_start = time.time()
                    
                    # Log initial status
                    initial_status = driver.execute_script("return window.seleniumLogNetworkStatus();")
                    EventLogger.action_log("Initial network status", {
                        "counter": initial_status.get("counter", "unknown"),
                        "complete": initial_status.get("complete", False)
                    })
                    
                    # Setup polling with diagnostics
                    polling_interval = 1.0  # seconds
                    max_polls = int(timeout / polling_interval)
                    last_status = initial_status
                    
                    for poll in range(max_polls):
                        # Check network status
                        status = driver.execute_script("""
                            var status = window.seleniumLogNetworkStatus();
                            return {
                                counter: window.seleniumNetworkCounter || 0,
                                complete: window.seleniumNetworkComplete || false,
                                elapsed: (new Date().getTime() - new Date(status.timestamp).getTime()) / 1000
                            };
                        """)
                        
                        # Log every 5 seconds or if counter changed
                        if poll % 5 == 0 or (poll > 0 and status.get("counter") != last_status.get("counter")):
                            EventLogger.action_log(f"Waiting for network idle (poll {poll+1}/{max_polls})", {
                                "counter": status.get("counter", "unknown"),
                                "complete": status.get("complete", False),
                                "elapsed": f"{time.time() - network_start:.1f}s",
                                "timeout_in": f"{timeout - (time.time() - network_start):.1f}s"
                            })
                        
                        # Store for comparison
                        last_status = status
                        
                        # Check if condition is met
                        if status.get("counter", 1) == 0 and status.get("complete", False):
                            break
                            
                        # Wait before next poll
                        time.sleep(polling_interval)
                        
                        # Check if we've exceeded timeout
                        if time.time() - network_start >= timeout:
                            # Get detailed network logs
                            network_logs = driver.execute_script("return window.seleniumNetworkLogs;")
                            raise TimeoutException(f"Network not idle after {timeout}s. Current counter: {status.get('counter')}")
                    
                    # Calculate wait time
                    network_time = time.time() - network_start
                    
                    EventLogger.performance_metric("network_idle_wait_time", network_time, {
                        "wait_strategy": wait_strategy,
                        "final_counter": status.get("counter", "unknown")
                    })
                    EventLogger.event_end(network_id, "success", {
                        "duration": network_time,
                        "counter": status.get("counter", "unknown"),
                        "complete": status.get("complete", False)
                    })
                    EventLogger.state_transition("document_ready", "network_idle", {})
                except Exception as e:
                    # If we timeout waiting for network idle, capture detailed diagnostics
                    elapsed = time.time() - network_start
                    
                    # Get final network status
                    try:
                        final_status = driver.execute_script("""
                            return {
                                counter: window.seleniumNetworkCounter || 0,
                                complete: window.seleniumNetworkComplete || false,
                                logs: window.seleniumNetworkLogs || []
                            };
                        """)
                        
                        # Extract a summary of the logs
                        network_log_summary = "Network activity summary:\n"
                        if final_status.get("logs"):
                            log_sample = final_status["logs"][-5:] if len(final_status["logs"]) > 5 else final_status["logs"]
                            for idx, entry in enumerate(log_sample):
                                network_log_summary += f"  {idx+1}. Counter: {entry.get('counter', '?')}, Complete: {entry.get('complete', '?')}, Time: {entry.get('timestamp', '?')}\n"
                        
                        EventLogger.action_log("Network idle timeout - final status", {
                            "counter": final_status.get("counter", "unknown"),
                            "complete": final_status.get("complete", False),
                            "log_count": len(final_status.get("logs", [])),
                            "elapsed": f"{elapsed:.1f}s"
                        }, "warning")
                        
                        logger.warning(f"Timed out waiting for network idle after {elapsed:.1f}s. Counter: {final_status.get('counter', 'unknown')}")
                        logger.warning(network_log_summary)
                    except:
                        logger.warning(f"Timed out waiting for network idle after {elapsed:.1f}s. Could not retrieve network status.")
                    
                    EventLogger.event_end(network_id, "warning", {
                        "reason": "timeout",
                        "message": str(e) if isinstance(e, Exception) else "Unknown error",
                        "elapsed": elapsed
                    })
            
            # For thorough strategy, also wait for DOM stability and animations
            if wait_strategy == "thorough":
                animation_id = EventLogger.event_start("wait", "animations", {})
                
                # Wait for any CSS animations/transitions to complete
                EventLogger.action_log("Waiting for animations to start", {"delay": 0.5})
                time.sleep(0.5)  # Brief pause for animations to start
                
                try:
                    # Get elements with animations/transitions - optimized to limit DOM scanning
                    animation_query = """
                        return (function() {
                            var animating = 0;
                            var maxElements = 100; // Limit scanning to first 100 elements for performance
                            
                            // More targeted selector for elements likely to have animations
                            var animationSelectors = [
                                // Common animation selectors
                                '.animate', '.animation', '.transition', '.loading', '.fade',
                                // Elements with transform, animation or transition in style
                                '[style*="transform"]', '[style*="animation"]', '[style*="transition"]',
                                // Common UI elements that often have animations
                                'nav', 'header', '.nav', '.menu', '.dropdown', '.modal', '.dialog',
                                '.carousel', '.slider', '.notification', '.alert', '.toast'
                            ];
                            
                            try {
                                // Check more targeted elements first
                                var targetedElements = document.querySelectorAll(animationSelectors.join(','));
                                for (var i = 0; i < Math.min(targetedElements.length, maxElements); i++) {
                                    var style = window.getComputedStyle(targetedElements[i]);
                                    if (style.animation !== 'none' || 
                                        style.transition !== 'none' ||
                                        style.transform !== 'none') {
                                        animating++;
                                    }
                                }
                                
                                // If no animations found in targeted elements, do a limited scan of all elements
                                if (animating === 0) {
                                    var elements = document.querySelectorAll('div, section, article, aside, nav, header, footer');
                                    for (var i = 0; i < Math.min(elements.length, maxElements); i++) {
                                        var style = window.getComputedStyle(elements[i]);
                                        if (style.animation !== 'none' || 
                                            style.transition !== 'none' ||
                                            style.transform !== 'none') {
                                            animating++;
                                        }
                                    }
                                }
                                
                                return animating;
                            } catch (e) {
                                return 0; // Error failsafe
                            }
                        })();
                    """
                    
                    # Wait until no more elements are animating
                    animation_start = time.time()
                    animation_count = driver.execute_script(animation_query)
                    EventLogger.action_log("Found elements with animations", {
                        "count": animation_count
                    })
                    
                    if animation_count > 0:
                        animation_check_count = 0
                        while time.time() - animation_start < min(5, timeout/2):  # Cap at 5 seconds or half timeout
                            animation_check_count += 1
                            current_animation_count = driver.execute_script(animation_query)
                            
                            if current_animation_count == 0:
                                EventLogger.action_log("Animations completed", {
                                    "checks": animation_check_count,
                                    "duration": time.time() - animation_start
                                })
                                break
                                
                            EventLogger.action_log("Waiting for animations to complete", {
                                "remaining": current_animation_count,
                                "check": animation_check_count
                            }, "debug")
                            time.sleep(0.1)
                    
                    animation_time = time.time() - animation_start
                    EventLogger.performance_metric("animation_wait_time", animation_time, {
                        "initial_count": animation_count
                    })
                    EventLogger.event_end(animation_id, "success", {
                        "duration": animation_time,
                        "initial_animation_count": animation_count
                    })
                    EventLogger.state_transition("network_idle", "animations_complete", {})
                except Exception as e:
                    # If animation check fails, log and continue
                    EventLogger.event_end(animation_id, "warning", {
                        "error": str(e) if isinstance(e, Exception) else "Unknown error"
                    })
                    logger.warning("Failed to check for animations, continuing")
                    
                # Final small wait for any last rendering
                EventLogger.action_log("Final rendering wait", {"delay": 0.5})
                time.sleep(0.5)
            
            # Calculate total wait time
            total_wait_time = time.time() - ready_state_start
            EventLogger.performance_metric("total_page_wait_time", total_wait_time, {
                "wait_strategy": wait_strategy
            })
            
            EventLogger.event_end(wait_id, "success", {
                "total_wait_time": total_wait_time,
                "wait_strategy": wait_strategy
            })
        except Exception as e:
            EventLogger.event_end(wait_id, "error", {
                "error_type": type(e).__name__,
                "message": str(e)
            }, e)
            logger.warning(f"Error during page load waiting: {str(e)}")
            # Fallback to simple wait
            time.sleep(1)
    
    @staticmethod
    def wait_for_element_ready(
        driver,
        selector: str,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        timeout: int = DEFAULT_TIMEOUT
    ) -> Any:
        """Wait for an element to be fully ready for interaction.
        
        Args:
            driver: Selenium WebDriver instance
            selector: CSS selector for the element
            wait_strategy: Level of waiting thoroughness
            timeout: Maximum time to wait in seconds
            
        Returns:
            The WebElement when ready
            
        Raises:
            TimeoutException: If element not ready within timeout
        """
        # For all strategies, at minimum wait for element to be present
        element = WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        
        if wait_strategy == "minimal":
            return element
            
        # For normal and thorough, wait for element to be visible and clickable
        if wait_strategy in ["normal", "thorough"]:
            WebDriverWait(driver, timeout).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
            )
            
            if wait_strategy == "thorough":
                # Check if element is obscured by other elements
                try:
                    WebDriverWait(driver, timeout).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                    )
                    
                    # Check if element position is stable
                    last_location = None
                    stable_count = 0
                    max_checks = 5
                    
                    for _ in range(max_checks):
                        current_location = element.location
                        
                        if last_location == current_location:
                            stable_count += 1
                            if stable_count >= 3:  # Element position stable for 3 checks
                                break
                        else:
                            stable_count = 0
                            
                        last_location = current_location
                        time.sleep(0.1)
                except (TimeoutException, StaleElementReferenceException):
                    # If element becomes stale or times out, find it again
                    element = WebDriverWait(driver, timeout).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                    )
        
        return element
    
    @staticmethod
    def apply_post_action_wait(
        driver,
        wait_for: Optional[str] = None,
        wait_strategy: str = DEFAULT_WAIT_STRATEGY,
        timeout: int = DEFAULT_TIMEOUT,
        post_action_delay: float = DEFAULT_POST_ACTION_DELAY,
        network_idle_time: float = DEFAULT_NETWORK_IDLE_TIME
    ) -> None:
        """Apply waiting strategy after an action is performed.
        
        Args:
            driver: Selenium WebDriver instance
            wait_for: Optional selector to wait for after action
            wait_strategy: Level of waiting thoroughness
            timeout: Maximum time to wait in seconds
            post_action_delay: Time to wait after action
            network_idle_time: Time to wait for network to be idle
        """
        # Wait for page load first
        WaitStrategies.wait_for_page_to_load(driver, wait_strategy, timeout, network_idle_time)
        
        # If there's a specific element to wait for
        if wait_for:
            try:
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
            except Exception as e:
                logger.warning(f"Error waiting for element '{wait_for}': {str(e)}")
        
        # Apply post-action delay if specified
        if post_action_delay > 0:
            time.sleep(post_action_delay)