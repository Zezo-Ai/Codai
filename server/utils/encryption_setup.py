"""
Automated encryption secret setup for first-time runs
"""

import os
import secrets
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class EncryptionSecretManager:
    """Manages encryption secret generation and storage"""
    
    def __init__(self):
        self.env_file = Path('.env')
        self.secret_file = Path('.encryption_secret')  # Separate file for better security
        self.env_var = 'ENCRYPTION_SECRET'
        
    def get_or_create_secret(self) -> str:
        """
        Get existing secret or create a new one automatically.
        
        Priority:
        1. Environment variable (production)
        2. .env file (development)
        3. .encryption_secret file (auto-generated)
        4. Generate new one
        """
        # 1. Check environment variable first (production)
        secret = os.environ.get(self.env_var)
        if secret and secret != 'your-32-byte-secret-key-here':
            logger.info("Using encryption secret from environment variable")
            return secret
            
        # 2. Check .env file
        secret = self._read_from_env_file()
        if secret and secret != 'your-32-byte-secret-key-here':
            logger.info("Using encryption secret from .env file")
            return secret
            
        # 3. Check dedicated secret file
        secret = self._read_from_secret_file()
        if secret:
            logger.info("Using encryption secret from .encryption_secret file")
            # Also update .env for consistency
            self._update_env_file(secret)
            return secret
            
        # 4. Generate new secret
        logger.warning("No encryption secret found. Generating a new one...")
        secret = self._generate_secret()
        
        # Save to both files
        self._save_to_secret_file(secret)
        self._update_env_file(secret)
        
        logger.info("✅ Generated and saved new encryption secret")
        logger.info("⚠️  IMPORTANT: Back up your .encryption_secret file!")
        logger.info("    Losing this secret means users must re-enter their API keys")
        
        return secret
    
    def _generate_secret(self) -> str:
        """Generate a cryptographically secure secret"""
        return secrets.token_hex(32)
    
    def _read_from_env_file(self) -> Optional[str]:
        """Read secret from .env file"""
        if not self.env_file.exists():
            return None
            
        try:
            with open(self.env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(f'{self.env_var}='):
                        # Extract value, handling quotes
                        value = line.split('=', 1)[1].strip()
                        if value.startswith('"') and value.endswith('"'):
                            value = value[1:-1]
                        return value
        except Exception as e:
            logger.error(f"Error reading .env file: {e}")
            
        return None
    
    def _read_from_secret_file(self) -> Optional[str]:
        """Read secret from dedicated file"""
        if not self.secret_file.exists():
            return None
            
        try:
            with open(self.secret_file, 'r') as f:
                secret = f.read().strip()
                if secret and len(secret) == 64:  # Valid hex secret
                    return secret
        except Exception as e:
            logger.error(f"Error reading secret file: {e}")
            
        return None
    
    def _save_to_secret_file(self, secret: str):
        """Save secret to dedicated file with restricted permissions"""
        try:
            # Write the file
            with open(self.secret_file, 'w') as f:
                f.write(secret)
            
            # Set restrictive permissions (Unix-like systems)
            if hasattr(os, 'chmod'):
                os.chmod(self.secret_file, 0o600)  # Read/write for owner only
                
            logger.info(f"Saved encryption secret to {self.secret_file}")
        except Exception as e:
            logger.error(f"Error saving secret file: {e}")
    
    def _update_env_file(self, secret: str):
        """Update or add secret to .env file"""
        try:
            lines = []
            secret_found = False
            
            # Read existing .env if it exists
            if self.env_file.exists():
                with open(self.env_file, 'r') as f:
                    for line in f:
                        if line.strip().startswith(f'{self.env_var}='):
                            lines.append(f'{self.env_var}={secret}\n')
                            secret_found = True
                        else:
                            lines.append(line)
            
            # Add secret if not found
            if not secret_found:
                # Create from .env.example if exists
                env_example = Path('.env.example')
                if env_example.exists() and not self.env_file.exists():
                    with open(env_example, 'r') as f:
                        for line in f:
                            if line.strip().startswith(f'{self.env_var}='):
                                lines.append(f'{self.env_var}={secret}\n')
                            else:
                                lines.append(line)
                else:
                    # Just append the secret
                    if lines and not lines[-1].endswith('\n'):
                        lines.append('\n')
                    lines.append(f'\n# Auto-generated encryption secret\n')
                    lines.append(f'{self.env_var}={secret}\n')
            
            # Write back
            with open(self.env_file, 'w') as f:
                f.writelines(lines)
                
            logger.info("Updated .env file with encryption secret")
        except Exception as e:
            logger.error(f"Error updating .env file: {e}")


# Singleton instance
encryption_manager = EncryptionSecretManager()


def ensure_encryption_secret() -> str:
    """
    Ensure an encryption secret exists, creating one if necessary.
    This is called during server startup.
    """
    return encryption_manager.get_or_create_secret()