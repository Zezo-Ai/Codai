# Frontend Architecture and Flow Reference

## Overview
This document describes the canonical frontend flow for CODAI's chat and expert mode functionality, identifying core components and highlighting areas for cleanup.

## Main Chat Flow

### 1. Application Entry
```
app/page.tsx
└── ChatContainer
    ├── ChatContainer/Layout.tsx (wrapper)
    └── ChatContainer/Content.tsx (main logic)
        ├── ChatHeader
        ├── ChatMessages
        ├── ChatInput
        └── ChatSidebar
```

### 2. Message Sending Flow
```
1. User types in ChatInput
   └── onSend callback
   
2. ChatContainer/Content::handleMessageSend()
   └── Calls sendMessage from useChat hook
   
3. useChat::sendMessage()
   ├── Creates user message
   ├── Creates thinking message
   ├── Injects expert mode status (if enabled)
   └── Calls api.chat.send()
   
4. API call to backend
   └── Returns SSE stream
   
5. StreamProcessor::processStream()
   ├── Parses SSE chunks
   ├── Updates state
   └── Triggers UI updates
```

## State Management

### Primary State Hook: useChat
```typescript
// Main state structure
{
  messages: Message[]           // All messages
  isProcessing: boolean        // Currently sending/receiving
  error: string | null         // Error state
  metadata: {                  // Session metadata
    sessionId: string
    model: string
    conversationTitle: string
  }
  thinkingState: 'active' | 'complete' | null
  thinkingContent: string      // Extended thinking content
  tokenInfo: {                 // Token usage
    token_count: number
    max_context_tokens: number
    needs_summary: boolean
  }
}
```

### State Update Flow
1. **Immediate Updates**: User messages, UI state
2. **Throttled Updates**: Stream content (100ms throttle)
3. **Batch Updates**: Multiple chunks processed together

## Stream Processing

### Current Implementation (Canonical)
**File**: `hooks/useChat/streamHandlers.ts`

```typescript
class StreamProcessor {
  // Core methods:
  processStream(body: ReadableStream)
  processChunk(chunk: string)
  handleDataChunk(data: any)
  injectChunk(chunk: string)  // For expert mode
}
```

### Processing Pipeline
```
1. SSE Stream from backend
   └── Read chunks from stream
   
2. Parse SSE format
   └── Extract JSON data
   
3. Route by message type
   ├── text → Append to current message
   ├── action → Format as action block
   ├── tool_result → Display tool output
   ├── expert_mode_status → Update expert UI
   └── token_update → Update token count
   
4. Update React state
   └── Throttled to prevent excessive renders
```

### Parallel Implementation (TO BE REVIEWED)
**Directory**: `lib/stream/`
- Appears to be newer/enhanced version
- Has more sophisticated block handling
- Currently not the primary implementation

## Expert Mode Frontend Implementation

### 1. Configuration Check
```typescript
// lib/expertMode.ts
isExpertModeEnabled() {
  // Checks server config cache in localStorage
  // Fetches from server if not cached
  return boolean
}
```

### 2. Status Injection (Frontend-side)
When sending a message with expert mode enabled:
```typescript
// In useChat.ts (line 290-305)
if (isExpertModeEnabled()) {
  const expertModeChunk = {
    type: 'expert_mode_status',
    status: 'preparing',
    message: 'Preparing analysis...',
    source: 'frontend'
  }
  streamProcessor.injectChunk(expertModeChunk)
}
```

### 3. Expert Mode UI Manager
**File**: `lib/ExpertModeManager.ts`

States:
- `preparing` - Initial state (frontend injected)
- `analyzing` - Domain analysis in progress
- `activated` - Analysis complete, shows domain
- `failed` - Analysis failed

### 4. UI Rendering
Expert mode cards are rendered inline with messages:
```
<div class="expert-mode-card {status}">
  └── Shows current status
  └── Displays domain when activated
  └── Styled with gradients and animations
</div>
```

## Core Components

### Primary Hooks
- **`hooks/useChat.ts`** - Main chat state and logic
- **`hooks/useSession.ts`** - Session management
- **`hooks/useAiMode.ts`** - AI model selection
- **`hooks/useStreamChat.ts`** - Lower-level stream handling

### Key Components
- **`components/chat/ChatContainer/`** - Main container
- **`components/chat/ChatMessages.tsx`** - Message list rendering
- **`components/chat/ChatInput.tsx`** - User input
- **`components/chat/MessageDisplay.tsx`** - Individual message rendering
- **`components/settings/ExpertModeSettings.tsx`** - Expert mode toggle

### Utility Libraries
- **`lib/api.ts`** - API client
- **`lib/storage.ts`** - Local storage management
- **`lib/sessionManager.ts`** - IndexedDB session persistence
- **`lib/expertMode.ts`** - Expert mode configuration

