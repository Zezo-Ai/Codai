import React from 'react';
import { useRouter } from 'next/navigation';
import {
    Table,
    TableBody,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MessageRow } from './MessageRow';
import { MessageWithValidation } from '../../types/message.types';

interface MessageTableProps {
    messages: MessageWithValidation[];
    isLoading: boolean;
    page: number;
    hasMore: boolean;
    onLoadMore: () => void;
    onMessageSelect: (messageId: string, isShiftKey: boolean, isCtrlKey: boolean) => void;
}

export const MessageTable: React.FC<MessageTableProps> = ({
    messages,
    isLoading,
    page,
    hasMore,
    onLoadMore,
    onMessageSelect
}) => {
    const router = useRouter();

    if (isLoading && page === 1) {
        return (
            <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Loading messages...</p>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="p-8 text-center">
                <div className="max-w-sm mx-auto">
                    <h3 className="font-medium mb-2">No Messages Found</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        There are no messages in this conversation yet. Start a chat to see messages appear here.
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => router.back()}
                    >
                        Return to Chat
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-1">
                <div className="overflow-x-auto">
                    <Table className="min-w-full">
                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                            <TableRow>
                                <TableHead className="w-[50px] bg-white">Select</TableHead>
                                <TableHead className="w-[100px] bg-white">Role</TableHead>
                                <TableHead className="bg-white min-w-[400px]">Content</TableHead>
                                <TableHead className="w-[200px] bg-white">Timestamp</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {messages.map((message) => (
                                <MessageRow 
                                    key={message.id}
                                    message={message}
                                    onSelect={(isShiftKey, isCtrlKey) => onMessageSelect(message.id, isShiftKey, isCtrlKey)}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Load More */}
            {hasMore && (
                <div className="flex-none flex justify-center py-4 bg-white border-t">
                    <Button
                        variant="outline"
                        onClick={onLoadMore}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                                Loading more...
                            </>
                        ) : (
                            'Load More Messages'
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
};