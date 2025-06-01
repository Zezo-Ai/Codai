"""Development utilities and helpers."""
import os
import psutil
import json
from pathlib import Path
from typing import Dict, Any
import time

def clear_terminal():
    """Clear the terminal screen."""
    os.system('cls' if os.name == 'nt' else 'clear')

def format_size(size_bytes: int) -> str:
    """Format byte size to human readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f}{unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f}TB"

def get_system_stats() -> Dict[str, Any]:
    """Get current system statistics."""
    process = psutil.Process()
    memory_info = process.memory_info()
    
    return {
        'memory': {
            'rss': format_size(memory_info.rss),
            'vms': format_size(memory_info.vms),
            'percent': process.memory_percent()
        },
        'cpu': {
            'percent': process.cpu_percent(),
            'threads': process.num_threads()
        },
        'io': {
            'read_bytes': format_size(process.io_counters().read_bytes),
            'write_bytes': format_size(process.io_counters().write_bytes)
        }
    }

def print_config_summary(config: Dict[str, Any]) -> None:
    """Print a formatted summary of the current configuration."""
    print("\n=== Active Configuration ===")
    
    # Server settings
    print("\nServer:")
    print(f"  Host: {config['server']['host']}")
    print(f"  Port: {config['server']['port']}")
    print(f"  Reload: {'enabled' if config['server']['reload'] else 'disabled'}")
    
    # Watched paths
    if config['server'].get('watch_paths'):
        print("\nWatching paths:")
        for path in config['server']['watch_paths']:
            full_path = Path(path).resolve()
            print(f"  - {path} {'(exists)' if full_path.exists() else '(missing)'}")
    
    # Logging
    print("\nLogging:")
    print(f"  Level: {config['logging']['default_level']}")
    print(f"  Directory: {config['logging']['dir']}")
    
    # Development features
    if 'development' in config:
        print("\nDevelopment features:")
        dev_config = config['development']
        print(f"  Debug endpoints: {'enabled' if dev_config.get('debug_endpoints') else 'disabled'}")
        if dev_config.get('profiling', {}).get('enabled'):
            print("  Profiling: enabled")
            print(f"    Stats interval: {dev_config['profiling']['stats_interval']}s")
    
    print("\n" + "="*30 + "\n")

async def system_stats_middleware(app):
    """Middleware to collect system stats during development."""
    stats_start_time = time.time()
    
    @app.middleware("http")
    async def stats_middleware(request, call_next):
        if not app.state.config.get('development', {}).get('profiling', {}).get('enabled'):
            return await call_next(request)
        
        # Collect stats before request
        start_time = time.time()
        start_stats = get_system_stats()
        
        response = await call_next(request)
        
        # Collect stats after request
        end_time = time.time()
        end_stats = get_system_stats()
        
        # Calculate request stats
        request_stats = {
            'path': request.url.path,
            'method': request.method,
            'duration_ms': (end_time - start_time) * 1000,
            'memory_change': {
                'rss': end_stats['memory']['rss'] - start_stats['memory']['rss'],
                'vms': end_stats['memory']['vms'] - start_stats['memory']['vms']
            }
        }
        
        # Log stats if interval has passed
        stats_interval = app.state.config['development']['profiling']['stats_interval']
        if time.time() - stats_start_time >= stats_interval:
            print("\n=== System Stats Update ===")
            print(json.dumps(end_stats, indent=2))
            print("\nLast Request:")
            print(json.dumps(request_stats, indent=2))
            print("="*30 + "\n")
        
        return response
    
    return app