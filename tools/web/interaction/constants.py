"""Constants used by the web interaction modules."""

from .logger import web_logger as logger

# Timeout and waiting constants
DEFAULT_TIMEOUT = 30  # Default timeout in seconds
DEFAULT_PAGE_LOAD_TIMEOUT = 60  # Longer timeout for initial page loads
DEFAULT_NETWORK_IDLE_TIME = 2  # Time in seconds to wait for network to be idle
DEFAULT_POST_ACTION_DELAY = 0.5  # Default delay after actions

# Browser configuration constants
DEFAULT_VIEWPORT = {"width": 1280, "height": 720}
DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Wait strategy options
DEFAULT_WAIT_STRATEGY = "normal"  # Options: minimal, normal, thorough
WAIT_STRATEGIES = ["minimal", "normal", "thorough"]

# Wait strategy options - intentionally left empty beyond this point
# No common selectors or indicators that would embed business logic into the tool