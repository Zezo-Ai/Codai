# Web Interaction Tool

The Web Interaction Tool provides advanced browser automation capabilities for interacting with web pages programmatically. This tool enables operations such as form filling, button clicking, login automation, element extraction, and more.

## Installation

The Web Interaction Tool depends on Playwright, which needs to be installed along with browser binaries:

```bash
pip install -r requirements.txt
playwright install
```

### Complete Installation Steps

1. Install the required Python packages:
   ```bash
   pip install playwright>=1.35.0 chardet>=5.1.0
   ```

2. Install Playwright browser binaries:
   ```bash
   python -m playwright install
   ```

3. Verify the installation:
   ```bash
   python -c "from playwright.sync_api import sync_playwright; print(sync_playwright().start().chromium.launch())"
   ```

### Troubleshooting

If you encounter issues with Playwright:

1. **Missing dependencies**: On Linux, you might need to install additional dependencies:
   ```bash
   sudo apt-get install libwoff1 libopus0 libwebp6 libwebpdemux2 libenchant1c2a libgudev-1.0-0 libsecret-1-0 libhyphen0 libgdk-pixbuf2.0-0 libegl1 libnotify4 libxslt1.1 libevent-2.0-5 libgles2 libvpx5
   ```

2. **Browser launch failure**: If browsers fail to launch, try installing with the --force flag:
   ```bash
   python -m playwright install --force
   ```

3. **Permission issues**: Ensure the current user has permissions to execute the installed browsers:
   ```bash
   chmod -R 755 ~/.cache/ms-playwright/
   ```

## Functionality

The tool provides the following actions:

### 1. Navigate

Navigate to a URL and wait for the page to load.

```python
await web_interact(
    action="navigate",
    url="https://example.com",
    wait_for="#content"  # Optional: wait for specific element
)
```

### 2. Fill Form

Fill form fields with provided data.

```python
await web_interact(
    action="fill_form",
    url="https://example.com/form",
    form_data={
        "#email": "user@example.com",
        "#password": "securepassword",
        "#checkbox": "true"
    },
    submit=True,  # Optional: submit form after filling
    wait_for=".success-message"  # Optional: wait for element after submission
)
```

### 3. Click

Click on a specific element identified by a CSS selector.

```python
await web_interact(
    action="click",
    url="https://example.com",
    selector="button.submit",
    wait_for=".result"  # Optional: wait for element after clicking
)
```

### 4. Login

Perform login operations by automating form filling and submission for authentication.

```python
await web_interact(
    action="login",
    url="https://example.com/login",
    form_data={
        "username": "myusername",
        "password": "mypassword"
    },
    wait_for=".dashboard"  # Optional: wait for element indicating successful login
)
```

### 5. Extract

Extract data from elements matching a CSS selector.

```python
await web_interact(
    action="extract",
    url="https://example.com",
    selector=".product-item"
)
```

### 6. Screenshot

Capture a screenshot of the entire page or a specific element.

```python
await web_interact(
    action="screenshot",
    url="https://example.com",
    selector=".main-content"  # Optional: specific element to screenshot
)
```

### 7. Scroll

Scroll the page or to a specific element.

```python
await web_interact(
    action="scroll",
    url="https://example.com",
    selector="#bottom-content"  # Optional: element to scroll to
)
```

### 8. Check

Check if an element exists and is visible on the page.

```python
await web_interact(
    action="check",
    url="https://example.com",
    selector=".notification"
)
```

## Security Considerations

When using this tool, be aware of the following security considerations:

1. **Credentials Security**: Never store sensitive credentials in code; use secure environment variables or a secure vault.
2. **Responsible Automation**: Use automated browsing responsibly and in accordance with the website's terms of service.
3. **Rate Limiting**: Implement rate limiting to avoid overwhelming websites with requests.
4. **Risk Management**: Some websites employ anti-bot measures that may detect and block automated interactions.

## Architecture

The Web Interaction Tool is built on the following architecture:

1. **BaseWebTool**: Inherits from the base tool infrastructure, providing core functionality.
2. **Playwright**: Uses Playwright for browser automation, which provides cross-browser support.
3. **Async Operations**: All operations are async/await based for non-blocking execution.
4. **Clean Architecture**: Follows the application's clean architecture principles with clear separation of concerns.

## Error Handling

The tool provides comprehensive error handling, including:

- Element not found errors
- Navigation timeouts
- Form submission failures
- Authentication failures
- Screenshot capture errors

All errors are returned as structured ToolResult objects with descriptive error messages.