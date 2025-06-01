"""Base classes for web tools."""

import requests
from abc import abstractmethod
from typing import Dict, Any, Optional, List, Literal
from urllib.parse import urlparse

from anthropic.types.beta import BetaToolUnionParam
from tools.base import BaseAnthropicTool, ToolError, ToolResult, CLIResult, WebResult


class BaseWebTool(BaseAnthropicTool):
    """Base class for web-related tools."""
    
    _user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    _timeout = 30  # Default timeout in seconds
    
    def __init__(self):
        super().__init__()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": self._user_agent})
    
    @abstractmethod
    def to_params(self) -> BetaToolUnionParam:
        """Get tool parameters for API consumption."""
        pass
    
    def _is_valid_url(self, url: str) -> bool:
        """Validate if a string is a properly formatted URL."""
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except:
            return False
    
    def _fetch_content(self, url: str, timeout: Optional[int] = None, max_size: int = 10485760) -> str:
        """
        Fetch content from URL with error handling.
        
        Args:
            url: The URL to fetch content from
            timeout: Request timeout in seconds
            max_size: Maximum content size in bytes (default 10MB)
            
        Returns:
            The text content of the response
        """
        if not self._is_valid_url(url):
            raise ToolError(f"Invalid URL format: {url}")
        
        # Enhanced headers for more reliable fetching
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Cache-Control": "max-age=0",
            "Sec-Fetch-Dest": "document", 
            "Sec-Fetch-Mode": "navigate", 
            "Sec-Fetch-Site": "none", 
            "Sec-Fetch-User": "?1",
            "Pragma": "no-cache"
        }
        
        try:
            import io
            import gzip
            import brotli
            
            # Don't use the session for each request to avoid cookie/session issues
            response = requests.get(
                url, 
                timeout=timeout or self._timeout,
                allow_redirects=True,
                headers=headers,
                stream=True
            )
            response.raise_for_status()
            
            # Check for binary content types that we can't process
            content_type = response.headers.get('Content-Type', '').lower()
            if any(binary_type in content_type for binary_type in ['image/', 'audio/', 'video/', 'application/octet-stream', 'application/pdf']):
                raise ToolError(f"Cannot process binary content type: {content_type}")
                
            # Get the content encoding from headers
            content_encoding = response.headers.get('Content-Encoding', '').lower()
            
            # Initialize variables for streaming
            content_size = 0
            content_chunks = []
            
            # Process content based on encoding
            for chunk in response.iter_content(chunk_size=8192):
                content_size += len(chunk)
                if content_size > max_size:
                    raise ToolError(
                        f"Content too large: {content_size} bytes (max {max_size} bytes)"
                    )
                content_chunks.append(chunk)
            
            # Combine all chunks
            raw_content = b''.join(content_chunks)
            
            # Decompress content if needed
            if 'gzip' in content_encoding:
                try:
                    with gzip.GzipFile(fileobj=io.BytesIO(raw_content)) as f:
                        raw_content = f.read()
                except Exception as e:
                    print(f"Gzip decompression failed: {e}. Treating as uncompressed.")
            elif 'br' in content_encoding or 'brotli' in content_encoding:
                try:
                    raw_content = brotli.decompress(raw_content)
                except Exception as e:
                    print(f"Brotli decompression failed: {e}. Treating as uncompressed.")
            elif 'deflate' in content_encoding:
                try:
                    import zlib
                    raw_content = zlib.decompress(raw_content, -zlib.MAX_WBITS)
                except Exception as e:
                    print(f"Deflate decompression failed: {e}. Trying raw deflate.")
                    try:
                        raw_content = zlib.decompress(raw_content)
                    except Exception as e2:
                        print(f"Raw deflate failed: {e2}. Treating as uncompressed.")
            
            # Detect encoding from content (HTML meta tags)
            encoding = response.encoding
            
            if b'<meta' in raw_content:
                try:
                    import re
                    charset_match = re.search(b'<meta[^>]*charset=[\'"]*([\\w-]+)', raw_content)
                    if charset_match:
                        encoding = charset_match.group(1).decode('ascii')
                except Exception:
                    pass
            
            # If encoding is still unknown, try to determine from content
            if not encoding:
                try:
                    # Try to detect encoding from content
                    try:
                        import chardet
                        encoding = chardet.detect(raw_content)['encoding']
                    except (ImportError, KeyError):
                        # Default to common encodings if chardet not available
                        for enc in ['utf-8', 'latin-1', 'windows-1252']:
                            try:
                                raw_content.decode(enc)
                                encoding = enc
                                break
                            except UnicodeDecodeError:
                                continue
                except Exception:
                    pass
            
            # Use the determined encoding or fall back to utf-8
            encoding = encoding or 'utf-8'
            
            # Try to decode the content
            try:
                return raw_content.decode(encoding, errors='replace')
            except UnicodeDecodeError:
                # Try common fallback encodings
                for fallback_encoding in ['utf-8', 'latin-1', 'windows-1252', 'ascii']:
                    try:
                        return raw_content.decode(fallback_encoding, errors='replace')
                    except UnicodeDecodeError:
                        continue
                
                # Last resort: force decode with ascii and replace errors
                return raw_content.decode('ascii', errors='replace')
                
        except requests.exceptions.Timeout:
            raise ToolError(f"Request timed out for URL: {url}")
        except requests.exceptions.TooManyRedirects:
            raise ToolError(f"Too many redirects for URL: {url}")
        except requests.exceptions.HTTPError as e:
            raise ToolError(f"HTTP error: {e}")
        except requests.exceptions.RequestException as e:
            raise ToolError(f"Error fetching content: {e}")
    
    def _format_result(
        self, 
        content: str, 
        url: Optional[str] = None,
        title: Optional[str] = None,
        result_type: Optional[str] = None
    ) -> ToolResult:
        """Format web content as tool result."""
        metadata = {}
        if url:
            metadata["url"] = url
        if title:
            metadata["title"] = title
        if result_type:
            metadata["type"] = result_type
            
        return CLIResult(
            output=content,
            metadata=metadata
        )