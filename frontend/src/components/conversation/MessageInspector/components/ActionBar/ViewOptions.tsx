import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface ViewOptionsProps {
    pageSize: number;
    order: 'asc' | 'desc';
    onPageSizeChange: (size: string) => void;
    onOrderChange: () => void;
}

export const ViewOptions: React.FC<ViewOptionsProps> = ({
    pageSize,
    order,
    onPageSizeChange,
    onOrderChange
}) => {
    return (
        <div className="flex items-center space-x-2">
            <Select
                value={pageSize.toString()}
                onValueChange={onPageSizeChange}
            >
                <SelectTrigger className="w-[130px] h-8">
                    <SelectValue placeholder="Messages per page" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="10">10 per page</SelectItem>
                    <SelectItem value="25">25 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                    <SelectItem value="200">200 per page</SelectItem>
                    <SelectItem value="500">500 per page</SelectItem>
                </SelectContent>
            </Select>

            <Button
                variant="outline"
                size="sm"
                onClick={onOrderChange}
                className="h-8 px-3"
            >
                {order === 'asc' ? (
                    <>
                        <ArrowDown className="h-3.5 w-3.5 mr-1.5" />
                        Oldest First
                    </>
                ) : (
                    <>
                        <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
                        Latest First
                    </>
                )}
            </Button>
        </div>
    );
};