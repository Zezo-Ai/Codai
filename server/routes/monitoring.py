"""Monitoring endpoints."""

from datetime import datetime, timedelta
import json
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException
from server.logging import get_logger
from pathlib import Path

router = APIRouter(prefix="/api/monitoring")
logger = get_logger("debug")

def get_log_files() -> Dict[str, List[Path]]:
    """Get all log files grouped by category."""
    base_path = Path(__file__).parent.parent.parent / "logs"
    categories = ["ai", "server", "security", "tools"]
    
    log_files = {}
    for category in categories:
        category_path = base_path / category
        if category_path.exists():
            log_files[category] = list(category_path.rglob("*.log"))
    
    return log_files

@router.get("/logs")
async def get_log_files_content() -> Dict[str, Any]:
    """Get all log files content organized by category."""
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        result = {}
        
        for category in ["ai", "server", "security", "tools"]:
            category_path = base_path / category
            if not category_path.exists():
                continue
                
            category_logs = []
            for log_file in category_path.rglob("*.log"):
                try:
                    entries = []
                    with open(log_file, "r") as f:
                        for line in f:
                            try:
                                entry = json.loads(line)
                                # Ensure timestamp is properly formatted
                                if "timestamp" in entry:
                                    entry["timestamp"] = datetime.fromisoformat(
                                        entry["timestamp"].replace("Z", "+00:00")
                                    ).isoformat()
                                entries.append(entry)
                            except json.JSONDecodeError:
                                # Handle non-JSON lines
                                entries.append({
                                    "timestamp": datetime.now().isoformat(),
                                    "message": line.strip(),
                                    "level": "UNKNOWN"
                                })
                                
                    category_logs.append({
                        "filename": log_file.name,
                        "path": str(log_file.relative_to(base_path)),
                        "size": round(log_file.stat().st_size / 1024, 2),  # Size in KB
                        "modified": datetime.fromtimestamp(log_file.stat().st_mtime).isoformat(),
                        "entries": entries
                    })
                except Exception as e:
                    logger.error(f"Error reading log file {log_file}: {e}")
                    
            if category_logs:
                result[category] = category_logs
        
        return result
    except Exception as e:
        logger.error(f"Error getting log files: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get log files: {str(e)}"
        )

from fastapi import Query

@router.post("/logs/clear")
async def clear_logs(
    category: str | None = Query(None, description="Optional category to clear"),
    days: int | None = Query(None, description="Optional: clear logs older than X days")
) -> Dict[str, Any]:
    """Clear log files.
    
    Args:
        category: Optional category to clear. If None, clears all logs.
        days: Optional number of days to keep. If provided, only clears logs older than this.
    """
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        categories = [category] if category else ["ai", "server", "security", "tools"]
        
        cleared_files = []
        for cat in categories:
            category_path = base_path / cat
            if category_path.exists():
                for log_file in category_path.rglob("*.log"):
                    try:
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

@router.post("/logs/archive")
async def archive_logs(category: str = None) -> Dict[str, Any]:
    """Archive current log files.
    
    Args:
        category: Optional category to archive. If None, archives all logs.
    """
    try:
        base_path = Path(__file__).parent.parent.parent / "logs"
        archive_path = base_path / "archives" / datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_path.mkdir(parents=True, exist_ok=True)
        
        categories = [category] if category else ["ai", "server", "security", "tools"]
        archived_files = []
        
        for cat in categories:
            category_path = base_path / cat
            if category_path.exists():
                # Create category directory in archive
                cat_archive_path = archive_path / cat
                cat_archive_path.mkdir(parents=True, exist_ok=True)
                
                for log_file in category_path.rglob("*.log"):
                    try:
                        # Create archive name with timestamp
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

@router.post("/logs/download")
async def prepare_log_download(category: str = None) -> Dict[str, Any]:
    """Prepare logs for download.
    
    Args:
        category: Optional category to download. If None, prepares all logs.
    """
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

