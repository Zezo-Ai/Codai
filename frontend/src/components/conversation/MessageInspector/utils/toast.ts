type ToastType = 'success' | 'error' | 'info';

interface ToastConfig {
    title: string;
    description: string;
    variant?: 'default' | 'destructive';
    duration?: number;
}

export const createToastConfig = (
    type: ToastType,
    title: string,
    description: string
): ToastConfig => {
    const baseConfig = {
        title,
        description,
    };

    switch (type) {
        case 'success':
            return {
                ...baseConfig,
                duration: 3000, // 3 seconds for success messages
            };
        case 'error':
            return {
                ...baseConfig,
                variant: 'destructive',
                duration: 5000, // 5 seconds for error messages
            };
        case 'info':
            return {
                ...baseConfig,
                duration: 4000, // 4 seconds for info messages
            };
        default:
            return {
                ...baseConfig,
                duration: 3000,
            };
    }
};