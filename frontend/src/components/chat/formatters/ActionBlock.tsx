'use client'

import { useRef, useEffect } from 'react'
import type { ActionBlockProps, ActionObject, ActionType, CommandType, OperationType, ActionDisplay } from '../types'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

function formatFileContent(content: string): string {
  // Replace escaped newlines with actual newlines and preserve indentation
  return content.replace(/\\n/g, '\n')
}

export function ActionBlock({ 
  content,
  metadata,
  isLoading = false 
}: ActionBlockProps) {
  // Create unique component ID for tracing
  const componentId = useRef(`actionblock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const COMPONENT_NAME = `ActionBlock:${componentId.current}`;
  
  // Capture initial render
  useEffect(() => {
    // Log the component initialization
    diagnosticLogger.info(
      DiagnosticArea.RENDER, 
      COMPONENT_NAME, 
      'Component mounted', 
      'ActionBlock component initialized',
      {
        contentLength: content?.length || 0,
        contentPreview: content ? content.substring(0, 100) + '...' : 'empty',
        hasMetadata: !!metadata,
        isLoading
      }
    );
    
    return () => {
      diagnosticLogger.debug(
        DiagnosticArea.RENDER,
        COMPONENT_NAME,
        'Component unmounted',
        'ActionBlock component cleanup'
      );
    };
  }, []);
  
  try {
    diagnosticLogger.debug(
      DiagnosticArea.PARSER,
      COMPONENT_NAME,
      'Parsing action',
      'Attempting to parse action JSON content',
      { contentLength: content.length }
    );
    
    const actionObj = JSON.parse(content) as ActionObject
    
    // Check if this is a search query object
    if (actionObj.query && !actionObj.action && !actionObj.command && !actionObj.operation) {
      // It's a search query, handle it as a web_search action
      actionObj.action = 'web_search';
      
      diagnosticLogger.debug(
        DiagnosticArea.PARSER,
        COMPONENT_NAME,
        'Action inference',
        'Identified query object as web_search action',
        { query: actionObj.query }
      );
    }
    
    // Handle action, command, and operation types
    const { icon, title } = actionObj.operation 
      ? getOperationDisplay(actionObj.operation)
      : actionObj.command 
        ? getCommandDisplay(actionObj.command)
        : getActionDisplay(actionObj.action as ActionType)
        
    diagnosticLogger.debug(
      DiagnosticArea.FORMAT,
      COMPONENT_NAME,
      'Action categorization',
      'Determined action type and display properties',
      { 
        actionType: actionObj.operation 
          ? `operation:${actionObj.operation}` 
          : actionObj.command 
            ? `command:${actionObj.command}` 
            : `action:${actionObj.action}`,
        title,
        hasFileText: !!actionObj.file_text
      }
    );

    // Format file_text if present
    const displayText = actionObj.file_text 
      ? `${getDisplayText(actionObj)}\n\nContent:\n${formatFileContent(actionObj.file_text)}`
      : getDisplayText(actionObj)

    return (
      <span className="inline-block my-2">
        <span className="block border rounded-lg overflow-hidden bg-blue-50 border-blue-100">
          <span className="flex items-center gap-2 bg-blue-100/50 px-3 py-2">
            <span className="text-lg" role="img" aria-label={title}>
              {icon}
            </span>
            <span className="font-medium text-blue-700">
              {title}
            </span>
            {actionObj.metadata?.timestamp && (
              <span className="text-xs text-gray-500 ml-auto">
                {new Date(actionObj.metadata.timestamp).toLocaleTimeString()}
              </span>
            )}
          </span>
          <span className="block px-3 py-2">
            <pre className="text-sm text-gray-600 whitespace-pre-wrap font-mono">
              {displayText}
              {actionObj.metadata?.duration && (
                <span className="text-xs text-gray-500 ml-2">
                  ({actionObj.metadata.duration}ms)
                </span>
              )}
            </pre>
          </span>
        </span>
      </span>
    )
  } catch (e) {
    diagnosticLogger.error(
      DiagnosticArea.PARSER,
      COMPONENT_NAME,
      'Parse error',
      'Error parsing action JSON content',
      e,
      'ACTION-PARSE-ERR'
    );
    return <span>{content}</span>
  }
}

function getOperationDisplay(operation: OperationType): Pick<ActionDisplay, 'icon' | 'title'> {
  const displays: Record<OperationType, { icon: string; title: string }> = {
    create: { icon: '📁', title: 'Create Directory' },
    delete: { icon: '🗑️', title: 'Delete Item' },
    move: { icon: '📦', title: 'Move Item' },
    copy: { icon: '📋', title: 'Copy Item' },
    rename: { icon: '✏️', title: 'Rename Item' }
  }

  return displays[operation] || { icon: '🔧', title: 'System Operation' }
}

function getActionDisplay(action: ActionType): Pick<ActionDisplay, 'icon' | 'title'> {
  const displays: Record<string, { icon: string; title: string }> = {
    key: { icon: '⌨️', title: 'Keyboard Action' },
    type: { icon: '⌨️', title: 'Keyboard Input' },
    mouse_move: { icon: '🖱️', title: 'Mouse Movement' },
    left_click: { icon: '🖱️', title: 'Mouse Click' },
    right_click: { icon: '🖱️', title: 'Right Click' },
    middle_click: { icon: '🖱️', title: 'Middle Click' },
    double_click: { icon: '🖱️', title: 'Double Click' },
    left_click_drag: { icon: '🖱️', title: 'Mouse Drag' },
    screenshot: { icon: '📸', title: 'Screen Capture' },
    cursor_position: { icon: '📍', title: 'Cursor Location' },
    web_search: { icon: '🔍', title: 'Web Search' },
    web_fetch: { icon: '📄', title: 'Web Fetch' }
  }

  return displays[action] || { icon: '🔧', title: 'System Action' }
}

function getCommandDisplay(command: CommandType): Pick<ActionDisplay, 'icon' | 'title'> {
  const displays: Record<CommandType, { icon: string; title: string }> = {
    view: { icon: '🔍', title: 'View File' },
    edit: { icon: '✏️', title: 'Edit File' },
    create: { icon: '📝', title: 'Create File' },
    delete: { icon: '🗑️', title: 'Delete File' },
    execute: { icon: '▶️', title: 'Execute Command' }
  }

  return displays[command] || { icon: '🔧', title: 'System Command' }
}

function getDisplayText(action: ActionObject): string {
  if (action.operation) {
    switch (action.operation) {
      case 'create':
        return `Creating directory: ${action.path}${action.create_parents ? ' (with parent directories)' : ''}`
      case 'delete':
        return `Deleting: ${action.path}`
      case 'move':
        return `Moving: ${action.path}`
      case 'copy':
        return `Copying: ${action.path}`
      case 'rename':
        return `Renaming: ${action.path}`
      default:
        return action.text || `Performing operation: ${action.operation}`
    }
  }

  if (action.command) {
    switch (action.command) {
      case 'view':
        return `Viewing file: ${action.path}`
      case 'edit':
        return `Editing file: ${action.path}`
      case 'create':
        return `Creating file: ${action.path}`
      case 'delete':
        return `Deleting file: ${action.path}`
      case 'execute':
        return `Executing: ${action.text || 'command'}`
      default:
        return action.text || `Performing command: ${action.command}`
    }
  }

  // Handle action types
  switch (action.action) {
    case 'key':
      return `Pressing key: ${action.text}`
    case 'type':
      return `Typing: "${action.text}"`
    case 'mouse_move':
      return `Moving cursor to: (${action.coordinate?.join(', ')})`
    case 'left_click_drag':
      return `Dragging to: (${action.coordinate?.join(', ')})`
    case 'screenshot':
      return 'Capturing screen'
    case 'web_search':
      // Format for web search actions with query
      if (action.query) {
        let displayText = `Searching for: "${action.query}"`;
        if (action.engine) {
          displayText += `\nEngine: ${action.engine}`;
        }
        if (action.num_results) {
          displayText += `\nRequested results: ${action.num_results}`;
        }
        return displayText;
      }
      return action.text || 'Performing web search';
    case 'web_fetch':
      // Format for web fetch actions
      if (action.url) {
        return `Fetching content from: ${action.url}`;
      }
      return action.text || 'Fetching web content';
    default:
      return action.text || `Performing action: ${action.action}`
  }
}