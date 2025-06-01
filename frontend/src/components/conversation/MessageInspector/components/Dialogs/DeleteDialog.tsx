import React from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { cn } from "@/lib/utils";

interface DeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    selectedCount: number;
    validationResult: {
        isValid: boolean;
        errors: Array<{
            type: string;
            description: string;
            messageIds: string[];
        }>;
    } | null;
}

export const DeleteDialog: React.FC<DeleteDialogProps> = ({
    open,
    onOpenChange,
    onConfirm,
    selectedCount,
    validationResult
}) => {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {validationResult && !validationResult.isValid ? (
                            <div className="flex items-center text-red-600">
                                <AlertTriangle className="h-5 w-5 mr-2" />
                                Cannot Delete Messages
                            </div>
                        ) : (
                            "Confirm Deletion"
                        )}
                    </AlertDialogTitle>
                    
                    {/* Simple text-only description */}
                    <AlertDialogDescription>
                        {validationResult && !validationResult.isValid 
                            ? "There are issues preventing message deletion" 
                            : `Are you sure you want to delete ${selectedCount} messages? This action cannot be undone.`
                        }
                    </AlertDialogDescription>
                    
                    {/* Move complex validation error display outside of AlertDialogDescription */}
                    {validationResult && !validationResult.isValid && (
                        <div className="mt-4">
                            <div className="text-sm font-medium text-red-600 mb-2">
                                The following issues prevent message deletion:
                            </div>
                            <div className="space-y-2">
                                {validationResult.errors.map((error, index) => (
                                    <div key={index} className="bg-red-50 p-3 rounded-md text-sm border border-red-200">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                                            <div className="space-y-1">
                                                <div className="text-red-700">{error.description}</div>
                                                {error.messageIds.length > 0 && (
                                                    <div className="text-xs text-red-600">
                                                        Affects {error.messageIds.length} message{error.messageIds.length !== 1 ? 's' : ''}
                                                    </div>
                                                )}
                                                {error.type === 'BROKEN_TOOL_CHAIN' && (
                                                    <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                                                        Tool chains must be deleted as a complete unit
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={onConfirm}
                        className={cn(
                            "bg-red-600 hover:bg-red-700",
                            (validationResult && !validationResult.isValid) && "opacity-50 cursor-not-allowed"
                        )}
                        disabled={validationResult && !validationResult.isValid}
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};