"""
Centralized Configuration API
This module provides a clean, type-safe interface to all application configuration.
All configuration is loaded from YAML files through config_manager.
"""

from typing import Dict, Any, Optional, List
from functools import lru_cache
from .config_manager import get_config

# Get config instance
_config = get_config()

# Debug: Print configuration status
import logging
logger = logging.getLogger(__name__)
logger.info(f"Configuration loaded. Model selection: {_config.get('model_selection', 'NOT FOUND')}")


class ServerConfig:
    """Server configuration settings."""
    
    @staticmethod
    def host() -> str:
        return _config.get('server.host', '127.0.0.1')
    
    @staticmethod
    def port() -> int:
        return _config.get('server.port', 8000)
    
    @staticmethod
    def frontend_port() -> int:
        return _config.get('server.frontend_port', 8001)
    
    @staticmethod
    def backend_url() -> str:
        return _config.get('server.backend_url', f'http://127.0.0.1:{ServerConfig.port()}')
    
    @staticmethod
    def frontend_url() -> str:
        return _config.get('server.frontend_url', f'http://127.0.0.1:{ServerConfig.frontend_port()}')
    
    @staticmethod
    def reload_enabled() -> bool:
        return _config.get('server.reload.enabled', False)
    
    @staticmethod
    def request_timeout() -> float:
        return _config.get('server.timeouts.request', 1200.0)
    
    @staticmethod
    def cors_config() -> Dict[str, Any]:
        return _config.get('server.cors', {})


class APIConfig:
    """API configuration settings."""
    
    @staticmethod
    def rate_limit() -> Dict[str, int]:
        return {
            'requests_per_minute': _config.get('api.rate_limiting.requests_per_minute', 100),
            'window_size': _config.get('api.rate_limiting.window_size', 60)
        }
    
    @staticmethod
    def retry_config() -> Dict[str, Any]:
        return _config.get('api.retry', {
            'max_retries': 3,
            'base_delay': 1.0,
            'max_delay': 10.0,
            'exponential_base': 2.0
        })
    
    @staticmethod
    def cache_config() -> Dict[str, int]:
        return _config.get('api.cache', {
            'ttl': 3600,
            'max_size': 10000
        })
    
    @staticmethod
    def max_content_length() -> int:
        return _config.get('api.response.max_content_length', 1000000)
    
    @staticmethod
    def max_message_length() -> int:
        return _config.get('api.response.max_message_length', 32768)


class ConversationConfig:
    """Conversation and token management configuration."""
    
    @staticmethod
    def max_context_tokens() -> int:
        return _config.get('conversation.tokens.max_context', 200000)
    
    @staticmethod
    def max_tokens_per_message() -> int:
        return _config.get('conversation.tokens.max_per_message', 32000)
    
    @staticmethod
    def summarization_enabled() -> bool:
        return _config.get('conversation.summarization.enabled', True)
    
    @staticmethod
    def summarization_threshold() -> float:
        return _config.get('conversation.summarization.threshold_percentage', 0.8)
    
    @staticmethod
    def summary_marker() -> str:
        return _config.get('conversation.summarization.marker', 'Previous conversation summary:')
    
    @staticmethod
    def summary_acknowledgment() -> str:
        return _config.get('conversation.summarization.acknowledgment', 
                          'Understood. Continuing with this context.')
    
    @staticmethod
    def section_config() -> Dict[str, Dict[str, int]]:
        return _config.get('conversation.sections', {})


class ModelConfig:
    """AI model configuration."""
    
    @staticmethod
    @lru_cache(maxsize=1)
    def allowed_models() -> List[str]:
        return _config.get('model_selection.allowed_models', [])
    
    @staticmethod
    def default_model() -> str:
        return _config.get('model_selection.default_model', 'claude-4-sonnet-20250514')
    
    @staticmethod
    def validate_model(model: Optional[str]) -> str:
        """Validate model name and return valid model or default."""
        allowed = ModelConfig.allowed_models()
        default = ModelConfig.default_model()
        
        # If no allowed models configured, just return the model or default
        if not allowed:
            return model or default
            
        if model and model in allowed:
            return model
        return default
    
    @staticmethod
    def get_model_info(model: str) -> Dict[str, Any]:
        """Get model capabilities and configuration."""
        models = _config.get('models', {})
        return models.get(model, models.get(ModelConfig.default_model(), {}))
    
    @staticmethod
    def get_model_max_tokens(model: str) -> int:
        """Get max tokens for a specific model."""
        info = ModelConfig.get_model_info(model)
        return info.get('max_tokens', 32000)
    
    @staticmethod
    def model_supports_tool(model: str, tool: str) -> bool:
        """Check if model supports a specific tool."""
        info = ModelConfig.get_model_info(model)
        supports_tools = info.get('supports_tools', {})
        
        # Map tool types to config keys
        tool_mapping = {
            'text_editor_20250429': 'text_editor',
            'computer_use': 'computer_use',
            'web_search': 'web_search',
            'file_operations': 'file_operations'
        }
        
        config_key = tool_mapping.get(tool, tool)
        return supports_tools.get(config_key, True)


