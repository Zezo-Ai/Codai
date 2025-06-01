import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { ConversationInspectorService } from '@/services/conversation-inspector';
import { createToastConfig } from '../utils/toast';

interface UseMessageOperationsProps {
    sessionId: string;
    onMessagesDeleted?: () => void;
    fetchMessages: () => Promise<void>;
    clearSelection: () => void;
}

export const useMessageOperations = ({
    sessionId,
    onMessagesDeleted,
    fetchMessages,
    clearSelection
}: UseMessageOperationsProps) => {
    const { toast } = useToast();
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const response = await ConversationInspectorService.exportMessages(sessionId);
            
            if (response.success && response.data) {
                const blob = new Blob(
                    [JSON.stringify(response.data, null, 2)], 
                    { type: 'application/json' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `messages-${sessionId}-${new Date().toISOString()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                toast(createToastConfig(
                    'success',
                    'Export Successful',
                    `Exported ${response.metadata.message_count} messages`
                ));
            } else {
                toast(createToastConfig(
                    'error',
                    'Export Failed',
                    response.error || 'Failed to export messages'
                ));
            }
        } catch (error) {
            toast(createToastConfig(
                'error',
                'Export Error',
                error instanceof Error ? error.message : 'Failed to export session'
            ));
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (uploadedFile: File) => {
        setIsImporting(true);
        try {
            const fileContent = await uploadedFile.text();
            const importData = JSON.parse(fileContent);
            
            const response = await ConversationInspectorService.importMessages(
                sessionId,
                importData
            );

            if (response.success) {
                toast(createToastConfig(
                    'success',
                    'Import Successful',
                    `Imported ${response.metadata.imported_messages} messages`
                ));
                clearSelection();
                fetchMessages();
            } else {
                toast(createToastConfig(
                    'error',
                    'Import Failed',
                    response.error || 'Failed to import session'
                ));
            }
        } catch (error) {
            toast(createToastConfig(
                'error',
                'Import Error',
                error instanceof Error ? error.message : 'Failed to import session'
            ));
        } finally {
            setIsImporting(false);
        }
    };

    const handleDelete = async (selectedMessages: Set<string>) => {
        try {
            const response = await ConversationInspectorService.deleteMessages({
                session_id: sessionId,
                message_ids: Array.from(selectedMessages),
            });

            if (response.success) {
                toast(createToastConfig(
                    'success',
                    'Success',
                    `Deleted ${response.deleted_count} messages`
                ));
                clearSelection();
                fetchMessages();
                onMessagesDeleted?.();
            } else {
                toast(createToastConfig(
                    'error',
                    'Warning',
                    response.errors?.join(', ') || 'Some messages could not be deleted'
                ));
            }
        } catch (error) {
            toast(createToastConfig(
                'error',
                'Error',
                error instanceof Error ? error.message : 'Failed to delete messages'
            ));
        }
    };

    const handleSummarize = async (selectedMessages: Set<string>) => {
        setIsSummarizing(true);
        try {
            const response = await ConversationInspectorService.summarizeMessages({
                session_id: sessionId,
                message_ids: Array.from(selectedMessages)
            });

            if (response.success) {
                const originalCount = response.metadata?.original_count || 0;
                const compressionRatio = response.metadata?.compression_ratio || 0;
                const compressionPercent = Math.round((1 - compressionRatio) * 100);
                
                toast(createToastConfig(
                    'success',
                    'Summary Created',
                    `Summarized ${originalCount} messages with ${compressionPercent}% reduction`
                ));
                
                clearSelection();
                fetchMessages();
            } else {
                toast(createToastConfig(
                    'error',
                    'Error',
                    response.error || 'Failed to create summary'
                ));
            }
        } catch (error) {
            toast(createToastConfig(
                'error',
                'Error',
                error instanceof Error ? error.message : 'Failed to summarize'
            ));
        } finally {
            setIsSummarizing(false);
        }
    };

    return {
        isExporting,
        isImporting,
        isSummarizing,
        handleExport,
        handleImport,
        handleDelete,
        handleSummarize
    };
};