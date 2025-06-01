"""
Stream tagging constants for consistent tool result marking.
These tags help the frontend properly identify and visualize tool states.
"""

# Tool result tags
TOOL_RESULT_START = "tool_result_start"
TOOL_RESULT_CONTENT = "tool_result" 
TOOL_RESULT_END = "tool_result_end"

# Tool call tags
TOOL_CALL_START = "tool_call_start"
TOOL_CALL_CONTENT = "action"  # Keep compatible with existing "action" type
TOOL_CALL_END = "tool_call_end"

# File content tags
FILE_CONTENT_START = "file_content_start"
FILE_CONTENT = "file"  # Keep compatible with existing "file" type
FILE_CONTENT_END = "file_content_end"

# PDF content tags
PDF_PROCESSING_START = "pdf_processing_start"
PDF_PROCESSING_CONTENT = "pdf_content"
PDF_PROCESSING_END = "pdf_processing_end"