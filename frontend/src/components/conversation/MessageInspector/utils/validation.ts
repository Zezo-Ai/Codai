import { Message } from '@/types/conversation-inspector';
import { MessageContentBlock } from '../types/message.types';

export const isToolChainComplete = (
    messages: Message[],
    selectedMessages: Set<string>
): boolean => {
    const toolUseIds = new Set<string>();
    const selectedToolUseIds = new Set<string>();

    // First pass: collect all tool use IDs
    messages.forEach(message => {
        message.content.forEach(block => {
            if (block.type === 'tool_use' && block.tool_use_id) {
                toolUseIds.add(block.tool_use_id);
            }
            if (block.type === 'tool_result' && block.tool_use_id) {
                toolUseIds.add(block.tool_use_id);
            }
        });
    });

    // Second pass: check selected messages' tool IDs
    messages.forEach(message => {
        if (selectedMessages.has(message.id)) {
            message.content.forEach(block => {
                if ((block.type === 'tool_use' || block.type === 'tool_result') 
                    && block.tool_use_id) {
                    selectedToolUseIds.add(block.tool_use_id);
                }
            });
        }
    });

    // For each selected tool ID, check if all related messages are selected
    for (const toolId of selectedToolUseIds) {
        let hasAllRelated = true;
        for (const message of messages) {
            const hasRelatedTool = message.content.some(block => 
                (block.type === 'tool_use' || block.type === 'tool_result') &&
                block.tool_use_id === toolId
            );
            if (hasRelatedTool && !selectedMessages.has(message.id)) {
                hasAllRelated = false;
                break;
            }
        }
        if (!hasAllRelated) return false;
    }

    return true;
};

export const validateToolChains = (
    messages: Message[],
    selectedMessages: Set<string>
): { isValid: boolean; errors: Array<{ messageId: string; error: string }> } => {
    const errors: Array<{ messageId: string; error: string }> = [];
    
    if (!isToolChainComplete(messages, selectedMessages)) {
        selectedMessages.forEach(messageId => {
            const message = messages.find(m => m.id === messageId);
            if (!message) return;

            const hasToolContent = message.content.some(block => 
                block.type === 'tool_use' || block.type === 'tool_result'
            );

            if (hasToolContent) {
                errors.push({
                    messageId,
                    error: 'This message is part of a tool chain. The entire chain must be selected.'
                });
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

export const hasCodeContent = (content: MessageContentBlock[]): boolean => {
    return content.some(block => 
        block.type === 'code' || 
        (block.type === 'tool_result' && block.content?.some((item: any) => item.type === 'code'))
    );
};

export const hasToolContent = (content: MessageContentBlock[]): boolean => {
    return content.some(block => 
        block.type === 'tool_use' || 
        block.type === 'tool_result'
    );
};