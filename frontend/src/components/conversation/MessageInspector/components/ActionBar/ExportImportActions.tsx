import React from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExportImportActionsProps {
    isExporting: boolean;
    isImporting: boolean;
    onExportClick: () => void;
    onImportClick: () => void;
}

export const ExportImportActions: React.FC<ExportImportActionsProps> = ({
    isExporting,
    isImporting,
    onExportClick,
    onImportClick
}) => {
    return (
        <div className="flex items-center space-x-2">
            <Button
                variant="outline"
                size="sm"
                onClick={onExportClick}
                disabled={isExporting}
                className="h-8 px-3"
            >
                {isExporting ? (
                    <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary mr-1.5" />
                        Exporting...
                    </>
                ) : (
                    <>
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        Export Messages
                    </>
                )}
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={onImportClick}
                disabled={isImporting}
                className="h-8 px-3"
            >
                {isImporting ? (
                    <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary mr-1.5" />
                        Importing...
                    </>
                ) : (
                    <>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Import Messages
                    </>
                )}
            </Button>
        </div>
    );
};