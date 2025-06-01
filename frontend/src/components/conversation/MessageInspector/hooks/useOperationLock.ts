import { useState, useCallback } from 'react';

export const useOperationLock = () => {
    const [isLocked, setIsLocked] = useState(false);

    const withLock = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
        if (isLocked) {
            throw new Error('Operation in progress');
        }

        setIsLocked(true);
        try {
            return await operation();
        } finally {
            setIsLocked(false);
        }
    }, [isLocked]);

    return {
        isLocked,
        withLock
    };
};