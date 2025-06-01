import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavigationActionsProps {
    onBackClick: () => void;
}

export const NavigationActions: React.FC<NavigationActionsProps> = ({
    onBackClick
}) => {
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={onBackClick}
            className="h-8 px-3"
        >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back to Chat
        </Button>
    );
};