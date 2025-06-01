'use client'

import React, { useState } from 'react'
import { Copy, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { vs } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import { CodeMetadata, FileStats, MessageMetadata } from '../types'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

interface FileViewProps {
    content: string
    metadata: MessageMetadata
    onCopy?: (content: string) => void
    isLoading?: boolean
}

const FileHeader: React.FC<{
    path: string
    metadata: MessageMetadata
    onCopy?: (content: string) => void
    content: string
    isExpanded: boolean
    onToggleExpand: () => void
}> = ({ path, metadata, onCopy, content, isExpanded, onToggleExpand }) => {
    const code = metadata?.code
    const stats = metadata?.stats
    
    return (
        <div className="flex flex-col px-4 py-2.5 bg-gray-50/80 border-b border-gray-100 rounded-t-lg">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-600">{path}</span>
                    {stats?.modified && (
                        <span className="text-xs text-gray-500">
                            {new Date(stats.modified * 1000).toLocaleString()}
                        </span>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    {code?.documentation_url && (
                        <a
                            href={code.documentation_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-gray-100 active:bg-gray-200 rounded-md transition-all hover:shadow-sm"
                            title="View documentation"
                        >
                            <ExternalLink className="h-4 w-4 text-gray-500" />
                        </a>
                    )}
                    {onCopy && (
                        <button
                            onClick={() => onCopy(content)}
                            className="p-1.5 hover:bg-gray-100 active:bg-gray-200 rounded-md transition-all hover:shadow-sm"
                            title="Copy file content"
                        >
                            <Copy className="h-4 w-4 text-gray-500" />
                        </button>
                    )}
                    <button
                        onClick={onToggleExpand}
                        className="p-1.5 hover:bg-gray-100 active:bg-gray-200 rounded-md transition-all hover:shadow-sm"
                        title={isExpanded ? "Collapse view" : "Expand view"}
                    >
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-500" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                        )}
                    </button>
                </div>
            </div>
            <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                {/* File type information */}
                <span>
                    {code ? code.display_name : 
                     path.toLowerCase().endsWith('.md') ? 'Markdown' :
                     path.toLowerCase().endsWith('.txt') ? 'Text' :
                     'File'}
                </span>
                
                {/* Framework information (for code files) */}
                {code?.features?.frameworks && code.features.frameworks.length > 0 && (
                    <span>Frameworks: {code.features.frameworks.join(', ')}</span>
                )}
                
                {/* Calculate file size from stats or content length if stats.size is invalid */}
                <span>
                    Size: {
                        (stats && stats.size && !isNaN(stats.size)) 
                            ? (stats.size / 1024).toFixed(1)
                            : (content?.length / 1024).toFixed(1)
                    }KB
                    {stats?.content?.was_truncated && ' (truncated)'}
                </span>
            </div>
        </div>
    )
}

const LineNumbers: React.FC<{
    lines?: Array<{
        number: number
        content: string
        highlighted: boolean
    }>
}> = ({ lines = [] }) => (
    <div className="select-none pr-2 pl-3 min-w-[3rem] text-right text-gray-400 bg-gray-50/50 border-r border-gray-100">
        {lines.map(line => (
            <div 
                key={line.number} 
                className={cn(
                    "text-xs leading-[1.5rem] h-6 font-mono py-0",
                    line.highlighted && "bg-yellow-100"
                )}
            >
                {line.number}
            </div>
        ))}
    </div>
)

const FileContent: React.FC<{
    content: string
    metadata: MessageMetadata
    lines?: Array<{
        number: number
        content: string
        highlighted: boolean
    }>
}> = ({ content, metadata, lines = [] }) => {
    const language = metadata?.code?.language || 'text'
    const supports_highlighting = metadata?.code?.features?.supports_highlighting ?? true
    
    // Clean content by removing backticks and language identifier
    const cleanContent = React.useMemo(() => {
        let cleaned = content
        // Remove leading language identifier and backticks
        cleaned = cleaned.replace(/^```\w*\n/, '')
        // Remove trailing backticks
        cleaned = cleaned.replace(/```$/, '')
        // Handle empty content
        if (!cleaned.trim()) {
            return content
        }
        return cleaned.trim()
    }, [content])
    
    return (
        <div className="pl-4 bg-white/50">
            <div 
                className="overflow-x-auto" 
                style={{ width: 'calc(100% - 1rem)' }}
                ref={(el) => {
                    if (el) {
                        const handleScroll = () => {
                            diagnosticLogger.trace(
                                DiagnosticArea.RENDER,
                                'FileViewBlock',
                                'User interaction',
                                'File view scrolled',
                                {
                                    scrollLeft: el.scrollLeft,
                                    scrollWidth: el.scrollWidth,
                                    clientWidth: el.clientWidth,
                                    hasHorizontalScroll: el.scrollWidth > el.clientWidth,
                                    fileType: metadata?.code?.language || 'text'
                                }
                            );
                        };
                        el.addEventListener('scroll', handleScroll);
                        return () => el.removeEventListener('scroll', handleScroll);
                    }
                }}>
                <SyntaxHighlighter
                    language={language}
                    style={vs}
                    customStyle={{ 
                        margin: 0, 
                        padding: '0',
                        background: 'transparent',
                        fontSize: '0.75rem',
                        lineHeight: '1.5rem',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        maxWidth: '100%',
                        overflowX: 'auto'
                    }}
                    codeTagProps={{
                        style: {
                            whiteSpace: 'pre',
                            lineHeight: '1.5rem',
                            display: 'block',
                            padding: '0'
                        }
                    }}
                    PreTag={({ children, ...props }) => (
                        <pre {...props} style={{ margin: 0, maxWidth: '100%', overflow: 'auto' }}>
                            {children}
                        </pre>
                    )}
                    CodeTag={({ children, ...props }) => (
                        <code {...props} style={{ 
                            display: 'inline-block',
                            maxWidth: '100%',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-all',
                            whiteSpace: 'pre-wrap'
                        }}>
                            {children}
                        </code>
                    )}
                    className="!bg-transparent !p-0"
                    showLineNumbers={false}
                    useInlineStyles={supports_highlighting}
                >
                    {cleanContent}
                </SyntaxHighlighter>
            </div>
        </div>
    )
}

export const FileViewBlock: React.FC<FileViewProps> = ({
    content,
    metadata,
    onCopy,
    isLoading = false
}) => {
    const [isExpanded, setIsExpanded] = useState(false)
    
    const lines = React.useMemo(() => {
        if (metadata?.lines) {
            return metadata.lines
        }
        const contentLines = content.split('\n')
        return contentLines.map((line, index) => ({
            number: index + 1,
            content: line,
            highlighted: false
        }))
    }, [metadata?.lines, content])

    return (
        <div className={cn(
            "rounded-lg border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]",
            "my-2 overflow-hidden",
            isExpanded ? "max-h-full" : "max-h-[600px]",
            "transition-all duration-200 ease-out"
        )}>
            <FileHeader
                path={metadata?.path || 'Untitled'}
                metadata={metadata || {}}
                onCopy={onCopy}
                content={content}
                isExpanded={isExpanded}
                onToggleExpand={() => setIsExpanded(!isExpanded)}
            />
            <div className="grid grid-cols-[3rem_1fr] overflow-hidden">
                <div className="overflow-hidden">
                    <LineNumbers lines={lines} />
                </div>
                <div className="overflow-hidden min-w-0">
                    <FileContent
                        content={content}
                        metadata={metadata || {}}
                        lines={lines}
                    />
                </div>
            </div>
            {metadata?.stats?.content?.was_truncated && (
                <div className="px-4 py-2.5 text-xs text-gray-400 border-t border-gray-100 bg-gray-50/30">
                    Content truncated. Original length: {metadata.stats.content.original_length} chars
                </div>
            )}
        </div>
    )
}