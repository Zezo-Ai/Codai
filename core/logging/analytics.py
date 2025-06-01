"""Log analysis utilities."""

import json
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any
from pathlib import Path
import re

class LogAnalyzer:
    """Analyze log files and generate metrics."""
    
    def __init__(self, log_manager):
        """Initialize analyzer.
        
        Args:
            log_manager: Log manager instance
        """
        self.log_manager = log_manager
        
    async def get_error_rates(
        self, 
        start_time: datetime,
        end_time: datetime
    ) -> List[Tuple[datetime, float]]:
        """Get error rates over time.
        
        Args:
            start_time: Start of analysis period
            end_time: End of analysis period
            
        Returns:
            List of (timestamp, error_rate) tuples
        """
        error_rates = []
        try:
            # Read error logs
            error_logs = []
            for log_file in self.log_manager.get_error_logs():
                with open(log_file, 'r') as f:
                    for line in f:
                        try:
                            log = json.loads(line)
                            timestamp = datetime.fromisoformat(
                                log['timestamp'].replace('Z', '+00:00')
                            )
                            if start_time <= timestamp <= end_time:
                                error_logs.append(timestamp)
                        except Exception:
                            continue
            
            # Calculate hourly error rates
            current = start_time
            while current < end_time:
                next_hour = current + timedelta(hours=1)
                
                # Count errors in this hour
                errors_in_hour = sum(
                    1 for ts in error_logs 
                    if current <= ts < next_hour
                )
                
                # Calculate rate (errors per minute)
                error_rates.append((
                    current,
                    errors_in_hour / 60.0
                ))
                
                current = next_hour
                
        except Exception as e:
            print(f"Error calculating error rates: {e}")
            
        return error_rates
    
    async def get_response_times(
        self,
        start_time: datetime,
        end_time: datetime
    ) -> List[Tuple[datetime, float]]:
        """Get average response times over time.
        
        Args:
            start_time: Start of analysis period
            end_time: End of analysis period
            
        Returns:
            List of (timestamp, avg_response_time) tuples
        """
        response_times = []
        try:
            # Read access logs which contain response times
            times_by_hour: Dict[datetime, List[float]] = {}
            
            for log_file in self.log_manager.get_access_logs():
                with open(log_file, 'r') as f:
                    for line in f:
                        try:
                            log = json.loads(line)
                            timestamp = datetime.fromisoformat(
                                log['timestamp'].replace('Z', '+00:00')
                            )
                            if start_time <= timestamp <= end_time:
                                hour = timestamp.replace(
                                    minute=0, second=0, microsecond=0
                                )
                                if 'response_time' in log:
                                    if hour not in times_by_hour:
                                        times_by_hour[hour] = []
                                    times_by_hour[hour].append(
                                        float(log['response_time'])
                                    )
                        except Exception:
                            continue
            
            # Calculate hourly averages
            current = start_time
            while current < end_time:
                hour = current.replace(minute=0, second=0, microsecond=0)
                times = times_by_hour.get(hour, [])
                avg_time = (
                    sum(times) / len(times) if times 
                    else 0
                )
                response_times.append((current, avg_time))
                current += timedelta(hours=1)
                
        except Exception as e:
            print(f"Error calculating response times: {e}")
            
        return response_times
    
    async def get_volume_stats(self) -> Dict[str, Dict[str, float]]:
        """Get log volume statistics by category.
        
        Returns:
            Dictionary of category statistics
        """
        stats = {}
        try:
            for category in ['ai', 'server', 'security', 'tools']:
                category_size = 0
                file_count = 0
                
                category_dir = self.log_manager.get_category_dir(category)
                if category_dir.exists():
                    for log_file in category_dir.rglob('*.log*'):
                        category_size += log_file.stat().st_size
                        file_count += 1
                        
                stats[category] = {
                    'volume': round(category_size / (1024 * 1024), 2),  # MB
                    'count': file_count
                }
                
        except Exception as e:
            print(f"Error calculating volume stats: {e}")
            
        return stats
    
    async def get_recent_errors(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get most recent error logs.
        
        Args:
            limit: Maximum number of errors to return
            
        Returns:
            List of error log entries
        """
        errors = []
        try:
            # Read all error logs
            for log_file in self.log_manager.get_error_logs():
                with open(log_file, 'r') as f:
                    for line in f:
                        try:
                            log = json.loads(line)
                            errors.append({
                                'id': log.get('id', ''),
                                'timestamp': datetime.fromisoformat(
                                    log['timestamp'].replace('Z', '+00:00')
                                ),
                                'message': log.get('message', ''),
                                'component': log.get('component', ''),
                                'details': log.get('details', {})
                            })
                        except Exception:
                            continue
            
            # Sort by timestamp and get most recent
            errors.sort(key=lambda x: x['timestamp'], reverse=True)
            return errors[:limit]
            
        except Exception as e:
            print(f"Error fetching recent errors: {e}")
            return []