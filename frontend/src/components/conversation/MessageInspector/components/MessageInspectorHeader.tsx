import React from 'react';
import { cn } from "@/lib/utils";

interface MessageInspectorHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export const MessageInspectorHeader: React.FC<MessageInspectorHeaderProps> = ({
    children,
    className
}) => {
    return (
        <div className={cn(
            "flex-none px-4 py-2 bg-white",
            className
        )}>
            {children}
        </div>
    );
};