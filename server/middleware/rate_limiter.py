from fastapi import Request, HTTPException
from datetime import datetime, timedelta
from collections import defaultdict
import time
import asyncio
from typing import Dict, List, Optional

class RateLimiter:
    def __init__(
        self,
        requests_per_minute: int = 60,
        burst_limit: int = 10,
        cleanup_interval: int = 60
    ):
        self.requests_per_minute = requests_per_minute
        self.burst_limit = burst_limit
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self.cleanup_interval = cleanup_interval
        self.cleanup_task: Optional[asyncio.Task] = None
        
    async def start_cleanup(self):
        """Start the periodic cleanup task."""
        if self.cleanup_task is None:
            self.cleanup_task = asyncio.create_task(self._cleanup_loop())
    
    async def _cleanup_loop(self):
        """Periodically clean up old request timestamps."""
        while True:
            await asyncio.sleep(self.cleanup_interval)
            self._cleanup()
    
    def _cleanup(self):
        """Remove timestamps older than 1 minute."""
        now = time.time()
        for ip in list(self.requests.keys()):
            self.requests[ip] = [
                ts for ts in self.requests[ip]
                if now - ts < 60
            ]
            if not self.requests[ip]:
                del self.requests[ip]
    
    async def __call__(self, request: Request):
        """Handle rate limiting for each request."""
        client_ip = request.client.host
        now = time.time()
        
        # Start cleanup if not already running
        await self.start_cleanup()
        
        # Clean old requests for this IP
        self.requests[client_ip] = [
            ts for ts in self.requests[client_ip]
            if now - ts < 60
        ]
        
        # Check burst limit
        recent_requests = len([
            ts for ts in self.requests[client_ip]
            if now - ts < 1  # Within the last second
        ])
        if recent_requests >= self.burst_limit:
            raise HTTPException(
                status_code=429,
                detail="Too many requests in a short time period."
            )
        
        # Check rate limit
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please try again later."
            )
        
        # Add current request
        self.requests[client_ip].append(now)
        return True

    async def close(self):
        """Cleanup when shutting down."""
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
            self.cleanup_task = None