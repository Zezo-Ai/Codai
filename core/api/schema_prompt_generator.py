"""Schema-driven prompt generator module.

This module dynamically generates system prompt instructions based on the current schema,
ensuring proper formatting for structured responses.
"""

import json
import logging
import os
from typing import Dict, List, Any, Optional
from pathlib import Path
from functools import lru_cache
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Cache the generated prompt to avoid regenerating on every request
# Reset to empty to force regeneration with new instructions
_prompt_cache = {
    "prompt": "",
    "generated_at": None, 
    "schema_version": "",
    "schema_modified": None
}

# Cache timeout (1 hour)
CACHE_TIMEOUT = timedelta(hours=1)

def get_block_type_examples(block_type: str) -> Optional[str]:
    """Get examples for a specific block type.
    
    Args:
        block_type: The block type to get examples for
        
    Returns:
        Example for the block type, or None if not available
    """
    examples = {
        "text": """<span class="block-tag-text">
<p>This is a plain text block with HTML formatting. It can contain multiple paragraphs.</p>

<p>Paragraphs should be wrapped in &lt;p&gt; tags.</p>

<h3>Lists should use proper HTML tags:</h3>
<ul>
  <li>Unordered list item 1</li>
  <li>Unordered list item 2</li>
</ul>

<ol>
  <li>Ordered list item 1</li>
  <li>Ordered list item 2</li>
</ol>

<p>You can use <strong>bold</strong> and <em>italic</em> formatting with HTML tags.</p>
</span>""",
        
        "rich_text": """<span class="block-tag-rich-text">
This is rich text with <span format="bold">bold</span>, <span format="italic">italic</span>, and <span format="code">code</span> formatting.

<heading level="2">Heading Level 2</heading>

<list type="bullet">
  <item>List item 1</item>
  <item>List item 2</item>
</list>
</span>""",
        
        "code": """<span class="block-tag-code" data-language="python">
def hello_world():
    print("Hello, world!")
    return True
</span>""",
        
        "html_code": """<span class="block-tag-code" data-language="html">
&lt;!DOCTYPE html&gt;
&lt;html&gt;
  &lt;head&gt;
    &lt;title&gt;Example Page&lt;/title&gt;
    &lt;meta charset=&quot;UTF-8&quot;&gt;
  &lt;/head&gt;
  &lt;body&gt;
    &lt;h1&gt;Hello World&lt;/h1&gt;
    &lt;p&gt;This is a paragraph with &lt;strong&gt;bold&lt;/strong&gt; text.&lt;/p&gt;
  &lt;/body&gt;
&lt;/html&gt;
</span>""",
        
        "table": """<span class="block-tag-table">
<table>
  <tr>
    <th>Header 1</th>
    <th>Header 2</th>
  </tr>
  <tr>
    <td>Value 1</td>
    <td>Value 2</td>
  </tr>
  <tr>
    <td>Value 3</td>
    <td>Value 4</td>
  </tr>
</table>
</span>""",
        
        "error": """<span class="block-tag-error">
Error message: File not found.
</span>""",
        
        "warning": """<span class="block-tag-warning">
Warning: This operation will delete all data.
</span>""",
        
        "note": """<span class="block-tag-note">
Note: Remember to save your changes.
</span>""",
        
        "math": """<span class="block-tag-math" data-display="block">
E = mc^2
</span>""",
        
        "diagram": """<span class="block-tag-diagram" data-type="mermaid">
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
</span>"""
    }
    
    return examples.get(block_type)

def get_schema_info() -> Dict[str, Any]:
    """Get information about the current schema.
    
    Returns:
        Dictionary with schema information
    """
    try:
        # Get schema path
        schema_path = Path(__file__).parent.parent / "schemas" / "response_schema.json"
        
        # Check if schema exists
        if not schema_path.exists():
            logger.warning(f"Schema file not found at {schema_path}")
            return {
                "version": "3.0.0",
                "block_types": [
                    "text", "rich_text", "code", "table", "math", "diagram",
                    "error", "warning", "note", "success", "info"
                ],
                "modified": datetime.now()
            }
        
        # Load schema
        with open(schema_path, 'r', encoding='utf-8') as f:
            schema = json.load(f)
        
        # Get modification time
        schema_modified = datetime.fromtimestamp(os.path.getmtime(schema_path))
        
        # Extract block types
        block_types = schema.get("block_types", [])
        if isinstance(block_types, dict) and "items" in block_types:
            if "enum" in block_types["items"]:
                block_types = block_types["items"]["enum"]
        
        if not block_types:
            # Fallback block types
            block_types = [
                "text", "rich_text", "code", "table", "math", "diagram",
                "error", "warning", "note", "success", "info"
            ]
            
        # Get version
        version = schema.get("version", "3.0.0")
        
        return {
            "version": version,
            "block_types": block_types,
            "modified": schema_modified,
            "schema": schema
        }
    except Exception as e:
        logger.error(f"Error loading schema information: {e}")
        # Return fallback values
        return {
            "version": "3.0.0",
            "block_types": [
                "text", "rich_text", "code", "table", "math", "diagram",
                "error", "warning", "note", "success", "info"
            ],
            "modified": datetime.now(),
            "schema": {}
        }

