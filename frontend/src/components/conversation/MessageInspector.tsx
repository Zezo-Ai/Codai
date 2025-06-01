'use client'

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePagination } from './MessageInspector/hooks/usePagination';
import { useMessageLoading } from './MessageInspector/hooks/useMessageLoading';
import { useMessageSelection } from './MessageInspector/hooks/useMessageSelection';
import { useMessageOperations } from './MessageInspector/hooks/useMessageOperations';
import { useMessageInspectorState } from './MessageInspector/hooks/useMessageInspectorState';
import { processMessages } from './MessageInspector/utils/messageProcessing';
import { ErrorBoundary } from './MessageInspector/components/ErrorBoundary';
import { MessageInspectorContainer } from './MessageInspector/components/MessageInspectorContainer';
import { MessageInspectorHeader } from './MessageInspector/components/MessageInspectorHeader';
import { MessageInspectorContent } from './MessageInspector/components/MessageInspectorContent';
import { MessageInspectorDialogs } from './MessageInspector/components/MessageInspectorDialogs';

// Components
import { ActionBar } from './MessageInspector/components/ActionBar/ActionBar';
import { MessageTable } from './MessageInspector/components/MessageTable/MessageTable';

interface MessageInspectorProps {
    sessionId: string;
    onMessagesDeleted?: () => void;
    initialPageSize?: number;
    initialOrder?: 'asc' | 'desc';
}

export function MessageInspector({ 
    sessionId,
    onMessagesDeleted,
    initialPageSize = 200,
    initialOrder = 'asc'
}: MessageInspectorProps) {
    const router = useRouter();

    // Pagination state and handlers
    const {
        page,
        pageSize,
        order,
        setPage,
        handlePageSizeChange,
        handleOrderChange: originalHandleOrderChange
    } = usePagination({ initialPageSize, initialOrder });

    // Message loading and state
    const {
        messages,
        isLoading,
        hasMore,
        fetchMessages
    } = useMessageLoading({
        sessionId,
        page,
        pageSize,
        order
    });

    // Message selection handling
    const {
        selectedMessages,
        rangeStart,
        rangeEnd,
        ranges,
        toolChains,
        validationResult,
        handleMessageSelection,
        clearSelection
    } = useMessageSelection({
        messages
    });

    // Message operations (delete, summarize, import/export)
    const {
        isExporting,
        isImporting,
        isSummarizing,
        handleExport,
        handleImport,
        handleDelete,
        handleSummarize
    } = useMessageOperations({
        sessionId,
        onMessagesDeleted,
        fetchMessages,
        clearSelection
    });

    // Refresh data helper - defined after all required hooks
    const refreshData = useCallback(async () => {
        clearSelection();
        setPage(1);
        await fetchMessages();
    }, [clearSelection, setPage, fetchMessages]);

    // Inspector state management
    const {
        showDeleteDialog,
        showSummaryDialog,
        showImportDialog,
        setShowDeleteDialog,
        setShowSummaryDialog,
        setShowImportDialog,
        isLocked,
        handleOperation
    } = useMessageInspectorState({
        onOperationComplete: refreshData
    });

    // Process messages with selection and validation state
    const processedMessages = React.useMemo(() => {
        return processMessages({
            messages,
            selectedMessages,
            rangeStart,
            rangeEnd,
            ranges,
            toolChains
        });
    }, [messages, selectedMessages, rangeStart, rangeEnd, ranges, toolChains]);

    // Operation handlers with proper error management
    const handleDeleteOperation = useCallback(async () => {
        await handleOperation(
            () => handleDelete(selectedMessages),
            {
                setDialogState: setShowDeleteDialog,
                errorMessage: 'Failed to delete messages'
            }
        );
    }, [handleOperation, handleDelete, selectedMessages, setShowDeleteDialog]);

    const handleSummarizeOperation = useCallback(async () => {
        await handleOperation(
            () => handleSummarize(selectedMessages),
            {
                setDialogState: setShowSummaryDialog,
                errorMessage: 'Failed to create summary'
            }
        );
    }, [handleOperation, handleSummarize, selectedMessages, setShowSummaryDialog]);

    const handleImportOperation = useCallback(async (file: File) => {
        await handleOperation(
            () => handleImport(file),
            {
                setDialogState: setShowImportDialog,
                errorMessage: 'Failed to import messages'
            }
        );
    }, [handleOperation, handleImport, setShowImportDialog]);

    // Create wrapped handlers that clear selection first
    const handleOrderChange = useCallback(() => {
        // Clear any selected messages to avoid confusion when order changes
        clearSelection();
        // Then change the order
        originalHandleOrderChange();
    }, [clearSelection, originalHandleOrderChange]);
    
    // Similarly for page size changes
    const handlePageSizeChangeWithClear = useCallback((newSize: string) => {
        // Clear selection when changing page size
        clearSelection();
        // Then change page size
        handlePageSizeChange(newSize);
    }, [clearSelection, handlePageSizeChange]);

    // Action handlers
    const handleLoadMore = () => setPage(p => p + 1);
    const handleBackClick = () => router.back();

    return (
        <ErrorBoundary>
            <MessageInspectorContainer>
                <MessageInspectorHeader>
                    <ActionBar 
                        messageCount={messages.length}
                        selectedCount={selectedMessages.size}
                        isSummarizing={isSummarizing}
                        isExporting={isExporting}
                        isImporting={isImporting}
                        pageSize={pageSize}
                        order={order}
                        onPageSizeChange={handlePageSizeChangeWithClear}
                        onOrderChange={handleOrderChange}
                        onSummaryClick={() => setShowSummaryDialog(true)}
                        onDeleteClick={() => setShowDeleteDialog(true)}
                        onExportClick={handleExport}
                        onImportClick={() => setShowImportDialog(true)}
                        onBackClick={handleBackClick}
                    />
                </MessageInspectorHeader>

                <MessageInspectorContent>
                    <MessageTable 
                        messages={processedMessages}
                        isLoading={isLoading}
                        page={page}
                        hasMore={hasMore}
                        onLoadMore={handleLoadMore}
                        onMessageSelect={handleMessageSelection}
                    />
                </MessageInspectorContent>

                <MessageInspectorDialogs
                    showDeleteDialog={showDeleteDialog}
                    showSummaryDialog={showSummaryDialog}
                    showImportDialog={showImportDialog}
                    setShowDeleteDialog={setShowDeleteDialog}
                    setShowSummaryDialog={setShowSummaryDialog}
                    setShowImportDialog={setShowImportDialog}
                    onDelete={handleDeleteOperation}
                    onSummarize={handleSummarizeOperation}
                    onImport={handleImportOperation}
                    isLocked={isLocked}
                    isSummarizing={isSummarizing}
                    isImporting={isImporting}
                    selectedCount={selectedMessages.size}
                    validationResult={validationResult}
                />
            </MessageInspectorContainer>
        </ErrorBoundary>
    );
}