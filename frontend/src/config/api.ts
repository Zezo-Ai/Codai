/**
 * API configuration
 */

import { getApiBaseUrl } from '@/lib/api-config';

// Use dynamic API base URL that works in both web and Electron
export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
    chat: {
        completion: '/codai/chat/stream',
        reset: '/codai/chat/reset',
        messages: {
            raw: '/chat/messages/raw',
            delete: '/chat/messages/delete'
        }
    },
    metrics: {
        logs: '/metrics/logs',
        stats: '/metrics/stats'
    }
} as const;