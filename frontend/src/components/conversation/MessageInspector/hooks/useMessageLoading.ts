import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { ConversationInspectorService } from '@/services/conversation-inspector';
import { Message } from '@/types/conversation-inspector';
import { createToastConfig } from '../utils/toast';

interface UseMessageLoadingProps {
    sessionId: string;
    page: number;
    pageSize: number;
    order: 'asc' | 'desc';
}

interface UseMessageLoadingReturn {
    messages: Message[];
    isLoading: boolean;
    hasMore: boolean;
    fetchMessages: () => Promise<void>;
}

export const useMessageLoading = ({
    sessionId,
    page,
    pageSize,
    order
}: UseMessageLoadingProps): UseMessageLoadingReturn => {
    const { toast } = useToast();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    
    // Keep track of the current fetch request
    const abortControllerRef = useRef<AbortController | null>(null);
    const currentRequestIdRef = useRef<number>(0);

    const fetchMessages = useCallback(async () => {
        if (!sessionId) return;

        // Cancel any ongoing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new abort controller
        abortControllerRef.current = new AbortController();
        const requestId = ++currentRequestIdRef.current;
        
        setIsLoading(true);
        try {
            const response = await ConversationInspectorService.getRawMessages({
                sessionId,
                page,
                pageSize,
                order,
                signal: abortControllerRef.current.signal
            });

            // Check if this is still the most recent request
            if (requestId !== currentRequestIdRef.current) {
                return;
            }

            if (response.error) {
                toast(createToastConfig(
                    'error',
                    'Error',
                    response.error
                ));
                setMessages([]);
                setHasMore(false);
                return;
            }

            setMessages(prev => {
                if (page === 1) return response.messages;
                
                // Deduplicate messages using a Map
                const messageMap = new Map<string, Message>();
                
                // Add existing messages
                prev.forEach(msg => messageMap.set(msg.id, msg));
                
                // Add new messages, overwriting duplicates
                response.messages.forEach(msg => messageMap.set(msg.id, msg));
                
                // Convert back to array and sort if needed
                const combinedMessages = Array.from(messageMap.values());
                if (order === 'desc') {
                    combinedMessages.sort((a, b) => 
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    );
                } else {
                    combinedMessages.sort((a, b) => 
                        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    );
                }
                
                return combinedMessages;
            });
            
            setHasMore(response.hasMore);

            // Show success message for first load
            if (page === 1 && response.messages.length > 0) {
                toast(createToastConfig(
                    'success',
                    'Messages Loaded',
                    `Found ${response.messages.length} messages in conversation`
                ));
            }
        } catch (error) {
            // Only show error if it's not an abort error and it's the most recent request
            if (!error.name === 'AbortError' && requestId === currentRequestIdRef.current) {
                toast(createToastConfig(
                    'error',
                    'Error',
                    error instanceof Error ? error.message : 'Failed to load messages'
                ));
                setMessages([]);
                setHasMore(false);
            }
        } finally {
            if (requestId === currentRequestIdRef.current) {
                setIsLoading(false);
                abortControllerRef.current = null;
            }
        }
    }, [sessionId, page, pageSize, order, toast]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Fetch messages when dependencies change
    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    return {
        messages,
        isLoading,
        hasMore,
        fetchMessages
    };
};