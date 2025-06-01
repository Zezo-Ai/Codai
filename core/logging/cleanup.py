"""Logging cleanup utilities."""

from pathlib import Path
import time
from typing import Dict, Set, Optional, List, Tuple
import logging
import os
import psutil
import subprocess

def find_locking_processes(file_path: str) -> List[Tuple[int, str]]:
    """Find processes that have the file open.
    
    Args:
        file_path: Path to the file to check
        
    Returns:
        List of (pid, name) tuples of processes with the file open
    """
    locking_processes = []
    
    try:
        # Use handle.exe if available (Windows Sysinternals)
        handle_exe = r"C:\Windows\System32\handle.exe"
        if os.path.exists(handle_exe):
            try:
                output = subprocess.check_output([handle_exe, file_path], 
                                              stderr=subprocess.STDOUT,
                                              text=True)
                for line in output.splitlines():
                    if file_path in line:
                        try:
                            pid = int(line.split()[2])
                            proc = psutil.Process(pid)
                            locking_processes.append((pid, proc.name()))
                        except:
                            pass
            except:
                pass
    except:
        pass
    
    # Fallback to psutil
    if not locking_processes:
        try:
            for proc in psutil.process_iter(['pid', 'name', 'open_files']):
                try:
                    files = proc.info['open_files'] or []
                    if any(file_path in str(f.path) for f in files):
                        locking_processes.append((proc.info['pid'], proc.info['name']))
                except:
                    continue
        except:
            pass
            
    return locking_processes

def safe_remove_file(file_path: Path, max_retries: int = 3, retry_delay: float = 0.5) -> bool:
    """Safely remove a file with retries.
    
    Args:
        file_path: Path to file to remove
        max_retries: Number of times to retry if file is locked
        retry_delay: Seconds to wait between retries
        
    Returns:
        bool: True if file was removed, False otherwise
    """
    str_path = str(file_path)
    for attempt in range(max_retries):
        try:
            if file_path.is_file():
                file_path.unlink(missing_ok=True)
                print(f"Removed log file: {file_path}")
                return True
        except PermissionError:
            if attempt < max_retries - 1:
                # Check what processes are locking the file
                locking_procs = find_locking_processes(str_path)
                if locking_procs:
                    print(f"File {file_path} is locked by processes:")
                    for pid, name in locking_procs:
                        print(f"  - Process {name} (PID: {pid})")
                print(f"Retry {attempt + 1} - File still locked: {file_path}")
                time.sleep(retry_delay)
            else:
                locking_procs = find_locking_processes(str_path)
                if locking_procs:
                    print(f"Warning: Could not remove {file_path} - locked by processes:")
                    for pid, name in locking_procs:
                        print(f"  - Process {name} (PID: {pid})")
                else:
                    print(f"Warning: Could not remove {file_path} after {max_retries} attempts - file still in use")
        except Exception as e:
            print(f"Error removing {file_path}: {e}")
            break
    return False

def close_handlers(loggers: Dict[str, logging.Logger], handlers: Dict[str, logging.Handler]) -> None:
    """Properly close all handlers from loggers and handler registry.
    
    Args:
        loggers: Dictionary of logger instances
        handlers: Dictionary of handler instances
    """
    # First close and remove handlers from loggers
    for logger_name, logger in list(loggers.items()):
        for handler in logger.handlers[:]:
            try:
                # Remove handler from logger first
                logger.removeHandler(handler)
                # Then flush and close it
                handler.flush()
                handler.close()
            except Exception as e:
                print(f"Error closing handler for logger {logger_name}: {e}")
    
    # Close any handlers in registry that might not be attached to loggers
    for handler_name, handler in handlers.items():
        try:
            handler.flush()
            handler.close()
        except Exception as e:
            print(f"Error closing registered handler {handler_name}: {e}")

def cleanup_category(category_dir: Path, base_files: Optional[Set[str]] = None,
                    max_retries: int = 3, retry_delay: float = 0.5) -> None:
    """Clean up a logging category directory.
    
    Args:
        category_dir: Path to category directory
        base_files: Set of base files to preserve
        max_retries: Number of retries for file removal
        retry_delay: Delay between retries
    """
    if not category_dir.exists():
        return
        
    try:
        # Handle files in category root
        for log_file in category_dir.glob('*.log*'):
            if log_file.is_file():
                try:
                    # Skip base files if specified
                    if base_files and log_file.name in base_files:
                        continue
                    safe_remove_file(log_file, max_retries, retry_delay)
                except Exception as e:
                    print(f"Error processing {log_file}: {e}")
        
        # Handle subdirectories
        for subdir in category_dir.iterdir():
            if subdir.is_dir():
                # Clean files in subdirectory
                for log_file in subdir.glob('*.log*'):
                    if log_file.is_file():
                        safe_remove_file(log_file, max_retries, retry_delay)
                
                # Try to remove empty directory
                try:
                    if not any(subdir.iterdir()):
                        subdir.rmdir()
                        print(f"Removed empty directory: {subdir}")
                except Exception as e:
                    print(f"Error removing directory {subdir}: {e}")
                    
    except Exception as e:
        print(f"Error cleaning category directory {category_dir}: {e}")