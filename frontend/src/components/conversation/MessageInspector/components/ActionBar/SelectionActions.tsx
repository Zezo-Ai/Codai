import React from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SelectionActionsProps {
    selectedCount: number;
    isSummarizing: boolean;
    onSummaryClick: () => void;
    onDeleteClick: () => void;
}

export const SelectionActions: React.FC<SelectionActionsProps> = ({
    selectedCount,
    isSummarizing,
    onSummaryClick,
    onDeleteClick
}) => {
    return (
        <div className="flex items-center space-x-2">
            <Button
                variant="secondary"
                size="sm"
                disabled={selectedCount === 0 || isSummarizing}
                onClick={onSummaryClick}
                className="h-8 px-3"
            >
                {isSummarizing ? (
                    <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary mr-1.5" />
                        Summarizing...
                    </>
                ) : (
                    <>
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        Summarize ({selectedCount})
                    </>
                )}
            </Button>
            
            <Button
                variant="destructive"
                size="sm"
                disabled={selectedCount === 0}
                onClick={onDeleteClick}
                className="h-8 px-3"
            >
                Delete Selected ({selectedCount})
            </Button>
        </div>
    );
};