import { useState, useCallback } from 'react';

interface UsePaginationProps {
    initialPageSize?: number;
    initialOrder?: 'asc' | 'desc';
}

interface UsePaginationReturn {
    page: number;
    pageSize: number;
    order: 'asc' | 'desc';
    setPage: (page: number) => void;
    handlePageSizeChange: (newSize: string) => void;
    handleOrderChange: () => void;
    resetPagination: () => void;
}

export const usePagination = ({
    initialPageSize = 200,
    initialOrder = 'asc'
}: UsePaginationProps = {}): UsePaginationReturn => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);
    const [order, setOrder] = useState<'asc' | 'desc'>(initialOrder);

    const handlePageSizeChange = useCallback((newSize: string) => {
        const size = parseInt(newSize, 10);
        setPageSize(size);
        setPage(1); // Reset to first page
    }, []);

    const handleOrderChange = useCallback(() => {
        setOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        setPage(1); // Reset to first page
    }, []);

    const resetPagination = useCallback(() => {
        setPage(1);
        setPageSize(initialPageSize);
        setOrder(initialOrder);
    }, [initialPageSize, initialOrder]);

    return {
        page,
        pageSize,
        order,
        setPage,
        handlePageSizeChange,
        handleOrderChange,
        resetPagination
    };
};