import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, ToolChain } from '@/types/conversation-inspector';
import { SelectionRange } from '../types/message.types';
import { ValidationResult } from '../types/validation';
import { validateDeletion } from '@/services/validation-service';
import { 
    isToolMessage, 
    findToolChain, 
    identifyAllToolChains 
} from '../utils/toolChainSelection';

interface UseMessageSelectionProps {
    messages: Message[];
}

interface UseMessageSelectionReturn {
    selectedMessages: Set<string>;
    rangeStart: string | null;
    rangeEnd: string | null;
    ranges: SelectionRange[];
    toolChains: ToolChain[];
    validationResult: ValidationResult | null;
    handleMessageSelection: (messageId: string, isShiftKey: boolean, isCtrlKey: boolean) => void;
    handleToolChainSelection: (messageId: string) => void;
    clearSelection: () => void;
}

interface MessageIndices {
    idToIndex: Map<string, number>;
    indexToId: Map<number, string>;
}

export const useMessageSelection = ({ 
    messages 
}: UseMessageSelectionProps): UseMessageSelectionReturn => {
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
    const [rangeStart, setRangeStart] = useState<string | null>(null);
    const [rangeEnd, setRangeEnd] = useState<string | null>(null);
    const [ranges, setRanges] = useState<SelectionRange[]>([]);
    const [toolChains, setToolChains] = useState<ToolChain[]>([]);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

    // Keep track of message indices for stable selection
    const messageIndicesRef = useRef<MessageIndices>({
        idToIndex: new Map(),
        indexToId: new Map()
    });

    // Update indices and tool chains when messages change
    useEffect(() => {
        const idToIndex = new Map<string, number>();
        const indexToId = new Map<number, string>();
        
        messages.forEach((msg, index) => {
            idToIndex.set(msg.id, index);
            indexToId.set(index, msg.id);
        });

        messageIndicesRef.current = { idToIndex, indexToId };
        
        // Identify tool chains
        const chains = identifyAllToolChains(messages);
        setToolChains(chains);

        // Clean up any selected messages that no longer exist
        setSelectedMessages(prev => {
            const newSet = new Set<string>();
            for (const id of prev) {
                if (idToIndex.has(id)) {
                    newSet.add(id);
                }
            }
            return newSet;
        });
    }, [messages]);

    const getMessageIndex = useCallback((messageId: string): number => {
        return messageIndicesRef.current.idToIndex.get(messageId) ?? -1;
    }, []);

    const getMessageId = useCallback((index: number): string | undefined => {
        return messageIndicesRef.current.indexToId.get(index);
    }, []);

    // Handle tool chain selection when Ctrl+Click on a tool message
    const handleToolChainSelection = useCallback((messageId: string) => {
        // Find all messages in the same tool chain
        const chainMessageIds = findToolChain(messages, messageId);
        
        if (chainMessageIds.length <= 1) {
            // Not part of a chain or just a single message - handle as normal selection
            setSelectedMessages(prev => {
                const next = new Set(prev);
                if (next.has(messageId)) {
                    next.delete(messageId);
                } else {
                    next.add(messageId);
                }
                return next;
            });
            return;
        }
        
        // Check if all messages in chain are already selected
        const allSelected = chainMessageIds.every(id => selectedMessages.has(id));
        
        if (allSelected) {
            // Deselect the whole chain
            setSelectedMessages(prev => {
                const next = new Set(prev);
                chainMessageIds.forEach(id => next.delete(id));
                return next;
            });
        } else {
            // Select the whole chain
            setSelectedMessages(prev => {
                const next = new Set(prev);
                chainMessageIds.forEach(id => next.add(id));
                return next;
            });
        }
        
        // Update ranges (optional - you might want to show this as a special selection)
        const indices = chainMessageIds.map(id => getMessageIndex(id)).sort((a, b) => a - b);
        if (indices.length >= 2) {
            const firstId = getMessageId(indices[0]);
            const lastId = getMessageId(indices[indices.length - 1]);
            
            if (firstId && lastId) {
                // Only add as a range if not deselecting
                if (!allSelected) {
                    const newRange = {
                        start: firstId,
                        end: lastId,
                        messageIds: chainMessageIds
                    };
                    setRanges(prev => [...prev, newRange]);
                    setRangeStart(firstId);
                    setRangeEnd(lastId);
                }
            }
        }
    }, [messages, selectedMessages, getMessageIndex, getMessageId]);

    // Handle message selection with enhanced range support
    const handleMessageSelection = useCallback((messageId: string, isShiftKey: boolean = false, isCtrlKey: boolean = false) => {
        // Check if this is a tool chain selection with ctrl key
        if (isCtrlKey && isToolMessage(messages.find(m => m.id === messageId) as Message)) {
            handleToolChainSelection(messageId);
            return;
        }
        
        if (!isShiftKey) {
            setSelectedMessages(prev => {
                const next = new Set(prev);
                if (next.has(messageId)) {
                    // Deselection
                    next.delete(messageId);
                    // Clear range if this was a range endpoint
                    if (messageId === rangeStart) setRangeStart(null);
                    if (messageId === rangeEnd) setRangeEnd(null);
                    // Remove any ranges containing this message
                    setRanges(prev => prev.filter(r => !r.messageIds.includes(messageId)));
                } else {
                    // Selection
                    next.add(messageId);
                    setRangeStart(messageId);
                    setRangeEnd(null);
                }
                return next;
            });
        } else {
            const messageIndex = getMessageIndex(messageId);
            const lastSelectedIndex = rangeStart ? getMessageIndex(rangeStart) : -1;

            if (lastSelectedIndex === -1 || messageIndex === -1) {
                setSelectedMessages(prev => new Set([...prev, messageId]));
                setRangeStart(messageId);
                return;
            }

            // Determine range boundaries
            const start = Math.min(lastSelectedIndex, messageIndex);
            const end = Math.max(lastSelectedIndex, messageIndex);
            
            // Collect range message IDs
            const rangeIds: string[] = [];
            for (let i = start; i <= end; i++) {
                const id = getMessageId(i);
                if (id) rangeIds.push(id);
            }

            // Check if we're clicking within an existing selected range
            const isInExistingRange = rangeIds.every(id => selectedMessages.has(id));

            if (isInExistingRange) {
                // Deselect the range
                setSelectedMessages(prev => {
                    const next = new Set(prev);
                    rangeIds.forEach(id => next.delete(id));
                    return next;
                });
                if (messageId === rangeStart || messageId === rangeEnd) {
                    setRangeStart(null);
                    setRangeEnd(null);
                }
                setRanges(prev => prev.filter(r => !rangeIds.includes(r.start)));
            } else {
                // Select the range
                setSelectedMessages(prev => {
                    const next = new Set(prev);
                    rangeIds.forEach(id => next.add(id));
                    return next;
                });
                setRangeEnd(messageId);
                
                // Add new range
                const firstId = getMessageId(start);
                const lastId = getMessageId(end);
                if (firstId && lastId) {
                    const newRange = {
                        start: firstId,
                        end: lastId,
                        messageIds: rangeIds
                    };
                    setRanges(prev => [...prev, newRange]);
                }
            }
        }
    }, [getMessageId, getMessageIndex, rangeStart, selectedMessages, messages, handleToolChainSelection]);

    // Validate selections whenever they change
    useEffect(() => {
        if (selectedMessages.size > 0) {
            const result = validateDeletion(messages, selectedMessages);
            setValidationResult(result);
        } else {
            setValidationResult(null);
        }
    }, [messages, selectedMessages]);

    const clearSelection = useCallback(() => {
        setSelectedMessages(new Set());
        setRangeStart(null);
        setRangeEnd(null);
        setRanges([]);
    }, []);

    return {
        selectedMessages,
        rangeStart,
        rangeEnd,
        ranges,
        toolChains,
        validationResult,
        handleMessageSelection,
        handleToolChainSelection,
        clearSelection
    };
};