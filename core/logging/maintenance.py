"""Logging system maintenance utilities."""

from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any
import shutil
import gzip

class LogMaintenance:
    """Handle log file maintenance and cleanup."""
    
    def __init__(self, log_dir: Path):
        """Initialize maintenance handler.
        
        Args:
            log_dir: Base logging directory
        """
        self.log_dir = log_dir
    
    def cleanup_old_logs(self, days: int = 30) -> None:
        """Remove logs older than specified days.
        
        Args:
            days: Number of days to keep logs
        """
        cutoff = datetime.now() - timedelta(days=days)
        
        for log_file in self.log_dir.rglob('*.log*'):
            try:
                if log_file.stat().st_mtime < cutoff.timestamp():
                    log_file.unlink()
            except Exception as e:
                print(f"Error removing old log {log_file}: {e}")
    
    def cleanup_all_logs(self) -> None:
        """Remove all log files."""
        try:
            for category in ['ai', 'server', 'tools']:
                category_dir = self.log_dir / category
                if category_dir.exists():
                    shutil.rmtree(category_dir)
                category_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"Error during log cleanup: {e}")
    
    def compress_old_logs(self, days: int = 7) -> None:
        """Compress logs older than specified days.
        
        Args:
            days: Number of days before compression
        """
        cutoff = datetime.now() - timedelta(days=days)
        
        for log_file in self.log_dir.rglob('*.log'):
            try:
                if log_file.stat().st_mtime < cutoff.timestamp():
                    gz_path = log_file.with_suffix('.log.gz')
                    with log_file.open('rb') as f_in:
                        with gzip.open(gz_path, 'wb') as f_out:
                            shutil.copyfileobj(f_in, f_out)
                    log_file.unlink()
            except Exception as e:
                print(f"Error compressing log {log_file}: {e}")
    
    def get_log_stats(self) -> Dict[str, Any]:
        """Get statistics about log files.
        
        Returns:
            Dictionary containing log statistics
        """
        stats = {
            'total_size': 0,
            'file_count': 0,
            'categories': {},
            'oldest_file': None,
            'newest_file': None
        }
        
        for category in ['ai', 'server', 'tools']:
            category_dir = self.log_dir / category
            if category_dir.exists():
                category_stats = {
                    'size': 0,
                    'files': 0,
                    'compressed_files': 0
                }
                
                for log_file in category_dir.glob('*.*'):
                    size = log_file.stat().st_size
                    mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
                    
                    category_stats['size'] += size
                    if log_file.suffix == '.gz':
                        category_stats['compressed_files'] += 1
                    else:
                        category_stats['files'] += 1
                    
                    if not stats['oldest_file'] or mtime < stats['oldest_file']:
                        stats['oldest_file'] = mtime
                    if not stats['newest_file'] or mtime > stats['newest_file']:
                        stats['newest_file'] = mtime
                
                stats['categories'][category] = category_stats
                stats['total_size'] += category_stats['size']
                stats['file_count'] += (category_stats['files'] + 
                                       category_stats['compressed_files'])
        
        return stats
    
    def rotate_logs(self, max_size: int = 10485760) -> None:
        """Rotate logs that exceed maximum size.
        
        Args:
            max_size: Maximum file size in bytes
        """
        for log_file in self.log_dir.rglob('*.log'):
            try:
                if log_file.stat().st_size > max_size:
                    # Rotate existing backups
                    for i in range(4, 0, -1):
                        backup = log_file.with_suffix(f'.log.{i}')
                        if backup.exists():
                            new_backup = log_file.with_suffix(f'.log.{i+1}')
                            backup.rename(new_backup)
                    
                    # Rotate current log
                    backup_1 = log_file.with_suffix('.log.1')
                    shutil.copy2(log_file, backup_1)
                    log_file.write_text('')  # Clear current log
            except Exception as e:
                print(f"Error rotating log {log_file}: {e}")