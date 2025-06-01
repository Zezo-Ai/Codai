import { Message, ToolChain } from '@/types/conversation-inspector';
import { MessageWithValidation } from '../types/message.types';
import { validateDeletion } from '@/services/validation-service';
import { isToolMessage, getToolChainForMessage } from './toolChainSelection';

interface ProcessMessagesOptions {
    messages: Message[];
    selectedMessages: Set<string>;
    rangeStart: string | null;
    rangeEnd: string | null;
    ranges: Array<{
        start: string;
        end: string;
        messageIds: string[];
    }>;
    toolChains?: ToolChain[];
}

export const processMessages = ({
    messages,
    selectedMessages,
    rangeStart,
    rangeEnd,
    ranges,
    toolChains = []
}: ProcessMessagesOptions): MessageWithValidation[] => {
    // Get validation result if there are selections
    const validationResult = selectedMessages.size > 0 
        ? validateDeletion(messages, selectedMessages)
        : null;

    return messages.map(message => {
        const isSelected = selectedMessages.has(message.id);
        const isRangeStart = message.id === rangeStart;
        const isRangeEnd = message.id === rangeEnd;
        const isInRange = ranges.some(range => 
            range.messageIds.includes(message.id) && 
            message.id !== range.start && 
            message.id !== range.end
        );
        
        // Get tool chain information
        const isTool = isToolMessage(message);
        const toolChain = isTool ? getToolChainForMessage(message, toolChains) : null;
        const toolChainId = toolChain?.id || null;

        // Check validation errors for this message
        const messageValidationErrors = validationResult?.errors
            .filter(error => error.messageIds.includes(message.id))
            .map(error => error.description);

        return {
            ...message,
            isSelected,
            isRangeStart,
            isRangeEnd,
            isInRange,
            isInvalid: messageValidationErrors?.length > 0,
            validationErrors: messageValidationErrors,
            isTool,
            toolChainId
        };
    });
};

export const getMessageValidationStatus = (
    messageId: string,
    validationResult: any | null
): { isInvalid: boolean; errors: string[] } => {
    if (!validationResult || !validationResult.errors) {
        return { isInvalid: false, errors: [] };
    }

    const errors = validationResult.errors
        .filter(error => error.messageIds.includes(messageId))
        .map(error => error.description);

    return {
        isInvalid: errors.length > 0,
        errors
    };
};