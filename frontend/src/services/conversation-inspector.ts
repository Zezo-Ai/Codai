import { API_BASE_URL } from '@/config/api';
import type { 
    DeleteRequest, 
    DeleteResponse, 
    GetMessagesResponse, 
    Message,
    SummarizeRequest,
    SummarizeResponse,
    ExportResponse,
    ImportResponse
} from '@/types/conversation-inspector';

const INSPECTOR_BASE_URL = `${API_BASE_URL}/chat/messages`;

/**
 * Get headers for requests
 * Note: API key is now stored on backend, no need to send in headers
 */
function getHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
    };
}

export const ConversationInspectorService = {
    /**
     * Summarize selected messages
     */
    summarizeMessages: async (request: SummarizeRequest): Promise<SummarizeResponse> => {
        try {
            const headers = getHeaders();
            const response = await fetch(
                `${INSPECTOR_BASE_URL}/summarize`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(request)
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to summarize messages: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error in summarizeMessages:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    },

    /**
     * Fetch raw messages for a session
     */
    async getRawMessages({
        sessionId,
        page = 1,
        pageSize = 50,
        order = 'asc'
    }: GetMessagesParams): Promise<GetMessagesResponse> {
        try {
            const response = await fetch(
                `${INSPECTOR_BASE_URL}/raw?session_id=${sessionId}&page=${page}&page_size=${pageSize}&order=${order}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            // Handle non-200 responses
            if (!response.ok) {
                console.error('Error fetching messages:', {
                    status: response.status,
                    statusText: response.statusText
                });
                return {
                    messages: [],
                    total: 0,
                    page,
                    hasMore: false,
                    error: `Failed to fetch messages: ${response.statusText}`
                };
            }

            const messages = await response.json();
            
            // Validate response format
            if (!Array.isArray(messages)) {
                console.error('Invalid response format:', messages);
                return {
                    messages: [],
                    total: 0,
                    page,
                    hasMore: false,
                    error: 'Invalid response format'
                };
            }

            return {
                messages,
                total: parseInt(response.headers.get('X-Total-Count') || String(messages.length)),
                page,
                hasMore: messages.length === pageSize,
            };
        } catch (error) {
            console.error('Error in getRawMessages:', error);
            return {
                messages: [],
                total: 0,
                page,
                hasMore: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    },

    /**
     * Delete specific messages from a session
     */
    async deleteMessages(request: DeleteRequest): Promise<DeleteResponse> {
        const response = await fetch(`${INSPECTOR_BASE_URL}/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error('Failed to delete messages');
        }

        return response.json();
    },

    /**
     * Export session data including messages and conversation state
     */
    exportMessages: async (sessionId: string): Promise<ExportResponse> => {
        try {
            const response = await fetch(
                `${INSPECTOR_BASE_URL}/export`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ session_id: sessionId })
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to export messages: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error in exportMessages:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to export messages'
            };
        }
    },

    /**
     * Import messages into a session
     */
    importMessages: async (sessionId: string, data: any): Promise<ImportResponse> => {
        try {
            // Basic validation
            if (!data.messages || !Array.isArray(data.messages)) {
                throw new Error('Invalid import data: messages array is required');
            }

            const response = await fetch(
                `${INSPECTOR_BASE_URL}/import`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        session_id: sessionId,
                        data: {
                            version: "1.0.0",
                            messages: data.messages
                        }
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to import messages: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error in importMessages:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to import messages'
            };
        }
    }
};