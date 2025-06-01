import { ContentProcessor } from './ContentProcessor';
import { CodeBlockProcessor, CodeBlockSegment } from './CodeBlockProcessor';
import { ActionCommandProcessor, ActionSegment } from './ActionCommandProcessor';
import { WebSearchProcessor, WebSearchSegment } from './WebSearchProcessor';

export type { 
  CodeBlockSegment,
  ActionSegment,
  WebSearchSegment
};

/**
 * Registry of content processors that can be used to process content
 */
export class ContentProcessorRegistry {
  private processors: ContentProcessor<any>[] = [];
  
  constructor() {
    // Register default processors
    this.register(new CodeBlockProcessor());
    this.register(new ActionCommandProcessor());
    this.register(new WebSearchProcessor());
  }
  
  /**
   * Register a new processor
   * @param processor The processor to register
   */
  public register(processor: ContentProcessor<any>): void {
    this.processors.push(processor);
  }
  
  /**
   * Find appropriate processors for the given content
   * @param content The content to check
   * @returns Array of processors that can handle the content
   */
  public findProcessorsForContent(content: string): ContentProcessor<any>[] {
    return this.processors.filter(processor => processor.canProcess(content));
  }
  
  /**
   * Process content with all applicable processors
   * @param content The content to process
   * @returns Object with results from each applicable processor
   */
  public processContent(content: string): {
    codeBlocks?: CodeBlockSegment[];
    actions?: ActionSegment[];
    webSearch?: WebSearchSegment[];
  } {
    const results: {
      codeBlocks?: CodeBlockSegment[];
      actions?: ActionSegment[];
      webSearch?: WebSearchSegment[];
    } = {};
    
    const applicableProcessors = this.findProcessorsForContent(content);
    
    for (const processor of applicableProcessors) {
      if (processor instanceof CodeBlockProcessor) {
        results.codeBlocks = processor.process(content);
      } else if (processor instanceof ActionCommandProcessor) {
        results.actions = processor.process(content);
      } else if (processor instanceof WebSearchProcessor) {
        results.webSearch = processor.process(content);
      }
    }
    
    return results;
  }
}

// Create and export singleton instance
export const processorRegistry = new ContentProcessorRegistry();