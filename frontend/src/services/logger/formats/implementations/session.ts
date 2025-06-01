import { z } from 'zod';
import { LogCategory } from '../../interfaces/types';
import { 
  LogFormatModule, 
  BaseLogFormat, 
  baseFormatSchema,
  FormatError
} from '../core/base';

/**
 * Session format type definition
 */
export interface SessionFormat extends BaseLogFormat {
  sessionId: string;
  userId?: string;
  state?: Record<string, any>;
  metadata?: {
    userAgent?: string;
    ip?: string;
    referrer?: string;
    [key: string]: any;
  };
}

/**
 * Session format validation schema
 */
const sessionFormatSchema = baseFormatSchema.extend({
  sessionId: z.string(),
  userId: z.string().optional(),
  state: z.record(z.any()).optional(),
  metadata: z.object({
    userAgent: z.string().optional(),
    ip: z.string().optional(),
    referrer: z.string().optional()
  }).optional()
});

/**
 * Session format implementation
 */
export const SessionFormatModule: LogFormatModule<SessionFormat> = {
  metadata: {
    id: 'session',
    version: '1.0.0',
    description: 'Format for session-related logging'
  },

  schema: sessionFormatSchema,

  validate: (data: unknown): data is SessionFormat => {
    return sessionFormatSchema.safeParse(data).success;
  },

  format: (data: Partial<SessionFormat>): SessionFormat => {
    try {
      // Default values and transformations
      const formatted: SessionFormat = {
        component: data.component || 'SessionManager',
        action: data.action || 'unknown',
        category: data.category || LogCategory.SESSION,
        sessionId: data.sessionId || 'unknown',
        timestamp: new Date().toISOString(),
        metadata: {
          userAgent: window.navigator.userAgent,
          referrer: document.referrer,
          ...data.metadata
        },
        ...data
      };

      // Validate the formatted data
      const result = sessionFormatSchema.safeParse(formatted);
      if (!result.success) {
        throw new FormatError(
          `Invalid session format: ${result.error.message}`,
          'session',
          'VALIDATION_FAILED'
        );
      }

      return formatted;
    } catch (error) {
      if (error instanceof FormatError) throw error;
      
      throw new FormatError(
        'Failed to format session data',
        'session',
        'INVALID_FORMAT'
      );
    }
  }
};