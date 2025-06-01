import React from 'react';
import { Zap, Wrench, Camera, AlertTriangle } from 'lucide-react';
import { MessageContentBlock } from '../types/message.types';

interface MessageBadgesProps {
    content: MessageContentBlock[];
    isInvalid?: boolean;
    validationErrors?: string[];
}

export const MessageBadges: React.FC<MessageBadgesProps> = ({ 
    content,
    isInvalid,
    validationErrors 
}) => {
    return (
        <div className="flex gap-1.5 items-center flex-nowrap">
            {/* Tool Usage Badge */}
            {content.some(c => c.type === 'tool_use') && (
                <span 
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-indigo-500 to-blue-500 text-white gap-1 shadow-sm whitespace-nowrap" 
                    title="This message contains tool usage"
                >
                    <Zap className="h-2.5 w-2.5 stroke-[2.5px]" />
                    <span className="whitespace-nowrap">TOOL&nbsp;USE</span>
                </span>
            )}

            {/* Tool Result Badge */}
            {content.some(c => c.type === 'tool_result') && (
                <span 
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white gap-1 shadow-sm" 
                    title="This message contains tool results"
                >
                    <Wrench className="h-2.5 w-2.5 stroke-[2.5px]" />
                    RESULT
                </span>
            )}

            {/* Screenshot Badge */}
            {content.some(c => 
                c.type === 'tool_result' && 
                Array.isArray(c.content) && 
                c.content.some(item => 
                    item && typeof item === 'object' && 'type' in item && item.type === 'screenshot'
                )
            ) && (
                <span 
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white gap-1 shadow-sm" 
                    title="Contains screenshot"
                >
                    <Camera className="h-2.5 w-2.5 stroke-[2.5px]" />
                    CAPTURE
                </span>
            )}

            {/* Invalid Selection Badge */}
            {isInvalid && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold 
                               bg-red-100 text-red-700 border border-red-200">
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                    Invalid Selection
                </span>
            )}
        </div>
    );
};