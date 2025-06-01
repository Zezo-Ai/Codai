export interface ValidationResult {
    isValid: boolean;
    errors: Array<{
        type: string;
        description: string;
        messageIds: string[];
    }>;
}