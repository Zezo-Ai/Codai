"""General-purpose web interaction tool for browser automation.

This module provides flexible, generic capabilities for browser interaction:
- Basic web navigation and page state observation
- Element interaction (clicking, scrolling, checking)
- General form field operations (not tied to specific form types)
- Page content extraction
- Visual capture

The tool provides the underlying functionality without imposing specific workflows
or assumptions about how it should be used - that logic belongs in the AI.

Built on Selenium for modern, reliable browser automation.

Note: This file re-exports the WebInteractionTool from the modular package structure.
"""

from tools.web.interaction.tool import WebInteractionTool

__all__ = ["WebInteractionTool"]