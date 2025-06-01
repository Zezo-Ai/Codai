"""Web tool result handling utilities."""

import json
import logging
import base64
from typing import Dict, Any, Optional, List, Union

from tools.base import ToolResult
from .message_handler import format_message_with_type, format_web_search

logger = logging.getLogger("web_tools")

def format_web_search_result(result: ToolResult) -> Dict[str, Any]:
    """Format web search results for frontend display."""
    try:
        # Check if result has metadata
        output = result.output or ""
        search_results = []
        query = ""
        engine = "unknown"
        
        # First try to extract from metadata
        if result.metadata:
            metadata = result.metadata
            query = metadata.get("search_query", "")
            engine = metadata.get("engine", "unknown")
            results_data = metadata.get("results", [])
            
            if results_data and isinstance(results_data, list):
                search_results = [
                    {
                        "title": item.get("title", "Untitled"),
                        "content": item.get("content", "No content available"),
                        "url": item.get("url", "")
                    } 
                    for item in results_data
                ]
        
        # If no results in metadata, try to parse from output
        if not search_results and output:
            # Try to parse structured output
            try:
                # Check if output is JSON
                if output.strip().startswith("{") and output.strip().endswith("}"):
                    data = json.loads(output)
                    if "results" in data and isinstance(data["results"], list):
                        search_results = [
                            {
                                "title": item.get("title", "Untitled"),
                                "content": item.get("content", "No content available"),
                                "url": item.get("url", "")
                            } 
                            for item in data["results"]
                        ]
                        query = data.get("query", "")
                        engine = data.get("engine", "unknown")
            except json.JSONDecodeError:
                # If not JSON, try to parse a readable format
                pass
                
        # Create an action command format that will be detected by ActionFormatter
        # This ensures it gets formatted as a tool even when returned as raw content
        formatted_action = {
            "action": "web_search",
            "query": query,
            "engine": engine,
            "results": search_results if search_results else "No results found"
        }
        
        # Create structured search result
        if search_results:
            # Use the dedicated formatting function for web search
            return format_web_search(
                query=query,
                results=search_results,
                engine=engine
            )
        else:
            # For text-only or failed parsing, return as action command
            return format_message_with_type(
                content=json.dumps(formatted_action),
                message_type="text",  # Format as text but with JSON that will be detected as an action
                metadata={"type": "tool_output"}
            )
    
    except Exception as e:
        logger.error(f"Error formatting web search result: {e}")
        return format_message_with_type(
            content=result.output or str(e),
            message_type="text"
        )

def format_web_fetch_result(result: ToolResult) -> Dict[str, Any]:
    """Format web fetched content for frontend display."""
    try:
        # Check if result has metadata
        output = result.output or ""
        url = ""
        title = "Web Content"
        extract_mode = "unknown"
        truncated = False
        
        # Sanitize output - remove any non-text content or encoding issues
        # Remove any control characters or binary data that could cause rendering issues
        import re
        # Remove null bytes and control characters
        output = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', output)
        # Replace any sequences that look like binary data with placeholders
        output = re.sub(r'[^\x20-\x7E\t\n\r\x85\u2028\u2029\xA0-\xFF]+', '[binary content removed]', output)
        
        # Extract metadata
        if result.metadata:
            metadata = result.metadata
            url = metadata.get("url", "")
            title = metadata.get("title", "Web Content")
            extract_mode = metadata.get("extract_mode", "unknown")
            truncated = metadata.get("truncated", False)
        
        # Check if the output is HTML and convert it to plain text if needed
        if '<html' in output.lower() or '<!doctype html' in output.lower():
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(output, 'html.parser')
                # Remove scripts, styles, and other non-content elements
                for element in soup(['script', 'style', 'meta', 'noscript', 'svg']):
                    element.decompose()
                
                # Extract main content with proper formatting
                content = ""
                
                # Process headings
                for i in range(1, 7):
                    for heading in soup.find_all(f'h{i}'):
                        text = heading.get_text().strip()
                        if text:
                            content += f"\n{'#' * i} {text}\n\n"
                            heading.decompose()
                
                # Process paragraphs
                for p in soup.find_all('p'):
                    text = p.get_text().strip()
                    if text:
                        content += f"{text}\n\n"
                
                # If we got some content, use it, otherwise fallback to all text
                if content.strip():
                    output = content.strip()
                else:
                    output = soup.get_text(separator='\n\n')
            except Exception as e:
                logger.warning(f"HTML to text conversion failed: {e}")
                # Just keep the original output if conversion fails
        
        # Create structured web fetch result
        web_fetch_metadata = {
            "url": url,
            "title": title,
            "extract_mode": extract_mode,
            "length": len(output),
            "truncated": truncated
        }
        
        return format_message_with_type(
            content=output,
            message_type="web_fetch",
            metadata=web_fetch_metadata
        )
    
    except Exception as e:
        logger.error(f"Error formatting web fetch result: {e}")
        return format_message_with_type(
            content=f"Error processing web content: {str(e)}",
            message_type="text"
        )

