# Schema System

This directory contains the schema definitions and validation system for structured AI responses.

## Key Components

1. **`response_schema.json`**: The JSON Schema definition for structured responses
2. **`registry.py`**: Central registry for schema management and validation
3. **`models.py`**: Pydantic models for schema validation and manipulation

## Schema Format

The current schema (v3.0.0) uses an XML-style tag-based format:

```xml
<response_json>
<version>3.0.0</version>
<block type="text">
This is a text block.
</block>
<block type="code" language="python">
def hello_world():
    print("Hello, world!")
</block>
</response_json>
```

## Usage

To generate a prompt that enforces the schema format:

```python
from core.api.schema_prompt_generator import generate_schema_prompt

# Get the system prompt for schema compliance
schema_prompt = generate_schema_prompt()
```

To validate or manipulate responses:

```python
from core.schemas import AIResponse, ResponseBlock

# Create a response
response = AIResponse(
    version="3.0.0",
    blocks=[
        ResponseBlock(
            type="text",
            content="This is a text block"
        ),
        ResponseBlock(
            type="code",
            content="print('Hello')",
            metadata={"language": "python"}
        )
    ]
)

# Validate against schema
is_valid, error = response.validate_against_schema()
```