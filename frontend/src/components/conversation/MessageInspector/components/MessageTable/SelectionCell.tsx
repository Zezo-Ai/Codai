import React from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';
import { TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from "@/lib/utils";

interface SelectionCellProps {
    isSelected: boolean;
    isInvalid?: boolean;
    validationErrors?: string[];
    onClick: (e: React.MouseEvent) => void;
    isTool?: boolean;
}

export const SelectionCell: React.FC<SelectionCellProps> = ({
    isSelected,
    isInvalid,
    validationErrors,
    onClick,
    isTool = false
}) => {
    return (
        <TableCell className="relative">
            <div 
                onClick={onClick}
                className="relative group"
            >
                <div className="relative">
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => {}}
                        className={cn(
                            isInvalid && "border-red-500 ring-red-200",
                            isTool && "border-amber-500"
                        )}
                    />
                    {isTool && (
                        <div className="absolute -top-1 -right-1 h-3 w-3 flex items-center justify-center">
                            <Wrench className="h-3 w-3 text-amber-500" />
                        </div>
                    )}
                </div>
                {isInvalid && validationErrors && validationErrors.length > 0 && (
                    <div className="absolute hidden group-hover:block left-full top-1/2 -translate-y-1/2 ml-2 
                                z-50 w-80 p-3 rounded-lg shadow-lg bg-red-50 border border-red-200">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="font-medium text-red-700">Cannot Delete Message</span>
                        </div>
                        <ul className="space-y-2">
                            {validationErrors.map((error, i) => (
                                <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                                    <span className="block w-1 h-1 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                                    <span>{error}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </TableCell>
    );
};