## Redundant/Duplicate Code

### 1. Stream Processors (Major Duplication)
- **Active**: `hooks/useChat/streamHandlers.ts`
- **Parallel**: `lib/stream/StreamProcessor.ts`
- **Issue**: Two implementations doing similar things
- **Solution**: Consolidate to one implementation

### 2. Expert Mode Globals
- **File**: `lib/expertModeGlobal.ts`
- **Status**: Deprecated but still imported
- **Solution**: Remove completely

### 3. State Management
- **`lib/streamStates.ts`** - 38K+ tokens(!!)
- **Issue**: Overly complex, needs refactoring
- **Solution**: Break into smaller modules

### 4. Message Formatting
- Multiple files handle message formatting
- Inconsistent approaches
- Should be consolidated

## Session Management

### Storage Layers
1. **localStorage**:
   - Current session ID
   - User preferences
   - API keys (encrypted)
   - Expert mode config cache

2. **IndexedDB**:
   - Full session data
   - Message history
   - Persists across page reloads

3. **Memory**:
   - Active React state
   - Stream processing state

### Session Flow
```
1. Page load
   └── Load session ID from localStorage
   
2. Initialize session
   ├── Fetch from IndexedDB if exists
   └── Create new if not
   
3. Sync with backend
   └── Send session_id in metadata
   
4. Auto-save
   └── Periodic save to IndexedDB
```

## Performance Optimizations

### 1. Throttled Updates
- State updates throttled to 100ms (10fps)
- Prevents excessive re-renders during streaming

### 2. Batch Processing
- Chunks processed in batches (1-15 at once)
- Reduces React update cycles

### 3. Lazy Loading
- Components loaded on demand
- Reduces initial bundle size

### 4. Memoization
- Heavy computations memoized
- Expensive renders prevented

## Areas for Improvement

### 1. Stream Processor Consolidation
- **Issue**: Two parallel implementations
- **Solution**: Choose one, remove the other
- **Recommendation**: Evaluate features, keep best one

### 2. Code Organization
- **Issue**: Related code spread across many files
- **Solution**: Group by feature, not by type
- **Example**: All expert mode code in one directory

### 3. State Complexity
- **Issue**: Complex nested state updates
- **Solution**: Consider state normalization
- **Tool**: Maybe Redux or Zustand improvements

### 4. Type Safety
- **Issue**: Many `any` types in stream handling
- **Solution**: Define proper TypeScript interfaces

### 5. Error Boundaries
- **Issue**: Errors can crash entire chat
- **Solution**: Add more granular error boundaries

## Best Practices for Enhancement

### 1. Follow React Patterns
- Use hooks for logic reuse
- Keep components focused
- Lift state only when needed

### 2. Stream Handling
- Always handle disconnections
- Process in batches when possible
- Don't block the main thread

### 3. State Updates
- Use functional updates for safety
- Batch related updates
- Throttle high-frequency updates

### 4. Performance
- Profile before optimizing
- Use React DevTools
- Monitor bundle size

### 5. Testing
- Test stream processing edge cases
- Mock SSE responses
- Test error scenarios

## Common Pitfalls

1. **State Update Loops**: Be careful with effect dependencies
2. **Memory Leaks**: Clean up stream readers and timeouts
3. **Race Conditions**: Multiple messages sent quickly
4. **Stale Closures**: Use refs for values in callbacks
5. **Type Mismatches**: Backend/frontend type sync

## Future Enhancements

### 1. Unified Stream Processor
- Consolidate implementations
- Add plugin system for processors
- Better error recovery

### 2. Optimistic Updates
- Show user message immediately
- Update with server response
- Handle conflicts gracefully

### 3. Offline Support
- Queue messages when offline
- Sync when connection restored
- Show offline indicator

### 4. Enhanced Expert Mode
- Show analysis progress
- Allow domain override
- Cache domain analysis

### 5. Performance Monitoring
- Track render times
- Monitor memory usage
- Alert on performance issues

## Architecture Decisions

### Why SSE Instead of WebSocket?
- Simpler implementation
- One-way communication sufficient
- Built-in reconnection
- Works through proxies

### Why Session-Based?
- No user authentication needed
- Simpler deployment
- Privacy-focused
- Local-first approach

### Why Frontend Expert Mode Injection?
- Immediate user feedback
- No backend round-trip
- Better perceived performance
- Progressive enhancement

## Testing Entry Points

### Manual Testing
1. Open browser console
2. Watch for `[SessionSort]` logs (now disabled)
3. Monitor network tab for SSE stream
4. Check IndexedDB for session data

### Key Flows to Test
1. Send message → Receive response
2. Expert mode toggle → Status cards
3. Long conversation → Summarization
4. Error handling → Recovery
5. Page refresh → Session restore