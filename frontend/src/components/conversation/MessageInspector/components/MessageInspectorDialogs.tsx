import React from 'react';
import { DeleteDialog } from './Dialogs/DeleteDialog';
import { SummaryDialog } from './Dialogs/SummaryDialog';
import { ImportDialog } from './Dialogs/ImportDialog';
import { ValidationResult } from '../types/validation';
import { useDialogLoadingState } from './DialogLoadingState';

interface MessageInspectorDialogsProps {
    // Dialog states
    showDeleteDialog: boolean;
    showSummaryDialog: boolean;
    showImportDialog: boolean;
    setShowDeleteDialog: (show: boolean) => void;
    setShowSummaryDialog: (show: boolean) => void;
    setShowImportDialog: (show: boolean) => void;

    // Operations
    onDelete: () => Promise<void>;
    onSummarize: () => Promise<void>;
    onImport: (file: File) => Promise<void>;

    // States
    isLocked: boolean;
    isSummarizing: boolean;
    isImporting: boolean;
    selectedCount: number;
    validationResult: ValidationResult | null;
}

export const MessageInspectorDialogs: React.FC<MessageInspectorDialogsProps> = ({
    // Dialog states
    showDeleteDialog,
    showSummaryDialog,
    showImportDialog,
    setShowDeleteDialog,
    setShowSummaryDialog,
    setShowImportDialog,

    // Operations
    onDelete,
    onSummarize,
    onImport,

    // States
    isLocked,
    isSummarizing,
    isImporting,
    selectedCount,
    validationResult
}) => {
    const isSummarizingDisabled = useDialogLoadingState({
        operationLoading: isSummarizing,
        globalLock: isLocked
    });

    const isImportingDisabled = useDialogLoadingState({
        operationLoading: isImporting,
        globalLock: isLocked
    });

    return (
        <>
            <DeleteDialog 
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                onConfirm={onDelete}
                selectedCount={selectedCount}
                validationResult={validationResult}
            />

            <SummaryDialog 
                open={showSummaryDialog}
                onOpenChange={setShowSummaryDialog}
                onConfirm={onSummarize}
                isSummarizing={isSummarizingDisabled}
            />

            <ImportDialog 
                open={showImportDialog}
                onOpenChange={setShowImportDialog}
                onFileSelect={onImport}
                isImporting={isImportingDisabled}
            />
        </>
    );
};