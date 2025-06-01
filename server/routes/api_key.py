"""API key management routes"""

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Dict, Optional
import anthropic
import logging

from .chat.api_key_storage import api_key_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api-key"])


class ValidateApiKeyRequest(BaseModel):
    api_key: str


class ValidateApiKeyResponse(BaseModel):
    valid: bool
    message: str
    key_hint: Optional[str] = None


class SaveApiKeyRequest(BaseModel):
    api_key: str
    label: Optional[str] = None


class SaveApiKeyResponse(BaseModel):
    success: bool
    message: str
    key_hint: Optional[str] = None


class GetApiKeyInfoResponse(BaseModel):
    has_key: bool
    key_hint: Optional[str] = None
    created_at: Optional[str] = None
    last_used_at: Optional[str] = None
    is_valid: Optional[bool] = None
    label: Optional[str] = None


@router.post("/validate-api-key", response_model=ValidateApiKeyResponse)
async def validate_api_key(
    request: Request,
    validate_request: ValidateApiKeyRequest
) -> ValidateApiKeyResponse:
    """
    Validate an Anthropic API key by making a test request.
    """
    # Check if we should use stored key
    if validate_request.api_key == "stored":
        # Get stored key from database
        session_id = get_session_id(request)
        api_key = api_key_storage.get_api_key(session_id)
        
        if not api_key:
            return ValidateApiKeyResponse(
                valid=False,
                message="No stored API key found"
            )
    else:
        api_key = validate_request.api_key
        
        # Basic format validation
        if not api_key.startswith("sk-ant-"):
            return ValidateApiKeyResponse(
                valid=False,
                message="Invalid API key format. Key must start with 'sk-ant-'"
            )

    # Don't log the actual key
    logger.info("Validating API key")

    try:
        # Test the key with a minimal request
        client = anthropic.Anthropic(api_key=api_key)
        
        # Make a minimal request to test the key
        # Using a very small token count to minimize cost
        response = client.messages.create(
            model="claude-3-haiku-20240307",  # Use the cheapest model
            max_tokens=1,
            messages=[{"role": "user", "content": "Hi"}]
        )
        
        # Update validation status in database
        session_id = get_session_id(request)
        api_key_storage.validate_api_key(session_id, True)
        
        logger.info("API key validation successful")
        return ValidateApiKeyResponse(
            valid=True,
            message="API key validated successfully",
            key_hint=api_key[:7] + "..." + api_key[-4:] if len(api_key) > 15 else api_key
        )
        
    except anthropic.AuthenticationError:
        session_id = get_session_id(request)
        api_key_storage.validate_api_key(session_id, False, "Authentication failed")
        logger.warning("API key validation failed: Authentication error")
        return ValidateApiKeyResponse(
            valid=False,
            message="Invalid API key. Please check your key and try again."
        )
    except anthropic.PermissionDeniedError:
        session_id = get_session_id(request)
        api_key_storage.validate_api_key(session_id, False, "Permission denied")
        logger.warning("API key validation failed: Permission denied")
        return ValidateApiKeyResponse(
            valid=False,
            message="API key lacks required permissions."
        )
    except anthropic.RateLimitError:
        session_id = get_session_id(request)
        api_key_storage.validate_api_key(session_id, False, "Rate limit exceeded")
        logger.warning("API key validation failed: Rate limit")
        return ValidateApiKeyResponse(
            valid=False,
            message="Rate limit exceeded. Please try again later."
        )
    except Exception as e:
        session_id = get_session_id(request)
        api_key_storage.validate_api_key(session_id, False, str(e))
        logger.error(f"API key validation error: {type(e).__name__}")
        return ValidateApiKeyResponse(
            valid=False,
            message="Failed to validate API key. Please try again."
        )


def get_session_id(request: Request) -> str:
    """Get or create a session ID for the request"""
    # For now, use the session ID from the request if available
    # In production, this should be a proper authenticated user ID
    if hasattr(request, 'state') and hasattr(request.state, 'session_id'):
        return request.state.session_id
    
    # Generate a session ID based on IP for demo purposes
    # In production, use proper session management
    client_ip = request.client.host if request.client else "unknown"
    return f"session_{client_ip}"


@router.post("/save-api-key", response_model=SaveApiKeyResponse)
async def save_api_key(
    request: Request,
    save_request: SaveApiKeyRequest
) -> SaveApiKeyResponse:
    """
    Save an API key for the current session/user
    """
    # Get session ID
    session_id = get_session_id(request)
    
    # Get client info for audit
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    
    # Validate format
    if not save_request.api_key.startswith("sk-ant-"):
        return SaveApiKeyResponse(
            success=False,
            message="Invalid API key format. Key must start with 'sk-ant-'"
        )
    
    # Save to database
    result = api_key_storage.save_api_key(
        session_id=session_id,
        api_key=save_request.api_key,
        label=save_request.label,
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return SaveApiKeyResponse(**result)


@router.get("/api-key-info", response_model=GetApiKeyInfoResponse)
async def get_api_key_info(request: Request) -> GetApiKeyInfoResponse:
    """
    Get information about the stored API key (without the actual key)
    """
    session_id = get_session_id(request)
    
    info = api_key_storage.get_key_info(session_id)
    
    if not info:
        return GetApiKeyInfoResponse(has_key=False)
    
    return GetApiKeyInfoResponse(
        has_key=True,
        **info
    )


@router.delete("/api-key")
async def delete_api_key(request: Request) -> Dict[str, bool]:
    """
    Delete the stored API key
    """
    session_id = get_session_id(request)
    
    # Get client info for audit
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    
    success = api_key_storage.delete_api_key(
        session_id=session_id,
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {"success": success}