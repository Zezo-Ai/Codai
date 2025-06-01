"""Configuration management system."""
import os
from pathlib import Path
import yaml
from typing import Any, Dict, Optional
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

class ConfigurationError(Exception):
    """Raised when there's an error in configuration loading or validation."""
    pass

class ConfigManager:
    """Manages application configuration with environment support."""
    
    def __init__(self, env: Optional[str] = None):
        """Initialize configuration manager.
        
        Args:
            env: Environment name. If None, will use APP_ENV environment variable
                or fall back to 'development'
        """
        self.env = env or os.getenv('APP_ENV', 'development')
        self.config_dir = Path(__file__).parent.parent / 'config'
        self._config: Dict[str, Any] = {}
        self._load_config()
    
    def _load_yaml(self, path: Path) -> Dict[str, Any]:
        """Load and parse a YAML file.
        
        Args:
            path: Path to YAML file
            
        Returns:
            Parsed YAML content as dictionary
            
        Raises:
            ConfigurationError: If file cannot be read or parsed
        """
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except Exception as e:
            raise ConfigurationError(f"Error loading config file {path}: {str(e)}")
    
    def _merge_configs(self, base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively merge two configuration dictionaries.
        
        Args:
            base: Base configuration
            override: Configuration to override base with
            
        Returns:
            Merged configuration dictionary
        """
        result = base.copy()
        
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._merge_configs(result[key], value)
            else:
                result[key] = value
        
        return result
    
    def _load_config(self) -> None:
        """Load configuration files for current environment."""
        # Load base config
        base_config = self._load_yaml(self.config_dir / 'base.yaml')
        
        # Load environment config
        env_config_path = self.config_dir / 'environments' / f'{self.env}.yaml'
        if env_config_path.exists():
            env_config = self._load_yaml(env_config_path)
            # Remove the extends key as we handle it explicitly
            env_config.pop('extends', None)
            self._config = self._merge_configs(base_config, env_config)
        else:
            logger.warning(f"No environment config found for {self.env}, using base config")
            self._config = base_config
        
        # Load feature-specific configs
        feature_configs = [
            'app.yaml',     # Master application configuration
            'models.yaml',  # AI model configurations
            'structured_prompts.yaml',
            'logging.yaml',
            'maintenance.yaml'
            # Add other feature configs here as needed
        ]
        
        for feature_config in feature_configs:
            feature_path = self.config_dir / feature_config
            if feature_path.exists():
                feature_settings = self._load_yaml(feature_path)
                self._config = self._merge_configs(self._config, feature_settings)
                logger.info(f"Loaded feature config: {feature_config}")
        
        # Load local overrides if they exist
        local_config_path = self.config_dir / 'local.yaml'
        if local_config_path.exists():
            local_config = self._load_yaml(local_config_path)
            self._config = self._merge_configs(self._config, local_config)
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key.
        
        Args:
            key: Configuration key in dot notation (e.g., 'server.host')
            default: Default value if key not found
            
        Returns:
            Configuration value or default
        """
        keys = key.split('.')
        value = self._config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
                
        return value
    
    def get_all(self) -> Dict[str, Any]:
        """Get complete configuration dictionary.
        
        Returns:
            Complete configuration dictionary
        """
        return self._config.copy()
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value by key.
        
        Args:
            key: Configuration key in dot notation (e.g., 'server.host')
            value: Value to set
        """
        keys = key.split('.')
        config = self._config
        
        # Navigate to the parent dictionary
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            elif not isinstance(config[k], dict):
                # Convert non-dict values to dict if needed
                config[k] = {}
            config = config[k]
        
        # Set the final value
        config[keys[-1]] = value
    
    def save(self) -> None:
        """Save current configuration to local.yaml file.
        
        This saves only the runtime changes to avoid overwriting base config.
        """
        local_config_path = self.config_dir / 'local.yaml'
        
        try:
            # Create a minimal config with only the changed values
            # For now, we'll save the entire config to local.yaml
            # In a production system, you might want to track only changes
            with open(local_config_path, 'w', encoding='utf-8') as f:
                yaml.dump(self._config, f, default_flow_style=False, sort_keys=False)
            
            logger.info(f"Configuration saved to {local_config_path}")
            
        except Exception as e:
            raise ConfigurationError(f"Error saving config to {local_config_path}: {str(e)}")
    
    def validate(self) -> None:
        """Validate configuration values.
        
        Raises:
            ConfigurationError: If validation fails
        """
        # Required configuration checks
        required_keys = [
            'server.host',
            'server.port',
            'logging.default_level',
            'logging.dir'
        ]
        
        for key in required_keys:
            if self.get(key) is None:
                raise ConfigurationError(f"Missing required configuration: {key}")
        
        # Value validation
        port = self.get('server.port')
        if not isinstance(port, int) or not (1024 <= port <= 65535):
            raise ConfigurationError(f"Invalid port number: {port}")
        
        # Add more validation as needed

@lru_cache()
def get_config(env: Optional[str] = None) -> ConfigManager:
    """Get or create configuration manager instance.
    
    Args:
        env: Optional environment name
        
    Returns:
        ConfigManager instance
    """
    return ConfigManager(env)

def update_config(key: str, value: Any) -> None:
    """Update configuration value globally.
    
    Args:
        key: Configuration key in dot notation
        value: Value to set
    """
    config_manager = get_config()
    config_manager.set(key, value)

def save_config() -> None:
    """Save current configuration to local.yaml file."""
    config_manager = get_config()
    config_manager.save()