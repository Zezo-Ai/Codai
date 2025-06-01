import React from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SummaryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    isSummarizing: boolean;
}

export const SummaryDialog: React.FC<SummaryDialogProps> = ({
    open,
    onOpenChange,
    onConfirm,
    isSummarizing
}) => {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Create Summary
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        The selected messages will be replaced with a summary pair.
                        This action cannot be undone. The summary will preserve all
                        content references and maintain conversation context.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={isSummarizing}
                    >
                        {isSummarizing ? 'Summarizing...' : 'Create Summary'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};