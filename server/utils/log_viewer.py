"""Log viewing and analysis utilities."""

import os
import re
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any

class LogEntry:
    """Represents a parsed log entry."""
    
    def __init__(self, timestamp: datetime, level: str, logger: str, 
                 message: str, extra_data: Dict[str, Any]):
        self.timestamp = timestamp
        self.level = level
        self.logger = logger
        self.message = message
        self.extra_data = extra_data

    @classmethod
    def parse(cls, entry_text: str) -> Optional['LogEntry']:
        """Parse a log entry from text."""
        try:
            # Extract timestamp
            timestamp_match = re.search(r'Time: ([\d-]+ [\d:,]+)', entry_text)
            if not timestamp_match:
                return None
            timestamp = datetime.strptime(timestamp_match.group(1), '%Y-%m-%d %H:%M:%S,%f')
            
            # Extract level
            level_match = re.search(r'Level: (\w+)', entry_text)
            level = level_match.group(1) if level_match else 'UNKNOWN'
            
            # Extract logger
            logger_match = re.search(r'Logger: ([\w\.]+)', entry_text)
            logger = logger_match.group(1) if logger_match else 'unknown'
            
            # Extract message
            message_match = re.search(r'Message: (.+?)(?=\nExtra Data:|$)', entry_text, re.DOTALL)
            message = message_match.group(1).strip() if message_match else ''
            
            # Extract extra data
            extra_data = {}
            extra_match = re.search(r'Extra Data: (.+?)(?=\n-{40}|$)', entry_text, re.DOTALL)
            if extra_match:
                try:
                    # Clean up the string and evaluate it safely
                    extra_str = extra_match.group(1).strip()
                    if extra_str != 'No extra data':
                        # Convert string representation to dict
                        extra_data = eval(extra_str, {'__builtins__': {}})
                except:
                    extra_data = {'parse_error': 'Failed to parse extra data'}
            
            return cls(timestamp, level, logger, message, extra_data)
        except Exception as e:
            print(f"Error parsing log entry: {str(e)}")
            return None

class LogViewer:
    """Utility for viewing and analyzing log files."""
    
    def __init__(self, log_path: str):
        self.log_path = Path(log_path)
        if not self.log_path.exists():
            raise FileNotFoundError(f"Log file not found: {log_path}")
    
    def read_entries(self, max_entries: int = None, 
                    level_filter: str = None,
                    logger_filter: str = None,
                    start_time: datetime = None,
                    end_time: datetime = None) -> List[LogEntry]:
        """Read and parse log entries with optional filtering."""
        entries = []
        current_entry = []
        entry_count = 0
        
        with open(self.log_path, 'r', encoding='utf-8') as f:
            for line in f:
                # Check if this is a new entry
                if line.startswith('Time: '):
                    if current_entry:
                        entry = LogEntry.parse(''.join(current_entry))
                        if entry and self._matches_filters(entry, level_filter, 
                                                         logger_filter, start_time, end_time):
                            entries.append(entry)
                            entry_count += 1
                            if max_entries and entry_count >= max_entries:
                                break
                    current_entry = [line]
                else:
                    current_entry.append(line)
            
            # Handle last entry
            if current_entry:
                entry = LogEntry.parse(''.join(current_entry))
                if entry and self._matches_filters(entry, level_filter, 
                                                 logger_filter, start_time, end_time):
                    entries.append(entry)
        
        return entries
    
    def _matches_filters(self, entry: LogEntry, 
                        level_filter: str = None,
                        logger_filter: str = None,
                        start_time: datetime = None,
                        end_time: datetime = None) -> bool:
        """Check if entry matches the given filters."""
        if level_filter and entry.level != level_filter:
            return False
        if logger_filter and not entry.logger.startswith(logger_filter):
            return False
        if start_time and entry.timestamp < start_time:
            return False
        if end_time and entry.timestamp > end_time:
            return False
        return True
    
    def get_latest_entries(self, count: int = 10, level: str = None) -> List[LogEntry]:
        """Get the most recent log entries."""
        return list(reversed(self.read_entries(max_entries=count, level_filter=level)))
    
    def get_errors(self, count: int = 10) -> List[LogEntry]:
        """Get the most recent error entries."""
        return self.get_latest_entries(count=count, level='ERROR')
    
    def analyze_errors(self) -> Dict[str, Any]:
        """Analyze error patterns in the log."""
        error_entries = self.get_errors(count=100)  # Analyze last 100 errors
        analysis = {
            'total_errors': len(error_entries),
            'error_types': {},
            'common_messages': {},
            'session_patterns': {},
            'timestamp_patterns': []
        }
        
        for entry in error_entries:
            # Analyze error types
            error_type = entry.extra_data.get('error_type', 'Unknown')
            analysis['error_types'][error_type] = analysis['error_types'].get(error_type, 0) + 1
            
            # Analyze messages
            analysis['common_messages'][entry.message] = analysis['common_messages'].get(entry.message, 0) + 1
            
            # Track session patterns
            session_id = entry.extra_data.get('session_id', 'Unknown')
            if session_id not in analysis['session_patterns']:
                analysis['session_patterns'][session_id] = {
                    'error_count': 0,
                    'first_seen': entry.timestamp,
                    'last_seen': entry.timestamp
                }
            session_data = analysis['session_patterns'][session_id]
            session_data['error_count'] += 1
            session_data['last_seen'] = max(session_data['last_seen'], entry.timestamp)
            
            # Record timestamp for pattern analysis
            analysis['timestamp_patterns'].append(entry.timestamp)
        
        return analysis

def analyze_recent_errors(log_dir: str = "logs/debug"):
    """Analyze recent errors across all debug logs."""
    log_dir = Path(log_dir)
    if not log_dir.exists():
        raise FileNotFoundError(f"Log directory not found: {log_dir}")
    
    # Get most recent log file
    log_files = sorted(log_dir.glob("*.log"), key=os.path.getmtime, reverse=True)
    if not log_files:
        raise FileNotFoundError("No log files found")
    
    viewer = LogViewer(log_files[0])
    analysis = viewer.analyze_errors()
    
    # Print analysis
    print("\nError Analysis Report")
    print("=" * 50)
    print(f"\nTotal Errors: {analysis['total_errors']}")
    
    print("\nError Types:")
    for error_type, count in sorted(analysis['error_types'].items(), key=lambda x: x[1], reverse=True):
        print(f"  {error_type}: {count}")
    
    print("\nMost Common Error Messages:")
    for msg, count in sorted(analysis['common_messages'].items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  [{count}] {msg[:100]}...")
    
    print("\nSession Analysis:")
    for session_id, data in analysis['session_patterns'].items():
        print(f"\n  Session: {session_id}")
        print(f"    Errors: {data['error_count']}")
        print(f"    First Error: {data['first_seen']}")
        print(f"    Last Error: {data['last_seen']}")
    
    return analysis

if __name__ == "__main__":
    try:
        analysis = analyze_recent_errors()
        print("\nAnalysis completed successfully!")
    except Exception as e:
        print(f"Error during analysis: {str(e)}")