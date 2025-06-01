"""Secure API key storage with encryption"""

import os
import base64
from typing import Optional, Dict, Any
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import IntegrityError
import logging

from server.models.api_key import UserApiKey, ApiKeyAuditLog, Base
from server.utils.encryption_setup import ensure_encryption_secret

logger = logging.getLogger(__name__)


class ApiKeyEncryption:
    """Handles encryption/decryption of API keys"""
    
    def __init__(self):
        # Get or generate encryption key
        self.cipher = self._get_cipher()
    
    def _get_cipher(self) -> Fernet:
        """Get or create the encryption cipher"""
        # Ensure we have an encryption secret (auto-generates if needed)
        encryption_secret = ensure_encryption_secret()
        
        # Handle different formats
        try:
            # First, try as a Fernet key directly
            if len(encryption_secret) == 44:  # Base64 Fernet keys are 44 chars
                return Fernet(encryption_secret.encode())
            
            # If it's hex format (64 chars), convert to Fernet key
            if len(encryption_secret) == 64 and all(c in '0123456789abcdefABCDEF' for c in encryption_secret):
                # Convert hex to bytes
                key_bytes = bytes.fromhex(encryption_secret)
                # Convert to base64 for Fernet
                fernet_key = base64.urlsafe_b64encode(key_bytes)
                return Fernet(fernet_key)
            
            # If it's 32 characters, assume it needs to be padded and encoded
            if len(encryption_secret) == 32:
                # Encode to bytes and then to base64
                key_bytes = encryption_secret.encode('utf-8')
                fernet_key = base64.urlsafe_b64encode(key_bytes)
                return Fernet(fernet_key)
            
            # Otherwise, try to use it as-is
            return Fernet(encryption_secret.encode())
            
        except Exception as e:
            # This should rarely happen now since we auto-generate
            raise ValueError(
                f"Invalid ENCRYPTION_SECRET format! "
                f"Secret length: {len(encryption_secret)}. "
                f"Error: {e}"
            )
    
    def encrypt(self, api_key: str) -> str:
        """Encrypt an API key"""
        return self.cipher.encrypt(api_key.encode()).decode()
    
    def decrypt(self, encrypted_key: str) -> str:
        """Decrypt an API key"""
        return self.cipher.decrypt(encrypted_key.encode()).decode()


