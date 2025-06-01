from fastapi import APIRouter
from .chat import router as chat_router
from .file_edit import router as file_edit_router
from .health import router as health_router

router = APIRouter()

# Include all routers
router.include_router(chat_router)
router.include_router(file_edit_router)
router.include_router(health_router)