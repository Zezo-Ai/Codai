'use client'

import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { storage } from '@/lib/storage'
import { ActionFormatter } from './ActionFormatter'
import type { ChatMessageProps, MessageSegment } from './types'
import { 
  CodeBlock, 
  TextBlock, 
  FileViewBlock, 
  WebSearchBlock, 
  ActionBlock,
  ThinkingBlock,
  RedactedThinking,
  ThinkingIndicator
} from './formatters'
import { PATTERNS, contentDetector } from '@/lib/patterns'
import { processorRegistry } from '@/lib/processors'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

/**
 * Sanitize HTML content to prevent unwanted resource loading
 */
function sanitizeHtmlContent(content: string): string {
  // Remove or disable link tags that could cause resource loading
  return content
    .replace(/<link[^>]*href[^>]*>/gi, '<!-- link tag removed -->')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<!-- script tag removed -->')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '<!-- iframe tag removed -->');
}

export interface ExtendedChatMessageProps extends ChatMessageProps {
  thinkingState?: 'indicator' | 'explainer' | 'content' | 'finalized' | 'active' | 'pending' | 'complete' | null;
  thinkingContent?: string; // Content of the thinking step
  thinkingSignature?: string; // Signature for the thinking content
  thinkingStatus?: string; // Status message for thinking
  displayMetadata?: any; // Metadata for thinking display
  thinkingTimestamp?: number; // Timestamp of the message for storage lookup
  thinkingSessionId?: string; // Session ID for storage lookup
}

