# Block Handling Rules

This document outlines the rules and principles for handling blocks in the streaming response system. These rules should be followed for all changes and updates to maintain consistency and proper functionality.

## 1. Separation of Concerns

### 1.1 State vs. Block Separation
- **Rule**: States and blocks are completely independent concepts.
- **Implementation**: Block transitions should never affect state boundaries.
- **Reasoning**: States represent different phases of the AI response, while blocks represent content formatting within a state.

### 1.2 Single Source of Truth
- **Rule**: Block type detection happens ONLY in `streamStates.ts`.
- **Implementation**: Metadata is the only source of block type information.
- **Reasoning**: Prevents inconsistencies and redundant processing.

## 2. Block Detection and Processing

### 2.1 Block Detection Location
- **Rule**: Only `streamStates.ts` should detect block types from content.
- **Implementation**: No content-based block detection in the renderer.
- **Reasoning**: Ensures a single source of truth and consistent detection.

### 2.2 Block Type Transmission
- **Rule**: Block type information flows from `streamStates.ts` to other components via metadata.
- **Implementation**: Set `currentBlockType` in `streamStates.ts` and pass it via metadata.
- **Reasoning**: Maintains clear information flow and prevents redundancy.

### 2.3 Block Transition Handling
- **Rule**: When a block ends, process fully before starting a new block.
- **Implementation**: Split processing at block boundaries with separate handling.
- **Reasoning**: Ensures clean transitions between blocks.

## 3. HTML Structure

### 3.1 State Segments
- **Rule**: Multiple blocks can exist within a single state segment.
- **Implementation**: Only close state segments at state boundaries, not block boundaries.
- **Reasoning**: Maintains proper nesting structure where blocks are contained within states.

### 3.2 Block Spans
- **Rule**: Block spans must be properly closed before starting a new block.
- **Implementation**: Add closing `</span>` tags at block boundaries.
- **Reasoning**: Prevents block nesting and ensures proper HTML structure.

### 3.3 Block Span Structure
- **Rule**: Block spans should be siblings, not nested.
- **Implementation**: Ensure closing spans before starting new blocks.
- **Reasoning**: Maintains clean HTML structure and prevents rendering issues.

## 4. Fragment Handling

### 4.1 Minimal Buffering
- **Rule**: Buffer only incomplete fragments, process complete sections immediately.
- **Implementation**: Split content at the first fragmented tag, buffer only incomplete parts.
- **Reasoning**: Enables faster rendering and more efficient processing.

### 4.2 Fragment Reassembly
- **Rule**: Combine buffered fragments with new content before processing.
- **Implementation**: `combinedContent = buffer + newContent`.
- **Reasoning**: Ensures complete tag processing.

### 4.3 Tag Completeness Check
- **Rule**: Only process content when tags are complete.
- **Implementation**: Check tag balance before processing.
- **Reasoning**: Prevents malformed HTML and incorrect processing.

## 5. Content Preservation

### 5.1 Block Content Handling
- **Rule**: Content inside blocks should be preserved as-is.
- **Implementation**: Keep content within block spans intact.
- **Reasoning**: Maintains formatting and structure of block content.

### 5.2 HTML Preservation Inside Blocks
- **Rule**: HTML formatting inside blocks should be maintained.
- **Implementation**: Don't escape HTML within blocks.
- **Reasoning**: Allows rich formatting within blocks.

## 6. Error Handling and Safety

### 6.1 Error Detection
- **Rule**: Log warnings when unexpected conditions are detected.
- **Implementation**: Add clear warning logs for unusual situations.
- **Reasoning**: Aids debugging and identifying issues.

### 6.2 Safety Measures
- **Rule**: Implement failsafes as a last resort, not primary solution.
- **Implementation**: Use safety nets only when primary handling fails.
- **Reasoning**: Ensures robust processing even in edge cases.

## 7. Special Block Types

### 7.1 CONTENT State Blocks
- **Rule**: Only the CONTENT state contains blocks.
- **Implementation**: Only apply block processing to CONTENT state.
- **Reasoning**: Other states (TOOL_CALL, etc.) have different structures.

### 7.2 Consistent Processing
- **Rule**: All block types should be processed consistently.
- **Implementation**: Use the same core processing for all block types.
- **Reasoning**: Simplifies code and ensures consistent behavior.

## 8. Performance Considerations

### 8.1 Efficient Processing
- **Rule**: Process content as soon as possible, avoid unnecessary buffering.
- **Implementation**: Process complete sections immediately.
- **Reasoning**: Improves performance and user experience.

### 8.2 Minimal Redundancy
- **Rule**: Avoid redundant operations and checks.
- **Implementation**: Only perform operations once, at the appropriate level.
- **Reasoning**: Improves efficiency and maintainability.

---

**Use this document as a reference for all changes to block handling logic.**