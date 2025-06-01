import { Message, ToolChain } from '@/types/conversation-inspector';

/**
 * Identifies tool-related content blocks in a message
 */
export function isToolMessage(message: Message): boolean {
    return message.content.some(block => 
        block.type === 'tool_use' || 
        block.type === 'tool_result'
    );
}

/**
 * Get tool chain type for a message: 'tool_use', 'tool_result', or null if not a tool message
 */
export function getToolMessageType(message: Message): 'tool_use' | 'tool_result' | null {
    if (message.content.some(block => block.type === 'tool_use')) {
        return 'tool_use';
    }
    if (message.content.some(block => block.type === 'tool_result')) {
        return 'tool_result';
    }
    return null;
}

/**
 * Find all connected tool messages in a chain
 * 
 * @param messages All messages in the conversation
 * @param startMessageId ID of the message to start the chain from
 * @returns Array of message IDs that form the tool chain
 */
export function findToolChain(messages: Message[], startMessageId: string): string[] {
    // Find the starting message
    const startIndex = messages.findIndex(m => m.id === startMessageId);
    if (startIndex === -1) return [];
    
    const startMessage = messages[startIndex];
    
    // If this isn't a tool message, return only this message
    if (!isToolMessage(startMessage)) {
        return [startMessageId];
    }
    
    // Initialize chain with the starting message
    const chainMessageIds = new Set<string>([startMessageId]);
    
    // Find boundary on both sides (forward and backward)
    
    // Search forward
    let currentIndex = startIndex;
    while (++currentIndex < messages.length) {
        const currentMessage = messages[currentIndex];
        if (!isToolMessage(currentMessage)) {
            break;
        }
        chainMessageIds.add(currentMessage.id);
    }
    
    // Search backward
    currentIndex = startIndex;
    while (--currentIndex >= 0) {
        const currentMessage = messages[currentIndex];
        if (!isToolMessage(currentMessage)) {
            break;
        }
        chainMessageIds.add(currentMessage.id);
    }
    
    return Array.from(chainMessageIds);
}

/**
 * Find and group messages into tool chains
 */
export function identifyAllToolChains(messages: Message[]): ToolChain[] {
    const toolChains: ToolChain[] = [];
    const processedMessages = new Set<string>();
    
    // Process each message
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        
        // Skip if already processed or not a tool message
        if (processedMessages.has(message.id) || !isToolMessage(message)) {
            continue;
        }
        
        // Find the full chain for this message
        const chainMessageIds = findToolChain(messages, message.id);
        
        // Mark all as processed
        chainMessageIds.forEach(id => processedMessages.add(id));
        
        // Create a chain ID based on first and last message
        const firstId = chainMessageIds[0];
        const lastId = chainMessageIds[chainMessageIds.length - 1];
        const chainId = `chain-${firstId}-${lastId}`;
        
        // Get the tool use and result messages if they exist
        const toolUseMessage = messages.find(m => 
            chainMessageIds.includes(m.id) && 
            getToolMessageType(m) === 'tool_use'
        );
        
        const toolResultMessage = messages.find(m => 
            chainMessageIds.includes(m.id) && 
            getToolMessageType(m) === 'tool_result'
        );
        
        toolChains.push({
            id: chainId,
            toolUseMessageId: toolUseMessage?.id || '',
            resultMessageId: toolResultMessage?.id || '',
            relatedMessageIds: chainMessageIds
        });
    }
    
    return toolChains;
}

/**
 * Check if a message is part of a tool chain
 */
export function isInToolChain(message: Message, toolChains: ToolChain[]): boolean {
    return toolChains.some(chain => 
        chain.relatedMessageIds.includes(message.id)
    );
}

/**
 * Find the tool chain that contains a specific message
 */
export function getToolChainForMessage(message: Message, toolChains: ToolChain[]): ToolChain | null {
    return toolChains.find(chain => 
        chain.relatedMessageIds.includes(message.id)
    ) || null;
}

/**
 * Return all messages that are in the same tool chain
 */
export function getRelatedToolChainMessages(
    messageId: string, 
    messages: Message[], 
    toolChains: ToolChain[]
): Message[] {
    const chain = toolChains.find(chain => 
        chain.relatedMessageIds.includes(messageId)
    );
    
    if (!chain) {
        return [];
    }
    
    return messages.filter(m => 
        chain.relatedMessageIds.includes(m.id)
    );
}