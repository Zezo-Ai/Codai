/**
 * Simple event emitter for component communication
 * 
 * This allows components to communicate through events without tight coupling.
 */
export class EventEmitter {
  private events: Record<string, Array<(...args: any[]) => void>> = {};

  /**
   * Subscribe to an event
   * @param event Event name
   * @param listener Function to call when event is emitted
   */
  on(event: string, listener: (...args: any[]) => void): () => void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  /**
   * Unsubscribe from an event
   * @param event Event name
   * @param listener Function to remove
   */
  off(event: string, listener: (...args: any[]) => void): void {
    if (!this.events[event]) return;
    
    const index = this.events[event].indexOf(listener);
    if (index !== -1) {
      this.events[event].splice(index, 1);
    }
  }

  /**
   * Emit an event
   * @param event Event name
   * @param args Arguments to pass to listeners
   */
  emit(event: string, ...args: any[]): void {
    if (!this.events[event]) return;
    
    this.events[event].forEach(listener => {
      try {
        listener(...args);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    });
  }

  /**
   * Subscribe to an event for a single emission
   * @param event Event name
   * @param listener Function to call when event is emitted
   */
  once(event: string, listener: (...args: any[]) => void): () => void {
    const onceListener = (...args: any[]) => {
      this.off(event, onceListener);
      listener(...args);
    };
    
    return this.on(event, onceListener);
  }

  /**
   * Remove all listeners for an event
   * @param event Optional event name, if not provided removes all listeners
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.events[event] = [];
    } else {
      this.events = {};
    }
  }
}