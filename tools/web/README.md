# Web Tools for CodaiApp9-1

This module provides web-focused tools for the CodaiApp9-1 application, allowing the AI to search the web and fetch content from websites.

## Tools Included

### WebSearchTool

Performs web searches using various search engines and returns structured results.

**Features**:
- Search using DuckDuckGo (default, no API key required)
- Optional Google Search (requires SerpAPI key)
- Optional Bing Search (requires Bing API key)
- Customizable number of results
- Structured result format

**Example Usage**:
```python
search_tool = WebSearchTool()
# Optional: Set API keys for commercial search engines
search_tool.set_api_key("google", "your_serpapi_key")
search_tool.set_api_key("bing", "your_bing_api_key")

# Use the tool
result = await search_tool(query="python programming", engine="duckduckgo", num_results=3)
```

### WebFetcherTool

Fetches and extracts content from web pages with multiple extraction modes.

**Features**:
- Multiple content extraction modes
  - `full_page`: Returns the complete HTML
  - `main_content`: Extracts the main content area
  - `text_only`: Extracts text content only (no HTML)
  - `structured`: Returns content in an organized structure
- Custom CSS selector support
- Content length limiting
- Structured metadata

**Example Usage**:
```python
fetcher_tool = WebFetcherTool()

# Basic usage
result = await fetcher_tool(url="https://example.com")

# Advanced usage with options
result = await fetcher_tool(
    url="https://example.com",
    extract_mode="structured",
    selector="article.main-content",
    max_length=5000
)
```

## Installation

Ensure you have the required dependencies:

```bash
pip install -r tools/web/requirements.txt
```

## API Keys

For commercial search engines, you'll need to set API keys:

- For Google Search: Get a key from [SerpApi](https://serpapi.com/)
- For Bing Search: Get a key from [Microsoft Azure](https://www.microsoft.com/en-us/bing/apis/bing-web-search-api)

## Legal Considerations

- Always respect robots.txt and website terms of service
- Implement proper rate limiting for web requests
- Be aware of content licensing and copyright considerations