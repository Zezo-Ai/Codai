"""Message cleaning utilities for chat responses."""

import re
import json
import logging
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger("message_cleaner")

def clean_json_prefixes(content: str) -> str:
    """
    Clean JSON command prefixes from assistant messages.
    
    This function detects and removes JSON command prefixes that Claude sometimes 
    incorrectly includes in its responses, particularly for web search commands.
    
    Args:
        content: The message content to clean
        
    Returns:
        Cleaned message content
    """
    # Pattern for JSON commands at the start of a message followed by text
    command_pattern = r'^\s*(\{.*?\})\s*(.*)'
    
    # Try to match and extract any JSON command at the start
    command_match = re.match(command_pattern, content, re.DOTALL)
    if not command_match:
        return content  # No JSON prefix found
    
    try:
        # Try to parse the first part as JSON to confirm it's a valid command
        json_part = command_match.group(1)
        parsed_json = json.loads(json_part)
        
        # Check if this looks like a web search command
        if "query" in parsed_json and "num_results" in parsed_json:
            # Extract the text after the JSON
            text_part = command_match.group(2).strip()
            
            # Common pattern for search results
            search_pattern = r'^Search results for [\'"].*?[\'"] from .*?:'
            if re.match(search_pattern, text_part):
                logger.info(f"Removed JSON web search command prefix from message")
                return text_part
    except (json.JSONDecodeError, IndexError):
        # If it's not valid JSON or there's an extraction error, return original content
        pass
    
    # Default: return original
    return content

def format_web_results(content: str) -> Tuple[bool, str]:
    """
    Format web search results in a consistent way.
    
    Args:
        content: Message content that might contain web search results
        
    Returns:
        (is_search_result, formatted_content)
    """
    # First check for our special marker format
    if "[WEB_SEARCH_RESULTS]" in content and "[/WEB_SEARCH_RESULTS]" in content:
        # Extract the content between the markers
        marker_pattern = r'\[WEB_SEARCH_RESULTS\](.*?)\[/WEB_SEARCH_RESULTS\]'
        marker_match = re.search(marker_pattern, content, re.DOTALL)
        if marker_match:
            search_content = marker_match.group(1).strip()
            
            # Extract query and engine
            search_pattern = r'Search results for [\'"](.+?)[\'"] from (.+?):'
            search_match = re.search(search_pattern, search_content)
            if search_match:
                query = search_match.group(1)
                engine = search_match.group(2)
                
                # Find all results
                results_pattern = r'(\d+)\.\s+(.*?)\n\s+(.*?)\n\s+URL:\s+(.*?)(?:\n\n|\Z)'
                results = re.findall(results_pattern, search_content, re.DOTALL)
                
                # Create action object
                action_obj = {
                    "action": "web_search",
                    "query": query,
                    "engine": engine,
                    "results": [
                        {
                            "title": r[1].strip(),
                            "content": r[2].strip(),
                            "url": r[3].strip()
                        } for r in results
                    ]
                }
                
                # Format as JSON for ActionFormatter
                return True, json.dumps(action_obj, ensure_ascii=False)
    
    # Check for regular search result format (backup method)
    search_pattern = r'^Search results for [\'"](.+?)[\'"] from (.+?):\s*(.*)$'
    match = re.match(search_pattern, content, re.DOTALL)
    
    if not match:
        return False, content
    
    query = match.group(1)
    engine = match.group(2)
    results_text = match.group(3).strip()
    
    # Check if this is in a typical search results format
    results_pattern = r'(\d+)\.\s+(.*?)\n\s+(.*?)\n\s+URL:\s+(.*?)(?:\n\n|\Z)'
    results = re.findall(results_pattern, results_text, re.DOTALL)
    
    if not results:
        return False, content
    
    # Create a formatted action object that will be detected by the ActionFormatter
    action_obj = {
        "action": "web_search",
        "query": query,
        "engine": engine,
        "results": [
            {
                "title": r[1].strip(),
                "content": r[2].strip(),
                "url": r[3].strip()
            } for r in results
        ]
    }
    
    # Format as a JSON string that will be detected as an action
    formatted_content = json.dumps(action_obj, ensure_ascii=False)
    
    return True, formatted_content