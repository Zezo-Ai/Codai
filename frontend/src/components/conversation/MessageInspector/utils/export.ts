export const downloadBlob = async (
    blob: Blob,
    filename: string
): Promise<void> => {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
    } finally {
        // Clean up the URL regardless of success or failure
        URL.revokeObjectURL(url);
    }
};