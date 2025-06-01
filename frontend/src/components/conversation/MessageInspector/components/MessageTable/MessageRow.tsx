import React, { useState } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { cn } from "@/lib/utils";
import { SelectionCell } from './SelectionCell';
import { RoleCell } from './RoleCell';
import { MessageContent } from '../MessageContent';
import { MessageWithValidation } from '../../types/message.types';
import { isToolMessage } from '../../utils/toolChainSelection';
import { Wrench } from 'lucide-react';

interface MessageRowProps {
    message: MessageWithValidation;
    onSelect: (isShiftKey: boolean, isCtrlKey: boolean) => void;
}

export const MessageRow: React.FC<MessageRowProps> = ({
    message,
    onSelect
}) => {
    const [isHovering, setIsHovering] = useState(false);
    const isTool = isToolMessage(message);
    
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        onSelect(e.shiftKey, e.ctrlKey);
    };
    
    const handleMouseEnter = () => {
        setIsHovering(true);
    };
    
    const handleMouseLeave = () => {
        setIsHovering(false);
    };

    return (
        <TableRow 
            className={cn(
                "relative transition-colors",
                message.isSelected && "bg-gray-50",
                message.isRangeStart && "border-l-4 border-l-blue-500 bg-blue-50",
                message.isRangeEnd && "border-r-4 border-r-blue-500 bg-blue-50",
                message.isInRange && "bg-gray-50 border-l border-l-gray-300",
                message.isInvalid && "border-red-500 bg-red-50 hover:bg-red-100",
                isTool && "hover:bg-amber-50",
                isTool && message.isSelected && "bg-amber-100"
            )}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <SelectionCell
                isSelected={message.isSelected}
                isInvalid={message.isInvalid}
                validationErrors={message.validationErrors}
                isTool={isTool}
                onClick={handleClick}
            />
            
            <RoleCell
                role={message.role}
                content={message.content}
                isInvalid={message.isInvalid}
                validationErrors={message.validationErrors}
            />
            
            <TableCell className="relative">
                <MessageContent content={message.content} />
                
                {/* Tool chain indicator */}
                {isTool && isHovering && (
                    <div className="absolute right-2 top-2 bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-xs flex items-center shadow-sm">
                        <Wrench className="h-3 w-3 mr-1" />
                        Ctrl+Click to select entire tool chain
                    </div>
                )}
            </TableCell>
            
            <TableCell>
                {new Date(message.timestamp).toLocaleString()}
            </TableCell>
        </TableRow>
    );
};