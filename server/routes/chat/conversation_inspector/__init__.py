"""Conversation Inspector module initialization."""

from fastapi import APIRouter
from .models import *
from .export import router as export_router
from .imports import router as import_router
from .messages import router as messages_router
from .delete import router as delete_router
from .summarize import router as summarize_router

router = APIRouter(prefix="/chat/messages", tags=["conversation-inspector"])

# Include all sub-routers
router.include_router(messages_router)
router.include_router(export_router)
router.include_router(import_router)
router.include_router(delete_router)
router.include_router(summarize_router)

__all__ = [
    'router',
    # Models
    'MessageResponse',
    'DeleteRequest',
    'DeleteResponse',
    'ExportRequest',
    'ExportResponse',
    'ImportRequest',
    'ImportResponse',
    'SummarizeRequest',
    'SummarizeResponse'
]