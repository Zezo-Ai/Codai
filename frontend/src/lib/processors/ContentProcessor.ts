/**
 * Base class for content processors that detect and transform content patterns
 */
export abstract class ContentProcessor<T> {
  /**
   * Check if this processor can handle the provided content
   * @param content The content to check
   * @returns True if this processor can handle the content
   */
  abstract canProcess(content: string): boolean;
  
  /**
   * Process the content and transform it
   * @param content The content to process
   * @returns The processed content in the format specified by T
   */
  abstract process(content: string): T;
  
  /**
   * Cleans up whitespace and standardizes content for processing
   * @param content The content to clean
   * @returns The cleaned content
   */
  protected cleanContent(content: string): string {
    return content
      .replace(/\r\n/g, '\n') // Standardize line endings
      .replace(/\t/g, '  ')   // Replace tabs with spaces
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();
  }
  
  /**
   * Checks if content is empty or just whitespace
   * @param content Content to check
   * @returns True if content is empty or only whitespace
   */
  protected isEmpty(content: string): boolean {
    return !content || !content.trim();
  }
}