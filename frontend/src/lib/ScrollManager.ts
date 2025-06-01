// Simple debounce implementation
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null;
  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

// Simple throttle implementation
function throttle<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let lastCall = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= wait) {
      lastCall = now;
      return func(...args);
    }
  }) as T;
}

// Mock race condition detector
const raceConditionDetector = {
  recordOperation: (_op: any) => {},
  getReport: () => 'No race conditions detected',
  getCriticalConditions: () => []
};

export interface ScrollOptions {
  smooth?: boolean;
  force?: boolean;
  delay?: number;
}

export interface ScrollState {
  isAutoScrollEnabled: boolean;
  isUserScrolling: boolean;
  isAtBottom: boolean;
  scrollPosition: number;
  scrollHeight: number;
  containerHeight: number;
  lastScrollTime: number;
  isAutoScrolling?: boolean;
}

type ScrollListener = (state: ScrollState) => void;

export class ScrollManager {
  private container: HTMLElement | null = null;
  private scrollRAF: number | null = null;
  private scrollTimeout: NodeJS.Timeout | null = null;
  private mutationObserver: MutationObserver | null = null;
  private isPerformingAutoScroll: boolean = false;
  private lastUserInteraction: number = 0;
  private lastScrollPosition: number = 0;
  private scrollVelocity: number = 0;
  
  // State
  private state: ScrollState = {
    isAutoScrollEnabled: true,
    isUserScrolling: false,
    isAtBottom: true,
    scrollPosition: 0,
    scrollHeight: 0,
    containerHeight: 0,
    lastScrollTime: 0,
    isAutoScrolling: false,
  };
  
  // Configuration
  private readonly BOTTOM_THRESHOLD = 10; // Much smaller than the current 100px
  private readonly SCROLL_SETTLE_TIME = 150;
  private readonly STREAMING_DEBOUNCE = 50;
  private readonly ESCAPE_VELOCITY_THRESHOLD = 30; // Pixels scrolled up to break auto-scroll (more sensitive)
  private readonly ESCAPE_TIME_WINDOW = 150; // Time window to measure velocity (more forgiving)
  
  // Listeners
  private listeners: Set<ScrollListener> = new Set();
  
  // Debounced/throttled methods
  private debouncedScrollToBottom: (options?: ScrollOptions) => void;
  private throttledUpdateState: () => void;
  private debouncedHandleScroll: () => void;
  
  constructor() {
    // Create debounced/throttled methods
    this.debouncedScrollToBottom = debounce(
      this.scrollToBottomInternal.bind(this),
      this.STREAMING_DEBOUNCE
    );
    
    this.throttledUpdateState = throttle(
      this.updateStateInternal.bind(this),
      100
    );
    
    this.debouncedHandleScroll = debounce(
      this.handleScrollEnd.bind(this),
      this.SCROLL_SETTLE_TIME
    );
  }
  
  /**
   * Initialize the scroll manager with a container element
   */
  public initialize(container: HTMLElement): void {
    if (this.container) {
      this.cleanup();
    }
    
    this.container = container;
    this.lastScrollPosition = container.scrollTop;
    this.setupEventListeners();
    this.setupMutationObserver();
    this.updateState();
  }
  
  /**
   * Clean up all resources
   */
  public cleanup(): void {
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
      this.scrollRAF = null;
    }
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    
    if (this.container) {
      this.container.removeEventListener('scroll', this.handleScroll);
      this.container.removeEventListener('touchstart', this.handleTouchStart);
      this.container.removeEventListener('touchend', this.handleTouchEnd);
      this.container.removeEventListener('mousedown', this.handleMouseDown);
      this.container.removeEventListener('wheel', this.handleWheel as EventListener);
      this.container = null;
    }
    
