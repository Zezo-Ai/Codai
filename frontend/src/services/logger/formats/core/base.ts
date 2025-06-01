import { LogCategory } from '../../interfaces/types';
import { z } from 'zod';

/**
 * Base format metadata
 */
export interface FormatMetadata {
  id: string;
  version: string;
  description: string;
}

/**
 * Base log format interface that all formats must extend
 */
export interface BaseLogFormat {
  component: string;
  action: string;
  category: LogCategory;
  timestamp?: string;
  [key: string]: any;
}

/**
 * Base Zod schema that all formats must extend
 */
export const baseFormatSchema = z.object({
  component: z.string(),
  action: z.string(),
  category: z.nativeEnum(LogCategory),
  timestamp: z.string().optional()
});

/**
 * Format module interface for implementing new formats
 */
export interface LogFormatModule<T extends BaseLogFormat> {
  metadata: FormatMetadata;
  schema: z.ZodSchema<T>;
  format: (data: Partial<T>) => T;
  validate: (data: unknown) => data is T;
}

/**
 * Format-specific error types
 */
export type FormatErrorCode = 
  | 'INVALID_FORMAT' 
  | 'DUPLICATE' 
  | 'NOT_FOUND' 
  | 'VALIDATION_FAILED';

/**
 * Format registration error
 */
export class FormatError extends Error {
  constructor(
    message: string,
    public formatId: string,
    public code: FormatErrorCode
  ) {
    super(message);
    this.name = 'FormatError';
  }
}