class ToolConfig:
    """Tool configuration settings."""
    
    @staticmethod
    def computer_enabled() -> bool:
        return _config.get('tools.computer.enabled', True)
    
    @staticmethod
    def computer_display() -> Dict[str, int]:
        return _config.get('tools.computer.display', {'width': 1024, 'height': 800})
    
    @staticmethod
    def file_max_size() -> int:
        return _config.get('tools.file.max_size', 8000000)
    
    @staticmethod
    def file_content_limits() -> Dict[str, int]:
        return _config.get('tools.file.content_limits', {})
    
    @staticmethod
    def web_enabled() -> bool:
        return _config.get('tools.web.enabled', True)
    
    @staticmethod
    def web_search_engine() -> str:
        return _config.get('tools.web.search.default_engine', 'duckduckgo')


class LoggingConfig:
    """Logging configuration settings."""
    
    @staticmethod
    def get_level(module: str = 'default') -> str:
        levels = _config.get('logging.levels', {})
        return levels.get(module, levels.get('default', 'INFO'))
    
    @staticmethod
    def file_enabled() -> bool:
        return _config.get('logging.file.enabled', True)
    
    @staticmethod
    def log_path() -> str:
        return _config.get('logging.file.path', 'logs/')
    
    @staticmethod
    def rotation_config() -> Dict[str, Any]:
        return _config.get('logging.rotation', {})


class FrontendConfig:
    """Frontend configuration settings."""
    
    @staticmethod
    def api_base_url() -> str:
        return _config.get('frontend.api.base_url', 'http://127.0.0.1:3005')
    
    @staticmethod
    def api_timeout() -> int:
        return _config.get('frontend.api.timeout', 30000)
    
    @staticmethod
    def feature_flags() -> Dict[str, bool]:
        return _config.get('frontend.features', {})
    
    @staticmethod
    def ui_settings() -> Dict[str, Any]:
        return _config.get('frontend.ui', {})


class DevelopmentConfig:
    """Development-specific configuration."""
    
    @staticmethod
    def debug_enabled() -> bool:
        return _config.get('development.debug.enabled', False)
    
    @staticmethod
    def hot_reload() -> Dict[str, bool]:
        return _config.get('development.hot_reload', {})
    
    @staticmethod
    def show_stack_traces() -> bool:
        return _config.get('development.error_handling.show_stack_traces', True)


class DebugConfig:
    """Debug logging configuration (replaces debug.debug_config)."""
    
    # Communication & API
    LOG_AI_API_CALLS = _config.get('development.debug.categories.ai_api_calls', False)
    LOG_STREAM_PROCESSING = _config.get('development.debug.categories.stream_processing', False)
    
    # Conversation management
    LOG_CONVERSATION_VERSIONS = _config.get('development.debug.categories.conversation_versions', False)
    LOG_CONVERSATION_PREPARATION_VALIDATION = _config.get('development.debug.categories.conversation_preparation_validation', False)
    LOG_HISTORY_STATE = _config.get('development.debug.categories.history_state', False)
    LOG_CONVERSATION_PERSISTENCE = _config.get('development.debug.categories.conversation_persistence', False)
    LOG_CONVERSATION_PERSISTENCE_DEBUG = _config.get('development.debug.categories.conversation_persistence_debug', False)
    LOG_CONVERSATION_PREPARATION = _config.get('development.debug.categories.conversation_preparation', False)
    
    # Summarization
    LOG_PAIR_LIMITING = _config.get('development.debug.categories.pair_limiting', False)
    LOG_SUMMARIZATION_VALIDATION = _config.get('development.debug.categories.summarization_validation', False)
    
    # Token counting
    LOG_TOKEN_COUNTING = _config.get('development.debug.categories.token_counting', False)
    LOG_TOKEN_VALIDATION = _config.get('development.debug.categories.token_validation', False)
    
    # Cache management
    LOG_CACHE_MANAGEMENT = _config.get('development.debug.categories.cache_management', False)
    
    # Tool interaction
    LOG_TOOL_CALLS = _config.get('development.debug.categories.tool_calls', False)
    LOG_TOOL_RESPONSES = _config.get('development.debug.categories.tool_responses', False)
    
    # Message processing
    LOG_MESSAGE_CLEANING = _config.get('development.debug.categories.message_cleaning', False)
    LOG_MESSAGE_ORDERING = _config.get('development.debug.categories.message_ordering', False)
    
    # Session management
    LOG_SESSION_STATE = _config.get('development.debug.categories.session_state', False)
    LOG_SESSION_LIFECYCLE = _config.get('development.debug.categories.session_lifecycle', False)
    
    # Expert mode
    LOG_EXPERT_MODE = _config.get('development.debug.categories.expert_mode', True)


