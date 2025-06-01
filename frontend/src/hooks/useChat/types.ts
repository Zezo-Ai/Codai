export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageType = 'text' | 'error' | 'code' | 'html' | 'screenshot' | 'file' | 'web_search' | 'web_fetch' | 'thinking' | 'redacted_thinking'

export type MessageMetadata = {
  category?: string
  sessionId?: string
  timestamp?: string
  [key: string]: unknown
}

export type MessageSegment = {
  type: MessageType
  content: string
  id: string
  metadata?: MessageMetadata
}

export type Message = {
  role: MessageRole
  segments: MessageSegment[]
  timestamp: string
  isThinking?: boolean
  metadata?: MessageMetadata
}

export type TokenInfo = {
  tokenCount: number
  maxContextTokens: number
  needsSummary: boolean
  thresholdPercentage: number
}

export type ChatMetadata = {
  sessionId: string
  category: string
  lastAccessed?: string
  lastModified?: string
  messageCount?: number
  syncStatus?: 'pending' | 'synced' | 'failed'
  [key: string]: unknown
}

export type ChatState = {
  messages: Message[]
  isProcessing: boolean
  error: string | null
  metadata?: ChatMetadata
  tokenInfo?: TokenInfo
}

export type ChatStreamDelta = {
  content?: string
  type?: 'text' | 'screenshot' | 'file' | 'error'
  metadata?: MessageMetadata
  role?: MessageRole
}

export type ChatStreamResponse = {
  type?: string;
  role?: MessageRole;
  choices?: [{
    delta?: ChatStreamDelta
  }]
  preparation?: {
    tokenCount: number
    needsSummary: boolean
  }
  messages?: any[];
  // Token info fields come directly in the message
  token_count?: number;
  max_context_tokens?: number;
  needs_summary?: boolean;
  threshold_percentage?: number;
}

export type ChatConfig = {
  retryLimit: number
  retryDelay: number
  streamTimeout: number
  maxMessageLength: number
}