@lru_cache(maxsize=1)
def generate_schema_prompt() -> str:
    """Generate a system prompt based on the current schema.
    
    Returns:
        System prompt with tag-based instructions
    """
    global _prompt_cache
    
    # Check if we have a cached prompt that's still valid
    if (_prompt_cache["prompt"] and _prompt_cache["generated_at"] and 
            datetime.now() - _prompt_cache["generated_at"] < CACHE_TIMEOUT):
        
        # Try to get schema modification time to check if schema has changed
        try:
            schema_info = get_schema_info()
            if (_prompt_cache["schema_version"] == schema_info["version"] and
                    _prompt_cache["schema_modified"] == schema_info["modified"]):
                # Schema hasn't changed, use cached prompt
                return _prompt_cache["prompt"]
        except Exception:
            # If we can't check schema modification time, use cached prompt
            return _prompt_cache["prompt"]
    
    # Get schema information
    schema_info = get_schema_info()
    schema_version = schema_info["version"]
    block_types = schema_info["block_types"]
    
    # Generate specific examples for each block type
    type_examples = []
    for block_type in block_types:
        example = get_block_type_examples(block_type)
        if example:
            type_examples.append(f"/* {block_type.upper()} BLOCK EXAMPLE */\n{example}")
    
    # Always include the HTML code example regardless of block types list
    html_example = get_block_type_examples("html_code")
    if html_example and not any("HTML_CODE BLOCK EXAMPLE" in ex for ex in type_examples):
        type_examples.append(f"/* HTML CODE BLOCK EXAMPLE (WITH ESCAPED ENTITIES) */\n{html_example}")
    
    # Combine examples
    type_examples_text = "\n\n".join(type_examples)
    
    # Create block types list
    block_types_str = ", ".join([f'"{bt}"' for bt in block_types])
    
    # Build complete prompt
    prompt = f"""RESPONSE FORMAT INSTRUCTION:
Always structure your responses using HTML span elements with the following format:

<span class="state-CONTENT">
  <span class="block-tag-text">
    <p>Your text explanation here</p>
  </span>
</span>

CRITICAL: AFTER ANY TOOL CALL, ALWAYS START A NEW STATE SPAN!

Valid block classes are: {block_types_str.replace('"', '"block-tag-')}

CRITICAL SPAN FORMATTING REQUIREMENTS:
1. ALWAYS wrap your responses in a state span (class="state-CONTENT", "state-TOOL_CALL", etc.)
2. ALWAYS use a block span inside the state span (class="block-tag-text", "block-tag-code", etc.)
3. ALWAYS use proper opening and closing tags for each span
4. Block spans MUST have the appropriate class specifying the content type
5. Spans must be properly nested (no overlapping tags)
6. Blocks can contain other blocks for nested content

TOOL CONTINUATION RULE (MANDATORY):
After any tool usage, token update, or other interruption, you MUST restart your response with a complete structure:

<span class="state-TOOL_RESULT">
  <span class="block-tag-text">
    <p>Continuation of your response here...</p>
  </span>
</span>

DO NOT continue with just block spans - always restart the complete span structure after any interruption in the stream.

EXACT FORMAT REQUIRED (DO NOT MODIFY):
<span class="state-[STATE]">
  <span class="block-tag-[TYPE]">
    <!-- Content goes here -->
  </span>
</span>

CONTENT TYPE ENFORCEMENT RULES (MUST FOLLOW):
1. NEVER use text blocks for content that has a specialized block type
2. ALL code MUST be in spans with class="block-tag-code" and data-language attribute
3. ALL tables MUST use spans with class="block-tag-table" containing a table element with proper tr, th, and td tags
4. ALL mathematical expressions MUST use spans with class="block-tag-math"
5. ALL diagrams MUST use spans with class="block-tag-diagram" with data-type attribute
6. Use appropriate specialized blocks (error, warning, note) when applicable

TEXT BLOCK HTML FORMATTING (MANDATORY):
1. All content within text blocks MUST use proper HTML elements
2. ALL paragraphs MUST be wrapped in <p> tags
3. ALL lists MUST use <ul>/<ol> and <li> tags (not hyphens or numbers)
4. ALL headings MUST use <h1>, <h2>, <h3>, etc. tags
5. ALL links MUST use <a href="url">link text</a> tags
6. ALL inline code MUST use <code>code here</code> tags
7. ALL quotes MUST use <blockquote>quoted text</blockquote> tags
8. Small tables CAN use <table>, <tr>, <th>, and <td> tags (larger tables should use span class="block-tag-table")
9. Use <strong> for bold text and <em> for italic text
10. Use <u> for underlined text and <s> for strikethrough text
11. Ensure all HTML tags are properly closed

DISPLAYING HTML CODE EXAMPLES (CRITICAL):
When showing HTML code examples or snippets, you MUST:
1. Use a dedicated code span with data-language="html" for multi-line HTML examples with ALL HTML characters fully escaped:
   <span class="block-tag-code" data-language="html">
   &lt;div class=&quot;example&quot;&gt;
     &lt;h1&gt;Example Heading&lt;/h1&gt;
   &lt;/div&gt;
   </span>

2. For inline HTML tags or elements, use <code> tags and escape the HTML characters:
   <p>Use <code>&lt;div&gt;</code> for a block-level container.</p>
   <p>The <code>&lt;a href="..."&gt;</code> tag creates links.</p>

3. NEVER include unescaped HTML code examples inside text blocks as they would be rendered instead of displayed

4. ALL code blocks with HTML content MUST have HTML entities properly escaped:
   - < must be written as &lt;
   - > must be written as &gt;
   - & must be written as &amp;
   - " must be written as &quot;
   - ' must be written as &#039;

5. This escape requirement applies to ALL code blocks containing HTML-like syntax, including HTML, XML, JSX, Vue templates, etc.

BLOCK ATTRIBUTES:
1. <span class="block-tag-code" data-language="python"> - data-language attribute is REQUIRED for code blocks
2. <span class="block-tag-table" data-caption="Title"><table>...</table></span> - optional data-caption attribute for tables
3. <span class="block-tag-math" data-display="block|inline"> - optional data-display attribute for math expressions
4. <span class="block-tag-diagram" data-type="mermaid|graphviz|plantuml"> - required data-type attribute for diagrams
5. <span class="block-tag-text" data-format="markdown"> - optional data-format attribute for text blocks

BLOCK TYPE EXAMPLES:

{type_examples_text}

NESTING EXAMPLES:

/* SIMPLE NESTING EXAMPLE */
<span class="state-CONTENT">
  <span class="block-tag-text">
    <p>Here's a section with nested content:</p>
    <span class="block-tag-code" data-language="javascript">
    function hello() {{
      console.log("Hello world!");
    }}
    </span>
    <p>The code above shows a simple greeting function.</p>
  </span>
</span>

/* COMPLEX NESTING EXAMPLE */
<span class="state-CONTENT">
  <span class="block-tag-text">
    <p>Project setup instructions:</p>
    <span class="block-tag-note">
    Important: Make sure all dependencies are installed first.
    </span>
    <span class="block-tag-code" data-language="bash">
    npm install
    npm run build
    </span>
  </span>
</span>

/* TOOL CONTINUATION EXAMPLE */
<span class="state-TOOL_CALL">
  <span class="block-tag-text">
    <p>I'll check the current directory contents.</p>
  </span>
</span>

[Tool call to list directory contents happens here]
[Tool returns directory contents]
[Token update occurs]

<span class="state-TOOL_RESULT">
  <span class="block-tag-text">
    <p>Based on the directory contents I found:</p>
    
    <ol>
      <li>The project has a frontend and backend directory</li>
      <li>There are configuration files in the root</li>
    </ol>
  </span>
</span>

SPECIAL RESPONSE CASES (MANDATORY - NO EXCEPTIONS):
EVERY response MUST use the complete span structure, INCLUDING:
1. Brief responses like "I'll help you with that"
2. Permission requests like "May I use a tool to view this file?"
3. Questions to the user
4. Acknowledgments and confirmations
5. ALL text before tool usage

INCORRECT (NEVER DO THIS):
I'll help you view the file.
May I check this folder?
Let me examine that code.

CORRECT (ALWAYS DO THIS):
<span class="state-CONTENT">
  <span class="block-tag-text">
    <p>I'll help you view the file.</p>
  </span>
</span>

<span class="state-CONTENT">
  <span class="block-tag-text">
    <p>May I check this folder?</p>
  </span>
</span>

PRE-TOOL INSTRUCTION (CRITICAL):
Before any tool usage, ALWAYS use the full span structure with the TOOL_CALL state:

<span class="state-TOOL_CALL">
  <span class="block-tag-text">
    <p>I'll need to view the file's contents. May I use a tool to view this file?</p>
  </span>
</span>

FORMATTED TEXT APPROACHES:

/* HTML FORMAT APPROACH (PREFERRED) */
<span class="block-tag-text">
<h2>Main Section Heading</h2>

<p>This is a paragraph with <strong>bold</strong>, <em>italic</em>, <u>underlined</u>, and <s>strikethrough</s> text. You can also include <code>inline code</code> and <a href="https://example.com">links to websites</a>.</p>

<h3>Subheading</h3>

<ul>
  <li>Unordered list item 1</li>
  <li>Unordered list item 2 with <strong>bold</strong> text</li>
  <li>Item with a <a href="https://example.com">link</a></li>
</ul>

<ol>
  <li>Ordered list item 1</li>
  <li>Ordered list item 2</li>
  <li>Item with <code>inline code</code></li>
</ol>

<blockquote>
  <p>This is a quotation that is properly formatted with blockquote tags.</p>
  <cite>— Source Attribution</cite>
</blockquote>

<p>For small tables, you can use HTML table tags:</p>

<table>
  <tr>
    <th>Header 1</th>
    <th>Header 2</th>
  </tr>
  <tr>
    <td>Data 1</td>
    <td>Data 2</td>
  </tr>
</table>

<h3>HTML Tags</h3>
<p>When referencing HTML tags, always escape them like <code>&lt;div&gt;</code> and <code>&lt;span&gt;</code>.</p>
</span>

<span class="block-tag-code" data-language="html">
<!-- For actual HTML code examples, use a dedicated code block -->
&lt;div class="container"&gt;
  &lt;h1&gt;Example Heading&lt;/h1&gt;
  &lt;p&gt;This is how HTML code should be displayed.&lt;/p&gt;
&lt;/div&gt;
</span>

/* MARKDOWN FORMAT APPROACH (FALLBACK) */
<span class="block-tag-text" data-format="markdown">
# Heading

This text uses **markdown** formatting with *italic* and `code`.

- List item 1
- List item 2
</span>

/* SPAN APPROACH */
<span class="block-tag-rich-text">
This text has <span format="bold">bold</span> and <span format="italic">italic</span> parts.
</span>

VALIDATION CHECKLIST:
1. All spans are properly opened and closed
2. Required data attributes are included (e.g., data-language for code)
3. Proper block class is used for each content type
4. Content is well-formatted within blocks
5. State span is always the outer wrapper
6. Block span is always inside the state span
7. Complete structure is restarted after any tool usage or interruption

When writing your response:
1. Choose the most appropriate state and block class for each part
2. For structured data (tables, code, diagrams), always use the corresponding specialized block class
3. Keep your structure clean and well-organized
4. Use nesting when appropriate to maintain logical structure
5. Verify all spans are properly closed before completing your response

STATES YOU SHOULD USE:
- state-CONTENT: For regular text content, explanations, questions
- state-TOOL_CALL: When requesting to use a tool
- state-TOOL_RESULT: After a tool has been used, displaying results
- state-THINKING: For intermediate reasoning steps (rare)

IMPORTANT: Malformed span structure will cause rendering issues. Always ensure spans are properly opened and closed.
"""
    
    # Update cache
    _prompt_cache.update({
        "prompt": prompt,
        "generated_at": datetime.now(),
        "schema_version": schema_info["version"],
        "schema_modified": schema_info.get("modified")
    })
    
    logger.info(f"Generated tag-based schema prompt for version {schema_version}")
    return prompt

def reset_prompt_cache() -> None:
    """Reset the prompt cache, forcing regeneration on next call."""
    global _prompt_cache
    _prompt_cache = {
        "prompt": "",
        "generated_at": None,
        "schema_version": "",
        "schema_modified": None
    }
    
# MAINTENANCE NOTE: If you modify formatting instructions in this file,
# also update the corresponding instructions in:
# config/structured_prompts.yaml
# This is to ensure consistency between schema-driven and fallback prompts.

# Force regeneration with the new HTML formatting instructions
reset_prompt_cache()  # Ensure the new HTML formatting instructions take effect immediately

# This comment forces a change to ensure the file is modified and reloaded
# Modified on: April 3, 2025 - Fixed table examples to include <table> tags and fixed other tag inconsistencies