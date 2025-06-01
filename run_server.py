"""Server startup script with unified logging."""
import uvicorn
import signal
import sys
import argparse
import atexit
from pathlib import Path
from server.logging import setup_server_logging, get_server_logger
from core.logging import initialize_logging, cleanup_logging
from core.config_manager import get_config
from core.development import clear_terminal, print_config_summary
from server.reload_handler import get_reload_handler
import time
import os

def parse_args():
    parser = argparse.ArgumentParser(description='Run the server with specified options')
    parser.add_argument('--clean-logs', action='store_true', 
                        help='Clean log files before starting')
    parser.add_argument('--no-clean-logs', action='store_true',
                        help='Prevent automatic log cleaning in development')
    parser.add_argument('--env', 
                        help='Environment to run in (development/production)',
                        default=None)
    return parser.parse_args()

def shutdown(remove_logs: bool = False):
    """Cleanup function to be called on server shutdown."""
    try:
        print("\nShutting down server...")
        
        # Force flush any pending log messages
        for handler in logger.handlers:
            handler.flush()
        
        # Import here to avoid circular imports
        import logging
        root = logging.getLogger()
        
        # Shutdown all loggers
        logging.shutdown()
        
        # Clear all handlers from root logger
        root.handlers = []
        
        # Now clean up our logging system
        cleanup_logging()
        
        # Extra delay to ensure files are released
        time.sleep(1.0)
        
        # If requested, try to remove the actual log files
        if remove_logs:
            import shutil
            log_dir = Path(__file__).parent / 'logs'
            try:
                if log_dir.exists():
                    shutil.rmtree(log_dir, ignore_errors=True)
            except Exception as e:
                print(f"Warning: Could not remove log directory: {e}")
        
        print("Server shutdown complete")
                
    except Exception as e:
        print(f"Error during shutdown: {e}")
        import traceback
        traceback.print_exc()

def signal_handler(signum, frame, manager):
    """Handle termination signals gracefully."""
    print("\nReceived shutdown signal. Cleaning up...")
    manager.safe_shutdown()
    sys.exit(0)

def reload_signal_handler(signum, frame):
    """Handle reload signals."""
    if 'reload_handler' in globals():
        reload_handler.on_reload()

class ServerManager:
    """Manages server state and shutdown sequence."""
    
    def __init__(self):
        self.shutdown_initiated = False
        self.reload_handler = None
        
    def safe_shutdown(self):
        """Ensure shutdown only happens once."""
        if not self.shutdown_initiated:
            self.shutdown_initiated = True
            shutdown()
            
    def set_reload_handler(self, handler):
        """Set the reload handler."""
        self.reload_handler = handler
        
    def handle_reload(self):
        """Handle server reload."""
        if self.reload_handler:
            self.reload_handler.on_reload()

