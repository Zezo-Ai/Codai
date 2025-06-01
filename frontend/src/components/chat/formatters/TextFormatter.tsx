'use client'

import React, { useMemo, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { cn } from '@/lib/utils'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

interface TextFormatterProps {
  content: string
  options?: {
    enableMarkdown?: boolean
    enableLists?: boolean
    enableCodeBlocks?: boolean
    className?: string
  }
}

const defaultOptions = {
  enableMarkdown: true,
  enableLists: true,
  enableCodeBlocks: true
}

export const TextFormatter: React.FC<TextFormatterProps> = ({ 
  content,
  options = defaultOptions
}) => {
  // Create unique component ID for tracing
  const componentId = useRef(`text-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const COMPONENT_NAME = `TextFormatter:${componentId.current}`;
  
  // Capture initial render
  useEffect(() => {
    // Log the component initialization
    diagnosticLogger.info(
      DiagnosticArea.RENDER, 
      COMPONENT_NAME, 
      'Component mounted', 
      'TextFormatter component initialized',
      {
        contentLength: content?.length || 0,
        options: {
          enableMarkdown: options.enableMarkdown,
          enableLists: options.enableLists,
          enableCodeBlocks: options.enableCodeBlocks
        }
      }
    );
    
    // Capture input content snapshot for diagnostics
    if (content) {
      const snapshotId = diagnosticLogger.captureSnapshot(
        DiagnosticArea.CONTENT,
        COMPONENT_NAME,
        { content, options },
        'Initial text content and options'
      );
    }
    
    return () => {
      diagnosticLogger.debug(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Component unmounted',
        'TextFormatter component cleanup'
      );
    };
  }, []);
  
  const processedContent = useMemo(() => {
    diagnosticLogger.debug(
      DiagnosticArea.FORMAT,
      COMPONENT_NAME,
      'Format process',
      'Starting text content processing',
      { contentLength: content.length, enableLists: options.enableLists }
    );
    
    let processed = content;
    const formatChanges: Record<string, { before: string, after: string }> = {};

    if (options.enableLists) {
      // Enhanced list spacing
      const beforeListSpacing = processed;
      processed = processed.replace(/^(\d+\.)(\s*)/gm, '$1 ')
      processed = processed.replace(/^([*-])(\s*)/gm, '$1 ')
      
      // Add extra spacing after lists for better readability
      processed = processed.replace(/(\n[*-]\s.*\n)(?=[^*-\s])/g, '$1\n')
      
      if (processed !== beforeListSpacing) {
        formatChanges.listSpacing = {
          before: beforeListSpacing.substring(0, 100) + '...',
          after: processed.substring(0, 100) + '...'
        };
        
        diagnosticLogger.debug(
          DiagnosticArea.FORMAT,
          COMPONENT_NAME,
          'List formatting',
          'Applied list spacing adjustments'
        );
      }
    }

    // Improved whitespace handling
    const beforeWhitespaceHandling = processed;
    processed = processed.replace(/\n{3,}/g, '\n\n')
    processed = processed.trim()
    
    if (processed !== beforeWhitespaceHandling) {
      formatChanges.whitespaceHandling = {
        before: beforeWhitespaceHandling.substring(0, 100) + '...',
        after: processed.substring(0, 100) + '...'
      };
      
      diagnosticLogger.debug(
        DiagnosticArea.FORMAT,
        COMPONENT_NAME,
        'Whitespace handling',
        'Applied whitespace normalizations'
      );
    }
    
    // Log formatting changes
    if (Object.keys(formatChanges).length > 0) {
      diagnosticLogger.info(
        DiagnosticArea.FORMAT,
        COMPONENT_NAME,
        'Format changes',
        `Applied ${Object.keys(formatChanges).length} formatting changes`,
        { changes: formatChanges }
      );
    } else {
      diagnosticLogger.debug(
        DiagnosticArea.FORMAT,
        COMPONENT_NAME,
        'No changes',
        'No formatting changes were necessary'
      );
    }

    return processed;
  }, [content, options.enableLists])

  // Log rendering decision and apply appropriate rendering method
  if (!options.enableMarkdown) {
    diagnosticLogger.debug(
      DiagnosticArea.RENDER,
      COMPONENT_NAME,
      'Render decision',
      'Using plain text rendering (markdown disabled)',
      { contentLength: processedContent.length }
    );
    
    return (
      <div className={cn(
        "text-sm text-gray-800 whitespace-pre-wrap leading-relaxed",
        options.className
      )}>
        {processedContent}
      </div>
    )
  }
  
  diagnosticLogger.debug(
    DiagnosticArea.RENDER,
    COMPONENT_NAME,
    'Render decision',
    'Using markdown rendering',
    { 
      contentLength: processedContent.length,
      plugins: ['remarkGfm', 'remarkBreaks']
    }
  );

  return (
    <ReactMarkdown
      className={cn(
        "prose prose-sm max-w-none",
        "prose-headings:font-semibold prose-headings:text-gray-800",
        "prose-p:my-2.5 prose-p:text-gray-800 prose-p:leading-relaxed",
        "prose-ul:my-3 prose-ol:my-3",
        "prose-li:my-1.5 prose-li:leading-relaxed",
        "prose-code:bg-gray-50 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5",
        "prose-code:font-mono prose-code:text-sm",
        "prose-code:before:content-none prose-code:after:content-none",
        options.className
      )}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mb-3 mt-5">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-medium mb-2.5 mt-4">{children}</h3>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 mb-3 space-y-1.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 mb-3 space-y-1.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="mb-1.5 leading-relaxed">{children}</li>
        ),
        p: ({ children }) => (
          <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>
        ),
        code: ({ inline, children }) => (
          inline ? 
            <code className="bg-gray-50 rounded px-1.5 py-0.5 font-mono text-sm">{children}</code> :
            <pre className="bg-gray-50 rounded-lg p-3 overflow-x-auto">
              <code className="block font-mono text-sm">{children}</code>
            </pre>
        )
      }}
    >
      {processedContent}
    </ReactMarkdown>
  )
}