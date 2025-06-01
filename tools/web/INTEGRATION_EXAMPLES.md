# Web Interaction Integration Examples

This document provides examples and patterns for integrating the Web Interaction Tool into your applications and workflows.

## Basic Integration

### 1. Importing and Using the Tool

```python
from tools.web import WebInteractionTool

async def example_usage():
    # Initialize the tool
    web_tool = WebInteractionTool()
    
    # Navigate to a website
    result = await web_tool(
        action="navigate",
        url="https://example.com"
    )
    
    # Display the result
    print(result.output)
    
    # If there's a screenshot
    if result.base64_image:
        # Save the screenshot
        import base64
        with open("screenshot.png", "wb") as f:
            f.write(base64.b64decode(result.base64_image))
```

### 2. Form Filling and Submission

```python
async def login_example():
    web_tool = WebInteractionTool()
    
    # Fill a login form and submit
    result = await web_tool(
        action="login",
        url="https://example.com/login",
        form_data={
            "username": "user@example.com",
            "password": "securepassword"
        },
        wait_for=".dashboard"  # Element to wait for after login
    )
    
    # Check if login was successful
    if "Login appears to have failed" in result.output:
        print("Login failed")
        return
        
    # Continue with authenticated operations
    dashboard_content = await web_tool(
        action="extract",
        url="https://example.com/dashboard",
        selector=".dashboard-content"
    )
```

## Advanced Usage Patterns

### 1. Chaining Multiple Interactions

```python
async def workflow_example():
    web_tool = WebInteractionTool()
    
    # 1. Navigate to a site
    await web_tool(action="navigate", url="https://example.com")
    
    # 2. Fill and submit a search form
    await web_tool(
        action="fill_form",
        url="https://example.com",
        form_data={"#search": "query"},
        submit=True,
        wait_for=".results"
    )
    
    # 3. Extract search results
    results = await web_tool(
        action="extract",
        url="https://example.com/search",
        selector=".result-item"
    )
    
    # 4. Click on the first result
    await web_tool(
        action="click",
        url="https://example.com/search",
        selector=".result-item:first-child a"
    )
    
    # 5. Take a screenshot of the result page
    screenshot = await web_tool(
        action="screenshot",
        url="https://example.com/result"
    )
```

### 2. Error Handling

```python
async def robust_interaction():
    web_tool = WebInteractionTool()
    
    try:
        result = await web_tool(
            action="navigate",
            url="https://example.com",
            timeout=10000  # 10 seconds timeout
        )
        
        if result.error:
            print(f"Navigation error: {result.error}")
            return
            
        # Continue with other actions...
        
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
```

### 3. Working with Dynamic Content

```python
async def dynamic_content_example():
    web_tool = WebInteractionTool()
    
    # Navigate to a page with dynamic content
    await web_tool(
        action="navigate",
        url="https://example.com/dynamic",
        wait_for="#content-loaded"  # Wait for a specific element indicating content is loaded
    )
    
    # Click a button that triggers AJAX loading
    await web_tool(
        action="click",
        url="https://example.com/dynamic",
        selector="#load-more-button",
        wait_for=".new-content"  # Wait for new content to appear
    )
    
    # Extract the dynamically loaded content
    content = await web_tool(
        action="extract",
        url="https://example.com/dynamic",
        selector=".content-container"
    )
```

## Integration with Application Architecture

### 1. Using with Clean Architecture

```python
# In your domain layer
class WebInteractionService:
    def __init__(self, web_tool):
        self.web_tool = web_tool
        
    async def perform_search(self, query, website_url):
        """Business logic for performing a search."""
        # Navigate to site
        await self.web_tool(action="navigate", url=website_url)
        
        # Perform search
        await self.web_tool(
            action="fill_form",
            url=website_url,
            form_data={"#search-box": query},
            submit=True
        )
        
        # Extract and return results
        result = await self.web_tool(
            action="extract",
            url=website_url,
            selector=".search-results-item"
        )
        
        # Process result data
        return self._process_results(result)
        
    def _process_results(self, result):
        # Process and transform results
        # ...

# In your application layer
async def search_use_case(query, website_url):
    # Get tool instance through dependency injection
    web_tool = get_web_tool_instance()
    
    # Create service
    service = WebInteractionService(web_tool)
    
    # Execute business logic
    return await service.perform_search(query, website_url)
```

### 2. Integration with API Routes

```python
# In your FastAPI route
from fastapi import APIRouter, Depends
from tools.web import WebInteractionTool

router = APIRouter()

def get_web_tool():
    # You might add configuration here
    return WebInteractionTool()

@router.post("/interact")
async def web_interaction(
    interaction: WebInteractionRequest,
    web_tool: WebInteractionTool = Depends(get_web_tool)
):
    """API endpoint for web interactions."""
    result = await web_tool(
        action=interaction.action,
        url=interaction.url,
        **interaction.additional_params
    )
    
    # Transform result to API response
    return {
        "success": not result.error,
        "message": result.output or result.error,
        "screenshot": result.base64_image,
        "metadata": result.metadata
    }
```

## Security Considerations

1. **Credential Handling**: Never hardcode sensitive credentials
   ```python
   # WRONG
   await web_tool(
       action="login",
       url="https://example.com",
       form_data={
           "username": "hardcoded_user",  # Bad practice
           "password": "hardcoded_password"  # Bad practice
       }
   )
   
   # BETTER
   import os
   from dotenv import load_dotenv
   
   load_dotenv()
   
   await web_tool(
       action="login",
       url="https://example.com",
       form_data={
           "username": os.getenv("SERVICE_USERNAME"),
           "password": os.getenv("SERVICE_PASSWORD")
       }
   )
   ```

2. **Rate Limiting**: Implement rate limiting to avoid overwhelming websites
   ```python
   import asyncio
   
   async def rate_limited_interaction():
       web_tool = WebInteractionTool()
       
       # First interaction
       await web_tool(action="navigate", url="https://example.com")
       
       # Wait before next request
       await asyncio.sleep(2)  # 2 second delay
       
       # Next interaction
       await web_tool(action="click", url="https://example.com", selector="button")
   ```

3. **User-Agent Rotation**: For high-volume scenarios, consider rotating user agents
   ```python
   import random
   
   user_agents = [
       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
       # Add more user agents
   ]
   
   # In your configuration code
   web_config = {
       "user_agent": random.choice(user_agents)
   }
   ```



## Performance Optimization

1. **Reusing Browser Context**:
   ```python
   from playwright.async_api import async_playwright
   
   class OptimizedWebInteraction:
       def __init__(self):
           self.playwright = None
           self.browser = None
           self.context = None
           
       async def initialize(self):
           """Initialize browser once and reuse."""
           self.playwright = await async_playwright().start()
           self.browser = await self.playwright.chromium.launch()
           self.context = await self.browser.new_context()
           
       async def navigate(self, url):
           """Use existing context."""
           if not self.context:
               await self.initialize()
               
           page = await self.context.new_page()
           await page.goto(url)
           return page
           
       async def close(self):
           """Clean up resources."""
           if self.context:
               await self.context.close()
           if self.browser:
               await self.browser.close()
           if self.playwright:
               await self.playwright.stop()
   ```

2. **Parallel Operations** (when appropriate):
   ```python
   async def parallel_extraction(urls):
       """Extract content from multiple URLs in parallel."""
       web_tool = WebInteractionTool()
       tasks = []
       
       for url in urls:
           task = asyncio.create_task(
               web_tool(action="extract", url=url, selector="main")
           )
           tasks.append(task)
           
       results = await asyncio.gather(*tasks)
       return results
   ```