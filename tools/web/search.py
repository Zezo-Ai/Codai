"""Web search tool implementation."""

import json
import aiohttp
import asyncio
from typing import List, Dict, Any, Optional, Literal

from anthropic.types.beta import BetaToolUnionParam
from tools.base import ToolError, ToolResult, CLIResult
from tools.web.base_web import BaseWebTool

# Default search engines and their APIs
SEARCH_ENGINES = {
    "duckduckgo": "https://api.duckduckgo.com/?q={query}&format=json",
    "google_serp": "https://serpapi.com/search?q={query}&api_key={api_key}",
    "bing": "https://api.bing.microsoft.com/v7.0/search?q={query}"
}

class WebSearchTool(BaseWebTool):
    """Tool for performing web searches and returning structured results."""
    
    name: Literal["web_search"] = "web_search"
    
    def __init__(self):
        """Initialize the web search tool."""
        super().__init__()
        self.api_keys = {}
    
    def set_api_key(self, engine: str, key: str):
        """Set API key for a specific search engine."""
        self.api_keys[engine] = key
    
    def to_params(self) -> BetaToolUnionParam:
        """Get tool parameters for API consumption."""
        return {
            "name": self.name,
            "description": "Search the web for information on a specific query.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to look up."
                    },
                    "engine": {
                        "type": "string",
                        "enum": ["duckduckgo", "google", "bing"],
                        "description": "The search engine to use. Default is duckduckgo."
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return. Default is 5."
                    }
                },
                "required": ["query"]
            }
        }
    
    async def __call__(
        self,
        *,
        query: str,
        engine: Literal["duckduckgo", "google", "bing"] = "duckduckgo",
        num_results: int = 5,
        **kwargs
    ) -> ToolResult:
        """Perform a web search and return results."""
        try:
            # Validate inputs
            if not query or not query.strip():
                raise ToolError("Search query cannot be empty")
            
            if num_results < 1:
                num_results = 1
            elif num_results > 10:
                num_results = 10
            
            # Use DuckDuckGo as the default since it doesn't require API keys
            if engine != "duckduckgo" and engine not in self.api_keys:
                engine = "duckduckgo"
                
            # Perform the search based on the engine
            if engine == "duckduckgo":
                results = await self._search_duckduckgo(query, num_results)
            elif engine == "google":
                results = await self._search_google(query, num_results)
            elif engine == "bing":
                results = await self._search_bing(query, num_results)
            else:
                raise ToolError(f"Unsupported search engine: {engine}")
            
            # Format the results
            output = self._format_search_results(query, results, engine)
            
            return self._handle_result(CLIResult(
                output=output,
                metadata={
                    "search_query": query,
                    "engine": engine,
                    "num_results": len(results),
                    "results": results
                }
            ))
        
        except ToolError as e:
            return self._handle_result(CLIResult(error=str(e)))
        except Exception as e:
            return self._handle_result(CLIResult(error=f"Search error: {str(e)}"))
    
    async def _search_duckduckgo(self, query: str, num_results: int) -> List[Dict[str, Any]]:
        """Perform a search using DuckDuckGo."""
        # Use the HTML search page directly which is more reliable
        encoded_query = query.replace(" ", "+")
        url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://duckduckgo.com/"
        }
        
        try:
            from bs4 import BeautifulSoup
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers) as response:
                    if response.status != 200:
                        raise ToolError(f"DuckDuckGo search failed with status: {response.status}")
                    
                    html_content = await response.text()
                    soup = BeautifulSoup(html_content, 'html.parser')
                    
                    # Extract results from the HTML response
                    results = []
                    result_elements = soup.select('.result')
                    
                    for element in result_elements:
                        if len(results) >= num_results:
                            break
                        
                        # Extract title
                        title_element = element.select_one('.result__a')
                        title = title_element.get_text().strip() if title_element else "No title"
                        
                        # Extract URL
                        url = title_element.get('href') if title_element else ""
                        # Fix relative URLs
                        if url.startswith('/'):
                            url = f"https://duckduckgo.com{url}"
                        
                        # Extract snippet
                        snippet_element = element.select_one('.result__snippet')
                        snippet = snippet_element.get_text().strip() if snippet_element else "No description available"
                        
                        results.append({
                            "title": title,
                            "content": snippet,
                            "url": url
                        })
                    
                    # If we couldn't find any results, try to extract from organic results
                    if not results:
                        organic_results = soup.select('.web-result')
                        for element in organic_results:
                            if len(results) >= num_results:
                                break
                            
                            title_element = element.select_one('a.result__a')
                            snippet_element = element.select_one('.result__snippet')
                            
                            if title_element:
                                title = title_element.get_text().strip()
                                url = title_element.get('href', '')
                                snippet = snippet_element.get_text().strip() if snippet_element else "No description available"
                                
                                results.append({
                                    "title": title,
                                    "content": snippet,
                                    "url": url
                                })
                    
                    # Fallback: If still no results, add a generic result with the query
                    if not results:
                        results.append({
                            "title": f"Search for '{query}'",
                            "content": "No specific results found. You may need to refine your search query.",
                            "url": f"https://duckduckgo.com/?q={encoded_query}"
                        })
                    
                    return results[:num_results]
        except Exception as e:
            # Fallback when BeautifulSoup fails or other errors occur
            print(f"Error in DuckDuckGo search: {str(e)}")
            # Provide at least one result even on error
            return [{
                "title": f"Search for '{query}'",
                "content": f"Search encountered an error: {str(e)}. Try rephrasing your query or using a different search engine.",
                "url": f"https://duckduckgo.com/?q={encoded_query}"
            }]
    
    async def _search_google(self, query: str, num_results: int) -> List[Dict[str, Any]]:
        """Perform a search using Google via SerpAPI."""
        api_key = self.api_keys.get("google")
        if not api_key:
            raise ToolError("Google search requires an API key")
        
        url = f"https://serpapi.com/search.json?q={query}&api_key={api_key}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise ToolError(f"Google search failed with status: {response.status}")
                
                data = await response.json()
                
                results = []
                
                # Extract organic results
                for result in data.get("organic_results", [])[:num_results]:
                    results.append({
                        "title": result.get("title", ""),
                        "content": result.get("snippet", ""),
                        "url": result.get("link", "")
                    })
                
                return results
    
    async def _search_bing(self, query: str, num_results: int) -> List[Dict[str, Any]]:
        """Perform a search using Bing Search API."""
        api_key = self.api_keys.get("bing")
        if not api_key:
            raise ToolError("Bing search requires an API key")
        
        url = f"https://api.bing.microsoft.com/v7.0/search?q={query}&count={num_results}"
        headers = {"Ocp-Apim-Subscription-Key": api_key}
        
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise ToolError(f"Bing search failed with status: {response.status}")
                
                data = await response.json()
                
                results = []
                
                # Extract web pages results
                for result in data.get("webPages", {}).get("value", [])[:num_results]:
                    results.append({
                        "title": result.get("name", ""),
                        "content": result.get("snippet", ""),
                        "url": result.get("url", "")
                    })
                
                return results
    
    def _format_search_results(self, query: str, results: List[Dict[str, Any]], engine: str) -> str:
        """
        Format search results into a specific format that can be recognized and displayed properly.
        Instead of plain text, we'll create a format that will be displayed in the UI as a tool result.
        """
        engine_names = {
            "duckduckgo": "DuckDuckGo",
            "google": "Google",
            "bing": "Bing"
        }
        
        # Create a special marker that will be recognized by our message processor
        output = f"[WEB_SEARCH_RESULTS]\n"
        output += f"Search results for '{query}' from {engine_names.get(engine, engine)}:\n\n"
        
        if not results:
            output += "No results found."
            return output
        
        for i, result in enumerate(results, 1):
            output += f"{i}. {result['title']}\n"
            output += f"   {result['content']}\n"
            output += f"   URL: {result['url']}\n\n"
        
        # Add a closing marker
        output += f"[/WEB_SEARCH_RESULTS]"
        return output