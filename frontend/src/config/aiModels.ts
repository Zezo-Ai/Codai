/**
 * Centralized AI Model Configuration
 * This configuration matches the backend config/models.yaml
 */

export const AI_MODELS = {
  OPUS: {
    id: 'powerful' as const,
    label: 'Powerful',
    name: 'Claude 4 Opus',
    model: 'claude-4-opus-20250514',
    description: 'Maximum capabilities for complex tasks',
    maxTokens: 32000,
    supportsTools: true,
    supportsTextEditor: true,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
  },
  SONNET: {
    id: 'balanced' as const,
    label: 'Balanced',
    name: 'Claude 4 Sonnet',
    model: 'claude-4-sonnet-20250514',
    description: 'Great performance for most tasks',
    maxTokens: 32000,
    supportsTools: true,
    supportsTextEditor: true,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    isDefault: true,
  },
  HAIKU: {
    id: 'light' as const,
    label: 'Light',
    name: 'Claude 3.5 Haiku',
    model: 'claude-3-5-haiku-20241022',
    description: 'Fast responses for simple tasks',
    maxTokens: 8192,
    supportsTools: true,
    supportsTextEditor: false, // Haiku doesn't support text_editor_20250429
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
  },
} as const;

// Type definitions
export type AiModelKey = keyof typeof AI_MODELS;
export type AiMode = typeof AI_MODELS[AiModelKey]['id'];
export type AiModelName = typeof AI_MODELS[AiModelKey]['model'];

// Helper functions
export const AI_MODE_TO_MODEL: Record<AiMode, AiModelName> = {
  powerful: AI_MODELS.OPUS.model,
  balanced: AI_MODELS.SONNET.model,
  light: AI_MODELS.HAIKU.model,
};

export const MODEL_TO_MODE: Record<AiModelName, AiMode> = {
  [AI_MODELS.OPUS.model]: AI_MODELS.OPUS.id,
  [AI_MODELS.SONNET.model]: AI_MODELS.SONNET.id,
  [AI_MODELS.HAIKU.model]: AI_MODELS.HAIKU.id,
};

export const AVAILABLE_MODES = Object.values(AI_MODELS).map(m => m.id);
export const AVAILABLE_MODELS = Object.values(AI_MODELS).map(m => m.model);
export const DEFAULT_MODE = AI_MODELS.SONNET.id;
export const DEFAULT_MODEL = AI_MODELS.SONNET.model;

/**
 * Get model configuration by mode
 */
export function getModelByMode(mode: AiMode) {
  return Object.values(AI_MODELS).find(m => m.id === mode);
}

/**
 * Get model configuration by model name
 */
export function getModelByName(modelName: AiModelName) {
  return Object.values(AI_MODELS).find(m => m.model === modelName);
}

/**
 * Check if a model supports a specific tool type
 */
export function modelSupportsTextEditor(modelName: string): boolean {
  const model = Object.values(AI_MODELS).find(m => m.model === modelName);
  return model?.supportsTextEditor ?? true;
}

/**
 * Get max tokens for a model
 */
export function getModelMaxTokens(modelName: string): number {
  const model = Object.values(AI_MODELS).find(m => m.model === modelName);
  return model?.maxTokens ?? 32000;
}