    this.listeners.clear();
  }
  
  /**
   * Subscribe to scroll state changes
   */
  public subscribe(listener: ScrollListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.getState());
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  /**
   * Get current scroll state
   */
  public getState(): Readonly<ScrollState> {
    return { ...this.state };
  }
  
  /**
   * Enable or disable auto-scrolling
   */
  public setAutoScrollEnabled(enabled: boolean): void {
    this.state.isAutoScrollEnabled = enabled;
    this.notifyListeners();
  }
  
  /**
   * Scroll to bottom with options
   */
  public scrollToBottom(options: ScrollOptions = {}): void {
    if (!this.container) return;
    
    // Use debounced version during streaming to prevent too many calls
    if (options.delay !== undefined) {
      this.debouncedScrollToBottom(options);
    } else {
      this.scrollToBottomInternal(options);
    }
  }
  
  /**
   * Scroll to specific position
   */
  public scrollTo(position: number, options: ScrollOptions = {}): void {
    if (!this.container) return;
    
    // Cancel any pending scroll animation
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
    }
    
    // Mark as programmatic scroll
    this.isPerformingAutoScroll = true;
    
    this.scrollRAF = requestAnimationFrame(() => {
      if (!this.container) return;
      
      this.container.scrollTo({
        top: position,
        behavior: options.smooth !== false ? 'smooth' : 'auto'
      });
      
      // Update state after scroll
      requestAnimationFrame(() => {
        this.isPerformingAutoScroll = false;
        this.updateState();
      });
    });
  }
  
  /**
   * Reset scroll state (useful when switching conversations)
   */
  public reset(): void {
    this.state = {
      isAutoScrollEnabled: true,
      isUserScrolling: false,
      isAtBottom: true,
      scrollPosition: 0,
      scrollHeight: 0,
      containerHeight: 0,
      lastScrollTime: 0,
      isAutoScrolling: false,
    };
    
    this.isPerformingAutoScroll = false;
    this.lastUserInteraction = 0;
    
    if (this.container) {
      this.container.scrollTop = 0;
    }
    
    this.notifyListeners();
  }

  /**
   * Navigate to next or previous message
   */
  public navigateToMessage(direction: 'next' | 'previous'): void {
    if (!this.container) return;
    
    const messages = this.container.querySelectorAll('[data-message-id]');
    if (messages.length === 0) return;
    
    let targetMessage: Element | null = null;
    
    if (direction === 'next') {
      // Find first message below current viewport
      for (const message of messages) {
        if (message.getBoundingClientRect().top > 100) {
          targetMessage = message;
          break;
        }
      }
    } else {
      // Find last message above current viewport
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].getBoundingClientRect().top < -100) {
          targetMessage = messages[i];
          break;
        }
      }
    }
    
    if (targetMessage) {
      targetMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Save current scroll position for a session
   */
  public saveScrollPosition(sessionId: string): void {
    if (!this.container) return;
    
    const key = `scroll_position_${sessionId}`;
    localStorage.setItem(key, JSON.stringify({
      scrollTop: this.container.scrollTop,
      scrollHeight: this.container.scrollHeight,
      timestamp: Date.now()
    }));
  }

  /**
   * Restore scroll position for a session
   */
  public restoreScrollPosition(sessionId: string): boolean {
    if (!this.container) return false;
    
    const key = `scroll_position_${sessionId}`;
    const saved = localStorage.getItem(key);
    
    if (saved) {
      try {
        const { scrollTop, scrollHeight } = JSON.parse(saved);
        // Only restore if scroll height is similar (content hasn't changed much)
        if (Math.abs(this.container.scrollHeight - scrollHeight) < 100) {
          this.container.scrollTop = scrollTop;
          return true;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    return false;
  }

  /**
   * Get critical race conditions (for debugging)
   */
  public getCriticalRaceConditions(): any[] {
    return raceConditionDetector.getCriticalConditions();
  }

  /**
   * Get race condition report (for debugging)
   */
  public getRaceConditionReport(): string {
    return raceConditionDetector.getReport();
  }
  
  /**
   * Force update the scroll state
   */
  public updateState(): void {
    this.updateStateInternal();
  }
  
  
  /**
   * Scroll to a specific element
   */
  public scrollToElement(element: HTMLElement, options: ScrollOptions & { 
    block?: 'start' | 'center' | 'end' | 'nearest',
    highlight?: boolean 
  } = {}): void {
    if (!element) return;
    
    // Mark as programmatic scroll
    this.isPerformingAutoScroll = true;
    
    // Scroll element into view
    element.scrollIntoView({
      behavior: options.smooth !== false ? 'smooth' : 'auto',
      block: options.block || 'center'
    });
    
    // Optional highlight effect
    if (options.highlight) {
      element.classList.add('highlight-message');
      setTimeout(() => {
        element.classList.remove('highlight-message');
      }, 2000);
    }
    
    // Update state after scroll
    setTimeout(() => {
      this.isPerformingAutoScroll = false;
      this.updateState();
    }, 500);
  }
  
  // Private methods
  
  private setupEventListeners(): void {
    if (!this.container) return;
    
    this.container.addEventListener('scroll', this.handleScroll, { passive: true });
    
    // Handle touch events for mobile
    this.container.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.container.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    
    // Handle mouse events for desktop
    this.container.addEventListener('mousedown', this.handleMouseDown, { passive: true });
    this.container.addEventListener('wheel', this.handleWheel as EventListener, { passive: true });
  }
  
  private setupMutationObserver(): void {
    if (!this.container) return;
    
    // Use MutationObserver for efficient content change detection
    this.mutationObserver = new MutationObserver((mutations) => {
      // Record content update
      const addedNodes = mutations.reduce((sum, m) => sum + m.addedNodes.length, 0);
      if (addedNodes > 0) {
        raceConditionDetector.recordOperation({
          type: 'content-update',
          source: 'mutation-observer',
          metadata: {
            addedNodes,
            autoScrollEnabled: this.state.isAutoScrollEnabled,
            userScrolling: this.state.isUserScrolling
          }
        });
      }
      
      // Only process if auto-scroll is enabled and user isn't scrolling
      if (this.state.isAutoScrollEnabled && !this.state.isUserScrolling) {
        // Check if significant content was added
        const hasSignificantChanges = mutations.some(mutation => 
          mutation.type === 'childList' && mutation.addedNodes.length > 0
        );
        
        if (hasSignificantChanges) {
          // Mark that content update is triggering scroll
          this.isPerformingAutoScroll = true;
          
          this.throttledUpdateState();
          
          // Auto-scroll if we're at the bottom
          if (this.state.isAtBottom) {
            this.scrollToBottom({ smooth: true, delay: 50 });
          }
          
          // Clear flag after a short delay
          setTimeout(() => {
            this.isPerformingAutoScroll = false;
          }, 200);
        }
      }
    });
    
    this.mutationObserver.observe(this.container, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });
  }
  
  private handleScroll = (): void => {
    const now = Date.now();
    const timeSinceLastInteraction = now - this.lastUserInteraction;
    const currentScrollTop = this.container?.scrollTop || 0;
    
    // Calculate scroll velocity (negative means scrolling up)
    const scrollDelta = currentScrollTop - this.lastScrollPosition;
    const timeDelta = now - this.state.lastScrollTime;
    this.scrollVelocity = timeDelta > 0 ? scrollDelta / timeDelta * 1000 : 0; // pixels per second
    
    // Detect escape velocity - user scrolling up forcefully while at bottom
    const isEscapingAutoScroll = 
      this.state.isAtBottom && 
      scrollDelta < -this.ESCAPE_VELOCITY_THRESHOLD && 
      timeDelta < this.ESCAPE_TIME_WINDOW;
    
    // If user is trying to escape auto-scroll, immediately disable it
    if (isEscapingAutoScroll) {
      this.lastUserInteraction = now; // Mark as user interaction
      this.state.isUserScrolling = true;
      this.state.isAutoScrollEnabled = false;
      this.isPerformingAutoScroll = false;
      this.state.isAutoScrolling = false;
      this.notifyListeners();
      
      raceConditionDetector.recordOperation({
        type: 'user-scroll',
        source: 'escape-velocity',
        metadata: {
          scrollDelta,
          velocity: this.scrollVelocity,
          timeDelta
        }
      });
    }
    
    // Update last position for next velocity calculation
    this.lastScrollPosition = currentScrollTop;
    
    // If we're actively auto-scrolling and user hasn't escaped, ignore scroll events
    if ((this.isPerformingAutoScroll || this.state.isAutoScrolling) && !isEscapingAutoScroll) {
      return;
    }
    
    // If this happens very quickly after a mutation (likely caused by content update)
    // and we haven't had recent user interaction, it's probably not user scroll
    const isLikelyAutoScrollEffect = timeSinceLastInteraction > 1000 && this.state.isAutoScrollEnabled;
    
    // Record scroll operation for race condition detection
    raceConditionDetector.recordOperation({
      type: isLikelyAutoScrollEffect ? 'auto-scroll' : 'user-scroll',
      source: 'scroll-event',
      metadata: {
        scrollTop: currentScrollTop,
        isAtBottom: this.state.isAtBottom,
        isPerformingAutoScroll: this.isPerformingAutoScroll,
        timeSinceLastInteraction,
        velocity: this.scrollVelocity
      }
    });
    
    this.updateState();
    
    // Only mark as user scrolling if:
    // 1. Not at bottom
    // 2. Not currently auto-scrolling
    // 3. Has recent user interaction OR auto-scroll is disabled
    if (!this.state.isAtBottom && !isLikelyAutoScrollEffect) {
      this.state.isUserScrolling = true;
      this.state.isAutoScrollEnabled = false;
      this.notifyListeners();
    }
    
    // Debounce the scroll end detection
    this.debouncedHandleScroll();
  };
  
  private handleScrollEnd(): void {
    // If user scrolled back to bottom, re-enable auto-scroll
    if (this.state.isAtBottom) {
      this.state.isUserScrolling = false;
      this.state.isAutoScrollEnabled = true;
      this.notifyListeners();
    }
  }
  
  private handleTouchStart = (): void => {
    // Mark as user interaction during touch
    this.lastUserInteraction = Date.now();
    this.state.isUserScrolling = true;
  };
  
  private handleTouchEnd = (): void => {
    this.lastUserInteraction = Date.now();
    // Let scroll settle before checking position
    setTimeout(() => {
      this.updateState();
      this.handleScrollEnd();
    }, 300);
  };
  
  private handleMouseDown = (): void => {
    // Track mouse interaction
    this.lastUserInteraction = Date.now();
  };
  
  private handleWheel = (e: WheelEvent): void => {
    // Track wheel interaction
    this.lastUserInteraction = Date.now();
    
    // If scrolling up (negative deltaY) while at bottom during auto-scroll, break out
    if (e.deltaY < 0 && this.state.isAtBottom && this.state.isAutoScrollEnabled) {
      this.state.isUserScrolling = true;
      this.state.isAutoScrollEnabled = false;
      this.isPerformingAutoScroll = false;
      this.state.isAutoScrolling = false;
      this.notifyListeners();
      
      raceConditionDetector.recordOperation({
        type: 'user-scroll',
        source: 'wheel-escape',
        metadata: {
          deltaY: e.deltaY,
          isAtBottom: this.state.isAtBottom
        }
      });
    }
  };
  
  private updateStateInternal(): void {
    if (!this.container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom <= this.BOTTOM_THRESHOLD;
    
    this.state = {
      ...this.state,
      scrollPosition: scrollTop,
      scrollHeight,
      containerHeight: clientHeight,
      isAtBottom,
      lastScrollTime: Date.now(),
    };
    
    this.notifyListeners();
  }
  
  private scrollToBottomInternal(options: ScrollOptions = {}): void {
    if (!this.container) return;
    
    // Record scroll operation
    raceConditionDetector.recordOperation({
      type: options.force ? 'force-scroll' : 'auto-scroll',
      source: 'scroll-manager',
      metadata: {
        smooth: options.smooth,
        userScrolling: this.state.isUserScrolling,
        scrollHeight: this.container.scrollHeight
      }
    });
    
    // Don't scroll if user has manually scrolled and force isn't set
    if (this.state.isUserScrolling && !options.force) return;
    
    // Cancel any pending scroll animation
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
    }
    
    // Mark that we're performing auto-scroll
    this.isPerformingAutoScroll = true;
    this.state.isAutoScrolling = true;
    this.notifyListeners();
    
    // Use requestAnimationFrame for smooth scrolling
    this.scrollRAF = requestAnimationFrame(() => {
      if (!this.container) return;
      
      const scrollOptions: ScrollToOptions = {
        top: this.container.scrollHeight,
        behavior: options.smooth !== false ? 'smooth' : 'auto',
      };
      
      this.container.scrollTo(scrollOptions);
      
      // Update state after scroll completes
      requestAnimationFrame(() => {
        // Clear auto-scroll flag after a delay to ensure scroll events are processed
        setTimeout(() => {
          this.isPerformingAutoScroll = false;
          this.state.isAutoScrolling = false;
          this.updateState();
          this.notifyListeners();
        }, 100);
      });
    });
  }
  
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        // Ignore listener errors
      }
    });
  }
}

// Singleton instance - only create on client side
export const scrollManager = typeof window !== 'undefined' ? new ScrollManager() : null as any;