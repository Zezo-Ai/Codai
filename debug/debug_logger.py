"""Unified debug logging for conversation analysis."""

import logging
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

class DebugLogger:
    def __init__(self):
        self.log_dir = Path(__file__).parent / 'logs'
        
        # Clean up old logs
        if self.log_dir.exists():
            for old_file in self.log_dir.glob('*.log'):
                try:
                    # Instead of deleting, just truncate the files
                    with open(old_file, 'w') as f:
                        f.truncate(0)
                except Exception as e:
                    print(f"Warning: Could not clear log file {old_file}: {e}")
        
        # Create fresh directory
        self.log_dir.mkdir(exist_ok=True)
        
        # Create new log files
        self.log_file = self.log_dir / f'debug.log'
        self.summary_file = self.log_dir / f'summary.log'
        self.pdf_log_file = self.log_dir / f'pdf_debug.log'
        self.expert_mode_file = self.log_dir / f'expert_mode.log'
        
        # Log startup information
        with open(self.summary_file, 'w', encoding='utf-8') as f:
            f.write(json.dumps({
                'time': datetime.now().strftime('%H:%M:%S'),
                'event': 'debug_logger_init',
                'message': 'Debug logging started with clean log directory',
                'log_files': {
                    'debug': self.log_file.name,
                    'summary': self.summary_file.name,
                    'pdf': self.pdf_log_file.name,
                    'expert_mode': self.expert_mode_file.name
                }
            }) + '\n')
        
        # Configure main logger
        self.logger = logging.getLogger('debug')
        self.logger.setLevel(logging.DEBUG)
        self.logger.propagate = False
        
        # Main log handler
        main_handler = logging.FileHandler(self.log_file, encoding='utf-8')
        main_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        self.logger.addHandler(main_handler)
        
        # Summary handler
        self.summary_handler = logging.FileHandler(self.summary_file, encoding='utf-8')
        self.summary_handler.setLevel(logging.INFO)
        self.logger.addHandler(self.summary_handler)
        
        # PDF log handler - dedicated file just for PDF logs
        self.pdf_handler = logging.FileHandler(self.pdf_log_file, encoding='utf-8')
        self.pdf_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        # Only process PDF-related logs
        self.pdf_handler.addFilter(lambda record: 
            hasattr(record, 'msg') and 
            isinstance(record.msg, str) and 
            'PDF_MANAGEMENT' in record.msg
        )
        self.logger.addHandler(self.pdf_handler)
    
    def clear_expert_mode_log(self):
        """Clear the expert mode log file for a new iteration."""
        try:
            if self.expert_mode_file.exists():
                with open(self.expert_mode_file, 'w', encoding='utf-8') as f:
                    f.write("")  # Clear the file
                print(f"[DEBUG] Cleared expert mode log: {self.expert_mode_file}")
            else:
                # Create the file if it doesn't exist
                self.expert_mode_file.touch()
                print(f"[DEBUG] Created expert mode log: {self.expert_mode_file}")
        except Exception as e:
            print(f"[DEBUG] Warning: Could not clear expert mode log: {e}")
    
    def _process_data(self, data: Any) -> Any:
        """Process data before logging to handle special cases."""
        if isinstance(data, dict):
            return {
                k: '[image data]' if k == 'data' and isinstance(v, str) and v.startswith('iVBOR') 
                else (self._process_data(v) if k != 'params' else self._process_string(v))
                for k, v in data.items()
            }
        elif isinstance(data, list):
            return [self._process_data(item) for item in data]
        elif isinstance(data, str):
            return self._process_string(data)
        return data
        
    def _get_caller_module(self) -> str:
        """Get the module name of the caller."""
        import inspect
        
        # Get the call stack
        stack = inspect.stack()
        
        # Look for the first frame that's not in this file
        for frame in stack[2:]:  # Skip this method and log method
            module = inspect.getmodule(frame[0])
            if module and module.__name__ != __name__:
                # Get relative path from project root
                try:
                    filepath = module.__file__
                    if filepath:
                        from pathlib import Path
                        project_root = Path(__file__).parent.parent
                        rel_path = Path(filepath).relative_to(project_root)
                        return str(rel_path).replace('\\', '/').replace('.py', '')
                except ValueError:
                    return module.__name__
        
        return 'unknown'

    def _process_string(self, s: str) -> str:
        """Process string content to handle embedded image data and objects."""
        import re
        
        # Replace base64 image data
        s = re.sub(
            r"'data': 'iVBOR[^']*'",
            "'data': '[image data]'",
            s
        )
        
        # Clean up Beta object representations
        s = re.sub(
            r'BetaTextBlock\(([^)]+)\)', 
            r'{\1}',
            s
        )
        s = re.sub(
            r'BetaToolUseBlock\(([^)]+)\)',
            r'{\1}',
            s
        )
        
        return s

    def _format_data(self, data: Dict[str, Any]) -> str:
        """Format data for logging."""
        try:
            processed_data = self._process_data(data)
            return json.dumps(processed_data, indent=2, default=str)
        except Exception as e:
            return f"Error formatting data: {str(e)}"

    def log(self, 
            event: str, 
            session_id: str = None, 
            data: Dict[str, Any] = None,
            summary: bool = True,
            module: str = None,
            category: str = None) -> None:
        """
        Log debug information.
        
        Args:
            event: Event identifier
            session_id: Optional session ID
            data: Additional data to log
            summary: Whether to include in summary log
            module: Optional module name override
            category: Optional debug category to check in DebugConfig
        """
        # For now, log all categories since debug_config was removed
        # TODO: Integrate with core.configuration if needed
        
        # Format timestamp
        timestamp = datetime.now().strftime('%H:%M:%S')
        
        # For special categories, create more readable log entries
        if category == "SESSION_MESSAGES_REPLACED":
            # Create a very readable, clearly formatted log for message replacement
            log_message = (
                f"\n{'='*80}\n"
                f"🔄 SESSION MESSAGES REPLACED AT {timestamp}\n"
                f"{'='*80}\n"
                f"Session: {session_id}\n"
            )
            
            if data:
                # Add important details about the replacement
                log_message += (
                    f"Original Messages: {data.get('original_count', data.get('messages_count', 'unknown'))}\n"
                    f"New Summary Count: {data.get('new_count', 2)}\n"
                    f"Original Tokens: {data.get('original_tokens', 'unknown')}\n"
                    f"Summary Tokens: {data.get('summary_tokens', 'unknown')}\n"
                    f"Compression: {data.get('compression_ratio', 'unknown')}\n"
                )
                
                # Add original messages for comparison
                if 'original_messages' in data:
                    log_message += (
                        f"\n{'-'*40} ORIGINAL MESSAGES {'-'*40}\n"
                    )
                    messages = data.get('original_messages', [])
                    for i, msg in enumerate(messages):
                        role = msg.get('role', 'unknown')
                        content = []
                        if 'content' in msg:
                            for block in msg['content']:
                                if isinstance(block, dict) and 'text' in block:
                                    content.append(block['text'])
                        content_str = "\n".join(content)
                        log_message += f"Message {i+1} ({role}):\n{content_str}\n\n"
                
                # Add message content for verification
                if 'summary_content' in data:
                    log_message += (
                        f"\n{'-'*40} NEW SUMMARY CONTENT {'-'*40}\n"
                        f"{data.get('summary_content', 'No content available')}\n"
                    )
                
                log_message += f"{'='*80}\n"
            
            # Write directly to the log file for better formatting
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(log_message)
                
            # Also keep the structured JSON log for systems that parse the logs
            structured_data = {
                'timestamp': datetime.now().isoformat(),
                'event': event,
                'module': module or self._get_caller_module(),
                'session_id': session_id,
                'data': data
            }
            self.logger.debug(self._format_data(structured_data))
            return
            
        elif category == "EXPERT_MODE":
            # Create dedicated logs for expert mode events
            status = "✅ SUCCESS" if "success" in event else "❌ ERROR" if "error" in event else "🎯 EXPERT"
            
            log_message = (
                f"\n{'='*80}\n"
                f"EXPERT MODE {status} AT {timestamp}: {event}\n"
                f"{'='*80}\n"
            )
            
            if data:
                # Format based on event type
                if "check" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Enabled: {data.get('enabled', 'unknown')}\n"
                        f"Config: {json.dumps(data.get('config_value', {}), indent=2)}\n"
                    )
                elif "phase1" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Model: {data.get('model', 'unknown')}\n"
                        f"Input Length: {data.get('input_length', 0)}\n"
                    )
                    if "response" in event:
                        log_message += (
                            f"Response Length: {data.get('response_length', 0)}\n"
                            f"Tokens Used: {json.dumps(data.get('usage', {}), indent=2)}\n"
                        )
                elif "analysis" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Domain: {data.get('domain', 'unknown')}\n"
                        f"Request Type: {data.get('request_type', 'unknown')}\n"
                    )
                    if "expert_prompt_preview" in data:
                        log_message += f"Expert Prompt: {data.get('expert_prompt_preview', '')}\n"
                else:
                    # Generic formatting for other expert mode events
                    for key, value in data.items():
                        log_message += f"{key}: {value}\n"
                
                log_message += f"{'='*80}\n"
            
            # Write to expert mode log file
            with open(self.expert_mode_file, 'a', encoding='utf-8') as f:
                f.write(log_message)
                
            # Also log summary info to summary file
            if summary:
                summary_data = {
                    'time': datetime.now().strftime('%H:%M:%S'),
                    'event': f"EXPERT_MODE_{event}",
                    'session': session_id,
                    'status': "enabled" if data and data.get('enabled') else "check"
                }
                with open(self.summary_file, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(summary_data) + '\n')
                    
        elif category in ["PDF_MANAGEMENT", "PDF_MANAGEMENT_ERROR"]:
            # Create more readable logs for PDF-related events
            status = "✅ SUCCESS" if "success" in event else "❌ ERROR" if "error" in event else "🔄 INFO"
            
            log_message = (
                f"\n{'-'*80}\n"
                f"PDF {status} AT {timestamp}: {event}\n"
                f"{'-'*80}\n"
            )
            
            if data:
                # Structure based on the event type
                if "upload" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"File: {data.get('file_name', 'unknown')}\n"
                        f"Size: {data.get('file_size', 0)} bytes ({data.get('file_size_mb', 0)} MB)\n"
                        f"Type: {data.get('mime_type', data.get('content_type', 'unknown'))}\n"
                    )
                    
                    if 'base64_length' in data:
                        log_message += f"Base64 Length: {data.get('base64_length', 0)} chars\n"
                        
                    if 'pdf_id' in data:
                        log_message += f"PDF ID: {data.get('pdf_id', 'unknown')}\n"
                        
                elif "api_request" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Message Count: {data.get('message_count', 'unknown')}\n"
                        f"Has Document Blocks: {data.get('has_document_blocks', False)}\n"
                    )
                    
                    # Add message structure if available
                    if 'message_structure' in data:
                        log_message += "Message Structure:\n"
                        for i, msg in enumerate(data.get('message_structure', [])):
                            log_message += f"  Message {i+1}: {msg.get('role', 'unknown')}\n"
                            content_types = [
                                t.get('type', 'unknown') 
                                for t in msg.get('content_structure', [])
                            ]
                            log_message += f"    Content Types: {', '.join(content_types)}\n"
                    
                elif "error" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Error: {data.get('error', 'Unknown error')}\n"
                        f"Error Type: {data.get('error_type', 'Unknown')}\n"
                    )
                else:
                    # Generic data formatting for other PDF events
                    for key, value in data.items():
                        if key not in ['timestamp', 'event', 'module']:
                            log_message += f"{key}: {value}\n"
                
                log_message += f"{'-'*80}\n"
            
            # Write directly to the PDF log file
            with open(self.pdf_log_file, 'a', encoding='utf-8') as f:
                f.write(log_message)
                
            # Also keep the structured log for the main debug file
            structured_data = {
                'timestamp': datetime.now().isoformat(),
                'event': event,
                'module': module or self._get_caller_module(),
                'session_id': session_id,
                'data': data,
                'category': category
            }
            self.logger.debug(self._format_data(structured_data))
            return
            
        elif category == "SUMMARIZATION" and event in ["summarization_started", "summarization_success", "summarization_failed"]:
            # Create more readable logs for major summarization state changes
            status = "✅ SUCCESS" if "success" in event else "❌ FAILED" if "failed" in event else "🔄 STARTED"
            
            log_message = (
                f"\n{'-'*60}\n"
                f"SUMMARIZATION {status} AT {timestamp}\n"
                f"{'-'*60}\n"
            )
            
            if data:
                # Include relevant data based on event type
                if "success" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Original Tokens: {data.get('original_tokens', 'unknown')}\n"
                        f"Summary Tokens: {data.get('summary_tokens', 'unknown')}\n"
                        f"Compression: {data.get('compression_ratio', 'unknown')}\n"
                        f"New Turn Count: {data.get('new_turns_count', 'unknown')}\n"
                    )
                elif "started" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Turns to Summarize: {data.get('turns_to_summarize', 'unknown')}\n"
                    )
                elif "failed" in event:
                    log_message += (
                        f"Session: {session_id}\n"
                        f"Error: {data.get('error', 'Unknown error')}\n"
                    )
                
                log_message += f"{'-'*60}\n"
            
            # Write directly to the log file
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(log_message)
                
            # Also keep the structured log
            structured_data = {
                'timestamp': datetime.now().isoformat(),
                'event': event,
                'module': module or self._get_caller_module(),
                'session_id': session_id,
                'data': data
            }
            self.logger.debug(self._format_data(structured_data))
            return
            
        # For all other logs, use the standard JSON format
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'event': event,
            'module': module or self._get_caller_module()
        }
        
        if session_id:
            log_data['session_id'] = session_id
            
        if data:
            log_data['data'] = data
            
        # Full debug log
        self.logger.debug(self._format_data(log_data))
        
        # Summary log
        if summary:
            summary_data = {
                'time': timestamp,
                'event': event
            }
            if session_id:
                summary_data['session'] = session_id
            
            # Add important counts but skip large content
            if data:
                if 'message_count' in data:
                    summary_data['messages'] = data['message_count']
                if 'turns_count' in data:
                    summary_data['turns'] = data['turns_count']
                if 'conversation_turns' in data:
                    summary_data['conv_turns'] = data['conversation_turns']
            
            self.summary_handler.handle(
                logging.LogRecord(
                    name='summary',
                    level=logging.INFO,
                    pathname=__file__,
                    lineno=0,
                    msg=json.dumps(summary_data),
                    args=(),
                    exc_info=None
                )
            )

# Global instance
debug = DebugLogger()

# Helper function for conversation flow logging
def log_conversation_flow(phase: str,
                        message: str,
                        session_id: str,
                        **kwargs) -> None:
    """Log conversation flow events."""
    debug.log(
        event=f"conversation_{phase}",
        session_id=session_id,
        data={
            'message': message,
            **kwargs
        }
    )