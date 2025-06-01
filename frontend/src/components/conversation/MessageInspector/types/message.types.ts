import { Message } from '@/types/conversation-inspector';

export interface MessageWithValidation extends Message {
    isSelected: boolean;
    isRangeStart: boolean;
    isRangeEnd: boolean;
    isInRange: boolean;
    isInvalid?: boolean;
    validationErrors?: string[];
    isTool?: boolean;
    toolChainId?: string | null;
}

export interface SelectionRange {
    start: string;
    end: string;
    messageIds: string[];
}

export interface ToolResultItem {
    type: string;
    text?: string;
    content?: string;
    source?: {
        type?: string;
        data?: string;
    };
}

export interface MessageContentBlock {
    type: 'text' | 'code' | 'tool_use' | 'tool_result';
    text?: string;
    language?: string;
    content?: ToolResultItem[];
    source?: {
        type?: string;
        data?: string;
    };
    tool_use_id?: string;
    is_error?: boolean;
}