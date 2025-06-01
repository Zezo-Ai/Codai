import React from 'react';
import { cn } from "@/lib/utils";

interface MessageInspectorContentProps {
    children: React.ReactNode;
    className?: string;
}

export const MessageInspectorContent: React.FC<MessageInspectorContentProps> = ({
    children,
    className
}) => {
    return (
        <div className={cn(
            "flex-1 overflow-hidden min-h-0 px-4 pb-4",
            className
        )}>
            <div className="h-full overflow-auto border rounded-lg">
                {children}
            </div>
        </div>
    );
};