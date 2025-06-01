import { useMemo, useRef, useEffect } from 'react'
import { ActionBlock } from './formatters'
import type { ActionObject } from './types'
import { PATTERNS, contentDetector } from '@/lib/patterns'
import { processorRegistry } from '@/lib/processors'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

interface ActionFormatterProps {
  content: string
}

export function ActionFormatter({ content }: ActionFormatterProps) {
  // Create unique component ID for tracing
  const componentId = useRef(`action-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const COMPONENT_NAME = `ActionFormatter:${componentId.current}`;
  
  // Capture initial render
  useEffect(() => {
    // Log the component initialization
    diagnosticLogger.info(
      DiagnosticArea.RENDER, 
      COMPONENT_NAME, 
      'Component mounted', 
      'ActionFormatter component initialized',
      {
        contentLength: content?.length || 0,
        contentPreview: content ? content.substring(0, 100) + '...' : 'empty'
      }
    );
    
    return () => {
      diagnosticLogger.debug(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Component unmounted',
        'ActionFormatter component cleanup'
      );
    };
  }, []);
  
  // Use memoization to prevent unnecessary re-processing
  const processedParts = useMemo(() => {
    if (!content) {
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Processing skipped',
        'Empty content provided'
      );
      return null;
    }
    
    diagnosticLogger.debug(
      DiagnosticArea.PARSER,
      COMPONENT_NAME,
      'Processing started',
      'Checking content for action commands',
      { contentLength: content.length }
    );
    
    try {
      // Use the ActionCommandProcessor to handle action commands
      const result = processorRegistry.processContent(content);
      
      // If no action commands found, return the content as-is
      if (!result.actions || result.actions.length === 0) {
        diagnosticLogger.debug(
          DiagnosticArea.PARSER,
          COMPONENT_NAME,
          'No actions found',
          'No action commands found in content'
        );
        return null;
      }
      
      diagnosticLogger.info(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Actions extracted',
        `Found ${result.actions.length} action commands`,
        { actionTypes: result.actions.map(a => a.type).join(', ') }
      );
      
      return result.actions;
    } catch (e) {
      diagnosticLogger.error(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Processing error',
        'Error processing content for actions',
        e
      );
      return null;
    }
  }, [content]);
  
  // If no processed parts or an error occurred, render the content as plain text
  if (!processedParts) {
    diagnosticLogger.debug(
      DiagnosticArea.RENDER,
      COMPONENT_NAME,
      'Render decision',
      'Rendering as plain text (no action commands found)'
    );
    return <span>{content}</span>;
  }
  
  diagnosticLogger.debug(
    DiagnosticArea.RENDER,
    COMPONENT_NAME,
    'Render decision',
    'Rendering processed action parts',
    { 
      partCount: processedParts.length,
      textParts: processedParts.filter(p => p.type === 'text').length,
      actionParts: processedParts.filter(p => p.type === 'action').length
    }
  );
  
  // Render the processed parts
  return (
    <span className="inline-flex flex-col w-full gap-2">
      {processedParts.map((part, index) => {
        if (part.type === 'text') {
          // Handle possible timestamps in text content
          const timeParts = contentDetector.splitByPattern(part.content, PATTERNS.TIMESTAMP);
          
          if (timeParts.length > 1) {
            diagnosticLogger.debug(
              DiagnosticArea.RENDER,
              COMPONENT_NAME,
              'Text processing',
              'Found timestamps in text content',
              { timestampCount: timeParts.filter(p => p.type === 'match').length }
            );
            
            return (
              <span key={`text-${index}`} className="inline-flex flex-wrap items-center">
                {timeParts.map((timePart, i) => {
                  if (timePart.type === 'match') {
                    return (
                      <span key={`time-${index}-${i}`} className="text-gray-500 mx-2">
                        {timePart.content}
                      </span>
                    );
                  } else if (timePart.content.trim()) {
                    return (
                      <span key={`text-part-${index}-${i}`} className="mr-2">
                        {timePart.content.trim()}
                      </span>
                    );
                  }
                  return null;
                })}
              </span>
            );
          }
          
          // Regular text without timestamps
          return (
            <span key={`text-${index}`} className="mr-2">
              {part.content}
            </span>
          );
        } else {
          // Render action block
          diagnosticLogger.debug(
            DiagnosticArea.RENDER,
            COMPONENT_NAME,
            'Action rendering',
            'Rendering action block',
            { 
              actionType: part.action?.type || 'unknown',
              contentLength: part.content.length
            }
          );
          
          return (
            <ActionBlock
              key={`action-${index}`}
              content={part.content}
            />
          );
        }
      })}
    </span>
  );
}