import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOperationLock } from './useOperationLock';

interface UseMessageInspectorStateProps {
    onOperationComplete?: () => Promise<void>;
}

interface OperationConfig {
    setDialogState: (state: boolean) => void;
    errorMessage: string;
}

export const useMessageInspectorState = ({ 
    onOperationComplete 
}: UseMessageInspectorStateProps = {}) => {
    const { toast } = useToast();
    const { isLocked, withLock } = useOperationLock();

    // Dialog states
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showSummaryDialog, setShowSummaryDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);

    // Handle operation with proper error handling and state updates
    const handleOperation = useCallback(async (
        operation: () => Promise<void>,
        { setDialogState, errorMessage }: OperationConfig
    ) => {
        try {
            await withLock(async () => {
                await operation();
                if (onOperationComplete) {
                    await onOperationComplete();
                }
                setDialogState(false);
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : errorMessage,
                variant: 'destructive',
                duration: 5000
            });
        }
    }, [withLock, onOperationComplete, toast]);

    return {
        // Dialog states
        showDeleteDialog,
        showSummaryDialog,
        showImportDialog,
        setShowDeleteDialog,
        setShowSummaryDialog,
        setShowImportDialog,

        // Operation state
        isLocked,
        handleOperation,
    };
};