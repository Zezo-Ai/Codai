# StreamHandlers Refactoring Guide

## Current Architecture Issues

The current implementation of `streamHandlers.ts` performs multiple roles that should be separated:

1. **Stream Processing**: Reading the stream, parsing chunks, and handling timeouts
2. **State Detection**: Identifying message states (ROLE, CONTENT, TOOL_CALL, etc.)
3. **Content Processing**: Transforming and structuring message content
4. **UI State Updates**: Constructing and updating UI message models

## Data Flow Analysis

The current data flow from backend to UI:

1. **API Fetch** (`api.ts`) → Returns raw stream
2. **useChat Hook** (`useChat.ts`) → Passes stream to StreamProcessor
3. **StreamProcessor** (`streamHandlers.ts`) → Currently processes content extensively
4. **State Machine** (`streamStates.ts`) → Detects states and visualizes them
5. **UI Components** → Renders messages

## Proper Architecture

The correct separation of concerns should be:

- **streamStates.ts**: 
  - Handles ONLY state detection and visualization
  - Does NOT modify content
  - Provides state information to streamHandlers

- **streamHandlers.ts**:
  - Reads and parses the raw stream
  - Passes raw chunks to state machine
  - Updates UI state with unmodified content
  - Does NO content processing or state detection

## Detailed Implementation Plan

1. **Create Minimal StreamHandler Implementation**
   - Remove all content processing logic (thinking blocks, screenshots, special formats)
   - Remove all state detection logic
   - Implement simple stream reading that passes chunks to state machine
   - Create basic message model updates with raw content

2. **Clean State Detection in streamStates**
   - Ensure state detection doesn't modify content
   - Improve detection patterns for all message types
   - Clearly separate state detection from content transformation

3. **Simplify Message Construction**
   - Create messages with raw content
   - Ensure content flows unchanged from backend to UI
   - Use simple consistent message structure

4. **UI Component Updates**
   - Update UI components to handle raw content
   - Move any needed formatting to display components
   - Make formatting non-destructive to original content

## Expected Outcomes

- Raw content flows unchanged from backend to UI display
- State machine only detects states without modifying content
- Message construction is simple and consistent
- Clear separation between stream handling, state detection, and UI rendering

## Testing Strategy

1. Compare raw backend responses with final UI display content
2. Verify that special content (code blocks, thinking states) displays correctly
3. Ensure state visualization works correctly for all message types

## Migration Plan

Due to extensive changes needed, we recommend:
1. Create a new implementation of streamHandlers.ts
2. Test with basic functionality
3. Gradually add support for different message types
4. Switch over to new implementation when complete