class ApiKeyStorage:
    """Manages API key storage in database"""
    
    def __init__(self, database_url: Optional[str] = None):
        # Use SQLite for development, PostgreSQL for production
        self.database_url = database_url or os.environ.get(
            'DATABASE_URL', 
            'sqlite:///./api_keys.db'
        )
        
        # Create engine and session
        self.engine = create_engine(self.database_url)
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        
        # Initialize encryption
        self.encryption = ApiKeyEncryption()
    
    def _get_key_hint(self, api_key: str) -> str:
        """Generate a hint for the API key (first 7 + last 4 chars)"""
        if len(api_key) < 15:
            return api_key
        return f"{api_key[:7]}...{api_key[-4:]}"
    
    def _log_action(
        self, 
        db: Session,
        api_key_id: str,
        session_id: str,
        action: str,
        success: bool = True,
        error_message: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Log an action in the audit log"""
        try:
            log_entry = ApiKeyAuditLog(
                api_key_id=api_key_id,
                session_id=session_id,
                action=action,
                success=success,
                error_message=error_message,
                ip_address=ip_address,
                user_agent=user_agent
            )
            db.add(log_entry)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to log action: {e}")
    
    def save_api_key(
        self, 
        session_id: str, 
        api_key: str,
        label: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """Save or update an API key for a session"""
        db = self.SessionLocal()
        try:
            # Encrypt the key
            encrypted_key = self.encryption.encrypt(api_key)
            key_hint = self._get_key_hint(api_key)
            
            # Check if key already exists for this session
            existing_key = db.query(UserApiKey).filter_by(session_id=session_id).first()
            
            if existing_key:
                # Update existing key
                existing_key.encrypted_key = encrypted_key
                existing_key.key_hint = key_hint
                existing_key.updated_at = datetime.utcnow()
                existing_key.is_active = True
                existing_key.is_valid = True
                if label:
                    existing_key.label = label
                
                action = "updated"
                api_key_id = existing_key.id
            else:
                # Create new key
                new_key = UserApiKey(
                    session_id=session_id,
                    encrypted_key=encrypted_key,
                    key_hint=key_hint,
                    label=label
                )
                db.add(new_key)
                db.flush()  # Get the ID
                
                action = "created"
                api_key_id = new_key.id
            
            db.commit()
            
            # Log the action
            self._log_action(
                db, api_key_id, session_id, action,
                success=True, ip_address=ip_address, user_agent=user_agent
            )
            
            return {
                "success": True,
                "message": f"API key {action} successfully",
                "key_hint": key_hint
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to save API key: {e}")
            return {
                "success": False,
                "message": f"Failed to save API key: {str(e)}"
            }
        finally:
            db.close()
    
    def get_api_key(
        self, 
        session_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Optional[str]:
        """Retrieve and decrypt an API key for a session"""
        db = self.SessionLocal()
        try:
            # Find the key
            user_key = db.query(UserApiKey).filter_by(
                session_id=session_id,
                is_active=True
            ).first()
            
            if not user_key:
                return None
            
            # Decrypt the key
            decrypted_key = self.encryption.decrypt(user_key.encrypted_key)
            
            # Update last used timestamp
            user_key.last_used_at = datetime.utcnow()
            db.commit()
            
            # Log the access
            self._log_action(
                db, user_key.id, session_id, "used",
                success=True, ip_address=ip_address, user_agent=user_agent
            )
            
            return decrypted_key
            
        except Exception as e:
            logger.error(f"Failed to retrieve API key: {e}")
            return None
        finally:
            db.close()
    
    def validate_api_key(
        self, 
        session_id: str, 
        is_valid: bool,
        error_message: Optional[str] = None
    ):
        """Update validation status of an API key"""
        db = self.SessionLocal()
        try:
            user_key = db.query(UserApiKey).filter_by(session_id=session_id).first()
            if user_key:
                user_key.is_valid = is_valid
                user_key.last_validated_at = datetime.utcnow()
                db.commit()
                
                # Log validation
                self._log_action(
                    db, user_key.id, session_id, "validated",
                    success=is_valid, error_message=error_message
                )
        except Exception as e:
            logger.error(f"Failed to update validation status: {e}")
        finally:
            db.close()
    
    def delete_api_key(
        self, 
        session_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """Delete (deactivate) an API key"""
        db = self.SessionLocal()
        try:
            user_key = db.query(UserApiKey).filter_by(session_id=session_id).first()
            if user_key:
                # Soft delete - just mark as inactive
                user_key.is_active = False
                db.commit()
                
                # Log deletion
                self._log_action(
                    db, user_key.id, session_id, "deleted",
                    success=True, ip_address=ip_address, user_agent=user_agent
                )
                
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete API key: {e}")
            return False
        finally:
            db.close()
    
    def get_key_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a stored key without decrypting it"""
        db = self.SessionLocal()
        try:
            user_key = db.query(UserApiKey).filter_by(
                session_id=session_id,
                is_active=True
            ).first()
            
            if not user_key:
                return None
            
            return {
                "key_hint": user_key.key_hint,
                "created_at": user_key.created_at.isoformat(),
                "updated_at": user_key.updated_at.isoformat() if user_key.updated_at else None,
                "last_used_at": user_key.last_used_at.isoformat() if user_key.last_used_at else None,
                "last_validated_at": user_key.last_validated_at.isoformat() if user_key.last_validated_at else None,
                "is_valid": user_key.is_valid,
                "label": user_key.label
            }
        except Exception as e:
            logger.error(f"Failed to get key info: {e}")
            return None
        finally:
            db.close()


# Global storage instance
api_key_storage = ApiKeyStorage()