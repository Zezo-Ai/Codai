import type { LogFormatModule, BaseLogFormat, FormatMetadata } from './base';
import { FormatError } from './base';

export class FormatRegistry {
  private static instance: FormatRegistry;
  private formats: Map<string, LogFormatModule<any>> = new Map();

  private constructor() {}

  public static getInstance(): FormatRegistry {
    if (!FormatRegistry.instance) {
      FormatRegistry.instance = new FormatRegistry();
    }
    return FormatRegistry.instance;
  }

  /**
   * Register a new format module
   */
  public register<T extends BaseLogFormat>(format: LogFormatModule<T>): void {
    const { id } = format.metadata;

    if (this.formats.has(id)) {
      throw new FormatError(
        `Format with id '${id}' is already registered`, 
        id, 
        'DUPLICATE'
      );
    }

    this.formats.set(id, format);
  }

  /**
   * Unregister a format module
   */
  public unregister(formatId: string): void {
    if (!this.formats.has(formatId)) {
      throw new FormatError(
        `Format with id '${formatId}' not found`, 
        formatId, 
        'NOT_FOUND'
      );
    }

    this.formats.delete(formatId);
  }

  /**
   * Get a format module by id
   */
  public getFormat<T extends BaseLogFormat>(formatId: string): LogFormatModule<T> {
    const format = this.formats.get(formatId);
    
    if (!format) {
      throw new FormatError(
        `Format with id '${formatId}' not found`, 
        formatId, 
        'NOT_FOUND'
      );
    }

    return format as LogFormatModule<T>;
  }

  /**
   * List all registered formats
   */
  public listFormats(): FormatMetadata[] {
    return Array.from(this.formats.values()).map(format => format.metadata);
  }

  /**
   * Format data using a registered format
   */
  public formatData<T extends BaseLogFormat>(formatId: string, data: Partial<T>): T {
    const format = this.getFormat<T>(formatId);
    
    try {
      return format.format(data);
    } catch (error) {
      throw new FormatError(
        `Failed to format data: ${error.message}`,
        formatId,
        'VALIDATION_FAILED'
      );
    }
  }

  /**
   * Validate data against a format
   */
  public validateData<T extends BaseLogFormat>(formatId: string, data: unknown): data is T {
    const format = this.getFormat<T>(formatId);
    return format.validate(data);
  }
}