# Convenience functions for backward compatibility
def get_server_config() -> Dict[str, Any]:
    """Get server configuration (deprecated, use ServerConfig class)."""
    return {
        'host': ServerConfig.host(),
        'port': ServerConfig.port(),
        'reload': ServerConfig.reload_enabled(),
        'timeout': ServerConfig.request_timeout()
    }


def get_model_config() -> Dict[str, Any]:
    """Get model configuration (deprecated, use ModelConfig class)."""
    return {
        'default_model': ModelConfig.default_model(),
        'allowed_models': ModelConfig.allowed_models()
    }


# Export main config access for direct use if needed
config = _config


def get_system_prompt() -> str:
    """Get system prompt with current context."""
    import platform
    from datetime import datetime
    
    system_os = "Mac OS" if platform.system() == "Darwin" else platform.system()
    current_date = datetime.today().strftime('%A, %B %d, %Y')
    
    base_prompt = f'''<SYSTEM_CAPABILITY>
* You are operating on a {system_os} computer with internet access.
* You can install new tools and technologies globally. When you do so, they will be available in all future sessions.
* Today's date is {current_date}.
</SYSTEM_CAPABILITY>

You are CODAI - Evolved Intelligence. You are an advanced AI system that transforms ideas into production-ready applications and solutions. CODAI works like a software factory, turning natural language descriptions into complete, functional software with zero code required from the user.

Created by Arian Rudd (https://x.com/AriRudd), CODAI represents the evolution of intelligent development. Visit codai.ai to learn more. When users ask who or what you are, always identify yourself as CODAI and explain that you democratize software creation by enabling anyone to build applications through natural conversation - functioning as their personal software factory.

You have access to a set of tools and functions you can use to complete tasks. When using computer-controlling tools, you can take a screenshot to see what's on the screen, perform click and keyboard actions to interact with applications. In web-controlling tools, you can navigate to URLs, fill in forms, click links, and interact with page elements.

IMPORTANT: When using file paths, use '/' as the path separator, not '\\'. For example:
- Correct: /Users/username/Documents/file.txt
- Incorrect: \\Users\\username\\Documents\\file.txt

Always follow this format regardless of the operating system to ensure consistent file access.'''
    
    # Add structured response configuration if enabled
    structured_enabled = _config.get('ai.structured_responses.enabled', False)
    if structured_enabled:
        try:
            # Use the schema-driven prompt generator if configured to do so
            use_schema_driven = _config.get('ai.structured_responses.use_schema_driven', True)
            
            if use_schema_driven:
                # Use the schema prompt generator (now tag-based by default)
                from .api.schema_prompt_generator import generate_schema_prompt
                structured_instruction = generate_schema_prompt()
                base_prompt += f"\n\n{structured_instruction}"
            else:
                # Use the static instruction from config
                structured_instruction = _config.get('ai.structured_responses.system_prompt_suffix', '')
                if structured_instruction:
                    base_prompt += f"\n\n{structured_instruction}"
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error generating schema prompt: {e}")
            
            # Use the static instruction from config
            structured_instruction = _config.get('ai.structured_responses.system_prompt_suffix', '')
            if structured_instruction:
                base_prompt += f"\n\n{structured_instruction}"

    return base_prompt


def get_tool_config() -> Dict[str, Any]:
    """Get tool configuration (legacy compatibility function)."""
    return {
        'computer': {
            'enabled': ToolConfig.computer_enabled(),
            'default_format': 'web',
            'options': {
                'display_height_px': ToolConfig.computer_display()['height'],
                'display_width_px': ToolConfig.computer_display()['width']
            }
        },
        'edit': {
            'enabled': True,
            'default_format': 'web',
            'options': {
                'max_file_size': ToolConfig.file_max_size(),
                'supported_formats': ['cli', 'web'],
                'content_limits': ToolConfig.file_content_limits(),
                'code_processing': _config.get('tools.file.code_processing', {})
            }
        },
        'system': {
            'enabled': True,
            'default_format': 'web',
            'options': {}
        }
    }