export function ChatMessage({ 
  role, 
  segments, 
  timestamp, 
  isThinking,
  onRetry,
  onCopy,
  isLoading = false,
  thinkingState,
  thinkingContent,
  thinkingSignature,
  thinkingStatus,
  displayMetadata,
  thinkingTimestamp,
  thinkingSessionId,
  stateHtml // Add stateHtml to the props
}: ExtendedChatMessageProps & { stateHtml?: string }) {
  // Create unique component ID for tracing
  const componentId = useRef(`message-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const COMPONENT_NAME = `ChatMessage:${componentId.current}`;
  
  // State for message-specific thinking state (from storage or props)
  const [messageThinkingState, setMessageThinkingState] = useState<string | null | undefined>(thinkingState);
  const [messageThinkingContent, setMessageThinkingContent] = useState<string | null | undefined>(thinkingContent);
  const [messageThinkingSignature, setMessageThinkingSignature] = useState<string | null | undefined>(thinkingSignature);
  const [messageThinkingStatus, setMessageThinkingStatus] = useState<string | null | undefined>(thinkingStatus);
  
  // Determine if we should use live thinking state or load from storage
  const isActiveLiveThinking = role === 'assistant' && (
    thinkingState === 'active' || 
    thinkingState === 'pending' || 
    isThinking
  );
  
  // If this message has a timestamp and session ID, try to load thinking state from storage
  useEffect(() => {
    // For live thinking, always use the props
    if (isActiveLiveThinking) {
      setMessageThinkingState(thinkingState);
      setMessageThinkingContent(thinkingContent);
      setMessageThinkingSignature(thinkingSignature);
      setMessageThinkingStatus(thinkingStatus);
      return;
    }
    
    // For completed messages, load from storage if available
    if (role === 'assistant' && thinkingTimestamp && thinkingSessionId) {
      try {
        const savedThinkingState = storage.getThinkingStateForMessage(thinkingSessionId, thinkingTimestamp);
        
        if (savedThinkingState) {
          setMessageThinkingState(savedThinkingState.thinkingState);
          setMessageThinkingContent(savedThinkingState.thinkingContent);
          setMessageThinkingSignature(savedThinkingState.thinkingSignature);
          setMessageThinkingStatus(savedThinkingState.thinkingStatus);
        }
      } catch (error) {
        console.error('Error loading thinking state for message:', error);
      }
    }
  }, [
    role, 
    thinkingSessionId, 
    thinkingTimestamp, 
    isActiveLiveThinking,
    thinkingState,
    thinkingContent,
    thinkingSignature,
    thinkingStatus
  ]);
  
  // Save thinking state to storage when it changes (for active thinking)
  useEffect(() => {
    if (isActiveLiveThinking && thinkingState === 'complete' && thinkingSessionId && thinkingTimestamp) {
      try {
        storage.saveThinkingState(thinkingSessionId, thinkingTimestamp, {
          thinkingState,
          thinkingContent,
          thinkingSignature,
          thinkingStatus
        });
      } catch (error) {
        console.error('Error saving thinking state for message:', error);
      }
    }
  }, [
    isActiveLiveThinking,
    thinkingState,
    thinkingContent,
    thinkingSignature,
    thinkingStatus,
    thinkingSessionId,
    thinkingTimestamp
  ]);
  
  // Track message rendering
  useEffect(() => {
    // Log the component initialization
    diagnosticLogger.info(
      DiagnosticArea.RENDER, 
      COMPONENT_NAME, 
      'Message render', 
      `Rendering message with role: ${role}`,
      {
        role,
        timestamp,
        segmentCount: segments.length,
        isThinking,
        isLoading,
        segmentTypes: segments.map(s => s.type).join(',')
      }
    );
    
    return () => {
      diagnosticLogger.debug(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Component unmounted',
        'ChatMessage component cleanup'
      );
    };
  }, [role, timestamp, segments.length, isThinking, isLoading]);
  
  // Prepare segments for rendering without processing the content
  const processedSegments = useMemo(() => {
    return segments.map((segment, index) => {
      const segmentId = `${COMPONENT_NAME}:segment-${index}`;
      
      // Log segment preparation
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        segmentId,
        'Segment preparation',
        `Preparing segment of type: ${segment.type}`,
        { 
          segmentType: segment.type,
          contentLength: segment.content?.length || 0,
          hasMetadata: !!segment.metadata
        }
      );
      
      // No content processing - just pass through the raw content
      return {
        segment,
        processResult: null, // No processing
        segmentId,
        index
      };
    });
  }, [segments, COMPONENT_NAME]);
  
  const handleCopy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      onCopy?.(content)
      
      diagnosticLogger.info(
        DiagnosticArea.RENDER, 
        COMPONENT_NAME, 
        'User interaction', 
        'Content copied to clipboard',
        { contentLength: content.length }
      );
    } catch (error) {
      diagnosticLogger.error(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Copy error',
        'Failed to copy content to clipboard',
        error
      );
    }
  }, [onCopy, COMPONENT_NAME]);
  
  // Cache for content rendering to avoid unnecessary re-renders
  const contentCache = useRef(new Map<string, React.ReactNode>());
  
  // Fast check for markdown using indexOf (much faster than includes)
  const isLikelyMarkdown = useCallback((content: string | undefined): boolean => {
    if (!content) return false;
    
    // Quick check using indexOf which is faster than includes
    return content.indexOf('#') !== -1 || 
           content.indexOf('-') !== -1 || 
           content.indexOf('*') !== -1 ||
           content.indexOf('```') !== -1 ||
           /\d+\.\s/.test(content);
  }, []);
  
  // Helper function to render text content consistently with memoization
  const renderTextContent = useCallback((content: string, key: string | number, segmentId?: string) => {
    // Skip processing for empty content
    if (!content) {
      return null;
    }
    
    // Generate a cache key from content and loading state
    const cacheKey = `${content.substring(0, 50)}:${content.length}:${isLoading}`;
    
    // Check if we already rendered this content
    if (contentCache.current.has(cacheKey)) {
      return contentCache.current.get(cacheKey);
    }
    
    // Check if the text should be formatted as Markdown - using faster indexOf
    const markdownDetected = isLikelyMarkdown(content);
    
    let result: React.ReactNode;
    
    if (markdownDetected) {
      // Use TextBlock for markdown content
      result = (
        <div key={key} className="text-sm overflow-hidden">
          <TextBlock 
            content={content} 
            isLoading={isLoading}
            metadata={{ 
              enableMarkdown: true,
              enableLists: true,
              enableCodeBlocks: true 
            }} 
          />
        </div>
      );
    } else {
      // Use ActionFormatter for non-markdown content
      result = (
        <div 
          key={key} 
          className="text-sm whitespace-pre-wrap break-all break-words overflow-hidden"
        >
          <ActionFormatter content={content} />
        </div>
      );
    }
    
    // Cache the result
    if (contentCache.current.size > 100) {
      // Prevent memory leaks by clearing cache if it gets too large
      contentCache.current.clear();
    }
    contentCache.current.set(cacheKey, result);
    
    return result;
  }, [isLoading, isLikelyMarkdown]);

  // Now renderSegment doesn't use hooks internally
  const renderSegment = (processedSegment: {
    segment: MessageSegment, 
    processResult: any, 
    segmentId: string, 
    index: number
  }) => {
    const { segment, processResult, segmentId, index } = processedSegment;
    
    // Removed segment rendering logs to clean up console
    
    // Simple, direct approach to handle JSON query objects at the end of text
    if (segment.type === 'text') {
      // Look for patterns like: Text content {"query": "search terms"}
      const queryObjMatch = segment.content?.match(/^(.*?)(\{(?:"query"|'query')(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})$/);
      
      if (queryObjMatch) {
        const textPart = queryObjMatch[1]?.trim();
        const jsonPart = queryObjMatch[2];
        
        try {
          // Try to parse the JSON to make sure it's valid
          const jsonObj = JSON.parse(jsonPart);
          
          // Make sure it has a query field
          if (jsonObj.query) {
            diagnosticLogger.info(
              DiagnosticArea.RENDER,
              segmentId,
              'Query JSON detected',
              'Found JSON query object at end of text',
              { 
                hasTextBefore: !!textPart,
                query: jsonObj.query
              }
            );
            
            // Return both text content and action block
            return (
              <div key={segment.id || index} className="w-full">
                {/* Render text part if it exists */}
                {textPart && renderTextContent(textPart, `${index}-text`, segmentId)}
                
                {/* Render action block for the JSON part */}
                <ActionBlock
                  key={`${index}-json`}
                  content={jsonPart}
                />
              </div>
            );
          }
        } catch (e) {
          // If JSON parsing fails, fall through to normal rendering
          diagnosticLogger.warn(
            DiagnosticArea.RENDER,
            segmentId,
            'JSON parse failure',
            'Failed to parse apparent JSON query object',
            { error: e instanceof Error ? e.message : 'Unknown error' }
          );
        }
      }
    }
    
    // Enhanced file type detection
    const isFileContent = 
      segment.type === 'file' || 
      (segment.metadata?.type === 'file');
      
    diagnosticLogger.debug(
      DiagnosticArea.RENDER,
      segmentId,
      'Type detection',
      isFileContent ? 'Detected file content' : 'Not file content',
      { isFileContent, type: segment.type, metadataType: segment.metadata?.type }
    );

    // If it's file content, use FileViewBlock with proper metadata
    if (isFileContent && segment.metadata) {
      diagnosticLogger.debug(
        DiagnosticArea.RENDER,
        segmentId,
        'Render decision',
        'Rendering as FileViewBlock',
        { 
          path: segment.metadata.path,
          contentLength: segment.content?.length || 0 
        }
      );
      
      return (
        <FileViewBlock
          key={segment.id || index}
          content={segment.content}
          metadata={segment.metadata}
          onCopy={handleCopy}
          isLoading={isLoading}
        />
      );
    }

    // No special handling for web search results or code blocks - render raw content
    // This ensures we display exactly what we receive from the API without processing

    // Handle extended thinking segment types first
    if (segment.type === 'thinking') {
      diagnosticLogger.info(
        DiagnosticArea.RENDER,
        segmentId,
        'Extended thinking block',
        'Rendering extended thinking block',
        { 
          hasThinking: !!segment.thinking,
          hasSignature: !!segment.signature,
          thinkingLength: segment.thinking?.length || 0
        }
      );
      
      return (
        <ThinkingBlock
          key={segment.id || index}
          thinking={segment.thinking || segment.content || ''}
          signature={segment.signature}
          metadata={(displayMetadata || segment.metadata) as ThinkingMetadata}
          isLoading={isLoading}
        />
      );
    }
    
    if (segment.type === 'redacted_thinking') {
      diagnosticLogger.info(
        DiagnosticArea.RENDER,
        segmentId,
        'Redacted thinking block',
        'Rendering redacted thinking block',
        { 
          hasData: !!segment.data,
          dataLength: segment.data?.length || 0
        }
      );
      
      return (
        <RedactedThinking
          key={segment.id || index}
          data={segment.data}
          isLoading={isLoading}
        />
      );
    }
    
    // SCREENSHOT DETECTION: Check for base64 image data in content regardless of type
    // But don't lose the surrounding text
    const isScreenshotAction = segment.content && 
                              typeof segment.content === 'string' &&
                              (segment.content.includes('"action":"screenshot"') ||
                               segment.content.includes('Screen Capture') ||
                               segment.content.includes('Capturing screen'));
                               
    if ((segment.type === 'text' && 
         segment.content && 
         typeof segment.content === 'string' && 
         segment.content.length > 500) ||
        isScreenshotAction) {
      
      // Extract base64 image data using a regex pattern that matches likely image data
      // This regex looks for long sequences of base64 characters
      const base64Regex = /([A-Za-z0-9+/]{100,}={0,2})/;
      const base64Match = segment.content.match(base64Regex);
      
      if (base64Match && base64Match[1]) {
        const imageData = base64Match[1]; // The extracted base64 data
        
        // If the image data starts with a PNG header, it's very likely a screenshot
        if (imageData.startsWith('iVBOR') || 
            imageData.indexOf('iVBOR') === 0 ||
            (imageData.length > 1000 && imageData.includes('AAAA'))) {
          
          // Only log in development mode or when debugging is enabled
          if (process.env.NODE_ENV === 'development' && window._DEBUG_LOGS) {
            console.log('Screenshot detected:', {
              matchLength: imageData.length,
              originalLength: segment.content.length
            });
          }
          
          // Split the content into parts: before the image, the image, and after the image
          const parts = segment.content.split(base64Regex);
          const beforeImage = parts[0] || '';
          const afterImage = parts[2] || '';
          
          // Create the combined output with text and image
          return (
            <div key={segment.id || index}>
              {/* Text content before the image */}
              {beforeImage && (
                <div className="mb-3">
                  {renderTextContent(beforeImage, `${segment.id || index}-before`, `${segmentId}-before`)}
                </div>
              )}
              
              {/* The image itself */}
              <div className="my-3">
                <img
                  src={`data:image/png;base64,${imageData}`}
                  alt="Screenshot"
                  className={cn(
                    "rounded-md border border-black/10 w-full",
                    isLoading && "opacity-50"
                  )}
                />
                <div className="text-xs text-gray-400 text-center mt-1">
                  Auto-extracted screenshot ({Math.round(imageData.length/1024)}KB)
                </div>
              </div>
              
              {/* Text content after the image */}
              {afterImage && (
                <div className="mt-3">
                  {renderTextContent(afterImage, `${segment.id || index}-after`, `${segmentId}-after`)}
                </div>
              )}
            </div>
          );
        }
      }
    }
    
    // Handle other segment types
    switch (segment.type) {
      case 'text':
        if (role === 'system' && segment.metadata?.type === 'operation-notification') {
          return (
            <div key={segment.id || index}>
              <div className="text-sm whitespace-pre-wrap break-words overflow-hidden w-full max-w-full">
                <span>{segment.content}</span>
                {isLoading && (
                  <span className="ml-2 inline-block animate-pulse">
                    <span className="bg-blue-300 rounded-full h-1 w-1 inline-block mx-0.5"></span>
                    <span className="bg-blue-400 rounded-full h-1 w-1 inline-block mx-0.5"></span>
                    <span className="bg-blue-500 rounded-full h-1 w-1 inline-block mx-0.5"></span>
                  </span>
                )}
              </div>
            </div>
          );
        }
        
        // Special handling for XML/JSON response format
        if (segment.content?.includes('<response_json>')) {
          // Import the state machine component for visualization
          const { StateMachine } = require('@/lib/streamStates');
          
          // Create a new state machine instance
          const stateMachine = new StateMachine();
          
          // Helper to extract parts in the same way the stream would arrive
          const extractStreamParts = (content: string): string[] => {
            const extracted: string[] = [];
            
            // Extract the opening response_json tag and any content before first block
            const openingMatch = content.match(/(<response_json>)([^<]*)/);
            if (openingMatch) {
              extracted.push(`data: {"choices":[{"delta":{"content":"${openingMatch[1]}","type":"text","metadata":{},"role":"assistant"}}]}`);
              if (openingMatch[2]?.trim()) {
                const escapedContent = openingMatch[2]
                  .replace(/\\/g, '\\\\')
                  .replace(/"/g, '\\"')
                  .replace(/\n/g, '\\n')
                  .replace(/\r/g, '\\r')
                  .replace(/\t/g, '\\t');
                extracted.push(`data: {"choices":[{"delta":{"content":"${escapedContent}","type":"text","metadata":{},"role":"assistant"}}]}`);
              }
            }
            
            // Extract blocks - use Set to ensure unique blocks
            const blockMatches = content.match(/(<block type="[^"]*">)([\s\S]*?)(<\/block>)/g);
            if (blockMatches) {
              // Use a Set to ensure we don't add duplicate blocks
              const uniqueBlocks = new Set(blockMatches);
              
              uniqueBlocks.forEach(block => {
                // Add each block as its own chunk - escape special chars for JSON
                const escapedBlock = block
                  .replace(/\\/g, '\\\\')
                  .replace(/"/g, '\\"')
                  .replace(/\n/g, '\\n')
                  .replace(/\r/g, '\\r')
                  .replace(/\t/g, '\\t');
                extracted.push(`data: {"choices":[{"delta":{"content":"${escapedBlock}","type":"text","metadata":{},"role":"assistant"}}]}`);
              });
            }
            
            // Extract tool calls
            const toolCallMatch = content.match(/(\{"operation": "[^"]+".*?\})/);
            if (toolCallMatch) {
              const escapedToolCall = toolCallMatch[1]
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n');
              extracted.push(`data: {"choices":[{"delta":{"content":"${escapedToolCall}","type":"action","metadata":{},"role":"assistant"}}]}`);
            }
            
            // Extract tool outputs - folder listings & file contents
            const toolOutputMatch = content.match(/(Contents of directory:[\s\S]*?)(<block type=|<\/response_json>)/);
            if (toolOutputMatch) {
              const escapedOutput = toolOutputMatch[1]
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
              extracted.push(`data: {"choices":[{"delta":{"content":"${escapedOutput}","type":"text","metadata":{},"role":"assistant"}}]}`);
            }
            
            // Extract file view output
            const fileViewMatch = content.match(/(🔍 View File[\s\S]*?)(<block type=|<\/response_json>)/);
            if (fileViewMatch) {
              const escapedFileView = fileViewMatch[1]
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
              extracted.push(`data: {"choices":[{"delta":{"content":"${escapedFileView}","type":"text","metadata":{},"role":"assistant"}}]}`);
            }
            
            // Extract closing response_json tag
            if (content.includes('</response_json>')) {
              extracted.push(`data: {"choices":[{"delta":{"content":"</response_json>","type":"text","metadata":{},"role":"assistant"}}]}`);
            }
            
            // Add completion marker
            extracted.push(`data: {"choices":[{"delta":{"content":"","finish_reason":"stop"}}]}`);
            
            return extracted;
          };
          
          // Process simulated stream parts through the state machine
          const streamParts = extractStreamParts(segment.content);
          streamParts.forEach(part => {
            stateMachine.processChunk(part);
          });
          
          // Finalize the state machine
          stateMachine.finalize();
          
          // Use the raw HTML output from the state machine
          const stateHtml = stateMachine.generateHtml(isLoading);
          
          return (
            <div key={segment.id || index}>
              <div 
                className="text-sm whitespace-pre-wrap break-all break-words overflow-hidden"
                dangerouslySetInnerHTML={{ 
                  __html: sanitizeHtmlContent(stateHtml)
                }}
              />
              
              {/* Streaming indicator */}
              {isLoading && (
                <div className="flex items-center mt-2 rounded bg-blue-50 px-3 py-1 text-blue-800 animate-pulse">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-xs font-medium">Streaming...</span>
                </div>
              )}
            </div>
          );
        }
        
        // Detect directory listing patterns
        const hasDirListing = segment.content?.includes('Contents of directory:') &&
          (segment.content?.includes('Folders:') || segment.content?.includes('Files:'));
        
        // Split content if it contains both directory listings and regular text
        if (hasDirListing && segment.content?.includes('###')) {
          // Find the end of the directory listing (usually ends with empty lines before text starts)
          const directoryEndIndex = segment.content.indexOf('\n\n', segment.content.indexOf('Contents of directory:'));
          
          if (directoryEndIndex > 0) {
            // Split into directory listing and markdown content
            const dirContent = segment.content.substring(0, directoryEndIndex + 2);
            const markdownContent = segment.content.substring(directoryEndIndex + 2);
            
            return (
              <div key={segment.id || index}>
                {/* Render directory listing with ActionFormatter */}
                <div className="text-sm whitespace-pre-wrap break-words overflow-hidden mb-4 w-full max-w-full">
                  <ActionFormatter content={dirContent} />
                </div>
                
                {/* Render markdown content with our helper function */}
                {renderTextContent(markdownContent, `${segment.id || index}-markdown`, `${segmentId}-markdown`)}
              </div>
            );
          }
        }
        
        // Simple raw text rendering without any processing
        return (
          <div key={segment.id || index} className="text-sm whitespace-pre-wrap break-words overflow-hidden w-full max-w-full">
            {segment.content}
          </div>
        );
      
      case 'screenshot':
        // Handle regular screenshots
        if (segment.content && !segment.screenshot_start && !segment.screenshot_end) {
          return (
            <div key={segment.id || index} className="mt-2 mb-2">
              <img
                src={`data:image/png;base64,${segment.content}`}
                alt={segment.metadata?.title || "Screenshot"}
                className={cn(
                  "rounded-md border border-black/10 w-full",
                  isLoading && "opacity-50"
                )}
              />
            </div>
          );
        }
        
        // Handle the start of a screenshot transmission
        else if (segment.screenshot_start) {
          window._screenshotData = '';
          return null;
        }
        
        // Handle the screenshot data
        else if (segment.screenshot_chunk) {
          window._screenshotData = (window._screenshotData || '') + segment.screenshot_chunk;
          return null;
        }
        
        // Handle the end of transmission
        else if (segment.screenshot_end && window._screenshotData) {
          const imageData = window._screenshotData;
          window._screenshotData = '';
          return (
            <div key={segment.id || index} className="mt-2 mb-2">
              <img
                src={`data:image/png;base64,${imageData}`}
                alt={segment.metadata?.title || "Screenshot"}
                className={cn(
                  "rounded-md border border-black/10 w-full",
                  isLoading && "opacity-50"
                )}
              />
            </div>
          );
        }
        return null;
      
      case 'code':
        return (
          <CodeBlock
            key={segment.id || index}
            content={segment.content}
            metadata={segment.metadata}
            onCopy={handleCopy}
            isLoading={isLoading}
          />
        );

      case 'file':
        return (
          <FileViewBlock
            key={segment.id || index}
            content={segment.content}
            metadata={segment.metadata}
            onCopy={handleCopy}
            isLoading={isLoading}
          />
        );
      
      case 'error':
        return (
          <div key={segment.id || index} className="text-sm text-red-600">
            {segment.content}
            {onRetry && !isLoading && (
              <button
                onClick={onRetry}
                className="ml-2 text-indigo-600 hover:text-indigo-700"
              >
                Retry
              </button>
            )}
          </div>
        );
      
      default:
        return null;
    }
  }

  const messageTimestamp = new Date(timestamp || Date.now()).getTime();
  
  // Only log in development and only when debugging is enabled
  if (process.env.NODE_ENV === 'development' && window._DEBUG_LOGS) {
    console.log("RENDERING MESSAGE:", { 
      role, 
      segments: segments.length,
      segmentTypes: segments.map(s => s.type),
      isThinking 
    });
  }

  return (
    <div 
      id={`chat-message-container-${messageTimestamp}-${role}`}
      data-message-id={`${messageTimestamp}-${role}`}
      className={cn(
        "flex mb-4 w-full",
        role === 'user' ? "justify-end" : "justify-start",
        role === 'system' && "justify-center",
        isLoading && "opacity-75"
      )}
    >
      <div 
        id={`chat-message-content-${messageTimestamp}-${role}`}
        className={cn(
          "max-w-[80%] min-w-0",
          "overflow-hidden",
          role === 'user' ? "text-right" : "",
          role === 'system' && "max-w-[90%] text-center"
        )}
      >
        <div
          id={`chat-message-bubble-${messageTimestamp}-${role}`}
          className={cn(
            "w-full rounded-xl px-4 py-2 shadow-sm break-words overflow-hidden",
            role === 'user'
              ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white"
              : role === 'system'
              ? "bg-gray-100 border border-gray-200 text-gray-600"
              : "bg-white border border-gray-200 text-gray-800",
            isLoading && "cursor-wait"
          )}
          style={{ 
            maxWidth: '100%', /* Ensure bubble doesn't exceed its container */
            overflowX: 'hidden', /* Force internal scrolling on components that need it */
            display: 'grid', /* Use grid layout for better containment */
            gridTemplateColumns: 'minmax(0, 1fr)', /* Critical for overflow handling */
            contain: 'layout paint style', /* Prevent layout effects from escaping */
            boxSizing: 'border-box' /* Include padding in width calculation */
          }}
        >
          {/* First, render thinking components if available - use message-specific state */}
          {(messageThinkingState === 'active' || messageThinkingState === 'complete') && (
            <div className="mb-4">
              <ThinkingBlock
                thinking={messageThinkingContent || ''}
                signature={messageThinkingSignature}
                metadata={{
                  complexity: 'standard',
                  type: 'thinking'
                }}
                isLoading={messageThinkingState === 'active' && isLoading}
              />
            </div>
          )}
          
          {messageThinkingState === 'pending' && (
            <div className="mb-4">
              <ThinkingIndicator 
                message={messageThinkingStatus || 'CODAI is thinking deeply...'}
                isLoading={isLoading}
              />
            </div>
          )}
          
          {/* Then, show regular content regardless of thinking state */}
          {segments.length === 0 && isThinking ? (
            <div className="flex items-center space-x-2 min-h-[24px] min-w-[100px]">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              <span className="text-sm text-gray-500">CODAI is thinking...</span>
            </div>
          ) : stateHtml ? (
            // If we have state HTML, render it directly
            <div 
              className="state-html-container w-full max-w-full" 
              style={{ 
                maxWidth: '100%', 
                width: '100%', 
                overflowX: 'hidden', /* Hide overflow at container level */
                display: 'grid', /* Grid layout for better containment */
                gridTemplateColumns: 'minmax(0, 1fr)', /* Force column to handle overflow */
                contain: 'paint layout style', /* Contain layout effects */
                boxSizing: 'border-box' /* Include padding in width calculation */
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(stateHtml) }}
            />
          ) : (
            processedSegments.map(renderSegment)
          )}
        </div>
        {timestamp && (
          <div>
            <span className={cn(
              "text-xs text-gray-500 mt-1 inline-block",
              isLoading && "opacity-50"
            )}>
              {new Date(timestamp).toLocaleTimeString()}
            </span>
            
            {/* Show streaming state indicator */}
            {isLoading && (
              <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                Streaming...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}