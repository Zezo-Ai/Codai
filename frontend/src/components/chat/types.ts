export type MessageRole = 'user' | 'assistant' | 'system'

export interface CodeFeatures {
    supports_highlighting: boolean
    has_formatter: boolean
    supports_linting: boolean
    documentation_url?: string
    common_extensions?: string[]
    frameworks?: string[]
}

export interface CodeMetadata {
    language: string
    display_name: string
    features: CodeFeatures
    extension?: string
    is_code: boolean
    has_features: boolean
    original_length: number
    processed_length: number
    was_wrapped: boolean
    has_line_numbers: boolean
}

export interface FileStats {
    size: number
    modified: number
    created: number
    content: {
        estimated_length: number
        encoding: string
        was_truncated: boolean
        original_length: number
        current_length: number
    }
    limits: {
        max_file_size: number
        max_content_length: number
    }
}

export interface MessageMetadata {
    category?: string
    sessionId?: string
    timestamp?: string
    path?: string
    type?: 'file' | 'code' | 'text'
    lines?: Array<{
        number: number
        content: string
        highlighted: boolean
    }>
    code?: CodeMetadata
    stats?: FileStats
    requires_chunking?: boolean
    cli_output?: string
}

export interface ImageSource {
    type: 'base64'
    media_type?: string
    data: string
}

export interface ImageData {
    type: 'base64'
    data: string
}

export interface ImageContent {
    image: ImageData
}

declare global {
    interface Window {
        _screenshotData?: string;
    }
}

export interface WebSearchResult {
    title: string;
    content: string;
    url: string;
}

export interface WebSearchMetadata {
    query: string;
    engine: string;
    num_results: number;
    results: WebSearchResult[];
    errors?: string[];
    hasMultipleSearches?: boolean;
    otherQueries?: string[];
}

export interface WebFetchMetadata {
    url: string;
    title: string;
    extract_mode: string;
    selector?: string;
    length: number;
    truncated: boolean;
}

// Extended thinking types
export interface ThinkingMetadata {
    signature?: string
    budget_tokens?: number
    prefix?: string
    complexity?: 'simple' | 'standard' | 'complex' | 'very_complex'
    token_budget?: number
    thinking_enabled?: boolean  
}

export interface MessageSegment {
    type: 'text' | 'code' | 'screenshot' | 'error' | 'file' | 'web_search' | 'web_fetch' | 'thinking' | 'redacted_thinking' | 'html'
    content?: string
    id?: string
    metadata?: MessageMetadata | WebSearchMetadata | WebFetchMetadata | ThinkingMetadata
    // Screenshot-specific fields
    screenshot_start?: boolean
    screenshot_chunk?: string
    screenshot_end?: boolean
    // Extended thinking fields
    thinking?: string
    signature?: string
    data?: string  // For redacted_thinking
}

export interface Message {
    role: MessageRole
    segments: MessageSegment[]
    timestamp: string
    isThinking?: boolean
    metadata?: MessageMetadata
    stateHtml?: string  // Add stateHtml field to store state machine's HTML output
}

export interface TokenInfo {
    tokenCount: number;
    maxContextTokens: number;
    needsSummary: boolean;
    thresholdPercentage: number;
}

export interface ChatState {
    messages: Message[]
    isProcessing: boolean
    error: string | null
    metadata?: {
        sessionId: string
        category: string
    }
    tokenInfo?: TokenInfo
}

export interface ChatMessageProps {
    role: MessageRole
    segments: MessageSegment[]
    timestamp?: string
    isThinking?: boolean
    onRetry?: () => void
    onCopy?: (content: string) => void
    isLoading?: boolean
}

export interface ChatInputProps {
    onSend: (message: string) => void
    onStop: () => void
    isProcessing: boolean
    disabled?: boolean
    placeholder?: string
    maxLength?: number;
    tokenInfo?: TokenInfo;
}

export interface FormatterProps {
    content: string
    metadata?: MessageMetadata
    isLoading?: boolean
}

export interface CodeBlockProps extends FormatterProps {
    onCopy?: (content: string) => void
}

export interface FileViewProps extends FormatterProps {
    onCopy?: (content: string) => void
}

export interface WebSearchBlockProps {
    content: string;
    metadata?: WebSearchMetadata;
    onCopy?: (content: string) => void;
    isLoading?: boolean;
}

export interface ActionBlockProps extends FormatterProps {
    action?: ActionType | CommandType | OperationType
}

export type ActionType = 
    | 'key'
    | 'type'
    | 'mouse_move'
    | 'left_click'
    | 'right_click'
    | 'middle_click'
    | 'double_click'
    | 'left_click_drag'
    | 'screenshot'
    | 'cursor_position'
    | 'web_search'  // Added for web search formatting
    | 'web_fetch'   // Added for web fetch formatting

export type CommandType = 'view' | 'edit' | 'create' | 'delete' | 'execute'

export type OperationType = 'create' | 'delete' | 'move' | 'copy' | 'rename'

export interface ActionObject {
    action?: ActionType
    command?: CommandType
    operation?: OperationType
    text?: string
    path?: string
    coordinate?: [number, number]
    create_parents?: boolean
    // Web search specific
    query?: string
    engine?: string
    results?: any[] | string
    // Common metadata
    metadata?: {
        timestamp?: string
        duration?: number
        success?: boolean
    }
}