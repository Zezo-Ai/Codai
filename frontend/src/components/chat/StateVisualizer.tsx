import React from 'react';
import '../../styles/states.css';

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

interface StateVisualizerProps {
  html: string;
  isVisible?: boolean;
}

/**
 * StateVisualizer Component
 * Renders the state machine visualization with proper styling
 */
const StateVisualizer: React.FC<StateVisualizerProps> = ({ 
  html, 
  isVisible = true 
}) => {
  if (!isVisible || !html) return null;
  
  return (
    <div 
      className="state-visualizer border border-gray-200 rounded bg-gray-50 mb-2.5 mt-2.5" 
      style={{ 
        width: '100%', 
        maxWidth: '100%',
        /* These styles will override any conflicting styles from states.css */
        '--override-background': 'transparent',
        '--override-border': 'none'
      }}
    >
      <div className="bg-gray-100 p-1.5 px-2.5 border-b border-gray-200">
        <div className="text-xs text-gray-700 font-semibold">State Transitions</div>
      </div>
      <div className="p-1.5 overflow-auto max-h-36 font-mono text-[10px]">
        <div 
          dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(html) }} 
          style={{ 
            maxWidth: '100%', 
            overflowX: 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word'
          }}
          className="state-visualizer-content"
        />
      </div>
    </div>
  );
};

export default StateVisualizer;