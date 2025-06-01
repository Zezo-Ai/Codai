import { FormatRegistry } from './core/registry';
import type { BaseLogFormat, LogFormatModule } from './core/base';

// Import all format implementations
import { SessionFormatModule } from './implementations/session';
import { SessionTitleFormatModule } from './implementations/sessionTitle';

/**
 * Initialize registry
 */
const registry = FormatRegistry.getInstance();

/**
 * Register built-in formats
 */
registry.register(SessionFormatModule);
registry.register(SessionTitleFormatModule);

/**
 * Format System API
 */
export const LogFormat = {
  /**
   * Create a log entry using a specific format
   */
  create<T extends BaseLogFormat>(formatId: string, data: Partial<T>): T {
    return registry.formatData<T>(formatId, data);
  },

  /**
   * Get format module
   */
  getFormat<T extends BaseLogFormat>(formatId: string): LogFormatModule<T> {
    return registry.getFormat<T>(formatId);
  },

  /**
   * List available formats
   */
  listFormats() {
    return registry.listFormats();
  },

  /**
   * Register a new format
   */
  register<T extends BaseLogFormat>(format: LogFormatModule<T>): void {
    registry.register(format);
  },

  /**
   * Validate data against a format
   */
  validate<T extends BaseLogFormat>(formatId: string, data: unknown): data is T {
    return registry.validateData<T>(formatId, data);
  }
};

// Re-export format types
export type { SessionFormat } from './implementations/session';
export type { SessionTitleFormat } from './implementations/sessionTitle';