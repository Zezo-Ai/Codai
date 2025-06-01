import { Message, ValidationResult, ValidationError, ToolChain } from '@/types/conversation-inspector';

/**
 * Identifies tool chains in a conversation
 */
function identifyToolChains(messages: Message[]): ToolChain[] {
    const toolChains: ToolChain[] = [];
    let currentToolUse: Message | null = null;
    
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        
        // Check for tool use
        if (message.content.some(c => c.type === 'tool_use')) {
            currentToolUse = message;
            continue;
        }
        
        // Check for tool result that belongs to current tool use
        if (currentToolUse && message.content.some(c => c.type === 'tool_result')) {
            const toolChainId = `tc-${currentToolUse.id}-${message.id}`;
            
            // Get all messages between tool use and result
            const startIndex = messages.findIndex(m => m.id === currentToolUse!.id);
            const endIndex = i;
            const relatedMessages = messages.slice(startIndex, endIndex + 1);
            
            toolChains.push({
                id: toolChainId,
                toolUseMessageId: currentToolUse.id,
                resultMessageId: message.id,
                relatedMessageIds: relatedMessages.map(m => m.id)
            });
            
            currentToolUse = null;
        }
    }
    
    return toolChains;
}

/**
 * Validates message pairs to ensure no adjacent same-role messages after deletion
 */
function validateMessagePairs(
    messages: Message[], 
    selectedForDelete: Set<string>
): ValidationError[] {
    const remainingMessages = messages.filter(m => !selectedForDelete.has(m.id));
    const errors: ValidationError[] = [];

    for (let i = 0; i < remainingMessages.length - 1; i++) {
        const current = remainingMessages[i];
        const next = remainingMessages[i + 1];

        if (current.role === next.role) {
            errors.push({
                type: 'ADJACENT_MESSAGES',
                messageIds: [current.id, next.id],
                description: `Cannot have two ${current.role} messages in sequence`,
                details: {
                    expectedRole: current.role === 'user' ? 'assistant' : 'user',
                    actualRole: next.role
                }
            });
        }
    }

    return errors;
}

/**
 * Validates tool chains to ensure they remain complete
 */
function validateToolChains(
    messages: Message[], 
    selectedForDelete: Set<string>
): ValidationError[] {
    const toolChains = identifyToolChains(messages);
    const errors: ValidationError[] = [];

    toolChains.forEach(chain => {
        const isPartiallySelected = chain.relatedMessageIds.some(
            id => selectedForDelete.has(id)
        ) && !chain.relatedMessageIds.every(
            id => selectedForDelete.has(id)
        );

        if (isPartiallySelected) {
            errors.push({
                type: 'BROKEN_TOOL_CHAIN',
                messageIds: chain.relatedMessageIds,
                description: 'Cannot partially delete a tool chain. Select all related messages or none.',
                details: {
                    toolChainId: chain.id
                }
            });
        }
    });

    return errors;
}

/**
 * Validates message deletion to ensure conversation integrity
 */
export function validateDeletion(
    messages: Message[], 
    selectedForDelete: Set<string>
): ValidationResult {
    // Skip validation if nothing selected
    if (selectedForDelete.size === 0) {
        return {
            isValid: true,
            invalidSelections: [],
            errors: []
        };
    }

    const pairErrors = validateMessagePairs(messages, selectedForDelete);
    const chainErrors = validateToolChains(messages, selectedForDelete);
    const allErrors = [...pairErrors, ...chainErrors];

    // Get unique message IDs from all errors
    const invalidSelections = Array.from(new Set(
        allErrors.flatMap(e => e.messageIds)
    ));

    return {
        isValid: allErrors.length === 0,
        invalidSelections,
        errors: allErrors
    };
}

/**
 * Processes messages to add validation state
 */
export function processMessagesWithValidation(
    messages: Message[],
    validationResult: ValidationResult | null
): Message[] {
    if (!validationResult || validationResult.isValid) {
        return messages;
    }

    return messages.map(message => ({
        ...message,
        isInvalid: validationResult.invalidSelections.includes(message.id),
        validationErrors: validationResult.errors
            .filter(e => e.messageIds.includes(message.id))
            .map(e => e.description)
    }));
}