'use client'

import React, { useState, useEffect, Suspense, lazy } from 'react'
import { ChatMessages } from '../ChatMessages'
import { ChatHeader } from '../ChatHeader'
import { ChatSidebar } from '../ChatSidebar'
import { ChatInput } from '../ChatInput'
import { SessionSync } from '../../session/SessionSync'
import { SessionManagement } from '../../session/SessionManagement'
import { SettingsMenu } from '../../settings/SettingsMenu'
import { ErrorBoundary } from '../../error/ErrorBoundary'
import { ChatErrorBoundary } from '../../error/ChatErrorBoundary'
import { SessionErrorBoundary } from '../../error/SessionErrorBoundary'
import { ErrorDialog } from '../../error/ErrorDialog'
import { Settings, HelpCircle, Eye, Loader2 } from 'lucide-react'

// Lazy load StreamControls
const StreamControls = lazy(() => import('../StreamControls'))
import { useRouter } from 'next/navigation'
import { SystemStatus } from '../../system/SystemStatus'
import { TokenMetrics } from '../../analytics/TokenMetrics'
import { ComputerUseToggle } from '@/modules/computer-use'
import { LoadingSpinner } from './Layout'
import { useChatContainer } from './hooks'
import { createHandlers } from './handlers'
import { useSession } from '@/hooks/useSession'
import { ScrollPerformanceMonitor } from '../ScrollPerformanceMonitor'
import { AutoScrollDebug } from './AutoScrollDebug'
import { ScrollBenchmark } from '../ScrollBenchmark'
import { ScrollToTop } from '../ScrollToTop'
import { JumpToBottom } from '../JumpToBottom'
import { KeyboardNavigation } from '../KeyboardNavigation'
import { useIsClient } from '@/hooks/useIsClient'
import { useApiKey } from '@/hooks/useApiKey'
import { ApiKeyPrompt } from '../ApiKeyPrompt'
import { initializeExpertModeGlobals, cleanupExpertModeGlobals } from '@/lib/expertModeGlobal'

