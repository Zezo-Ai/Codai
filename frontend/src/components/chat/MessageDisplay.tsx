/**
 * Component for displaying messages from the stream processor
 */

'use client'

import React from 'react';
import { Message, MessageSegment } from '@/lib/stream';

interface MessageDisplayProps {
  message: Message;
  isThinking?: boolean;
}

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

/**
 * Simple function to process markdown in text content
 * This preserves existing HTML while converting markdown elements
 */
function processMarkdown(content: string): string {
  // Skip processing if the content already contains HTML (except for markdown elements)
  if (content.includes('<div') || content.includes('<span') || content.includes('<pre')) {
    return content;
  }
  
  // Process markdown within <response_json> blocks
  // The regex looks for content in <block type="text"> elements
  return content.replace(
    /(<block type="text">)([\s\S]*?)(<\/block>)/g, 
    (match, openTag, blockContent, closeTag) => {
      // Process markdown in this text block
      let processed = blockContent
        // Process headings (# Heading, ## Heading)
        .replace(/^##\s+(.*?)$/gm, '<h2>$1</h2>')
        .replace(/^#\s+(.*?)$/gm, '<h1>$1</h1>')
        
        // Process unordered lists (- item)
        .replace(/^-\s+(.*?)$/gm, '<li>$1</li>')
        
        // Wrap adjacent list items in a <ul> element
        .replace(/(<li>.*?<\/li>\n)+/g, match => {
          return `<ul>${match}</ul>`;
        })
        
        // Process basic text formatting
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
      
      // Return the processed content within the original tags
      return openTag + processed + closeTag;
    }
  );
}

/**
 * Component for displaying a single message
 */
export function MessageDisplay({ message, isThinking = false }: MessageDisplayProps) {
  // Determine styling based on role
  const getMessageStyle = () => {
    switch (message.role) {
      case 'user':
        return 'bg-indigo-500 text-white';
      case 'system':
        return 'bg-gray-200 text-gray-800';
      case 'assistant':
      default:
        return 'bg-white border border-gray-200 text-gray-900';
    }
  };

  // Function to render message segments
  const renderSegment = (segment: MessageSegment) => {
    switch (segment.type) {
      case 'tool_call':
      case 'tool_result':
      case 'table':
      case 'image':
      case 'file':
      case 'error':
      case 'warning':
      case 'thinking':
      case 'system':
        // For HTML content from formatter, use dangerouslySetInnerHTML with sanitization
        return (
          <div 
            key={segment.id}
            className="segment"
            dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(segment.content) }}
          />
        );
      
      case 'code':
        // For code, use a pre block
        return (
          <pre key={segment.id} className="bg-gray-50 p-3 rounded overflow-x-auto">
            <code>{segment.content}</code>
          </pre>
        );
      
      case 'text':
      default:
        // Process markdown in text content before rendering, then sanitize
        const processedContent = sanitizeHtmlContent(processMarkdown(segment.content));
        return (
          <div 
            key={segment.id}
            className="segment"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        );
    }
  };
  
  // Render thinking indicator if needed
  if (isThinking) {
    return (
      <div className={`message flex flex-col max-w-3xl rounded-lg p-4 mb-4 ${getMessageStyle()}`}>
        <div className="flex items-center space-x-2">
          <div className="animate-pulse h-2 w-2 bg-gray-400 rounded-full"></div>
          <div className="animate-pulse h-2 w-2 bg-gray-400 rounded-full"></div>
          <div className="animate-pulse h-2 w-2 bg-gray-400 rounded-full"></div>
          <span className="text-sm text-gray-500 ml-1">Thinking...</span>
        </div>
      </div>
    );
  }

  // Render message with segments
  return (
    <div className={`message flex flex-col max-w-3xl rounded-lg p-4 mb-4 ${getMessageStyle()}`}>
      {message.segments.map(renderSegment)}
      
      {message.timestamp && (
        <div className="text-xs text-gray-500 mt-2">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}