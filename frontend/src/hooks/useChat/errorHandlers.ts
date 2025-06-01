'use client'

import { APIError } from '@/lib/api'
import type { Message, ChatMetadata } from './types'
import { createMessage } from './state'

export type ErrorHandlerDependencies = {
  reportError: (error: Error, context?: unknown, metadata?: Record<string, unknown>) => void
  recoverUnsaved: (sessionId: string) => Promise<Message[]>
}

export type ErrorResponse = {
  errorMessage: string
  errorCode: string
  errorMsg: Message
  recoveredMessages: Message[]
}

export class ErrorHandler {
  private deps: ErrorHandlerDependencies
  private metadata: ChatMetadata | undefined
  private readonly DEFAULT_ERROR = {
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR'
  }

  constructor(deps: ErrorHandlerDependencies, metadata?: ChatMetadata) {
    this.deps = deps
    this.metadata = metadata
  }

  private async recoverMessages(): Promise<Message[]> {
    if (!this.metadata?.sessionId) return []
    
    try {
      return await this.deps.recoverUnsaved(this.metadata.sessionId)
    } catch (error) {
      console.error('Failed to recover messages:', error)
      return []
    }
  }

  private classifyError(error: unknown): { message: string; code: string } {
    if (error instanceof APIError) {
      return {
        message: error.message,
        code: error.code || this.DEFAULT_ERROR.code
      }
    }

    // Handle overloaded error specifically
    if (typeof error === 'object' && error !== null) {
      const err = error as any;
      if (err.type === 'error' && err.error?.type === 'overloaded_error') {
        return {
          message: 'The system is currently overloaded. Please try again in a few moments.',
          code: 'OVERLOADED_ERROR'
        }
      }
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        code: 'ERROR'
      }
    }

    if (typeof error === 'string') {
      return {
        message: error,
        code: 'STRING_ERROR'
      }
    }

    return this.DEFAULT_ERROR
  }

  private createErrorMetadata(errorCode: string) {
    return {
      componentName: 'ChatHook',
      sessionId: this.metadata?.sessionId,
      category: this.metadata?.category,
      errorCode,
      timestamp: new Date().toISOString()
    }
  }

  async handleError(error: unknown): Promise<ErrorResponse> {
    const { message: errorMessage, code: errorCode } = this.classifyError(error)

    // Create error message
    const errorMsg = createMessage('system', errorMessage, 'error', this.metadata)

    // Report error
    this.deps.reportError(
      error instanceof Error ? error : new Error(errorMessage),
      undefined,
      this.createErrorMetadata(errorCode)
    )

    // Recover messages
    const recoveredMessages = await this.recoverMessages()

    return {
      errorMessage,
      errorCode,
      errorMsg,
      recoveredMessages
    }
  }

  async handleStreamError(error: unknown): Promise<ErrorResponse> {
    const response = await this.handleError(error)
    
    // Additional stream-specific error handling
    if (response.errorCode === 'STREAM_ERROR') {
      // Handle stream-specific recovery
    }

    // Handle overloaded errors differently - suggest retry with backoff
    if (response.errorCode === 'OVERLOADED_ERROR') {
      return {
        ...response,
        errorMessage: 'The system is currently overloaded. Please wait a moment before trying again.',
        errorMsg: createMessage(
          'system',
          'The system is currently experiencing high load. Your request will be automatically retried in a few moments.',
          'error',
          this.metadata
        )
      }
    }

    return response
  }

  async handleNetworkError(error: unknown): Promise<ErrorResponse> {
    const response = await this.handleError(error)
    
    // Additional network-specific error handling
    if (response.errorCode === 'NETWORK_ERROR') {
      // Handle network-specific recovery
    }

    return response
  }
}