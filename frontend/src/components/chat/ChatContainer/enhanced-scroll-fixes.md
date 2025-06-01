# Enhanced Scroll Fixes for CODAI Chat

## Issues Identified
1. **Jerky Scrolling**: Current `scrollIntoView` conflicts with user scrolling
2. **Poor User Control**: 300ms timeout makes scroll detection laggy
3. **Race Conditions**: Auto-scroll fires during user scrolling
4. **No CSS Smooth Scrolling**: Missing CSS foundation

## Proposed Solutions

### 1. Add CSS Smooth Scrolling Foundation
Add to `globals.css`:

```css
/* Enhanced smooth scrolling */
html {
  scroll-behavior: smooth;
}

.chat-container {
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}

/* Reduce motion for accessibility */
@media (prefers-reduced-motion: reduce) {
  html, .chat-container {
    scroll-behavior: auto;
  }
}
```

### 2. Enhanced Scroll Detection (Content.tsx)
Replace lines 247-275 with:

```typescript
ref={(el) => {
  if (el) {
    let isUserScrolling = false;
    let scrollTimer: NodeJS.Timeout;
    
    const handleScroll = () => {
      // Clear existing timer
      if (scrollTimer) clearTimeout(scrollTimer);
      
      // Mark as user scrolling immediately
      if (!isUserScrolling) {
        isUserScrolling = true;
        setShouldAutoScroll(false);
      }
      
      // Check if at bottom after scroll settles
      scrollTimer = setTimeout(() => {
        const threshold = 5; // More forgiving threshold
        const isAtBottom = Math.abs(
          (el.scrollHeight - el.scrollTop) - el.clientHeight
        ) <= threshold;
        
        if (isAtBottom) {
          userHasScrolled.current = false;
          setShouldAutoScroll(true);
        } else {
          userHasScrolled.current = true;
        }
        
        isUserScrolling = false;
      }, 150); // Reduced from 300ms to 150ms
    };
    
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }
}}
```

### 3. Enhanced Auto-Scroll Logic (hooks.ts)
Replace lines 56-71 with:

```typescript
const messagesEndRef = useCallback((node: HTMLDivElement | null) => {
  if (node && chatState.messages.length > 0) {
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTimestampRef.current;
    const isPageRefresh = !lastScrollTimestampRef.current;
    
    // Only auto-scroll if conditions are met
    if (!userHasScrolled.current && shouldAutoScroll) {
      // Prevent rapid fire scrolling during content updates
      if (timeSinceLastScroll > 50 || isPageRefresh) {
        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
          // Check if still should scroll (user might have scrolled)
          if (!userHasScrolled.current && shouldAutoScroll) {
            const container = node.closest('.overflow-y-auto');
            if (container) {
              // Use scrollTo for better control than scrollIntoView
              container.scrollTo({
                top: container.scrollHeight,
                behavior: isPageRefresh ? 'auto' : 'smooth'
              });
              lastScrollTimestampRef.current = now;
            }
          }
        });
      }
    }
  }
}, [chatState.messages.length, userHasScrolled.current, shouldAutoScroll])
```

### 4. Scroll Momentum Detection
Add new hook in hooks.ts:

```typescript
// Add this new ref for momentum detection
const scrollMomentumRef = useRef<{
  lastScrollTop: number;
  lastScrollTime: number;
  isDecelerating: boolean;
}>({
  lastScrollTop: 0,
  lastScrollTime: 0,
  isDecelerating: false
});

// Enhanced scroll detection with momentum
const detectScrollMomentum = useCallback((element: HTMLElement) => {
  const currentScrollTop = element.scrollTop;
  const currentTime = Date.now();
  const momentum = scrollMomentumRef.current;
  
  // Calculate scroll velocity
  const timeDiff = currentTime - momentum.lastScrollTime;
  const scrollDiff = Math.abs(currentScrollTop - momentum.lastScrollTop);
  const velocity = timeDiff > 0 ? scrollDiff / timeDiff : 0;
  
  // Detect if scroll is decelerating (end of momentum)
  const wasDecelerating = momentum.isDecelerating;
  momentum.isDecelerating = velocity < 0.1; // Very slow = end of momentum
  
  // Update momentum tracking
  momentum.lastScrollTop = currentScrollTop;
  momentum.lastScrollTime = currentTime;
  
  // Return true if scroll just finished (was decelerating, now stopped)
  return wasDecelerating && velocity < 0.05;
}, []);
```

### 5. Stream Processing Integration
Modify the stream processing to respect scroll state:

```typescript
// In useChat.ts throttledStateUpdate function
const throttledStateUpdate = useCallback((updateFn: (prev: any) => any) => {
  // Check if user is actively scrolling
  const container = document.querySelector('.overflow-y-auto');
  if (container) {
    const isAtBottom = Math.abs(
      (container.scrollHeight - container.scrollTop) - container.clientHeight
    ) <= 10;
    
    // If user scrolled away from bottom, pause auto-scroll during updates
    if (!isAtBottom && userHasScrolled.current) {
      // Update state but don't trigger scroll
      setState(updateFn);
      return;
    }
  }
  
  // Normal update with potential auto-scroll
  setState(updateFn);
}, [setState]);
```

## Implementation Priority

1. **High Priority**: CSS smooth scrolling + Enhanced scroll detection (immediate improvement)
2. **Medium Priority**: Enhanced auto-scroll logic (better user experience)
3. **Low Priority**: Momentum detection + Stream integration (polish)

## Testing Checklist

- [ ] Smooth scrolling during AI responses
- [ ] User can scroll up without interference
- [ ] Auto-scroll resumes when user returns to bottom
- [ ] No jerky behavior during rapid content updates
- [ ] Works on mobile devices
- [ ] Respects reduced motion preferences