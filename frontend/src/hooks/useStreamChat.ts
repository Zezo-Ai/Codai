/**
 * React hook for using the stream processor with React state
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { StreamProcessor, Message, TokenInfo, StreamProcessorState } from '@/lib/stream';
import { api } from '@/lib/api';

interface StreamChatState {
  messages: Message[];
  isProcessing: boolean;
  error: Error | null;
  tokenInfo?: TokenInfo;
  state: StreamProcessorState;
  rawData: string[]; // Track raw data for display
}

interface StreamChatOptions {
  debug?: boolean;
  showStateMarkers?: boolean;
  captureRawData?: boolean; // Whether to capture raw data
  onError?: (error: Error) => void;
  sessionId?: string;
  onRawChunkReceived?: (chunk: string) => void; // Callback for raw chunks with timestamps
}

/**
 * Hook for using the stream processor in React components
 */
export function useStreamChat(options: StreamChatOptions = {}) {
  // Stream state
  const [state, setState] = useState<StreamChatState>({
    messages: [],
    isProcessing: false,
    error: null,
    state: 'idle',
    rawData: []
  });
  
  // Stream processor reference
  const processorRef = useRef<StreamProcessor | null>(null);
  
  // Initialize stream processor if not exists
  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new StreamProcessor({
        debug: options.debug,
        showStateMarkers: options.showStateMarkers,
        captureRawData: options.captureRawData,
        
        // Message handling
        onMessage: (messages) => {
          setState(prev => ({
            ...prev,
            messages: messages
          }));
        },
        
        // Raw data updates
        onRawDataUpdate: (rawData) => {
          if (options.captureRawData) {
            setState(prev => ({
              ...prev,
              rawData
            }));
            
            // If a new raw chunk was added, notify via callback
            if (rawData.length > 0 && options.onRawChunkReceived) {
              const latestChunk = rawData[rawData.length - 1];
              options.onRawChunkReceived(latestChunk);
            }
          }
        },
        
        // Error handling
        onError: (error) => {
          setState(prev => ({
            ...prev,
            error,
            isProcessing: false
          }));
          
          if (options.onError) {
            options.onError(error);
          }
        },
        
        // Stream completion
        onComplete: () => {
          setState(prev => ({
            ...prev,
            isProcessing: false
          }));
        },
        
        // Token updates
        onTokenUpdate: (tokenInfo) => {
          setState(prev => ({
            ...prev,
            tokenInfo
          }));
        },
        
        // State changes
        onStateChange: (newState) => {
          setState(prev => ({
            ...prev,
            state: newState
          }));
        }
      });
    }
  }, [options.debug, options.showStateMarkers, options.onError]);
  
  /**
   * Send a message to the API
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!content?.trim() || state.isProcessing || !processorRef.current) return;
    
    // Update state
    setState(prev => ({ ...prev, isProcessing: true, error: null }));
    
    try {
      // Add user message
      processorRef.current.addUserMessage(content);
      
      // Make API request
      const sessionId = options.sessionId || 'default';
      const response = await api.chat.send([{
        role: 'user',
        content
      }], sessionId);
      
      if (!response.body) {
        throw new Error('No response body received');
      }
      
      // Process the stream
      await processorRef.current.processStream(response.body);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error : new Error(String(error))
      }));
      
      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }, [state.isProcessing, options.sessionId, options.onError]);
  
  /**
   * Stop the current streaming response
   */
  const stopChat = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.cancel();
    }
    
    setState(prev => ({ ...prev, isProcessing: false }));
  }, []);
  
  /**
   * Reset all messages
   */
  const resetChat = useCallback(() => {
    setState({
      messages: [],
      isProcessing: false,
      error: null,
      state: 'idle',
      rawData: []
    });
  }, []);
  
  /**
   * Update raw data directly (for use during playback)
   */
  const updateRawData = useCallback((newRawData: string | string[]) => {
    setState(prev => ({
      ...prev,
      rawData: Array.isArray(newRawData) 
        ? [...newRawData] 
        : [...prev.rawData, newRawData]
    }));
  }, []);
  
  // Return state and functions
  return {
    messages: state.messages,
    isProcessing: state.isProcessing,
    error: state.error,
    tokenInfo: state.tokenInfo,
    processorState: state.state,
    rawData: state.rawData, // Expose raw data
    sendMessage,
    stopChat,
    resetChat,
    updateRawData, // Export the update function
    processor: processorRef.current // Expose the processor reference
  };
}