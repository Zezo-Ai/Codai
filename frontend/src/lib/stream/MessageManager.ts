/**
 * Message Manager
 * 
 * Responsible for managing the state of messages, including
 * creation, updates, and tracking.
 */

import { generateId } from './utils';
import { Logger } from './Logger';
import { Message, MessageSegment, MessageRole, ContentType } from './types';

/**
 * Configuration for the MessageManager
 */
export interface MessageManagerConfig {
  debug?: boolean;
  onUpdate?: (messages: Message[]) => void;
}

/**
 * Manager for message state
 */
export class MessageManager {
  private messages: Message[] = [];
  private logger: Logger;
  private config: MessageManagerConfig;

  /**
   * Create a new message manager
   */
  constructor(config: MessageManagerConfig = {}) {
    this.config = {
      debug: false,
      ...config
    };
    
    this.logger = new Logger({
      level: this.config.debug ? 'debug' : 'info',
      enabled: this.config.debug
    });
  }

  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Create a new message
   */
  createMessage(role: MessageRole, content?: string, type: ContentType = 'text', metadata?: Record<string, any>): Message {
    const message: Message = {
      id: generateId(),
      role,
      segments: [],
      timestamp: new Date().toISOString(),
      metadata
    };
    
    // Add initial segment if content provided
    if (content) {
      message.segments.push(this.createSegment(type, content, metadata));
    }
    
    this.logger.debug('message', `Created new message: ${role}`, { message });
    
    return message;
  }

  /**
   * Create a message segment
   */
  createSegment(type: ContentType, content: string, metadata?: Record<string, any>): MessageSegment {
    return {
      id: generateId(),
      type,
      content,
      metadata
    };
  }

  /**
   * Add a new message
   */
  addMessage(message: Message): void {
    this.messages.push(message);
    this.logger.debug('message', 'Added message', { messageId: message.id });
    this.notifyUpdate();
  }

  /**
   * Add a new segment to the last message
   */
  addSegmentToLastMessage(type: ContentType, content: string, metadata?: Record<string, any>): void {
    if (this.messages.length === 0) {
      this.logger.warn('message', 'Cannot add segment to last message, no messages exist');
      return;
    }
    
    const lastMessage = this.messages[this.messages.length - 1];
    lastMessage.segments.push(this.createSegment(type, content, metadata));
    
    this.logger.debug('message', 'Added segment to last message', { 
      messageId: lastMessage.id,
      segmentType: type
    });
    
    this.notifyUpdate();
  }

  /**
   * Update the content of a segment in the last message
   */
  updateSegment(messageId: string, segmentId: string, content: string): void {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) {
      this.logger.warn('message', `Cannot update segment, message ${messageId} not found`);
      return;
    }
    
    const segment = message.segments.find(s => s.id === segmentId);
    if (!segment) {
      this.logger.warn('message', `Cannot update segment, segment ${segmentId} not found in message ${messageId}`);
      return;
    }
    
    segment.content = content;
    this.logger.debug('message', 'Updated segment content', { 
      messageId,
      segmentId,
      contentLength: content.length
    });
    
    this.notifyUpdate();
  }

  /**
   * Update the last segment of the last message
   */
  updateLastSegment(content: string): void {
    if (this.messages.length === 0) {
      this.logger.warn('message', 'Cannot update last segment, no messages exist');
      return;
    }
    
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage.segments.length === 0) {
      this.logger.warn('message', 'Cannot update last segment, message has no segments');
      return;
    }
    
    const lastSegment = lastMessage.segments[lastMessage.segments.length - 1];
    lastSegment.content = content;
    
    this.logger.debug('message', 'Updated last segment', { 
      messageId: lastMessage.id,
      segmentId: lastSegment.id,
      contentLength: content.length
    });
    
    this.notifyUpdate();
  }

  /**
   * Replace all messages
   */
  setMessages(messages: Message[]): void {
    this.messages = [...messages];
    this.logger.debug('message', 'Replaced all messages', { count: messages.length });
    this.notifyUpdate();
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.logger.debug('message', 'Cleared all messages');
    this.notifyUpdate();
  }

  /**
   * Get the last message
   */
  getLastMessage(): Message | undefined {
    if (this.messages.length === 0) {
      return undefined;
    }
    
    return this.messages[this.messages.length - 1];
  }

  /**
   * Get the last segment of the last message
   */
  getLastSegment(): MessageSegment | undefined {
    const lastMessage = this.getLastMessage();
    if (!lastMessage || lastMessage.segments.length === 0) {
      return undefined;
    }
    
    return lastMessage.segments[lastMessage.segments.length - 1];
  }

  /**
   * Notify listeners of an update
   */
  private notifyUpdate(): void {
    if (this.config.onUpdate) {
      this.config.onUpdate([...this.messages]);
    }
  }
}