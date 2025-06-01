"""Log management endpoints."""

from datetime import datetime, timedelta
import json
import gzip
import shutil
import zipfile
from typing import Dict, Any, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from server.logging import get_logger

router = APIRouter(prefix="/api/logs")
logger = get_logger("debug")

@router.get("/status")
async def get_logs_status() -> Dict[str, Any]:
    """Get status of all log files."""
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        stats = {
            "total_files": 0,
            "non_empty_files": 0,
            "total_size": 0,
            "categories": {}
        }
        
        for category in ["ai", "server", "security", "tools"]:
            category_path = base_path / category
            if not category_path.exists():
                continue
                
            cat_stats = {
                "total_files": 0,
                "non_empty_files": 0,
                "total_size": 0,
                "files": []
            }
            
            for log_file in category_path.rglob("*.log"):
                try:
                    file_size = log_file.stat().st_size
                    is_empty = file_size == 0
                    last_modified = datetime.fromtimestamp(log_file.stat().st_mtime)
                    
                    file_info = {
                        "name": log_file.name,
                        "path": str(log_file.relative_to(base_path)),
                        "size": file_size,
                        "is_empty": is_empty,
                        "last_modified": last_modified.isoformat()
                    }
                    
                    cat_stats["files"].append(file_info)
                    cat_stats["total_files"] += 1
                    stats["total_files"] += 1
                    
                    if not is_empty:
                        cat_stats["non_empty_files"] += 1
                        stats["non_empty_files"] += 1
                        cat_stats["total_size"] += file_size
                        stats["total_size"] += file_size
                        
                except Exception as e:
                    logger.error(f"Error processing file {log_file}: {e}")
            
            if cat_stats["total_files"] > 0:
                stats["categories"][category] = cat_stats
        
        return {
            "status": "success",
            "data": stats
        }
        
    except Exception as e:
        logger.error(f"Error getting logs status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get logs status: {str(e)}"
        )
# Logger already initialized above

@router.post("/clear")
async def clear_logs(
    category: Optional[str] = Query(None, description="Optional category to clear"),
    days: Optional[int] = Query(None, description="Optional: clear logs older than X days")
) -> Dict[str, Any]:
    """Clear log files."""
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        categories = [category] if category else ["ai", "server", "security", "tools"]
        
        cleared_files = []
        for cat in categories:
            category_path = base_path / cat
            if category_path.exists():
                for log_file in category_path.rglob("*.log"):
                    try:
                        if days is not None:
                            # Only clear old content
                            mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
                            if mtime > datetime.now() - timedelta(days=days):
                                continue
                        # Empty the file
                        open(log_file, 'w').close()
                        cleared_files.append(str(log_file.relative_to(base_path)))
                    except Exception as e:
                        logger.error(f"Error clearing log file {log_file}: {e}")
        
        return {
            "status": "success",
            "cleared_files": cleared_files,
            "message": f"Cleared {len(cleared_files)} log files"
        }
        
    except Exception as e:
        logger.error(f"Error clearing logs: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear logs: {str(e)}"
        )

@router.post("/archive")
async def archive_logs(
    category: Optional[str] = Query(None, description="Optional category to archive")
) -> Dict[str, Any]:
    """Archive log files."""
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        archive_path = base_path / "archives" / datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_path.mkdir(parents=True, exist_ok=True)
        
        categories = [category] if category else ["ai", "server", "security", "tools"]
        archived_files = []
        
        for cat in categories:
            category_path = base_path / cat
            if category_path.exists():
                cat_archive_path = archive_path / cat
                cat_archive_path.mkdir(parents=True, exist_ok=True)
                
                for log_file in category_path.rglob("*.log"):
                    try:
                        # Create archive name
                        archive_name = f"{log_file.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
                        archive_file = cat_archive_path / archive_name
                        
                        # Copy to archive and compress
                        with open(log_file, 'rb') as f_in:
                            with gzip.open(str(archive_file) + '.gz', 'wb') as f_out:
                                shutil.copyfileobj(f_in, f_out)
                        
                        # Clear original file
                        open(log_file, 'w').close()
                        archived_files.append(str(log_file.relative_to(base_path)))
                    except Exception as e:
                        logger.error(f"Error archiving log file {log_file}: {e}")
        
        return {
            "status": "success",
            "archived_files": archived_files,
            "archive_path": str(archive_path),
            "message": f"Archived {len(archived_files)} log files"
        }
        
    except Exception as e:
        logger.error(f"Error archiving logs: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to archive logs: {str(e)}"
        )

@router.post("/download")
async def prepare_log_download(
    category: Optional[str] = Query(None, description="Optional category to download")
) -> Dict[str, Any]:
    """Prepare logs for download."""
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        download_path = base_path / "downloads"
        download_path.mkdir(exist_ok=True)
        
        # Create timestamped zip file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_name = f"logs_{timestamp}.zip"
        zip_path = download_path / zip_name
        
        categories = [category] if category else ["ai", "server", "security", "tools"]
        included_files = []
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for cat in categories:
                category_path = base_path / cat
                if category_path.exists():
                    for log_file in category_path.rglob("*.log"):
                        zipf.write(log_file, log_file.relative_to(base_path))
                        included_files.append(str(log_file.relative_to(base_path)))
        
        return {
            "status": "success",
            "download_path": str(zip_path),
            "included_files": included_files,
            "message": f"Prepared {len(included_files)} log files for download"
        }
        
    except Exception as e:
        logger.error(f"Error preparing logs for download: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to prepare logs for download: {str(e)}"
        )

@router.delete("/cleanup")
async def cleanup_old_logs(
    days: int = Query(30, description="Remove archives older than this many days")
) -> Dict[str, Any]:
    """Remove old log archives."""
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        archive_path = base_path / "archives"
        
        if not archive_path.exists():
            return {
                "status": "success",
                "message": "No archives to clean up"
            }
        
        cutoff = datetime.now() - timedelta(days=days)
        removed_archives = []
        
        for archive in archive_path.glob("*"):
            try:
                if archive.is_dir():
                    # Check archive timestamp from directory name
                    archive_time = datetime.strptime(archive.name, "%Y%m%d_%H%M%S")
                    if archive_time < cutoff:
                        shutil.rmtree(archive)
                        removed_archives.append(str(archive.name))
            except Exception as e:
                logger.error(f"Error processing archive {archive}: {e}")
        
        return {
            "status": "success",
            "removed_archives": removed_archives,
            "message": f"Removed {len(removed_archives)} old archives"
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up old logs: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clean up old logs: {str(e)}"
        )