export function ChatContainerContent() {
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<string | undefined>()
  const [showSessionManagement, setShowSessionManagement] = useState(false)
  const [isSessionLoading, setIsSessionLoading] = useState(false)
  const [showBenchmark, setShowBenchmark] = useState(false)
  const isClient = useIsClient()
  
  // Check if user has API key
  const { hasApiKey, isLoading: isApiKeyLoading } = useApiKey()


  const {
    chatState,
    setChatState,
    sendMessage,
    stopChat,
    sessions,
    currentSessionId,
    currentCategory,
    isLoading,
    sessionError,
    handleNewSession,
    handleSessionSelect,
    handleDeleteSession,
    handleCategoryChange,
    handleExportSessions,
    handleImportSessions,
    reportError,
    messagesEndRef,
    trackEvent,
    retrieveSession,
    recoverSession,
    scrollState,
    scrollManager,
    resetScrollState,
    // Add stream processor and its controls
    streamProcessor,
    resetStreamProcessor
  } = useChatContainer()
  
  // Make stream processor globally available
  useEffect(() => {
    if (typeof window !== 'undefined' && streamProcessor) {
      (window as any).__STREAM_PROCESSOR = streamProcessor;
    }
  }, [streamProcessor]);

  // Initialize expert mode global functions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initializeExpertModeGlobals();
      
      return () => {
        cleanupExpertModeGlobals();
      };
    }
  }, []);
  
  const { setState } = useSession()

  const {
    handleSessionSelectWrapper,
    handleNewSessionWrapper,
    handleDeleteSessionWrapper,
    handleCategoryChangeWrapper,
    handleRecoveryAttempt
  } = createHandlers({
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
    setIsSessionLoading,
    onSessionUpdate: (sessionId: string) => {
      setState(prev => ({ ...prev, currentSessionId: sessionId }))
    },
    resetScrollState,
    resetStreamProcessor  // Add stream processor reset function
  })

  const handleSettingsClick = () => {
    setSettingsInitialSection(undefined)
    setShowSettings(true)
    trackEvent('open_settings')
  }

  const handleHelpClick = () => {
    trackEvent('open_help')
    setSettingsInitialSection('help-about')
    setShowSettings(true)
  }

  const router = useRouter()
  const handleMessageInspectorClick = () => {
    trackEvent('open_message_inspector')
    router.push(`/conversation-inspector?session=${currentSessionId}`)
  }

  // Token info will be updated from conversation responses

  // Handle message send
  const handleMessageSend = async (message: string) => {
    // Send message directly - token counts will come from conversation response
    await sendMessage(message);
  };

  const handleSuggestionClick = (suggestion: string) => {
    trackEvent('use_suggestion', { suggestion })
    handleMessageSend(suggestion)
  }



  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <>
      <div className="h-screen flex bg-gray-50">
        <SessionErrorBoundary>
          <ChatSidebar
            sessions={sessions}
            currentSessionId={currentSessionId}
            currentCategory={currentCategory}
            onSessionSelect={handleSessionSelectWrapper}
            onDeleteSession={handleDeleteSessionWrapper}
            onNewSession={handleNewSessionWrapper}
            onCategoryChange={handleCategoryChangeWrapper}
            isLoading={isSessionLoading}
          />
        </SessionErrorBoundary>

        <div className="flex-1 flex flex-col">
          <ErrorBoundary>
            <header className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <SystemStatus />
                </div>
                
                <div className="flex items-center space-x-3">
                  <SessionSync />
                  <div className="h-4 w-px bg-gray-200" />
                  <ComputerUseToggle disabled={isSessionLoading} />
                  <div className="h-4 w-px bg-gray-200" />
                  <div className="flex items-center space-x-3">
  
                    <button 
                      onClick={handleMessageInspectorClick}
                      className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Message Inspector"
                      disabled={isSessionLoading}
                    >
                      <Eye className="h-5 w-5 text-gray-600" />
                    </button>
                    
                    {/* Stream Controls */}
                    {typeof window !== 'undefined' && (window as any).__STREAM_PROCESSOR && (
                      <Suspense fallback={
                        <button 
                          className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                          title="Stream Controls Loading..."
                        >
                          <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                        </button>
                      }>
                        <StreamControls 
                          streamProcessor={(window as any).__STREAM_PROCESSOR}
                          isProcessing={chatState.isProcessing}
                        />
                      </Suspense>
                    )}
                    
                    <TokenMetrics />
                    <button 
                      onClick={handleHelpClick}
                      className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Help & About"
                    >
                      <HelpCircle className="h-5 w-5 text-gray-600" />
                    </button>
                    <button 
                      onClick={handleSettingsClick}
                      className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Settings"
                    >
                      <Settings className="h-5 w-5 text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>
            </header>
          </ErrorBoundary>

          {chatState.error && (
            <ErrorDialog
              error={new Error(chatState.error)}
              onClose={() => {
                trackEvent('dismiss_error')
                setChatState(prev => ({ ...prev, error: null }))
              }}
              onRetry={() => {
                trackEvent('retry_error')
                handleRecoveryAttempt(currentSessionId)
              }}
              onReport={() => {
                trackEvent('report_error')
                reportError(new Error(chatState.error), undefined, {
                  componentName: 'ChatContainer',
                  sessionId: currentSessionId,
                  category: currentCategory,
                  lastMessage: chatState.messages[chatState.messages.length - 1]
                })
              }}
            />
          )}

          {sessionError && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
              {sessionError}
            </div>
          )}

          <ChatErrorBoundary>
            <div 
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 chat-container relative"
            >
              {/* Show API key prompt if user hasn't set up their key */}
              {!isApiKeyLoading && !hasApiKey ? (
                <ApiKeyPrompt onOpenSettings={() => setShowSettings(true)} />
              ) : (
                <ChatMessages
                  ref={messagesEndRef}
                  messages={chatState.messages}
                  onSuggestionClick={handleSuggestionClick}
                  isLoading={isSessionLoading}
                  thinkingState={chatState.thinkingState}
                  thinkingContent={chatState.thinkingContent}
                  thinkingSignature={chatState.thinkingSignature}
                  thinkingStatus={chatState.thinkingStatus}
                />
              )}
            </div>

            <div className="border-t bg-white p-4 sticky bottom-0">
              <ChatInput 
                onSend={handleMessageSend}
                onStop={stopChat}
                isProcessing={chatState.isProcessing}
                disabled={isSessionLoading || (!isApiKeyLoading && !hasApiKey)}
                tokenInfo={chatState.tokenInfo}
              />
            </div>
          </ChatErrorBoundary>
        </div>
      </div>

      {/* Scroll navigation components */}
      {isClient && (
        <>
          <JumpToBottom
            scrollState={scrollState}
            scrollManager={scrollManager}
            messages={chatState.messages}
            isProcessing={chatState.isProcessing}
          />
          <ScrollToTop
            scrollState={scrollState}
            scrollManager={scrollManager}
            threshold={1000}
          />
          <KeyboardNavigation
            scrollManager={scrollManager}
            enabled={true}
          />
        </>
      )}

      <SettingsMenu 
        isOpen={showSettings} 
        onClose={() => {
          setShowSettings(false)
          setSettingsInitialSection(undefined)
          trackEvent('close_settings')
        }}
        onOpenSessionManagement={() => {
          setShowSessionManagement(true)
          trackEvent('open_session_management')
        }}
        initialSection={settingsInitialSection}
      />

      <SessionManagement 
        isOpen={showSessionManagement}
        onClose={() => {
          setShowSessionManagement(false)
          trackEvent('close_session_management')
        }}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onExport={handleExportSessions}
        onImport={handleImportSessions}
        onDelete={handleDeleteSessionWrapper}
        onSelect={handleSessionSelectWrapper}
      />

      {/* Scroll diagnostics - only in development with debug flag */}
      {process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.search.includes('debug=scroll') && (
        <>
          <ScrollPerformanceMonitor
            containerRef={{ current: typeof document !== 'undefined' ? document.querySelector('.chat-container') as HTMLElement : null }}
            enabled={true}
            onReport={(report) => {
              console.log('[Scroll Performance Report]', report)
              // Check for critical race conditions
              const criticalConditions = scrollManager.getCriticalRaceConditions()
              if (criticalConditions.length > 0) {
                console.warn('[Critical Race Conditions Detected]', criticalConditions)
              }
            }}
            showOverlay={true}
          />
          <AutoScrollDebug
            scrollState={scrollState}
            isProcessing={chatState.isProcessing}
            messageCount={chatState.messages.length}
          />
          {showBenchmark && (
            <ScrollBenchmark
              containerRef={{ current: typeof document !== 'undefined' ? document.querySelector('.chat-container') as HTMLElement : null }}
              scrollManager={scrollManager}
              onComplete={(results: any) => {
                console.log('[Benchmark Complete]', results)
                // Log race condition report after benchmark
                console.log(scrollManager.getRaceConditionReport())
              }}
            />
          )}
          {/* Toggle benchmark button */}
          <button
            onClick={() => setShowBenchmark(!showBenchmark)}
            className="fixed bottom-4 left-4 bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition"
          >
            {showBenchmark ? 'Hide' : 'Show'} Benchmark
          </button>
        </>
      )}

    </>
  )
}