import { z } from 'zod';
import { LogCategory } from '../../interfaces/types';
import { 
  LogFormatModule, 
  BaseLogFormat, 
  baseFormatSchema,
  FormatError
} from '../core/base';
import { SessionFormat } from './session';

/**
 * Session title metadata format
 */
export interface SessionTitleFormat extends SessionFormat {
  metadata: {
    title: {
      current: string | null;
      previous?: string | null;
      source: 'storage' | 'component' | 'user' | 'system';
      fallback?: boolean;
    };
    display?: {
      component: string;
      fallbackUsed: boolean;
      fallbackValue: string;
    };
    sync?: {
      storageTitle: string | null;
      componentTitle: string | null;
      syncTimestamp: string;
    };
  }
}

/**
 * Session title validation schema
 */
const titleMetadataSchema = z.object({
  title: z.object({
    current: z.string().nullable().default(null),
    previous: z.string().nullable().optional(),
    source: z.enum(['storage', 'component', 'user', 'system']),
    fallback: z.boolean().optional()
  }),
  display: z.object({
    component: z.string(),
    fallbackUsed: z.boolean(),
    fallbackValue: z.string()
  }).optional(),
  sync: z.object({
    storageTitle: z.string().nullable(),
    componentTitle: z.string().nullable(),
    syncTimestamp: z.string()
  }).optional()
}).strict();

const sessionTitleFormatSchema = baseFormatSchema.extend({
  sessionId: z.string(),
  category: z.nativeEnum(LogCategory),
  metadata: titleMetadataSchema
});

/**
 * Session title format implementation
 */
export const SessionTitleFormatModule: LogFormatModule<SessionTitleFormat> = {
  metadata: {
    id: 'session_title',
    version: '1.0.0',
    description: 'Format for session title-related logging'
  },

  schema: sessionTitleFormatSchema,

  validate: (data: unknown): data is SessionTitleFormat => {
    return sessionTitleFormatSchema.safeParse(data).success;
  },

  format: (data: Partial<SessionTitleFormat>): SessionTitleFormat => {
    try {
      // Default values and transformations
      const formatted: SessionTitleFormat = {
        component: data.component || 'SessionManager',
        action: data.action || 'unknown',
        category: LogCategory.SESSION,
        sessionId: data.sessionId || 'none',
        timestamp: new Date().toISOString(),
        metadata: {
          title: {
            current: null,
            source: 'system',
            ...data.metadata?.title
          },
          ...data.metadata,
        }
      };

      // Validate the formatted data
      const result = sessionTitleFormatSchema.safeParse(formatted);
      if (!result.success) {
        throw new FormatError(
          `Invalid session title format: ${result.error.message}`,
          'session_title',
          'VALIDATION_FAILED'
        );
      }

      return formatted;
    } catch (error) {
      if (error instanceof FormatError) throw error;
      
      throw new FormatError(
        'Failed to format session title data',
        'session_title',
        'INVALID_FORMAT'
      );
    }
  }
};