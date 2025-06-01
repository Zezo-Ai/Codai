'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CodeBlockProps } from '../types'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

export function CodeBlock({ 
  content, 
  metadata, 
  onCopy,
  isLoading = false 
}: CodeBlockProps) {
  // Create unique component ID for tracing
  const componentId = useRef(`code-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const COMPONENT_NAME = `CodeBlock:${componentId.current}`;
  
  // Capture initial render and content
  useEffect(() => {
    // Log the component initialization
    diagnosticLogger.info(
      DiagnosticArea.RENDER, 
      COMPONENT_NAME, 
      'Component mounted', 
      'CodeBlock component initialized',
      {
        contentLength: content?.length || 0,
        contentPreview: content ? content.substring(0, 100) + '...' : 'empty',
        hasMetadata: !!metadata,
        language: metadata?.language || 'unknown',
        isLoading
      }
    );
    
    // Capture input content snapshot for diagnostics
    if (content) {
      const snapshotId = diagnosticLogger.captureSnapshot(
        DiagnosticArea.CONTENT,
        COMPONENT_NAME,
        { content, metadata },
        'Initial code content and metadata'
      );
    }
    
    return () => {
      diagnosticLogger.debug(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Component unmounted',
        'CodeBlock component cleanup'
      );
    };
  }, []);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      onCopy?.(content)
      
      diagnosticLogger.info(
        DiagnosticArea.RENDER, 
        COMPONENT_NAME, 
        'User interaction', 
        'Code copied to clipboard',
        { contentLength: content.length }
      );
    } catch (error) {
      diagnosticLogger.error(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Copy error',
        'Failed to copy code to clipboard',
        error
      );
    }
  }

  // Detect code language from content or metadata
  const detectLanguage = useMemo(() => {
    if (metadata?.language) {
      diagnosticLogger.debug(
        DiagnosticArea.FORMAT,
        COMPONENT_NAME,
        'Language detection',
        'Using language from metadata',
        { language: metadata.language }
      );
      return metadata.language;
    }
    
    diagnosticLogger.debug(
      DiagnosticArea.FORMAT,
      COMPONENT_NAME,
      'Language detection',
      'Attempting to detect language from content',
      { contentLength: content.length }
    );
    
    // Simple language detection based on content
    let detectedLanguage = 'text';
    let detectionRule = 'default';
    
    if (content.includes('def ') || content.includes('print(')) {
      detectedLanguage = 'python';
      detectionRule = 'python keywords';
    }
    else if (content.includes('function') || content.includes('const ')) {
      detectedLanguage = 'javascript';
      detectionRule = 'javascript keywords';
    }
    else if (content.includes('interface') || content.includes('type ')) {
      detectedLanguage = 'typescript';
      detectionRule = 'typescript keywords';
    }
    
    diagnosticLogger.info(
      DiagnosticArea.FORMAT,
      COMPONENT_NAME,
      'Language detected',
      `Detected language: ${detectedLanguage}`,
      { detectionRule, contentPreview: content.substring(0, 50) + '...' }
    );
    
    return detectedLanguage;
  }, [content, metadata?.language])

  // Format the code with proper indentation
  const formattedCode = useMemo(() => {
    try {
      // If it's JSON content, try to format it
      if (detectLanguage === 'json') {
        diagnosticLogger.debug(
          DiagnosticArea.FORMAT,
          COMPONENT_NAME,
          'Code formatting',
          'Attempting to format JSON content'
        );
        
        const parsed = JSON.parse(content);
        const formatted = JSON.stringify(parsed, null, 2);
        
        diagnosticLogger.info(
          DiagnosticArea.FORMAT,
          COMPONENT_NAME,
          'Format success',
          'Successfully formatted JSON content',
          { originalLength: content.length, formattedLength: formatted.length }
        );
        
        return formatted;
      }
      
      // Otherwise return the content with preserved whitespace
      diagnosticLogger.debug(
        DiagnosticArea.FORMAT,
        COMPONENT_NAME,
        'Code formatting',
        `No special formatting for ${detectLanguage} content`
      );
      
      return content;
    } catch (e) {
      diagnosticLogger.warn(
        DiagnosticArea.FORMAT,
        COMPONENT_NAME,
        'Format error',
        'Error formatting code content',
        { error: e instanceof Error ? e.message : 'Unknown error', language: detectLanguage }
      );
      return content;
    }
  }, [content, detectLanguage])

  return (
    <div className="mt-2 rounded-xl bg-gray-50 border border-gray-200 p-4 overflow-hidden w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-indigo-600 truncate flex-1 mr-2">
          {detectLanguage}
          {metadata?.title && ` - ${metadata.title}`}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            "text-xs text-gray-500 hover:text-gray-700 flex-shrink-0",
            isLoading && "pointer-events-none opacity-50"
          )}
          disabled={isLoading}
          aria-label="Copy code"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <div className="w-full overflow-hidden">
        <div 
          className="overflow-x-auto"
          ref={(el) => {
            if (el) {
              const handleScroll = () => {
                diagnosticLogger.trace(
                  DiagnosticArea.RENDER,
                  COMPONENT_NAME,
                  'User interaction',
                  'Code block scrolled',
                  {
                    scrollLeft: el.scrollLeft,
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                    hasHorizontalScroll: el.scrollWidth > el.clientWidth,
                    language: detectLanguage
                  }
                );
              };
              el.addEventListener('scroll', handleScroll);
              return () => el.removeEventListener('scroll', handleScroll);
            }
          }}>
          <pre className={cn(
            "text-sm text-gray-800 whitespace-pre scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
            "w-full overflow-x-auto",
            isLoading && "opacity-75"
          )} style={{ maxWidth: '100%' }}>
            <code className="inline-block" style={{ 
              minWidth: 'min-content',
              maxWidth: '100%',
              overflowWrap: 'break-word',
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap'
            }}>{formattedCode}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}