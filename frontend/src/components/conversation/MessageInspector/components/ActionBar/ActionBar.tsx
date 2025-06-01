import React from 'react';
import { ArrowLeft, Download, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ViewOptions } from './ViewOptions';
import { SelectionActions } from './SelectionActions';
import { NavigationActions } from './NavigationActions';
import { ExportImportActions } from './ExportImportActions';

interface ActionBarProps {
    messageCount: number;
    selectedCount: number;
    isSummarizing: boolean;
    isExporting: boolean;
    isImporting: boolean;
    pageSize: number;
    order: 'asc' | 'desc';
    onPageSizeChange: (size: string) => void;
    onOrderChange: () => void;
    onSummaryClick: () => void;
    onDeleteClick: () => void;
    onExportClick: () => void;
    onImportClick: () => void;
    onBackClick: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
    messageCount,
    selectedCount,
    isSummarizing,
    isExporting,
    isImporting,
    pageSize,
    order,
    onPageSizeChange,
    onOrderChange,
    onSummaryClick,
    onDeleteClick,
    onExportClick,
    onImportClick,
    onBackClick
}) => {
    return (
        <div className="flex justify-between items-start h-14">
            <div>
                <h2 className="text-xl font-semibold leading-tight mb-1">
                    Conversation Messages
                </h2>
                <p className="text-sm text-muted-foreground leading-none">
                    {messageCount} messages in conversation
                </p>
            </div>
            
            <div className="flex items-center gap-4">
                <ViewOptions 
                    pageSize={pageSize}
                    order={order}
                    onPageSizeChange={onPageSizeChange}
                    onOrderChange={onOrderChange}
                />

                <div className="h-8 w-px bg-gray-200" />

                <SelectionActions 
                    selectedCount={selectedCount}
                    isSummarizing={isSummarizing}
                    onSummaryClick={onSummaryClick}
                    onDeleteClick={onDeleteClick}
                />

                <div className="h-8 w-px bg-gray-200" />

                <NavigationActions onBackClick={onBackClick} />

                <div className="h-8 w-px bg-gray-200" />

                <ExportImportActions 
                    isExporting={isExporting}
                    isImporting={isImporting}
                    onExportClick={onExportClick}
                    onImportClick={onImportClick}
                />
            </div>
        </div>
    );
};