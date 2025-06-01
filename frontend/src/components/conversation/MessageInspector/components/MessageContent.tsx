import React from 'react';
import { MessageContentBlock } from '../types/message.types';

interface MessageContentProps {
    content: MessageContentBlock[];
}

export const MessageContent: React.FC<MessageContentProps> = ({ content }) => {
    return (
        <div className="space-y-1 max-w-full overflow-hidden">
            {content.map((block, index) => (
                <div key={index} className="my-1">
                    {block.type === 'text' && (
                        <div className="break-words">
                            <span>{block.text}</span>
                        </div>
                    )}
                    
                    {block.type === 'code' && (
                        <pre className="bg-muted p-2 rounded overflow-x-auto">
                            <code>{block.text}</code>
                        </pre>
                    )}
                    
                    {block.type === 'tool_result' && (
                        <div className="bg-slate-50 border rounded p-2 overflow-hidden">
                            <div className="text-sm text-slate-500 mb-1">
                                Tool Result 
                                {block.is_error && <span className="text-red-500 ml-1">(Error)</span>}
                                {block.tool_use_id && (
                                    <span className="text-xs text-gray-400 ml-2">
                                        ID: {block.tool_use_id}
                                    </span>
                                )}
                            </div>
                            
                            {Array.isArray(block.content) ? block.content.map((item: any, i: number) => {
                                // Try to parse JSON content if needed
                                let parsedItem = item;
                                if (typeof item === 'string' && item.trim().startsWith('{')) {
                                    try {
                                        parsedItem = JSON.parse(item);
                                    } catch (e) {
                                        console.error('Failed to parse JSON:', e);
                                    }
                                }

                                return (
                                    <div key={i} className="overflow-hidden">
                                        {/* Text content */}
                                        {(item.type === 'text' || typeof item === 'string') && (
                                            <div className="ml-2 my-1 break-words">
                                                <span>{item.text || item}</span>
                                            </div>
                                        )}
                                        
                                        {/* Screenshot/Image content */}
                                        {((item.type === 'image' && item.source?.data) || 
                                          (item.type === 'screenshot' && item.content)) && (
                                            <div className="mt-2 mb-2">
                                                <img
                                                    src={`data:image/png;base64,${
                                                        (item.type === 'image' && item.source?.data) ||
                                                        (item.type === 'screenshot' && item.content)
                                                    }`}
                                                    alt="Screenshot"
                                                    className="rounded-md border border-black/10 max-w-full h-auto"
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="ml-2 my-1 break-words">
                                    <span>{String(block.content)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};