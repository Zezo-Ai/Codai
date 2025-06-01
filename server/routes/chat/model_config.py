"""Model configuration API for chat routes."""

from core.configuration import ModelConfig

# Re-export for backward compatibility
validate_model = ModelConfig.validate_model
get_model_info = ModelConfig.get_model_info
get_model_max_tokens = ModelConfig.get_model_max_tokens

def model_supports_text_editor(model: str) -> bool:
    """Check if model supports text editor tool."""
    return ModelConfig.model_supports_tool(model, 'text_editor')

def get_model_capabilities(model: str) -> dict:
    """Get capabilities for a specific model."""
    info = ModelConfig.get_model_info(model)
    return {
        'max_tokens': info.get('max_tokens', 32000),
        'supports_text_editor': info.get('supports_tools', {}).get('text_editor', True),
        'supports_computer_use': info.get('supports_tools', {}).get('computer_use', True),
        'name': info.get('name', model)
    }

# Export constants for compatibility
ALLOWED_MODELS = set(ModelConfig.allowed_models())
DEFAULT_MODEL = ModelConfig.default_model()