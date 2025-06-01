"""Database models for API key storage"""

from sqlalchemy import Column, String, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime
import uuid

Base = declarative_base()


class UserApiKey(Base):
    """Model for storing encrypted user API keys"""
    __tablename__ = 'user_api_keys'
    
    # Primary key - UUID for security
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # User identification (session-based for now, can be user_id later)
    session_id = Column(String(255), unique=True, nullable=False, index=True)
    
    # Encrypted API key storage
    encrypted_key = Column(Text, nullable=False)  # Encrypted with server-side key
    key_hint = Column(String(20), nullable=True)  # Last 4 chars for display: "sk-ant-...AbCd"
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    last_validated_at = Column(DateTime(timezone=True), nullable=True)
    
    # Security flags
    is_active = Column(Boolean, default=True)
    is_valid = Column(Boolean, default=True)  # Set to False if validation fails
    
    # Optional metadata
    label = Column(String(100), nullable=True)  # User-provided label
    
    def __repr__(self):
        return f"<UserApiKey(session_id='{self.session_id}', hint='{self.key_hint}', active={self.is_active})>"


class ApiKeyAuditLog(Base):
    """Audit log for API key access and changes"""
    __tablename__ = 'api_key_audit_logs'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Reference to the API key
    api_key_id = Column(String(36), nullable=False, index=True)
    session_id = Column(String(255), nullable=False)
    
    # Action details
    action = Column(String(50), nullable=False)  # created, updated, validated, used, deleted
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(500), nullable=True)
    
    # Result
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<ApiKeyAuditLog(action='{self.action}', session='{self.session_id}', success={self.success})>"