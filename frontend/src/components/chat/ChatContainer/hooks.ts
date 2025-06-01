import { useEffect, useRef, useState, useCallback } from 'react'
import { useSessionInitialization } from '@/hooks/useSessionInitialization'
import { useChat } from '@/hooks/useChat'
import { useSession } from '@/hooks/useSession'
import { useSessionManager } from '@/lib/sessionManager'
import { useError } from '../../error/ErrorProvider'
import { analytics } from '@/lib/analytics'
import { storage } from '@/lib/storage'
import { scrollManager, type ScrollState } from '@/lib/ScrollManager'

export const useChatContainer = () => {
  const {
    state: chatState,
    setState: setChatState,
    sendMessage,
    stopChat,
    createMessage,
    // Add chunk processing controls
    streamProcessor,
    pendingChunk,
    pendingCount,
    toggleManualMode,
    approveNextChunk,
    resetStreamProcessor
  } = useChat()

  const {
    sessions,
    currentSessionId,
    currentCategory,
    isLoading,
    error: sessionError,
    features,
    handleNewSession,
    handleSessionSelect,
    handleDeleteSession,
    handleCategoryChange,
    handleExportSessions,
    handleImportSessions,
    refreshSessions,
    updateSessionTitle
  } = useSession()

  const {
    persistSession,
    retrieveSession
  } = useSessionManager()

  const { reportError } = useError()
  
  // Scroll state management
  const [scrollState, setScrollState] = useState<ScrollState>({
    isAutoScrollEnabled: true,
    isUserScrolling: false,
    isAtBottom: true,
    scrollPosition: 0,
    scrollHeight: 0,
    containerHeight: 0,
    lastScrollTime: 0,
  })
  const containerRef = useRef<HTMLDivElement | null>(null)
  
  // Subscribe to scroll manager updates
  useEffect(() => {
    // Only subscribe on client side
    if (typeof window === 'undefined') return
    
    const unsubscribe = scrollManager.subscribe((state) => {
      setScrollState(state)
    })
    
    return unsubscribe
  }, [])
  
  // Initialize scroll manager when container is available
  const messagesEndRef = useCallback((node: HTMLDivElement | null) => {
    if (node && node.parentElement) {
      const container = node.parentElement.closest('.chat-container') as HTMLDivElement
      if (container && container !== containerRef.current) {
        containerRef.current = container
        scrollManager.initialize(container)
        
        // Try to restore scroll position for current session
        if (currentSessionId) {
          const restored = scrollManager.restoreScrollPosition(currentSessionId)
          if (!restored) {
            // If no saved position, scroll to bottom for new sessions
            scrollManager.scrollToBottom({ smooth: false })
          }
        }
      }
    }
  }, [currentSessionId])
  
  // Auto-scroll when messages change
  useEffect(() => {
    if (scrollState.isAutoScrollEnabled && chatState.messages.length > 0) {
      scrollManager.scrollToBottom({ smooth: true, delay: 50 })
    }
  }, [chatState.messages, scrollState.isAutoScrollEnabled])
  
  // Handle streaming state changes
  useEffect(() => {
    if (chatState.isProcessing && scrollState.isAutoScrollEnabled) {
      // ScrollManager's MutationObserver will handle streaming updates
      // No need for interval-based scrolling
    }
  }, [chatState.isProcessing, scrollState.isAutoScrollEnabled])


  // Initialize once on mount with better state tracking
  const initialized = useRef(false);
  const initializationPromise = useRef<Promise<void> | null>(null);
  const currentInitSessionId = useRef<string | null>(null);

  useEffect(() => {
    // Only initialize when we have currentSessionId
    if (!currentSessionId) return;

    const initializeChat = async () => {
      // Skip if already initialized with current session
      if (initialized.current && currentInitSessionId.current === currentSessionId) {
        return;
      }
      
      // Wait for existing initialization if in progress
      if (initializationPromise.current) {
        try {
          await Promise.race([
            initializationPromise.current,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Init timeout')), 5000))
          ]);
          return;
        } catch (error) {
          // Previous initialization failed, continue with new one
        }
      }

      initializationPromise.current = (async () => {
        try {
          // First ensure we have a valid session
          let sessionData: { sessionId: string; session: any } | undefined;

          if (currentSessionId) {
            // Try to use current session
            const sessions = await storage.getSessions();
            const validSession = sessions.find(s => s.id === currentSessionId);
            if (validSession) {
              sessionData = { sessionId: currentSessionId, session: validSession };
            }
          }

          if (!sessionData) {
            // Need to refresh sessions
            await refreshSessions();
            const sessions = await storage.getSessions();

            if (sessions && sessions.length > 0) {
              sessionData = { 
                sessionId: sessions[0].id, 
                session: sessions[0] 
              };
            } else {
              // Create new session as last resort
              const newSessionId = await storage.startNewSession('system');
              const sessions = await storage.getSessions();
              const newSession = sessions.find(s => s.id === newSessionId);
              
              if (!newSession) {
                throw new Error('Failed to create new session');
              }

              sessionData = { 
                sessionId: newSessionId, 
                session: newSession 
              };
            }
          }

          // Track initialization
          if (features.analytics?.isEnabled) {
            analytics.trackEvent('chat', 'initialize', {
              sessionId: sessionData.sessionId,
              category: sessionData.session.category,
              isNewSession: sessionData.sessionId !== currentInitSessionId.current
            });
          }

          // Set chat state optimistically
          setChatState(prev => ({
            ...prev,
            messages: [],
            metadata: {
              sessionId: sessionData.sessionId,
              category: sessionData.session.category || 'system'
            }
          }));

          // Load messages in background
          try {
            const messages = await storage.getSessionMessages(sessionData.sessionId);
            if (messages?.length > 0) {
              setChatState(prev => ({
                ...prev,
                messages: messages as any, // Type cast until we unify Message types
                metadata: {
                  ...prev.metadata,
                  messageCount: messages.length
                }
              }));
            }
          } catch (error) {
            // Non-critical error, continue without messages
          }

          // Update initialization tracking
          initialized.current = true;
          currentInitSessionId.current = sessionData.sessionId;

        } catch (error) {
          if (error instanceof Error) {
            if (features.analytics?.isEnabled) {
              analytics.trackEvent('chat', 'initialize_error', {
                error: error.message,
                sessionId: currentSessionId
              });
            }
            reportError(error, undefined, {
              componentName: 'ChatContainer',
              action: 'initialization',
              context: {
                currentSessionId,
                initializedSessionId: currentInitSessionId.current
              }
            });
          }
          
          // Reset initialization state on error
          initialized.current = false;
          currentInitSessionId.current = null;
          
        } finally {
          initializationPromise.current = null;
        }
      })();

      try {
        await initializationPromise.current;
      } catch (error) {
        // Reset initialization state on error
        initialized.current = false;
        currentInitSessionId.current = null;
      }
    };

    initializeChat();
  }, [currentSessionId]); // Add currentSessionId as dependency

  // Previous state ref to prevent unnecessary updates
  const prevStateRef = useRef<{
    messageCount: number;
    sessionId: string | undefined;
    messages: typeof chatState.messages;
    title: string | undefined;
    lastUpdate: number;
  }>({
    messageCount: 0,
    sessionId: undefined,
    messages: [],
    title: undefined,
    lastUpdate: 0
  });

  // Update debounce settings
  const UPDATE_DEBOUNCE = 1000; // 1 second minimum between updates

  // Session persistence effect
  useEffect(() => {
    const updateSession = async () => {
      if (!chatState.messages.length || !chatState.metadata?.sessionId) return;

      // Check if we need to update based on changes
      const currentSession = sessions.find(s => s.id === chatState.metadata?.sessionId);
      const prevState = prevStateRef.current;
      const now = Date.now();
      
      // Deep compare messages
      const hasMessagesChanged = JSON.stringify(chatState.messages) !== JSON.stringify(prevState.messages);
      const hasSessionChanged = chatState.metadata?.sessionId !== prevState.sessionId;
      const hasTitleChanged = currentSession?.title !== prevState.title;
      const hasDebounceElapsed = now - prevState.lastUpdate > UPDATE_DEBOUNCE;

      // Skip update if nothing meaningful changed or we're within debounce period
      if ((!hasMessagesChanged && !hasSessionChanged && !hasTitleChanged) || !hasDebounceElapsed) {
        return;
      }

      // Update last update timestamp
      prevStateRef.current.lastUpdate = now;



      try {
        // Check if we need to generate a title
        const needsTitleGeneration = currentSession && 
          (!currentSession.title || currentSession.title === 'New Chat') && 
          chatState.messages.length > 0;

        // Check if we can use cached title
        const hasValidCachedTitle = prevState.title && 
          prevState.title !== 'New Chat' && 
          prevState.sessionId === chatState.metadata.sessionId;
        
        // Only generate title if needed and no valid cached title exists
        const shouldUpdateTitle = needsTitleGeneration && !hasValidCachedTitle;
        


        // Declare title variable in wider scope
        let generatedTitle: string | undefined;

        // Handle title generation from first user message
        if (shouldUpdateTitle) {
          const firstUserMessage = chatState.messages.find(m => m.role === 'user');
          if (firstUserMessage?.segments?.[0]?.content) {
            const content = firstUserMessage.segments[0].content;
            
            // Generate title from first line of user message
            generatedTitle = content
              .split('\n')[0] // Take first line
              .slice(0, 50)   // Max 50 chars
              .trim()
              .replace(/[^\w\s]/g, '') // Remove special chars
              + (content.length > 50 ? '...' : '');



            // Only update if we have a valid new title different from current
            if (generatedTitle && 
                generatedTitle !== 'New Chat' && 
                generatedTitle !== currentSession?.title) {
              try {
                // Update title in storage - this will trigger the notification internally
                await updateSessionTitle(chatState.metadata.sessionId, generatedTitle);
                
                // Update our ref to track title state
                prevStateRef.current = {
                  ...prevState,
                  title: generatedTitle,
                  sessionId: chatState.metadata.sessionId,
                  lastUpdate: Date.now()
                };



              } catch (error) {

                reportError(error instanceof Error ? error : new Error(String(error)), undefined, {
                  component: 'ChatContainer',
                  action: 'updateTitle',
                  context: {
                    sessionId: chatState.metadata.sessionId,
                    attemptedTitle: generatedTitle
                  }
                });
              }
            }
          }
        }

        // Get latest session info after potential title update
        const updatedSession = sessions.find(s => s.id === chatState.metadata?.sessionId);
        
        // Persist session with current state
        await persistSession(
          chatState.metadata.sessionId,
          chatState.messages,
          {
            sessionId: chatState.metadata.sessionId,
            category: updatedSession?.category || chatState.metadata.category || 'chat',
            lastAccessed: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            messageCount: chatState.messages.length,
            syncStatus: 'pending',
            title: updatedSession?.title || 'New Chat'
          }
        );

        // Track analytics only when something meaningful changes
        if (features.analytics?.isEnabled && (hasMessagesChanged || hasTitleChanged)) {
          analytics.trackEvent('chat', 'update_messages', {
            sessionId: currentSessionId,
            category: currentCategory,
            messageCount: chatState.messages.length,
            hasTitle: !!generatedTitle || !!currentSession?.title
          });
        }

        // Update our ref after successful update
        prevStateRef.current = {
          messageCount: chatState.messages.length,
          sessionId: chatState.metadata.sessionId,
          messages: chatState.messages,
          title: updatedSession?.title,
          lastUpdate: Date.now()
        };
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('Failed to update session'), undefined, {
          component: 'ChatContainer',
          action: 'updateSession',
          context: {
            sessionId: chatState.metadata?.sessionId,
            messageCount: chatState.messages.length,
            hasMessagesChanged: chatState.messages !== prevStateRef.current.messages,
            hasSessionChanged: chatState.metadata.sessionId !== prevStateRef.current.sessionId
          }
        });
      }
    };

    updateSession();

    // Cleanup function to handle component unmount or session changes
    return () => {
      const currentState = prevStateRef.current;
      if (currentState.sessionId && currentState.sessionId !== chatState.metadata?.sessionId) {
        // Clear state when switching sessions
        prevStateRef.current = {
          messageCount: 0,
          sessionId: undefined,
          messages: [],
          title: undefined,
          lastUpdate: 0
        };
      }
    };
  }, [
    // Only include essential dependencies
    chatState.messages.length, // Track message count changes
    chatState.metadata?.sessionId, // Track session changes
    sessions // Track session list changes
  ])

  // Save scroll position before unmount or session change
  useEffect(() => {
    return () => {
      if (currentSessionId && containerRef.current) {
        scrollManager.saveScrollPosition(currentSessionId)
      }
    }
  }, [currentSessionId])
  
  // Reset scroll state function
  const resetScrollState = useCallback(() => {
    // Save current position before reset
    if (currentSessionId) {
      scrollManager.saveScrollPosition(currentSessionId)
    }
    scrollManager.reset()
  }, [currentSessionId])

  return {
    chatState,
    setChatState,
    sendMessage,
    stopChat,
    createMessage,
    sessions,
    currentSessionId,
    currentCategory,
    isLoading,
    sessionError,
    features,
    handleNewSession,
    handleSessionSelect,
    handleDeleteSession,
    handleCategoryChange,
    handleExportSessions,
    handleImportSessions,
    reportError,
    messagesEndRef,
    persistSession,
    retrieveSession,
    recoverSession: retrieveSession, // Use retrieveSession as fallback for recoverSession
    scrollState,
    scrollManager,
    resetScrollState,
    setState: setChatState, // Expose setState for chat
    // Chunk processing controls
    streamProcessor,
    pendingChunk,
    pendingCount,
    toggleManualMode,
    approveNextChunk,
    resetStreamProcessor,
    trackEvent: (action: string, metadata?: Record<string, any>) => {
      if (features.analytics?.isEnabled) {
        analytics.trackEvent('chat', action, {
          sessionId: currentSessionId,
          category: currentCategory,
          ...metadata
        })
      }
    }
  }
}