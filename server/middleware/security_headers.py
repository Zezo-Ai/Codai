from fastapi import Request
from fastapi.responses import Response
from typing import Callable, Dict
import json

class SecurityHeadersMiddleware:
    def __init__(
        self,
        allow_origins: list[str] = None,
        allow_methods: list[str] = None,
        allow_headers: list[str] = None
    ):
        self.security_headers: Dict[str, str] = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Content-Security-Policy": self._build_csp_header(allow_origins),
            "Permissions-Policy": (
                "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
                "magnetometer=(), microphone=(), payment=(), usb=()"
            )
        }
        
        self.cors_headers: Dict[str, str] = {
            "Access-Control-Allow-Methods": ", ".join(allow_methods or ["GET", "POST", "OPTIONS"]),
            "Access-Control-Allow-Headers": ", ".join(allow_headers or ["Content-Type", "Authorization"]),
            "Access-Control-Max-Age": "3600"
        }
    
    def _build_csp_header(self, allowed_origins: list[str] = None) -> str:
        """Build Content Security Policy header."""
        origins = " ".join(allowed_origins) if allowed_origins else "'self'"
        return (
            f"default-src 'self'; "
            f"script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            f"style-src 'self' 'unsafe-inline'; "
            f"img-src 'self' data: blob:; "
            f"font-src 'self' data:; "
            f"connect-src 'self' {origins}; "
            f"frame-ancestors 'none'; "
            f"form-action 'self';"
        )
    
    async def __call__(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        try:
            response = await call_next(request)
            
            # Add security headers
            for header_name, header_value in self.security_headers.items():
                response.headers[header_name] = header_value
            
            # Add CORS headers for OPTIONS requests
            if request.method == "OPTIONS":
                for header_name, header_value in self.cors_headers.items():
                    response.headers[header_name] = header_value
            
            return response
            
        except Exception as e:
            # Handle errors gracefully
            error_response = {
                "detail": "Internal server error",
                "error_id": str(id(e))
            }
            
            if isinstance(e, HTTPException):
                error_response["detail"] = e.detail
                status_code = e.status_code
            else:
                status_code = 500
            
            return Response(
                content=json.dumps(error_response),
                status_code=status_code,
                media_type="application/json",
                headers=self.security_headers
            )