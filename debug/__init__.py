"""Debug utilities for conversation analysis."""

import os
from pathlib import Path
from datetime import datetime

def write_test_marker(message, clear_log=False):
    """
    Write a test marker directly to the debug log file.
    
    Args:
        message: The marker message to write
        clear_log: If True, clears the log file first
    """
    log_dir = Path(__file__).parent / 'logs'
    log_file = log_dir / 'debug.log'
    
    # Create the directory if it doesn't exist
    log_dir.mkdir(exist_ok=True)
    
    # Clear the log if requested
    if clear_log:
        try:
            with open(log_file, 'w', encoding='utf-8') as f:
                f.truncate(0)
        except Exception as e:
            print(f"Could not clear log file: {e}")
    
    # Write the marker
    try:
        timestamp = datetime.now().strftime('%H:%M:%S')
        marker = f"\n\n{'#'*100}\n# TEST MARKER: {message} @ {timestamp}\n{'#'*100}\n\n"
        
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(marker)
            
        print(f"Wrote test marker to log: {message}")
    except Exception as e:
        print(f"Failed to write test marker: {e}")
        
def log_message_state(session_id, step_name):
    """
    Log the current state of messages in the session.
    
    Args:
        session_id: The session ID to log messages for
        step_name: Name of the current step for identification
    """
    try:
        from server.routes.chat.state import get_or_create_session
        
        session = get_or_create_session(session_id)
        if not session:
            print(f"Could not get session for logging: {session_id}")
            return
            
        log_dir = Path(__file__).parent / 'logs'
        log_file = log_dir / 'debug.log'
        
        timestamp = datetime.now().strftime('%H:%M:%S')
        
        # Format message content for logging
        message_log = f"\n\n{'*'*100}\n* MESSAGE STATE AFTER: {step_name} @ {timestamp}\n{'*'*100}\n\n"
        message_log += f"Session ID: {session_id}\n"
        message_log += f"Total Messages: {len(session.messages)}\n"
        message_log += f"Is Using Short Messages: {session.short_messages is not session.messages}\n"
        
        # Log full messages
        message_log += f"\n{'-'*50} FULL MESSAGES {'-'*50}\n"
        for i, msg in enumerate(session.messages):
            role = msg.get("role", "unknown")
            content_text = ""
            if "content" in msg:
                for content in msg["content"]:
                    if isinstance(content, dict) and "text" in content:
                        content_text += content["text"] + "\n"
            message_log += f"Message {i+1} ({role}):\n{content_text}\n\n"
            
        # Log short messages if they exist
        if session.short_messages and session.short_messages is not session.messages:
            message_log += f"\n{'-'*50} SHORT MESSAGES {'-'*50}\n"
            for i, msg in enumerate(session.short_messages):
                role = msg.get("role", "unknown")
                content_text = ""
                if "content" in msg:
                    for content in msg["content"]:
                        if isinstance(content, dict) and "text" in content:
                            content_text += content["text"] + "\n"
                message_log += f"Message {i+1} ({role}):\n{content_text}\n\n"
        
        message_log += f"{'*'*100}\n"
        
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(message_log)
            
        print(f"Logged message state for step: {step_name}")
    except Exception as e:
        print(f"Failed to log message state: {e}")