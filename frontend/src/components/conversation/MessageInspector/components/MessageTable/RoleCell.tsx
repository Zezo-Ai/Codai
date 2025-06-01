import React from 'react';
import { TableCell } from '@/components/ui/table';
import { MessageBadges } from '../MessageBadges';
import { MessageContentBlock } from '../../types/message.types';

interface RoleCellProps {
    role: string;
    content: MessageContentBlock[];
    isInvalid?: boolean;
    validationErrors?: string[];
}

export const RoleCell: React.FC<RoleCellProps> = ({
    role,
    content,
    isInvalid,
    validationErrors
}) => {
    return (
        <TableCell className="font-medium">
            <div className="flex flex-col gap-2">
                <span className={role === 'assistant' ? 'text-blue-600' : 'text-green-600'}>
                    {role}
                </span>
                
                <MessageBadges
                    content={content}
                    isInvalid={isInvalid}
                    validationErrors={validationErrors}
                />
            </div>
        </TableCell>
    );
};