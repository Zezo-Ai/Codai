# Web Interaction Tool

This modular package provides a comprehensive set of utilities for programmatic interaction with web pages using Selenium.

## Module Structure

The package is organized into the following modules, each with a single responsibility:

- **tool.py**: Main WebInteractionTool class that serves as the entry point
- **browser.py**: Browser initialization and management
- **waiter.py**: Sophisticated waiting strategies for page loads and elements
- **actions.py**: Core interaction actions (navigate, click, fill forms, etc.)
- **extraction.py**: Element data extraction capabilities
- **visual.py**: Visual interactions like screenshots and scrolling
- **capture.py**: Screenshot utilities with element highlighting
- **constants.py**: Shared constants and configuration values

## Wait Strategies

The tool implements three levels of waiting strategies:

- **minimal**: Fastest execution with basic waiting for document ready state
- **normal**: Balanced approach with waiting for network idle and element visibility
- **thorough**: Most reliable approach with extensive waiting for DOM stability, network idle, animations completion, and element position stability

## Features

- Form filling and submission
- Button clicking with intelligent retry mechanisms
- Login workflow automation
- Element data extraction
- Screenshot capture with element highlighting
- Scrolling operations
- Element presence and visibility checking
- Automatic page load waiting and network activity monitoring

## Usage Examples

```python
# Basic navigation
result = await web_interact(
    action="navigate",
    url="https://example.com",
    wait_strategy="normal"
)

# Click an element
result = await web_interact(
    action="click",
    url="https://example.com",
    selector="#submit-button",
    wait_strategy="thorough"
)

# Fill a form
result = await web_interact(
    action="fill_form",
    url="https://example.com/form",
    form_data={
        "#email": "user@example.com",
        "#password": "password123"
    },
    submit=True
)

# Login to a site
result = await web_interact(
    action="login",
    url="https://example.com/login",
    form_data={
        "username": "myuser",
        "password": "mypassword"
    }
)

# Extract element data
result = await web_interact(
    action="extract",
    url="https://example.com",
    selector=".product-item"
)

# Take a screenshot
result = await web_interact(
    action="screenshot",
    url="https://example.com"
)
```

## Technical Details

- Thread safety is achieved with thread-local storage for browser instances
- Browser reuse improves performance across multiple operations
- Advanced error handling with retry mechanisms
- DOM mutation observation for stability detection
- Network request tracking for AJAX, fetch, and jQuery
- Animation detection and waiting
- Element position stability checking