"""Facade for Conversation Inspector functionality."""

from .conversation_inspector import router as inspector_router

# Re-export the router
router = inspector_router

__all__ = ['router']