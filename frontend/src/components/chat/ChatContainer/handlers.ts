import { recoveryAnalytics } from '@/lib/recoveryAnalytics'
import { storage } from '@/lib/storage'

interface HandlersProps {
  setChatState: (prev: any) => void;
  handleNewSession: () => Promise<string>;
  handleSessionSelect: (sessionId: string) => Promise<any>;
  handleDeleteSession: (sessionId: string) => Promise<string>;
  handleCategoryChange: (category: string) => Promise<string>;
  sessions: any[];
  currentCategory: string;
  reportError: (error: Error, cause?: Error, context?: Record<string, any>) => void;
  retrieveSession: (sessionId: string) => Promise<any>;
  recoverSession: (sessionId: string) => Promise<boolean>;
  trackEvent: (action: string, metadata?: Record<string, any>) => void;
  setIsSessionLoading: (loading: boolean) => void;
  onSessionUpdate: (sessionId: string) => void;
  resetScrollState: () => void;
  resetStreamProcessor?: () => void; // Optional method to reset stream processor
}

export const createHandlers = (props: HandlersProps) => {
  const {
    setChatState,
    handleNewSession,
    handleSessionSelect,
    handleDeleteSession,
    handleCategoryChange,
    sessions,
    currentCategory,
    reportError,
    retrieveSession,
    recoverSession,
    trackEvent,
    setIsSessionLoading
  } = props

  const handleSessionSelectWrapper = async (sessionId: string) => {
    if (sessionId === props.currentSessionId) return; // Skip if already selected
    
    // Reset stream processor when switching sessions
    try {
      if (typeof props.resetStreamProcessor === 'function') {
        props.resetStreamProcessor();
        // console.log("Stream processor reset complete for session switch");
      } else {
        // console.warn("resetStreamProcessor is not available or not a function");
      }
    } catch (e) {
      console.error("Error resetting stream processor:", e);
    }
    
    setIsSessionLoading(true)
    try {
      const startTime = await recoveryAnalytics.trackRecoveryAttempt(
        sessionId,
        'indexeddb',
        'SessionSelect'
      )

      // Switch session in storage
      const session = await storage.switchSession(sessionId)
      if (!session) throw new Error('Failed to switch session')

      // Get messages for the session
      const sessionData = await retrieveSession(sessionId)
      const messages = sessionData?.messages || []

      recoveryAnalytics.trackRecoverySuccess(
        sessionId,
        'indexeddb',
        startTime,
        messages,
        'SessionSelect'
      )

      // Reset scroll state before updating messages
      props.resetScrollState();
      setChatState(prev => ({
        ...prev,
        messages,
        metadata: {
          ...prev.metadata,
          sessionId,
          category: session.category || 'chat'
        }
      }))

      // Update storage and get updated session info
      await storage.switchSession(sessionId)

      // Update current session state
      props.setState?.(prev => ({
        ...prev,
        currentSessionId: sessionId
      }))

      // Track the change
      trackEvent('select_session', { 
        sessionId,
        messageCount: messages.length,
        category: session.category
      })

    } catch (error) {
      if (error instanceof Error) {
        recoveryAnalytics.trackRecoveryFailure(
          sessionId,
          'indexeddb',
          error,
          'SessionSelect'
        )
        reportError(error, undefined, {
          componentName: 'ChatContainer',
          action: 'sessionSelect',
          sessionId
        })
      }
    } finally {
      setIsSessionLoading(false)
    }
  }

  const handleNewSessionWrapper = async () => {
    // Reset stream processor when creating a new session
    try {
      if (typeof props.resetStreamProcessor === 'function') {
        props.resetStreamProcessor();
        // console.log("Stream processor reset complete for new session");
      } else {
        // console.warn("resetStreamProcessor is not available or not a function");
      }
    } catch (e) {
      console.error("Error resetting stream processor:", e);
    }
    
    setIsSessionLoading(true)
    try {
      trackEvent('new_session')
      const sessionId = await handleNewSession()
      if (sessionId) {
        // Get previous session title if it exists
        const prevSession = sessions.find(s => s.id === props.currentSessionId);
        let initialTitle = 'New Chat';
        
        // If previous session had a custom title, append a number
        if (prevSession?.title && prevSession.title !== 'New Chat') {
          const similarSessions = sessions.filter(s => 
            s.title?.startsWith(prevSession.title) || 
            s.title?.startsWith(prevSession.title + ' (')
          );
          if (similarSessions.length > 0) {
            initialTitle = `${prevSession.title} (${similarSessions.length + 1})`;
          } else {
            initialTitle = prevSession.title;
          }
          
          // Update title immediately
          await storage.updateSessionTitle(sessionId, initialTitle);
        }

        setChatState(prev => ({
          ...prev,
          messages: [],
          metadata: {
            ...prev.metadata,
            sessionId,
            category: currentCategory,
            title: initialTitle
          }
        }))
      }
    } catch (error) {
      if (error instanceof Error) {
        trackEvent('new_session_error', { error: error.message })
        reportError(error, undefined, {
          componentName: 'ChatContainer',
          action: 'newSession'
        })
      }
    } finally {
      setIsSessionLoading(false)
    }
  }

  const handleDeleteSessionWrapper = async (sessionId: string) => {
    setIsSessionLoading(true)
    try {
      trackEvent('delete_session', { sessionId })
      const newSessionId = await handleDeleteSession(sessionId)
      if (newSessionId) {
        const messages = await handleSessionSelect(newSessionId)
        
        setChatState(prev => ({
          ...prev,
          messages,
          metadata: {
            ...prev.metadata,
            sessionId: newSessionId,
            category: sessions.find(s => s?.id === newSessionId)?.category || 'chat'
          }
        }))
      }
    } catch (error) {
      if (error instanceof Error) {
        trackEvent('delete_session_error', { sessionId, error: error.message })
        reportError(error, undefined, {
          componentName: 'ChatContainer',
          action: 'deleteSession',
          sessionId
        })
      }
    } finally {
      setIsSessionLoading(false)
    }
  }

  const handleCategoryChangeWrapper = async (category: string) => {
    setIsSessionLoading(true)
    try {
      trackEvent('change_category', { category })
      const sessionId = await handleCategoryChange(category)
      if (sessionId) {
        setChatState(prev => ({
          ...prev,
          messages: [],
          metadata: {
            ...prev.metadata,
            sessionId,
            category
          }
        }))
      }
    } catch (error) {
      if (error instanceof Error) {
        trackEvent('change_category_error', { category, error: error.message })
        reportError(error, undefined, {
          componentName: 'ChatContainer',
          action: 'categoryChange',
          category
        })
      }
    } finally {
      setIsSessionLoading(false)
    }
  }

  const handleRecoveryAttempt = async (sessionId: string) => {
    try {
      const startTime = await recoveryAnalytics.trackRecoveryAttempt(
        sessionId,
        'indexeddb',
        'RecoveryAttempt'
      )

      const recovered = await recoverSession(sessionId)
      if (recovered) {
        const session = await retrieveSession(sessionId)
        if (session) {
          recoveryAnalytics.trackRecoverySuccess(
            sessionId,
            'indexeddb',
            startTime,
            session.messages,
            'RecoveryAttempt'
          )

          setChatState(prev => ({
            ...prev,
            messages: session.messages,
            metadata: {
              ...prev.metadata,
              sessionId,
              category: session.metadata.category
            }
          }))
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        recoveryAnalytics.trackRecoveryFailure(
          sessionId,
          'indexeddb',
          error,
          'RecoveryAttempt'
        )
        reportError(error, undefined, {
          componentName: 'ChatContainer',
          action: 'sessionRecovery',
          sessionId
        })
      }
    }
  }

  return {
    handleSessionSelectWrapper,
    handleNewSessionWrapper,
    handleDeleteSessionWrapper,
    handleCategoryChangeWrapper,
    handleRecoveryAttempt
  }
}