if __name__ == "__main__":
    args = parse_args()
    
    print("\nInitializing server...")
    
    # Initialize logging system
    config_path = Path(__file__).parent / 'config' / 'logging.yaml'
    initialize_logging(str(config_path), refresh=args.clean_logs)
    
    # Get server logger
    logger = get_server_logger("main")
    print("Logging system initialized")
    
    # Configure uvicorn logging to suppress console output
    log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.NullHandler",
            },
        },
        "loggers": {
            "uvicorn": {"handlers": ["default"], "level": "INFO", "propagate": False},
            "uvicorn.error": {"handlers": ["default"], "level": "INFO", "propagate": False},
            "uvicorn.access": {"handlers": ["default"], "level": "INFO", "propagate": False},
        },
    }
    
    # Create server manager to handle state
    manager = ServerManager()
    
    # Register shutdown handlers
    atexit.register(manager.safe_shutdown)
    signal.signal(signal.SIGINT, lambda s, f: signal_handler(s, f, manager))
    if sys.platform == 'win32':
        signal.signal(signal.SIGBREAK, lambda s, f: signal_handler(s, f, manager))
        # Register custom reload handler for Windows
        signal.signal(signal.SIGILL, reload_signal_handler)
    else:
        signal.signal(signal.SIGTERM, lambda s, f: signal_handler(s, f, manager))
        # Register custom reload handler for Unix
        signal.signal(signal.SIGUSR1, reload_signal_handler)
    
    # Load application configuration
    config_manager = get_config(args.env)
    
    # Validate configuration
    try:
        config_manager.validate()
    except Exception as e:
        logger.error(f"Configuration validation failed: {e}")
        sys.exit(1)
    
    # Handle log cleaning based on environment and flags
    should_clean_logs = (
        args.clean_logs or
        (config_manager.get('server.clean_logs_on_restart', False) and not args.no_clean_logs)
    )
    
    if should_clean_logs:
        print("Cleaning log files...")
        cleanup_logging()
        time.sleep(0.5)  # Give a moment for file handles to be released
    
    # Run the server
    try:
        host = config_manager.get('server.host')
        # Check for SERVER_PORT environment variable (used by Electron)
        port = int(os.getenv('SERVER_PORT', config_manager.get('server.port')))
        reload = config_manager.get('server.reload', False)
        # Get configuration from centralized config
        from pathlib import Path
        BASE_DIR = Path(__file__).parent
        WATCH_PATHS = config_manager.get('development.hot_reload.watch_paths', [])
        WATCH_PATTERNS = config_manager.get('development.hot_reload.watch_patterns', ["*.py"])
        EXCLUDE_PATTERNS = config_manager.get('development.hot_reload.exclude_patterns', [])
        
        # Convert and validate watch paths
        resolved_paths = set()  # Use set to avoid duplicates
        
        for pattern in WATCH_PATHS:
            pattern_path = BASE_DIR / pattern
            if pattern_path.exists():
                resolved_paths.add(str(pattern_path))
            else:
                print(f"Warning: Watch path does not exist: {pattern}")
        
        # Convert set back to list
        watch_paths = sorted(list(resolved_paths))
        
        # Get patterns for reload
        reload_patterns = WATCH_PATTERNS
        
        # Clear terminal if configured
        # Initialize reload handler
        reload_handler = get_reload_handler(config_manager.get_all())
        
        if config_manager.get('server.clear_terminal_on_reload', False):
            clear_terminal()
        
        # Show configuration summary if enabled
        if config_manager.get('development.show_config_on_startup', False):
            print_config_summary(config_manager.get_all())
            
        # Log summarization configuration
        print("\n=== Summarization Configuration ===")
        print(f"Enabled: {config_manager.get('ai.token_management.enable_summarization')}")
        print(f"Threshold: {config_manager.get('ai.token_management.summary_triggers.threshold_percentage')*100:.1f}%")
        print(f"Min pairs: {config_manager.get('ai.conversation.summary.min_pairs', 2)}")
        print(f"Section min pairs - First: {config_manager.get('ai.conversation.section.first.min_pairs', 2)}, Middle: {config_manager.get('ai.conversation.section.middle.min_pairs', 1)}, Last: {config_manager.get('ai.conversation.section.last.min_pairs', 2)}")
        print("=====================================\n")
            
        print(f"\nStarting server on http://{host}:{port}")
        if reload:
            print("\nHot reload is enabled. Server will restart on file changes.")
            print("\nWatching directories:")
            for path in watch_paths:
                # Use ASCII characters for Windows compatibility
                status = "[OK]" if Path(path).exists() else "[X]"
                print(f"  {status} {path}")
            
            # Initialize reload handler before starting
            reload_handler.on_reload()
            
        print("\nPress Ctrl+C to stop\n")
        
        config = uvicorn.Config(
            "server.app:app",
            host=host,
            port=port,
            reload=reload,
            log_config=log_config,
            log_level=config_manager.get('logging.levels.default', 'error').lower(),
            access_log=False,
            reload_dirs=watch_paths if reload else None,
            reload_excludes=EXCLUDE_PATTERNS if reload else None,
            reload_includes=reload_patterns if reload else None,  # Add explicit file patterns to watch
            workers=1,  # Use single worker for development
            reload_delay=config_manager.get('development.settings.reload_delay', 0.25) if reload else None  # Faster reload
        )
        server = uvicorn.Server(config)
        server.install_signal_handlers = lambda: None  # Let our own signal handlers work
        server.run()
    except Exception as e:
        logger.error(
            "Server failed to start",
            exc_info=True,
            extra={
                'error_type': type(e).__name__,
                'error_message': str(e)
            }
        )
    finally:
        manager.safe_shutdown()
        