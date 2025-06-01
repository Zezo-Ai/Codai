import React from 'react';
import { cn } from "@/lib/utils";

interface MessageInspectorContainerProps {
    children: React.ReactNode;
    className?: string;
}

export const MessageInspectorContainer: React.FC<MessageInspectorContainerProps> = ({
    children,
    className
}) => {
    return (
        <div className={cn(
            "absolute inset-0 flex flex-col overflow-hidden",
            className
        )}>
            {children}
        </div>
    );
};