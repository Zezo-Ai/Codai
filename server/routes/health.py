from fastapi import APIRouter, Response, Request
import os
import time
import psutil
import platform
from fastapi.responses import JSONResponse
from .utils import CustomAPIRoute
from datetime import datetime, timedelta
from server.logging import get_logger

# Initialize logger
logger = get_logger("debug")

# System monitoring functions
def get_system_metrics():
    """Get basic system metrics for health monitoring."""
    try:
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        return {
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_percent": memory.percent,
            "disk_percent": disk.percent,
            "platform": platform.system(),
            "python_version": platform.python_version()
        }
    except Exception as e:
        logger.warning(f"Failed to get system metrics: {str(e)}")
        return None

router = APIRouter(
    prefix="",  # No prefix for health endpoint
    tags=["health"],
    route_class=CustomAPIRoute
)

# In-memory cache for health status and metrics
_health_cache = {
    "last_check": None,
    "status": None,
    "error_count": 0,
    "last_error_log": None,
    "metrics_history": [],  # Store historical metrics
    "performance_baseline": None
}

# Configuration constants
CACHE_DURATION = timedelta(seconds=10)  # Cache health status for 10 seconds
ERROR_LOG_INTERVAL = timedelta(minutes=5)  # Log errors only every 5 minutes
METRICS_HISTORY_SIZE = 100  # Keep last 100 metric points
PERFORMANCE_THRESHOLD = {
    "cpu_percent": 80,  # CPU usage above 80% is concerning
    "memory_percent": 85,  # Memory usage above 85% is concerning
    "disk_percent": 90,  # Disk usage above 90% is concerning
}

def update_metrics_history(metrics: dict):
    """Update metrics history with new data points."""
    if metrics:
        _health_cache["metrics_history"].append({
            "timestamp": datetime.now(),
            **metrics
        })
        
        # Keep only last N entries
        if len(_health_cache["metrics_history"]) > METRICS_HISTORY_SIZE:
            _health_cache["metrics_history"].pop(0)

def check_performance_issues(metrics: dict) -> list:
    """Check for any performance issues based on current metrics."""
    if not metrics:
        return []
    
    issues = []
    for metric, value in metrics.items():
        if metric in PERFORMANCE_THRESHOLD and value > PERFORMANCE_THRESHOLD[metric]:
            issues.append(f"{metric} usage is high: {value}%")
            logger.warning(f"Performance issue detected: {metric} at {value}%")
    
    return issues

def should_log_error() -> bool:
    """Determine if we should log an error based on the last error log time."""
    if not _health_cache["last_error_log"]:
        return True
    return datetime.now() - _health_cache["last_error_log"] > ERROR_LOG_INTERVAL

@router.get("/health")
async def health_check(request: Request):
    """Standard health check endpoint with system metrics and performance monitoring."""
    now = datetime.now()
    client_ip = request.client.host if request.client else "unknown"
    
    # Check if this is a lightweight health ping request for UI status
    lightweight = "X-Request-Type" in request.headers and request.headers["X-Request-Type"] == "health-check"
    
    # If lightweight request, return immediate ping response without metrics
    if lightweight:
        return JSONResponse(
            content={
                "status": "operational",
                "server": True,
                "timestamp": time.time(),
                "version": "1.0.0",
            },
            headers={
                "Cache-Control": "no-cache"
            }
        )
    
    # For full health check requests, return cached response if valid
    if not lightweight and (_health_cache["last_check"] and 
        _health_cache["status"] and 
        now - _health_cache["last_check"] < CACHE_DURATION):
        logger.debug(f"Serving cached health status to {client_ip}")
        return _health_cache["status"]

    try:
        # Get current system metrics only for full health checks
        metrics = None
        performance_issues = []
        
        if not lightweight:
            metrics = get_system_metrics()
            update_metrics_history(metrics)
            performance_issues = check_performance_issues(metrics)
        
        # Check API key and basic server status
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        api_key_configured = bool(api_key)
        
        if not api_key_configured:
            logger.warning("API key not configured - system may have limited functionality")
        
        # Determine system status based on performance
        system_status = "operational"
        if performance_issues:
            system_status = "degraded"
            logger.warning(f"System status degraded due to: {', '.join(performance_issues)}")
        
        status_response = JSONResponse(
            content={
                "status": system_status,
                "server": True,
                "api_key_configured": api_key_configured,
                "timestamp": time.time(),
                "version": "1.0.0",
                "metrics": metrics,
                "performance_issues": performance_issues,
                "metrics_history_size": len(_health_cache["metrics_history"]) if not lightweight else 0
            },
            headers={
                "Cache-Control": "public, max-age=10" if not lightweight else "no-cache",
                "Expires": (now + CACHE_DURATION).strftime('%a, %d %b %Y %H:%M:%S GMT') if not lightweight else "0"
            }
        )
        
        # Update cache and log success
        _health_cache.update({
            "last_check": now,
            "status": status_response,
            "error_count": 0,
            "last_error_log": None
        })
        
        logger.info(f"Health check successful - Status: {system_status}")
        if performance_issues:
            logger.warning(f"Performance issues detected: {performance_issues}")
        
        return status_response

    except Exception as e:
        _health_cache["error_count"] += 1
        error_msg = str(e)
        client_ip = request.client.host if request.client else "unknown"
        
        # Get metrics even in error state if possible
        try:
            metrics = get_system_metrics()
            update_metrics_history(metrics)
        except Exception as metric_error:
            logger.error(f"Failed to get metrics during error handling: {str(metric_error)}")
            metrics = None
        
        # Log error only if it's been long enough since the last error log
        if should_log_error():
            logger.error(
                f"Health check failed for {client_ip}: {error_msg} "
                f"(Total errors: {_health_cache['error_count']}, "
                f"Metrics available: {metrics is not None})"
            )
            _health_cache["last_error_log"] = now
            
        error_response = JSONResponse(
            content={
                "status": "error",
                "error": error_msg,
                "server": True,
                "api_key_configured": False,
                "timestamp": time.time(),
                "error_count": _health_cache["error_count"],
                "metrics": metrics,
                "metrics_history_size": len(_health_cache["metrics_history"]) if metrics else 0
            },
            status_code=500,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
        
        # Cache error response but keep existing metrics history
        _health_cache.update({
            "last_check": now,
            "status": error_response,
            "last_error": {
                "timestamp": now,
                "message": error_msg,
                "client": client_ip
            }
        })
        
        return error_response