@router.delete("/logs/cleanup")
async def cleanup_old_logs(days: int = 30) -> Dict[str, Any]:
    """Remove old log archives.
    
    Args:
        days: Remove archives older than this many days
    """
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

@router.get("/overview")
async def get_monitoring_overview() -> Dict[str, Any]:
    """Get monitoring overview data."""
    try:
        now = datetime.now()
        start_time = now - timedelta(hours=24)
        
        # Initialize data structures
        error_rates = []
        response_times = []
        volume_stats = {}
        recent_errors = []
        
        # Get all log files
        log_files = get_log_files()
        
        # Process each category
        for category, files in log_files.items():
            total_size = 0
            error_count = 0
            
            for file in files:
                # Calculate volume stats
                total_size += file.stat().st_size
                
                # Read file for errors and response times
                try:
                    with open(file, "r") as f:
                        for line in f:
                            try:
                                log_entry = json.loads(line)
                                timestamp = datetime.fromisoformat(
                                    log_entry["timestamp"].replace("Z", "+00:00")
                                )
                                
                                # Only process last 24 hours
                                if timestamp < start_time:
                                    continue
                                    
                                # Check for errors
                                if log_entry.get("level") == "ERROR":
                                    error_count += 1
                                    recent_errors.append({
                                        "id": str(timestamp.timestamp()),
                                        "timestamp": timestamp.isoformat(),
                                        "message": log_entry.get("message", "Unknown error"),
                                        "component": category,
                                        "details": {
                                            "level": log_entry.get("level"),
                                            "logger": log_entry.get("logger"),
                                            **log_entry.get("extra", {})
                                        }
                                    })
                                
                                # Check for response times
                                if "response_time" in log_entry:
                                    hour = timestamp.replace(
                                        minute=0, second=0, microsecond=0
                                    )
                                    response_times.append({
                                        "timestamp": hour.isoformat(),
                                        "time": float(log_entry["response_time"])
                                    })
                                    
                            except json.JSONDecodeError:
                                continue
                except Exception as e:
                    logger.error(f"Error reading log file {file}: {e}")
            
            # Store volume stats
            volume_stats[category] = {
                "volume": round(total_size / (1024 * 1024), 2),  # Convert to MB
                "fileCount": len(files)
            }
            
            # Calculate hourly error rates
            current = start_time
            while current < now:
                next_hour = current + timedelta(hours=1)
                errors_in_hour = sum(
                    1 for err in recent_errors
                    if current <= datetime.fromisoformat(err["timestamp"]) < next_hour
                )
                error_rates.append({
                    "timestamp": current.isoformat(),
                    "rate": round(errors_in_hour / 60, 4)  # errors per minute
                })
                current = next_hour
        
        # Format volume stats for response
        volume_stats_list = [
            {
                "category": cat,
                "volume": stats["volume"],
                "fileCount": stats["fileCount"]
            }
            for cat, stats in volume_stats.items()
        ]
        
        # Sort and limit recent errors
        recent_errors.sort(key=lambda x: x["timestamp"], reverse=True)
        recent_errors = recent_errors[:10]
        
        # Average response times by hour
        response_times_avg = {}
        for rt in response_times:
            if rt["timestamp"] not in response_times_avg:
                response_times_avg[rt["timestamp"]] = {"total": 0, "count": 0}
            response_times_avg[rt["timestamp"]]["total"] += rt["time"]
            response_times_avg[rt["timestamp"]]["count"] += 1
        
        response_times_list = [
            {
                "timestamp": ts,
                "time": round(data["total"] / data["count"], 2)
            }
            for ts, data in response_times_avg.items()
        ]
        
        return {
            "errorRates": error_rates,
            "responseTimes": response_times_list,
            "volumeStats": volume_stats_list,
            "recentErrors": recent_errors
        }
        
    except Exception as e:
        logger.error(f"Error generating monitoring overview: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate monitoring overview: {str(e)}"
        )