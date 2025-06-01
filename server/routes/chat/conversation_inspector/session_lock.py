"""Session lock manager for thread-safe conversation inspector operations."""

import asyncio
import time
from typing import Dict, Any, Callable, Awaitable
from debug.debug_logger import debug

class SessionLockManager:
    """Manages locks for concurrent session operations."""
    
    def __init__(self):
        """Initialize the lock manager."""
        self._locks: Dict[str, asyncio.Lock] = {}
        self._last_access: Dict[str, float] = {}
        # Cleanup locks after 1 hour of inactivity
        self._cleanup_threshold = 3600  
    
    async def acquire_lock(self, session_id: str) -> asyncio.Lock:
        """Get and acquire a lock for a session."""
        # Auto cleanup old locks
        self._cleanup_old_locks()
        
        # Create lock if it doesn't exist
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
            
        # Update last access time
        self._last_access[session_id] = time.time()
        
        # Get and acquire the lock
        lock = self._locks[session_id]
        await lock.acquire()
        
        debug.log(
            event="session_lock_acquired",
            session_id=session_id,
            category="CONVERSATION_INSPECTOR_DEBUG",
            data={"action": "lock_acquired"}
        )
        
        return lock
    
    def release_lock(self, session_id: str) -> None:
        """Release a lock for a session."""
        if session_id in self._locks:
            lock = self._locks[session_id]
            if lock.locked():
                lock.release()
                debug.log(
                    event="session_lock_released",
                    session_id=session_id,
                    category="CONVERSATION_INSPECTOR_DEBUG",
                    data={"action": "lock_released"}
                )
    
    def _cleanup_old_locks(self) -> None:
        """Remove locks that haven't been used for a while."""
        current_time = time.time()
        session_ids_to_remove = []
        
        for session_id, last_access in self._last_access.items():
            if current_time - last_access > self._cleanup_threshold:
                if session_id in self._locks and not self._locks[session_id].locked():
                    session_ids_to_remove.append(session_id)
        
        for session_id in session_ids_to_remove:
            del self._locks[session_id]
            del self._last_access[session_id]
            debug.log(
                event="session_lock_cleaned",
                session_id=session_id,
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={"action": "lock_removed", "reason": "inactivity"}
            )
    
    async def with_session_lock(self, session_id: str, operation: Callable[[], Awaitable[Any]]) -> Any:
        """Execute an operation with a session lock."""
        lock = await self.acquire_lock(session_id)
        try:
            start_time = time.time()
            result = await operation()
            execution_time = time.time() - start_time
            
            debug.log(
                event="operation_with_lock_complete",
                session_id=session_id,
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "execution_time_ms": int(execution_time * 1000),
                    "success": True
                }
            )
            
            return result
        except Exception as e:
            debug.log(
                event="operation_with_lock_failed",
                session_id=session_id,
                category="CONVERSATION_INSPECTOR_DEBUG",
                data={
                    "error": str(e),
                    "error_type": type(e).__name__
                }
            )
            raise
        finally:
            self.release_lock(session_id)

# Global instance
lock_manager = SessionLockManager()