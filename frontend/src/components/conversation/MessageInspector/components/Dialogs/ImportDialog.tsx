import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onFileSelect: (file: File) => void;
    isImporting: boolean;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
    open,
    onOpenChange,
    onFileSelect,
    isImporting
}) => {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Import Messages
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Select a messages file to import. This will replace all existing messages in the current session.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                
                {/* Move warning outside AlertDialogHeader */}
                <div className="mb-4">
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                        <div className="flex items-center text-yellow-800">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
                            <span className="text-sm font-medium">Warning</span>
                        </div>
                        <div className="text-sm text-yellow-700 mt-1">
                            This action will replace all current messages. Make sure to export your current messages first if you want to keep them.
                        </div>
                    </div>
                </div>
                <div className="py-4">
                    <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onFileSelect(file);
                        }}
                        className="w-full"
                        disabled={isImporting}
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isImporting}>Cancel</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};