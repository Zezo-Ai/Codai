import type { LogEntry } from './types';

/**
 * Transport interface for implementing log output destinations
 */
export interface ITransport {
  /**
   * Write a log entry to the transport
   */
  write(entry: LogEntry): Promise<void>;

  /**
   * Optional initialization (connections, file handlers, etc)
   */
  initialize?(): Promise<void>;

  /**
   * Optional cleanup (close connections, flush buffers, etc)
   */
  dispose?(): Promise<void>;
}