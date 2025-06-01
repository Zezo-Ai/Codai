import React from 'react';

interface DialogLoadingStateProps {
    operationLoading: boolean;
    globalLock: boolean;
}

export const useDialogLoadingState = ({
    operationLoading,
    globalLock
}: DialogLoadingStateProps) => {
    return operationLoading || globalLock;
};