"""Web content fetching and extraction tool."""

import re
import asyncio
from typing import Optional, Dict, Any, List, Literal
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

from anthropic.types.beta import BetaToolUnionParam
from tools.base import ToolError, ToolResult, CLIResult
from tools.web.base_web import BaseWebTool


class WebFetcherTool(BaseWebTool):
    """Tool for fetching and extracting content from web pages."""
    
    name: Literal["web_fetch"] = "web_fetch"
    
    # Content extraction modes
    EXTRACT_MODES = {
        "full_page": "Return the full page content",
        "main_content": "Extract the main content area",
        "text_only": "Extract text content only (no HTML)",
        "structured": "Extract content in a structured format"
    }
    
    def to_params(self) -> BetaToolUnionParam:
        """Get tool parameters for API consumption."""
        return {
            "name": self.name,
            "description": "Fetch and extract content from web pages.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch content from."
                    },
                    "extract_mode": {
                        "type": "string",
                        "enum": list(self.EXTRACT_MODES.keys()),
                        "description": "Content extraction mode. Default is main_content."
                    },
                    "selector": {
                        "type": "string",
                        "description": "Optional CSS selector to extract specific content."
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum content length in characters. Default is 10000."
                    }
                },
                "required": ["url"]
            }
        }
    
    async def __call__(
        self,
        *,
        url: str,
        extract_mode: Literal["full_page", "main_content", "text_only", "structured"] = "main_content",
        selector: Optional[str] = None,
        max_length: int = 10000,
        **kwargs
    ) -> ToolResult:
        """Fetch and extract content from a web page."""
        try:
            # Validate URL
            if not self._is_valid_url(url):
                raise ToolError(f"Invalid URL format: {url}")
            
            # Fetch content
            html_content = self._fetch_content(url)
            
            # Extract content based on the specified mode
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Get page title
            title = soup.title.string if soup.title else "Unknown Title"
            
            # Extract content based on mode
            if selector:
                # Custom selector takes precedence
                content = self._extract_by_selector(soup, selector)
            elif extract_mode == "full_page":
                content = html_content
            elif extract_mode == "main_content":
                content = self._extract_main_content(soup)
            elif extract_mode == "text_only":
                content = self._extract_text_only(soup)
            elif extract_mode == "structured":
                content = self._extract_structured(soup)
            else:
                # Default to main content
                content = self._extract_main_content(soup)
            
            # Check if truncation is needed, and do it intelligently if so
            truncated = False
            if max_length > 0 and len(content) > max_length:
                # Try to truncate at a sentence boundary for more natural cutoffs
                truncation_point = max_length
                # Look for the last period, question mark, or exclamation point before max_length
                for end_marker in ['. ', '? ', '! ', '\n\n']:
                    last_marker = content[:max_length].rfind(end_marker)
                    if last_marker > max_length * 0.75:  # Only use if we're at least 75% into the content
                        truncation_point = last_marker + len(end_marker)
                        break
                
                # Truncate and add a notice
                content = content[:truncation_point] + "\n\n... [Content truncated due to length limit]"
                truncated = True
            
            # Format output based on extraction mode
            if extract_mode == "structured":
                formatted_output = self._format_structured_output(content)
            else:
                formatted_output = content
            
            # Add a summary section for longer content
            if len(content) > 2000:
                # Create a brief summary by using the first paragraph and first sentence of subsequent paragraphs
                paragraphs = content.split('\n\n')
                summary = paragraphs[0]  # First paragraph in full
                
                # Add first sentence of each subsequent paragraph (up to 5)
                first_sentences = []
                for p in paragraphs[1:6]:  # Consider up to 5 more paragraphs
                    # Extract first sentence
                    sentence_end = -1
                    for marker in ['. ', '? ', '! ']:
                        end_pos = p.find(marker)
                        if end_pos > 0 and (sentence_end == -1 or end_pos < sentence_end):
                            sentence_end = end_pos + len(marker) - 1
                    
                    if sentence_end > 0:
                        first_sentences.append(p[:sentence_end+1])
                
                if first_sentences:
                    summary += "\n\n" + " ".join(first_sentences)
                
                # Prepend the summary to longer content
                formatted_output = "## Quick Summary\n" + summary + "\n\n## Full Content\n\n" + formatted_output
            
            return self._handle_result(CLIResult(
                output=formatted_output,
                metadata={
                    "url": url,
                    "title": title,
                    "extract_mode": extract_mode,
                    "selector": selector,
                    "length": len(content),
                    "truncated": truncated
                }
            ))
            
        except ToolError as e:
            return self._handle_result(CLIResult(error=str(e)))
        except Exception as e:
            return self._handle_result(CLIResult(error=f"Error fetching content: {str(e)}"))
    
    def _extract_by_selector(self, soup: BeautifulSoup, selector: str) -> str:
        """Extract content using a custom CSS selector."""
        try:
            elements = soup.select(selector)
            if not elements:
                return f"No elements found matching selector: {selector}"
            
            return "\n\n".join(str(element) for element in elements)
        except Exception as e:
            raise ToolError(f"Invalid selector: {selector}. Error: {str(e)}")
    
    def _extract_main_content(self, soup: BeautifulSoup) -> str:
        """
        Extract the main content from a web page using heuristics.
        Uses a more robust algorithm to identify the main content area.
        """
        # Create a clean copy of the soup to work with
        clean_soup = BeautifulSoup(str(soup), 'html.parser')
        
        # Remove script, style, and other non-content elements
        for element in clean_soup.select('script, style, iframe, noscript, svg, form, header, footer, nav, aside, [role="complementary"], [role="banner"], [role="navigation"], .sidebar, .menu, .navigation, .nav, .header, .footer, .comments, .ad, .advertisement, .promo'):
            element.decompose()
        
        # List of common content containers by priority
        main_content_selectors = [
            "main", 
            "article", 
            "#content", 
            "#main", 
            "#article", 
            ".content", 
            ".main", 
            ".article", 
            ".post-content",
            ".entry-content",
            ".page-content",
            "section.content",
            "div[role='main']",
            "div.main-content",
            "[itemprop='articleBody']"
        ]
        
        # Try to identify main content by common content identifiers
        for selector in main_content_selectors:
            candidate = clean_soup.select_one(selector)
            if candidate and len(candidate.get_text().strip()) > 200:  # Minimum size threshold
                # Extract and clean text from this element
                return self._clean_extracted_content(candidate)
        
        # Try to identify using common patterns
        content_candidates = [
            # Check for elements with IDs containing these terms
            clean_soup.find(id=re.compile(r"(content|main|article|post|body|entry)", re.I)),
            # Check for elements with classes containing these terms
            clean_soup.find(class_=re.compile(r"(content|main|article|post|body|entry)", re.I)),
            # Look for common section patterns
            clean_soup.find("section", class_=re.compile(r"(content|main|body|article)", re.I))
        ]
        
        # Use the first successful candidate that has substantial content
        for candidate in content_candidates:
            if candidate and len(candidate.get_text().strip()) > 200:
                return self._clean_extracted_content(candidate)
        
        # Density-based content extraction - find the element with the most paragraph text
        paragraphs = clean_soup.find_all('p')
        if paragraphs:
            # Group paragraphs by parent to find the densest content area
            parent_counts = {}
            for p in paragraphs:
                if p.parent:
                    parent_key = str(p.parent.name) + str(p.parent.get('class', ''))
                    if parent_key not in parent_counts:
                        parent_counts[parent_key] = {'element': p.parent, 'text_length': 0, 'count': 0}
                    parent_counts[parent_key]['text_length'] += len(p.get_text())
                    parent_counts[parent_key]['count'] += 1
            
            # Find the parent with the most substantial text
            best_parent = None
            most_text = 0
            min_paragraphs = 3  # Require at least 3 paragraphs
            
            for info in parent_counts.values():
                if info['count'] >= min_paragraphs and info['text_length'] > most_text:
                    most_text = info['text_length']
                    best_parent = info['element']
            
            if best_parent:
                return self._clean_extracted_content(best_parent)
            
            # If no good parent found, just concatenate all paragraphs
            return "\n\n".join(p.get_text().strip() for p in paragraphs if len(p.get_text().strip()) > 20)
        
        # Final fallback: just get the body text
        body = clean_soup.body
        if body:
            return body.get_text(separator='\n\n', strip=True)
        
        # Ultimate fallback
        return clean_soup.get_text(separator='\n\n', strip=True)
        
    def _clean_extracted_content(self, element: BeautifulSoup) -> str:
        """Clean and format extracted content for better readability."""
        # Create a copy to avoid modifying the original
        element_copy = BeautifulSoup(str(element), 'html.parser')
        
        # Remove any remaining non-content elements that might be nested
        for unwanted in element_copy.select('script, style, iframe, button, .ad, .share, .social, .comment'):
            unwanted.decompose()
            
        # Handle different element types appropriately
        if element_copy.name in ['pre', 'code']:
            # Preserve formatting for code blocks
            return element_copy.get_text(strip=True)
        
        # Process headings to make them stand out
        for heading in element_copy.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            heading_text = heading.get_text().strip()
            heading_level = int(heading.name[1])
            # Replace with formatted heading
            new_tag = element_copy.new_tag('p')
            new_tag.string = f"\n{'#' * heading_level} {heading_text}\n"
            heading.replace_with(new_tag)
        
        # Process list items
        for list_tag in element_copy.find_all(['ul', 'ol']):
            list_type = 'ordered' if list_tag.name == 'ol' else 'unordered'
            list_items = []
            for i, item in enumerate(list_tag.find_all('li', recursive=False)):
                prefix = f"{i+1}." if list_type == 'ordered' else "•"
                list_items.append(f"{prefix} {item.get_text().strip()}")
            
            # Replace with formatted list
            new_tag = element_copy.new_tag('p')
            new_tag.string = '\n' + '\n'.join(list_items) + '\n'
            list_tag.replace_with(new_tag)
        
        # Get the text with spacing between elements
        content = ""
        for element in element_copy.children:
            if element.name == 'p':
                content += element.get_text().strip() + "\n\n"
            elif element.name in ['br']:
                content += "\n"
            elif element.name:
                content += element.get_text().strip() + "\n"
            elif isinstance(element, str) and element.strip():
                content += element.strip() + "\n"
        
        # Clean up extra whitespace and line breaks
        content = re.sub(r'\n{3,}', '\n\n', content)
        return content.strip()
    
    def _extract_text_only(self, soup: BeautifulSoup) -> str:
        """
        Extract text content only, removing all HTML but preserving structure.
        More advanced version that maintains heading structure and lists.
        """
        # Create a clean copy to work with
        clean_soup = BeautifulSoup(str(soup), 'html.parser')
        
        # Remove all non-content elements
        for element in clean_soup.select('script, style, iframe, noscript, svg, form, button, header, footer, nav, aside, .sidebar, .menu, .nav, .comments, .ad, .advertisement, .promo'):
            element.decompose()
        
        # Structure to hold ordered content
        structured_content = []
        
        # Extract headings with proper formatting
        for i in range(1, 7):  # h1 through h6
            for heading in clean_soup.find_all(f'h{i}'):
                text = heading.get_text().strip()
                if text:
                    structured_content.append({
                        'type': 'heading',
                        'level': i,
                        'text': text,
                        'position': heading.sourcepos if hasattr(heading, 'sourcepos') else 0
                    })
        
        # Extract paragraphs
        for p in clean_soup.find_all('p'):
            text = p.get_text().strip()
            if text:
                structured_content.append({
                    'type': 'paragraph',
                    'text': text,
                    'position': p.sourcepos if hasattr(p, 'sourcepos') else 0
                })
        
        # Extract lists
        for list_element in clean_soup.find_all(['ul', 'ol']):
            list_type = 'ordered' if list_element.name == 'ol' else 'unordered'
            list_items = []
            
            for i, item in enumerate(list_element.find_all('li')):
                text = item.get_text().strip()
                if text:
                    list_items.append(text)
            
            if list_items:
                structured_content.append({
                    'type': 'list',
                    'list_type': list_type,
                    'items': list_items,
                    'position': list_element.sourcepos if hasattr(list_element, 'sourcepos') else 0
                })
        
        # Sort content by position in document (if available)
        try:
            structured_content.sort(key=lambda x: x.get('position', 0))
        except:
            pass  # If sorting fails, keep original order
        
        # Format the extracted content
        formatted_content = []
        
        for item in structured_content:
            if item['type'] == 'heading':
                formatted_content.append(f"\n{'#' * item['level']} {item['text']}\n")
            elif item['type'] == 'paragraph':
                formatted_content.append(item['text'])
            elif item['type'] == 'list':
                list_text = []
                for i, text in enumerate(item['items']):
                    prefix = f"{i+1}." if item['list_type'] == 'ordered' else "•"
                    list_text.append(f"{prefix} {text}")
                formatted_content.append("\n" + "\n".join(list_text))
        
        # Join everything with double newlines for readability
        result = "\n\n".join(formatted_content)
        
        # If no structured content was found, fall back to simple text extraction
        if not result:
            # First try paragraphs only
            paragraphs = [p.get_text().strip() for p in clean_soup.find_all('p')]
            paragraphs = [p for p in paragraphs if p]  # Remove empty paragraphs
            
            if paragraphs:
                result = "\n\n".join(paragraphs)
            else:
                # Ultimate fallback: just get all text
                result = clean_soup.get_text(separator='\n\n', strip=True)
                
                # Clean up excessive whitespace
                result = re.sub(r'\s+', ' ', result)
                result = re.sub(r'\n{3,}', '\n\n', result)
                
        return result.strip()
    
    def _extract_structured(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """Extract content in a structured format."""
        # Initialize structure
        structure = {
            "title": soup.title.string if soup.title else "Unknown Title",
            "headings": [],
            "paragraphs": [],
            "links": [],
            "lists": [],
            "tables": []
        }
        
        # Extract headings (h1-h6)
        for i in range(1, 7):
            headings = soup.find_all(f'h{i}')
            for heading in headings:
                structure["headings"].append({
                    "level": i,
                    "text": heading.get_text().strip()
                })
        
        # Extract paragraphs
        paragraphs = soup.find_all('p')
        for p in paragraphs:
            text = p.get_text().strip()
            if text:  # Skip empty paragraphs
                structure["paragraphs"].append(text)
        
        # Extract links
        links = soup.find_all('a', href=True)
        for link in links[:20]:  # Limit to 20 links
            href = link['href']
            # Convert relative URLs to absolute
            if not href.startswith(('http://', 'https://')):
                base_url = urlparse(soup.get('base_url', ''))
                href = urljoin(f"{base_url.scheme}://{base_url.netloc}", href)
            
            structure["links"].append({
                "text": link.get_text().strip() or "No text",
                "url": href
            })
        
        # Extract lists (ul, ol)
        lists = soup.find_all(['ul', 'ol'])
        for lst in lists[:10]:  # Limit to 10 lists
            items = [li.get_text().strip() for li in lst.find_all('li')]
            if items:
                structure["lists"].append({
                    "type": lst.name,  # 'ul' or 'ol'
                    "items": items
                })
        
        # Extract tables
        tables = soup.find_all('table')
        for table in tables[:5]:  # Limit to 5 tables
            rows = []
            for tr in table.find_all('tr'):
                row = [td.get_text().strip() for td in tr.find_all(['td', 'th'])]
                if row:
                    rows.append(row)
            
            if rows:
                structure["tables"].append(rows)
        
        return structure
    
    def _format_structured_output(self, structure: Dict[str, Any]) -> str:
        """Format structured content into readable text."""
        output = f"Title: {structure['title']}\n\n"
        
        # Add headings
        if structure['headings']:
            output += "HEADINGS:\n"
            for heading in structure['headings']:
                output += f"{'#' * heading['level']} {heading['text']}\n"
            output += "\n"
        
        # Add paragraphs
        if structure['paragraphs']:
            output += "MAIN CONTENT:\n"
            for i, para in enumerate(structure['paragraphs'][:10], 1):  # Limit to 10 paragraphs
                output += f"Paragraph {i}: {para}\n\n"
            
            if len(structure['paragraphs']) > 10:
                output += f"... and {len(structure['paragraphs']) - 10} more paragraphs\n\n"
        
        # Add links
        if structure['links']:
            output += "LINKS:\n"
            for i, link in enumerate(structure['links'], 1):
                output += f"{i}. {link['text']} - {link['url']}\n"
            output += "\n"
        
        # Add lists
        if structure['lists']:
            output += "LISTS:\n"
            for i, lst in enumerate(structure['lists'], 1):
                output += f"List {i} ({lst['type']}):\n"
                for j, item in enumerate(lst['items'], 1):
                    output += f"  {j}. {item}\n"
                output += "\n"
        
        # Add tables
        if structure['tables']:
            output += "TABLES:\n"
            for i, table in enumerate(structure['tables'], 1):
                output += f"Table {i}:\n"
                for row in table:
                    output += "  | " + " | ".join(row) + " |\n"
                output += "\n"
        
        return output