def format_web_interaction_result(result: ToolResult) -> Dict[str, Any]:
    """Format web interaction results for frontend display.
    
    Handles various types of web interaction results including:
    - Form submissions
    - Clicks
    - Navigation
    - Screenshots
    - Extractions
    """
    try:
        # Get output and metadata
        output = result.output or ""
        action = "interaction"
        url = ""
        title = "Web Interaction"
        action_description = "Performed web interaction"
        
        # Extract image if present
        screenshot_data = None
        if result.base64_image:
            screenshot_data = result.base64_image
        
        # Extract metadata
        if result.metadata:
            metadata = result.metadata
            url = metadata.get("url", "")
            title = metadata.get("title", title)
            action = metadata.get("action", action)
            
            # Create more descriptive action description based on action type
            if action == "navigate":
                action_description = f"Navigated to {url}"
            elif action == "fill_form":
                fields_filled = metadata.get("fields_filled", [])
                fields_count = len(fields_filled) if isinstance(fields_filled, list) else 0
                submitted = metadata.get("submitted", False)
                if submitted:
                    action_description = f"Filled {fields_count} form fields and submitted the form"
                else:
                    action_description = f"Filled {fields_count} form fields"
            elif action == "click":
                element = metadata.get("element", "element")
                element_text = metadata.get("element_text", "")
                action_description = f"Clicked on {element}"
                if element_text:
                    action_description += f" with text '{element_text}'"
            elif action == "login":
                action_description = f"Performed login action at {url}"
            elif action == "extract":
                count = metadata.get("count", 0)
                selector = metadata.get("selector", "elements")
                action_description = f"Extracted {count} {selector}"
            elif action == "screenshot":
                selector = metadata.get("selector", "")
                if selector:
                    element_count = metadata.get("element_count", 1)
                    action_description = f"Captured screenshot of {element_count} element(s) matching '{selector}'"
                else:
                    action_description = f"Captured full page screenshot of {url}"
            elif action == "scroll":
                selector = metadata.get("selector", "")
                if selector:
                    element_text = metadata.get("element_text", "")
                    action_description = f"Scrolled to element '{selector}'"
                    if element_text:
                        action_description += f" with text '{element_text}'"
                else:
                    action_description = f"Scrolled the page at {url}"
            elif action == "check":
                selector = metadata.get("selector", "")
                exists = metadata.get("exists", False)
                visible = metadata.get("visible", False)
                status = "visible" if visible else ("exists but not visible" if exists else "does not exist")
                action_description = f"Element '{selector}' {status} on the page"
        
        # Create structured metadata
        interaction_metadata = {
            "url": url,
            "title": title,
            "action": action,
            "action_description": action_description,
            "has_screenshot": screenshot_data is not None
        }
        
        # Add relevant metadata from the result
        if result.metadata:
            for key, value in result.metadata.items():
                if key not in interaction_metadata and key != "action_description":
                    interaction_metadata[key] = value
        
        # Check if we need to create a special format for screenshots
        if screenshot_data:
            # Return special format for screenshot type
            return {
                "type": "web_interaction",
                "content": action_description,
                "screenshot": screenshot_data,
                "metadata": interaction_metadata
            }
        
        # Otherwise return standard message format
        return format_message_with_type(
            content=output,
            message_type="web_interaction",
            metadata=interaction_metadata
        )
    
    except Exception as e:
        logger.error(f"Error formatting web interaction result: {e}")
        return format_message_with_type(
            content=f"Error processing web interaction: {str(e)}",
            message_type="text"
        )