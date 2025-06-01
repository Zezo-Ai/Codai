"""PDF processing tool implementation.

This module provides a tool for processing PDF documents to be used with Claude's PDF analysis capabilities.
It handles validation, conversion to base64, and preparation for the Anthropic API.
"""
import base64
from pathlib import Path
from typing import Literal, Optional

from anthropic.types.beta import BetaToolUnionParam
from tools.base import BaseAnthropicTool, ToolError, ToolResult, CLIResult, WebResult
from tools.path_handler import get_path_handler
from debug.debug_logger import debug

class PDFTool(BaseAnthropicTool):
    """Tool for processing PDF documents with Claude.
    
    This tool handles:
    - Validating PDF files
    - Size checking against Anthropic's limits
    - Converting PDFs to base64 for Claude's API
    """
    
    name: Literal["pdf_processor"] = "pdf_processor"
    MAX_SIZE = 32 * 1024 * 1024  # 32MB - Anthropic's limit
    
    def __init__(self):
        """Initialize PDFTool with path handler."""
        super().__init__()
        self.path_handler = get_path_handler()
    
    def to_params(self) -> BetaToolUnionParam:
        """Get tool parameters for API consumption."""
        return {
            "name": self.name,
            "description": "Process and analyze PDF documents.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Local path to the PDF file."
                    },
                    "output_format": {
                        "type": "string",
                        "enum": ["cli", "web"],
                        "description": "Output format (cli or web). Default is web."
                    }
                },
                "required": ["file_path"]
            }
        }
    
    async def __call__(
        self, 
        *, 
        file_path: str, 
        output_format: Literal["cli", "web"] = "web",
        **kwargs
    ) -> ToolResult:
        """Process a PDF file and prepare it for Claude analysis.
        
        Args:
            file_path: Path to the PDF file
            output_format: Output format ('cli' or 'web')
            
        Returns:
            ToolResult with PDF processing results
        """
        try:
            debug.log(
                event="pdf_processing_started",
                data={"path": file_path, "format": output_format},
                category="PDF_PROCESSING"
            )
            
            # Validate the path exists and is accessible using path handler
            validated_path = self.path_handler.validate(
                file_path,
                must_exist=True,
                check_permissions=True,
                required_permission='r'
            )
            
            # Verify file is a PDF
            if validated_path.suffix.lower() != '.pdf':
                raise ToolError(f"File is not a PDF: {validated_path}")
            
            # Check file size against Anthropic's limit
            file_size = validated_path.stat().st_size
            if file_size > self.MAX_SIZE:
                raise ToolError(f"PDF exceeds maximum size of 32MB: {file_size/1024/1024:.1f}MB")
            
            # Read and encode the PDF
            with open(validated_path, 'rb') as file:
                pdf_bytes = file.read()
                pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
            
            # Create simple info object
            pdf_info = {
                "path": str(validated_path),
                "size_mb": round(file_size / 1024 / 1024, 2),
                "name": validated_path.name
            }
            
            debug.log(
                event="pdf_processed",
                data={"path": str(validated_path), "size_mb": pdf_info["size_mb"]},
                category="PDF_PROCESSING"
            )
            
            # Return result in appropriate format
            if output_format == "cli":
                return self._handle_result(CLIResult(
                    output=f"PDF processed successfully: {validated_path.name} ({pdf_info['size_mb']}MB)"
                ))
            else:
                return self._handle_result(WebResult(
                    output=f"PDF processed successfully: {validated_path.name}",
                    metadata={
                        "pdf_info": pdf_info,
                        "pdf_base64": pdf_base64,
                        "file_type": "pdf"
                    }
                ))
            
        except ToolError as e:
            debug.log(
                event="pdf_processing_error", 
                data={"error": str(e)},
                category="PDF_PROCESSING"
            )
            return self._handle_result(
                CLIResult(error=str(e)) if output_format == "cli" else WebResult(error=str(e))
            )
        except Exception as e:
            debug.log(
                event="pdf_processing_exception",
                data={"error": str(e)},
                category="PDF_PROCESSING"
            )
            return self._handle_result(
                CLIResult(error=f"Error processing PDF: {str(e)}") 
                if output_format == "cli" 
                else WebResult(error=f"Error processing PDF: {str(e)}")
            )