export interface Message {
    id: string;
    role: string;
    content: Array<{
        type: string;
        text?: string;
        language?: string;
        source?: Record<string, any>;
    }>;
    timestamp: string;
    metadata: Record<string, any>;
}

export type ValidationErrorType = 'ADJACENT_MESSAGES' | 'BROKEN_TOOL_CHAIN';

export interface ValidationError {
    type: ValidationErrorType;
    messageIds: string[];
    description: string;
    details?: {
        expectedRole?: string;
        actualRole?: string;
        toolChainId?: string;
    };
}

export interface ValidationResult {
    isValid: boolean;
    invalidSelections: string[];
    errors: ValidationError[];
}

export interface ToolChain {
    id: string;
    toolUseMessageId: string;
    resultMessageId: string;
    relatedMessageIds: string[];
}

export interface MessageWithSelection extends Message {
    isSelected: boolean;
    isRangeStart: boolean;
    isRangeEnd: boolean;
    isInRange: boolean;
    isInvalid?: boolean;
    validationErrors?: string[];
    toolChainId?: string;
}

export interface SelectionRange {
    start: string;
    end: string;
    messageIds: string[];
}

export interface DeleteRequest {
    session_id: string;
    message_ids: string[];
}

export interface DeleteResponse {
    success: boolean;
    deleted_count: number;
    errors?: string[];
}

export interface GetMessagesParams {
    sessionId: string;
    page: number;
    pageSize: number;
    order: 'asc' | 'desc';
}

export interface GetMessagesResponse {
    messages: Message[];
    total: number;
    page: number;
    hasMore: boolean;
    error?: string;
}

export interface SummarizeRequest {
    session_id: string;
    message_ids: string[];
}

export interface SummarizeResponse {
    success: boolean;
    summary_pair?: Message[];
    error?: string;
    metadata?: {
        original_count: number;
        original_tokens: number;
        summary_tokens: number;
        compression_ratio: number;
        insertion_index: number;
    };
}

export interface ExportData {
    version: string;
    exported_at: string;
    messages: Message[];
}

export interface ExportResponse {
    success: boolean;
    data?: ExportData;
    error?: string;
    metadata?: {
        exported_at: string;
        message_count: number;
    };
}

export interface ImportResponse {
    success: boolean;
    session_id: string;
    error?: string;
    metadata?: {
        imported_at: string;
        imported_messages: number;
    };
}