'use client'

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { useError } from '@/components/error/ErrorProvider'
import { useRecovery } from '@/lib/recovery'
import { api } from '@/lib/api'
import { storage } from '@/lib/storage'
import type { Message } from './useChat/types'
import { useInitialState, createMessage, createThinkingMessage } from './useChat/state'
import { StreamProcessor } from './useChat/streamHandlers'
import { ErrorHandler } from './useChat/errorHandlers'
import { useSessionPersistence } from './useChat/sessionHandlers'
import { useAiMode, useAiModeListener } from './useAiMode'
import { isExpertModeEnabled } from '@/lib/expertMode'



export function useChat() {
  const [state, setState] = useInitialState()
  // Token info comes from conversation response
  const { reportError } = useError()
  const { handleMessageFailure, recoverUnsaved } = useRecovery()
  const { currentModel } = useAiMode()
  
  // Use a ref to track the current model so sendMessage always uses the latest value
  const currentModelRef = useRef(currentModel)
  
  // Update ref synchronously when local currentModel changes
  useLayoutEffect(() => {
    currentModelRef.current = currentModel
  }, [currentModel])
  
  // Listen for AI mode changes from other components
  useAiModeListener(useCallback((mode, model) => {
    currentModelRef.current = model
  }, []))
  
  // Create refs for stream handling and UI state
  const streamProcessorRef = useRef<StreamProcessor | null>(null)
  const [pendingChunk, setPendingChunk] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  
  // Rate limiting for state updates to prevent too many React renders
  const lastUpdateTimeRef = useRef(0)
  const pendingStateUpdateRef = useRef<any>(null)
  const updateThrottleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Throttled state update function to reduce render frequency during fast streaming
  const throttledStateUpdate = useCallback((updateFn: (prev: any) => any) => {
    // Store the latest update function
    pendingStateUpdateRef.current = updateFn;
    
    // Check if we need to throttle
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    const MIN_UPDATE_INTERVAL = 100; // ms between updates (10 fps is plenty for chat)
    
    // If we have a pending timeout, let it execute
    if (updateThrottleTimeoutRef.current) {
      return;
    }
    
    // If enough time has passed, update immediately
    if (timeSinceLastUpdate >= MIN_UPDATE_INTERVAL) {
      setState(pendingStateUpdateRef.current);
      lastUpdateTimeRef.current = now;
      pendingStateUpdateRef.current = null;
      return;
    }
    
    // Otherwise, schedule an update for later
    updateThrottleTimeoutRef.current = setTimeout(() => {
      if (pendingStateUpdateRef.current) {
        setState(pendingStateUpdateRef.current);
        lastUpdateTimeRef.current = Date.now();
        pendingStateUpdateRef.current = null;
      }
      updateThrottleTimeoutRef.current = null;
    }, MIN_UPDATE_INTERVAL - timeSinceLastUpdate);
  }, [setState]);
  
  // Initialize StreamProcessor with handlers if not exists
  if (!streamProcessorRef.current) {
    streamProcessorRef.current = new StreamProcessor({
      updateState: setState,
      handleError: async (error) => {
        const errorHandler = new ErrorHandler(
          { reportError, recoverUnsaved },
          state.metadata
        )
        const { errorMessage, errorMsg, recoveredMessages } = await errorHandler.handleStreamError(error)
        setState(prev => ({
          ...prev,
          isProcessing: false,
          error: errorMessage,
          messages: [...prev.messages, errorMsg, ...recoveredMessages]
        }))
      },
      // State events
      onStreamStart: () => {
        // We'll handle thinking state here
      },
      onStreamEnd: () => {
        setState(prev => {
          const lastMessageIndex = prev.messages.length - 1;
          if (lastMessageIndex < 0) return prev;
          
          return {
            ...prev,
            messages: prev.messages.map((m, idx) => 
              idx === lastMessageIndex
                ? { ...m, isComplete: true }
                : m
            ),
            // Preserve thinking state when stream ends
            // Just mark as complete but keep the content
            thinkingState: prev.thinkingState === 'active' ? 'complete' : prev.thinkingState,
            // Keep thinkingContent, thinkingSignature, and thinkingStatus
          };
        });
      },
      // Add optimized handler for chunk processing
      onChunkProcessed: (processedChunk, pending) => {
        // Use a debounced state update approach for better performance
        setPendingChunk(null) // Clear any pending chunk
        setPendingCount(pending) // Update pending count
        
        // Update the response bubble with the raw state HTML
        if (streamProcessorRef.current) {
          // Get the new HTML state
          const stateHtml = streamProcessorRef.current.getStateHtml();
          
          // Create a unique ID for this chat segment if needed
          const segmentId = crypto.randomUUID();
          
          // Update the last message with the state HTML directly using throttled updates
          throttledStateUpdate(prev => {
            const lastMessageIndex = prev.messages.length - 1;
            if (lastMessageIndex < 0) return prev;
            
            // Get the last message
            const lastMessage = prev.messages[lastMessageIndex];
            
            // Check if HTML has changed to avoid unnecessary updates
            if (lastMessage.stateHtml === stateHtml) {
              return prev; // No change, skip update
            }
            
            // Create updated messages array with new message at the end
            const updatedMessages = [...prev.messages];
            updatedMessages[lastMessageIndex] = {
              ...lastMessage,
              stateHtml: stateHtml,
              segments: [{
                type: 'html',
                content: '',
                id: lastMessage.segments?.[0]?.id || segmentId
              }]
            };
            
            return {
              ...prev,
              messages: updatedMessages
            };
          });
        }
      },
      onWaitingApproval: (chunk) => {
        setPendingChunk(chunk) // Set pending chunk for UI
      },
      // Add handler for token updates
      onTokenUpdate: (tokenInfo) => {
        // Update state with token information
        setState(prev => ({
          ...prev,
          tokenInfo: {
            token_count: tokenInfo.count,
            max_context_tokens: tokenInfo.max,
            needs_summary: tokenInfo.needsSummary,
            current_percentage: tokenInfo.currentPercentage,  // Match camelCase from streamHandlers
            config_threshold: tokenInfo.configThreshold  // Added new field
          }
        }))
      }
    })
  }

  // Setup session persistence
  useSessionPersistence(state.messages, state.metadata, { reportError })
  
  // We don't need to load thinking state from storage in useChat anymore
  // All thinking state loading is now handled by individual message components
  
  // We also don't need to save thinking state here
  // All thinking state saving is now handled by individual message components
  
  // Clean up throttle timeout on unmount
  useEffect(() => {
    return () => {
      if (updateThrottleTimeoutRef.current) {
        clearTimeout(updateThrottleTimeoutRef.current);
        updateThrottleTimeoutRef.current = null;
      }
    };
  }, []);

  const stopChat = async () => {
    if (!state.isProcessing) return
    
    try {
      // First update - mark processing as stopped but preserve thinking
      setState(prev => ({ 
        ...prev, 
        isProcessing: false,
        // Ensure thinking state is marked as complete when stopping
        thinkingState: prev.thinkingState === 'active' ? 'complete' : prev.thinkingState,
      }))
      
      // Cancel the stream but PRESERVE thinking state
      await streamProcessorRef.current?.cancelStream()
      
      // Reset stream processor but preserve thinking state (true = preserve thinking)
      resetStreamProcessor(true)
      
      // Add system message
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, createMessage('system', 'Operation stopped by user.', 'text', state.metadata)]
      }))
    } catch (error) {
      const errorHandler = new ErrorHandler(
        { reportError, recoverUnsaved },
        state.metadata
      )
      const { errorMessage, errorMsg, recoveredMessages } = await errorHandler.handleError(error)
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage,
        messages: [...prev.messages, errorMsg, ...recoveredMessages]
      }))
    }
  }

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    if (!content?.trim() || state.isProcessing) return

    // Get the CURRENT model from ref (not captured in closure)
    const latestModel = currentModelRef.current

    // Clear thinking state in storage for this session
    if (state.metadata?.sessionId) {
      storage.clearAllThinkingStatesForSession(state.metadata.sessionId);
    }

    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      error: null,
      // Reset thinking state for new conversation
      thinkingState: null,
      thinkingContent: '',
      thinkingSignature: '',
      thinkingStatus: ''
    }))
    streamProcessorRef.current?.resetState()

    // Token info will be updated from conversation response

    try {
      const userMessage = createMessage('user', content, 'text', state.metadata)
      // Update with user message
      const updatedWithUser = [...state.messages, userMessage];
      setState(prev => ({
        ...prev,
        messages: updatedWithUser
      }));
      
      // Create a thinking message explicitly with assistant role
      const thinkingMessage = createThinkingMessage(state.metadata);
      thinkingMessage.role = 'assistant'; // Force role to be assistant
      
      const updatedWithThinking = [...updatedWithUser, thinkingMessage];
      setState(prev => ({
        ...prev,
        messages: updatedWithThinking
      }));

      // Immediately inject expert mode preparation status if enabled
      if (isExpertModeEnabled() && streamProcessorRef.current) {
        // Simulate the expert mode status chunk
        const expertModeChunk = 'data: ' + JSON.stringify({
          type: 'expert_mode_status',
          status: 'preparing',
          message: 'Preparing analysis...',
          source: 'frontend' // Mark as frontend-generated
        });
        
        // Frontend injecting expert mode preparation status
        
        // Inject the chunk through the stream processor
        setTimeout(() => {
          streamProcessorRef.current?.injectChunk?.(expertModeChunk);
        }, 100); // Small delay to ensure UI is ready
      }

      let retryCount = 0
      const maxRetries = 3

      while (retryCount < maxRetries) {
        try {
          if (!state.metadata?.sessionId) {
            throw new Error('No session ID available');
          }

          const response = await api.chat.send([{
            role: 'user',
            content
          }], state.metadata.sessionId, latestModel)

          if (!response.body) {
            throw new Error('No response body received')
          }

          await streamProcessorRef.current?.processStream(response.body)
          break
        } catch (error) {
          retryCount++
          
          const recoveryResult = await handleMessageFailure(
            userMessage,
            error instanceof Error ? error : new Error(String(error))
          )

          // Special handling for overloaded errors
          if (error instanceof Error &&
              typeof error === 'object' &&
              (error as any).type === 'error' &&
              (error as any).error?.type === 'overloaded_error') {
            // Use exponential backoff for overloaded errors
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000) // Max 10 second backoff
            setState(prev => ({
              ...prev,
              messages: prev.messages.map((msg: any, idx: number) => {
                if (idx === prev.messages.length - 1 && msg.type === 'system') {
                  return {
                    ...msg,
                    content: `System is overloaded. Retrying in ${backoffTime/1000} seconds...`
                  }
                }
                return msg
              })
            }))
            await new Promise(resolve => setTimeout(resolve, backoffTime))
            continue // Skip throwing error for overloaded case
          }

          // For other errors, check if retryable
          if (!recoveryResult.retryable || retryCount >= maxRetries) {
            throw error
          }

          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
      }
    } catch (error) {
      const errorHandler = new ErrorHandler(
        { reportError, recoverUnsaved },
        state.metadata
      )
      const { errorMessage, errorMsg, recoveredMessages } = await errorHandler.handleError(error)
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage,
        messages: [...prev.messages, errorMsg, ...recoveredMessages]
      }))
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }))
    }
  }, [state.messages, state.metadata, state.isProcessing, reportError, recoverUnsaved, handleMessageFailure])

  // Methods for controlling chunk processing
  const toggleManualMode = useCallback((enabled: boolean) => {
    streamProcessorRef.current?.toggleManualMode(enabled);
  }, []);
  
  const approveNextChunk = useCallback(() => {
    streamProcessorRef.current?.approveNextChunk();
  }, []);
  
  // Reset stream processor completely
  const resetStreamProcessor = useCallback((preserveThinking = false) => {
    try {
      if (streamProcessorRef.current) {
        // Capture thinking state if needed
        let thinkingState = null;
        let thinkingContent = '';
        let thinkingSignature = '';
        let thinkingStatus = '';
        
        if (preserveThinking) {
          // Save current thinking state before reset
          thinkingState = state.thinkingState;
          thinkingContent = state.thinkingContent || '';
          thinkingSignature = state.thinkingSignature || '';
          thinkingStatus = state.thinkingStatus || '';
        }
        
        // Reset internal state
        streamProcessorRef.current.resetState();
        
        // Reset UI states
        setPendingChunk(null);
        setPendingCount(0);
        
        // Restore thinking state if needed
        if (preserveThinking && thinkingState) {
          // Restore thinking state after reset
          setState(prev => ({
            ...prev,
            thinkingState,
            thinkingContent,
            thinkingSignature,
            thinkingStatus
          }));
        }
        
        // Dispatch a special event to notify listeners
        if (typeof window !== 'undefined') {
          try {
            const event = new CustomEvent('streamProcessorReset');
            window.dispatchEvent(event);
          } catch (e) {
            // Silent error handling
          }
        }
      }
    } catch (e) {
      // Silent error handling
    }
  }, [state.thinkingState, state.thinkingContent, state.thinkingSignature, state.thinkingStatus]);

  return {
    state,
    setState,
    sendMessage,
    stopChat,
    createMessage: useCallback(
      (role: Message['role'], content: string, type = 'text') => 
        createMessage(role, content, type, state.metadata),
      [state.metadata]
    ),
    // Processing control
    streamProcessor: streamProcessorRef.current,
    pendingChunk,
    pendingCount,
    toggleManualMode,
    approveNextChunk,
    resetStreamProcessor
  }
}