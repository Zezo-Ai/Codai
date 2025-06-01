from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Literal
from .utils import CustomAPIRoute
from tools.edit import EditTool
from tools.base import WebResult, CLIResult
from server.logging import get_logger

# Initialize logger
logger = get_logger("debug")

router = APIRouter(route_class=CustomAPIRoute)

# File editing models
class ViewFileRequest(BaseModel):
    path: str
    view_range: Optional[List[int]] = None
    output_format: Literal['cli', 'web'] = 'web'

class CreateFileRequest(BaseModel):
    path: str
    content: str

class ReplaceTextRequest(BaseModel):
    path: str
    old_str: str
    new_str: str
    output_format: Literal['cli', 'web'] = 'web'

class InsertTextRequest(BaseModel):
    path: str
    insert_line: int
    new_str: str
    output_format: Literal['cli', 'web'] = 'web'

class UndoEditRequest(BaseModel):
    path: str
    output_format: Literal['cli', 'web'] = 'web'

@router.post("/edit/view")
async def view_file(request: ViewFileRequest):
    """View contents of a file."""
    try:
        logger.info(f"Viewing file: {request.path}")
        edit_tool = EditTool()
        result = await edit_tool(
            command="view",
            path=request.path,
            view_range=request.view_range,
            output_format=request.output_format
        )
        
        if isinstance(result, (WebResult, CLIResult)):
            logger.debug(f"File view successful: {request.path}")
            return JSONResponse({
                "status": "success",
                "content": result.output,
                "metadata": result.metadata,
                "format": result.format,
                "error": result.error
            })
        return JSONResponse({
            "status": "success",
            "content": result.output,
            "error": result.error
        })
    except Exception as e:
        logger.error(f"Error viewing file {request.path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@router.post("/edit/create")
async def create_file(request: CreateFileRequest):
    """Create a new file with content."""
    try:
        logger.info(f"Creating file: {request.path}")
        edit_tool = EditTool()
        result = await edit_tool(
            command="create",
            path=request.path,
            file_text=request.content
        )
        logger.debug(f"File creation successful: {request.path}")
        return JSONResponse({
            "status": "success",
            "message": result.output,
            "error": result.error
        })
    except Exception as e:
        logger.error(f"Error creating file {request.path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@router.post("/edit/replace")
async def replace_text(request: ReplaceTextRequest):
    """Replace text in a file."""
    try:
        logger.info(f"Replacing text in file: {request.path}")
        edit_tool = EditTool()
        result = await edit_tool(
            command="str_replace",
            path=request.path,
            old_str=request.old_str,
            new_str=request.new_str,
            output_format=request.output_format
        )
        
        if isinstance(result, (WebResult, CLIResult)):
            logger.debug(f"Text replacement successful: {request.path}")
            return JSONResponse({
                "status": "success",
                "content": result.output,
                "metadata": result.metadata,
                "format": result.format,
                "error": result.error
            })
        return JSONResponse({
            "status": "success",
            "message": result.output,
            "error": result.error
        })
    except Exception as e:
        logger.error(f"Error replacing text in file {request.path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@router.post("/edit/insert")
async def insert_text(request: InsertTextRequest):
    """Insert text at a specific line in a file."""
    try:
        logger.info(f"Inserting text in file: {request.path} at line {request.insert_line}")
        edit_tool = EditTool()
        result = await edit_tool(
            command="insert",
            path=request.path,
            insert_line=request.insert_line,
            new_str=request.new_str,
            output_format=request.output_format
        )
        
        if isinstance(result, (WebResult, CLIResult)):
            logger.debug(f"Text insertion successful: {request.path}")
            return JSONResponse({
                "status": "success",
                "content": result.output,
                "metadata": result.metadata,
                "format": result.format,
                "error": result.error
            })
        return JSONResponse({
            "status": "success",
            "message": result.output,
            "error": result.error
        })
    except Exception as e:
        logger.error(f"Error inserting text in file {request.path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@router.post("/edit/undo")
async def undo_edit(request: UndoEditRequest):
    """Undo last edit to a file."""
    try:
        logger.info(f"Undoing last edit for file: {request.path}")
        edit_tool = EditTool()
        result = await edit_tool(
            command="undo_edit",
            path=request.path,
            output_format=request.output_format
        )
        
        if isinstance(result, (WebResult, CLIResult)):
            logger.debug(f"Undo successful: {request.path}")
            return JSONResponse({
                "status": "success",
                "content": result.output,
                "metadata": result.metadata,
                "format": result.format,
                "error": result.error
            })
        return JSONResponse({
            "status": "success",
            "message": result.output,
            "error": result.error
        })
    except Exception as e:
        logger.error(f"Error undoing edit for file {request.path}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )