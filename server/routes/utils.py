import json
from typing import Union
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse
from tools.base import ToolResult

class CustomAPIRoute(APIRoute):
    def get_route_handler(self):
        original_route_handler = super().get_route_handler()

        async def custom_route_handler(request):
            if request.method == "OPTIONS":
                return JSONResponse(
                    status_code=200,
                    content={"detail": "OK"}
                )
            return await original_route_handler(request)

        return custom_route_handler

def filter_tool_output(text: str) -> str:
    """Filter out tool actions and internal info from text."""
    if not text:
        return ""
    lines = text.split('\n')
    filtered_lines = [
        line for line in lines 
        if not (
            line.startswith('{"action":') or
            line.startswith('{"command":') or
            line.startswith('INFO:') or 
            '/_stcore/' in line or
            'Computer action:' in line or
            'Screenshot captured' in line or
            'View File' in line or
            'Viewing file:' in line or
            'str_replace_editor' in line or
            'Using str_replace_editor' in line or
            'with the view command' in line
        )
    ]
    return '\n'.join(filtered_lines)

def format_sse_data(data: Union[str, dict]) -> str:
    """Format data into SSE format with proper JSON structure."""
    try:
        if isinstance(data, dict):
            json_str = json.dumps(data)
        else:
            json.loads(data)  # This will raise an error if invalid
            json_str = data

        return f"data: {json_str}\n\n"
    except Exception as e:
        error_json = json.dumps({"error": str(e)})
        return f"data: {error_json}\n\n"

def send_screenshot_chunks(screenshot_data: str, chunk_size: int = 50000):
    """Split and send screenshot data in chunks."""
    try:
        # Send start marker
        yield format_sse_data({
            "choices": [{
                "delta": {
                    "content": "",
                    "screenshot_start": True
                }
            }]
        })

        # Send data chunks
        total_chunks = (len(screenshot_data) + chunk_size - 1) // chunk_size
        for i in range(0, len(screenshot_data), chunk_size):
            chunk = screenshot_data[i:i+chunk_size]
            yield format_sse_data({
                "choices": [{
                    "delta": {
                        "content": "",
                        "screenshot_chunk": chunk,
                        "chunk_number": i // chunk_size + 1,
                        "total_chunks": total_chunks
                    }
                }]
            })

        # Send end marker
        yield format_sse_data({
            "choices": [{
                "delta": {
                    "content": "",
                    "screenshot_end": True
                }
            }]
        })
    except Exception as e:
        yield format_sse_data({
            "error": f"Screenshot chunk error: {str(e)}"
        })

async def send_screenshot_chunks(screenshot_data: str, chunk_size: int = 50000):
    """Split and send screenshot data in chunks asynchronously."""
    try:
        # Send the image data in the correct format for the UI
        yield format_sse_data({
            "choices": [{
                "delta": {
                    "type": "image",
                    "image": {
                        "data": screenshot_data,
                        "type": "base64"
                    }
                }
            }]
        })

    except Exception as e:
        # Report error
        yield format_sse_data({
            "choices": [{
                "delta": {
                    "content": f"❌ Screenshot error: {str(e)}\n",
                    "type": "error"
                }
            }]
        })