# Backend Architecture and Flow Reference

## Overview
This document describes the canonical backend flow for CODAI's chat and expert mode functionality, identifying core components and highlighting areas for cleanup.

## Main Chat Flow

### 1. Request Entry Point
```
POST /codai/chat/stream
├── Entry: server/routes/chat/router.py (line 89)
├── Handler: handle_chat_completion()
└── Response: StreamingResponse with SSE
```

### 2. Request Processing Flow
```
1. router.py::chat_stream()
   └── Validates request, extracts metadata
   
2. handlers.py::handle_chat_completion()
   └── Creates ChatHandler instance
   
3. ChatHandler::initialize()
   ├── Sets session_id
   ├── Loads configuration
   └── Logs summarization settings
   
4. ChatHandler::_stream_response()
   ├── Gets/creates session
   ├── Initializes tool collection
   ├── Adds message to session
   └── Starts streaming loop
   
5. core/api/client.py::sampling_loop()
   ├── Prepares conversation
   ├── Calls Anthropic API
   └── Streams response chunks
```

## Expert Mode Implementation

### Configuration
Located in `config/base.yaml`:
```yaml
ai:
  expert_mode:
    enabled: true  # Master toggle
    settings:
      phase1_max_tokens: 1000
      stream_phase1: true
```

### Two-Phase Process

#### Phase 1: Domain Analysis
- **File**: `core/api/expert_mode.py`
- **Entry**: `ExpertModeAnalyzer.analyze_request()`
- **Process**:
  1. Sends user message to Claude with analysis prompt
  2. Identifies domain expertise needed
  3. Returns JSON with domain and expert prompt

#### Phase 2: Enhanced Response  
- **File**: `server/routes/chat/handlers.py` (lines 871-950)
- **Process**:
  1. Combines base system prompt with expert enhancement
  2. Uses enhanced prompt for main Claude API call
  3. Streams response with domain context

### Expert Mode Status Flow
```
Frontend Request
└── metadata.expert_mode_enabled (from frontend)
    └── Server checks config AND client preference
        ├── If enabled: Start Phase 1 analysis
        │   ├── Send "analyzing" status
        │   ├── Perform domain analysis
        │   └── Send "activated" status with domain
        └── If disabled: Skip to normal response
```

## Core Files (Canonical)

### Primary Components
- **`/server/routes/chat/handlers.py`** (1342 lines)
  - Main chat handler implementation
  - Contains ChatHandler class
  - Handles streaming, summarization, expert mode
  
- **`/server/routes/chat/router.py`**
  - API endpoint definitions
  - Request routing
  - Config endpoints
  
- **`/server/routes/chat/state.py`**
  - SessionState class
  - Message management
  - Session persistence

- **`/core/api/client.py`**
  - Anthropic API integration
  - Main sampling loop
  - Token counting

- **`/core/api/expert_mode.py`**
  - ExpertModeAnalyzer class
  - Domain detection logic
  - Prompt enhancement

### Supporting Components
- **`/server/routes/chat/message_handler.py`**
  - SSE formatting functions
  - Message type handlers
  
- **`/server/routes/chat/stream_tags.py`**
  - Stream message type constants
  
- **`/server/routes/chat/utils.py`**
  - Tool collection initialization
  - Helper functions

## Redundant/Legacy Files

### Files to Remove
1. **`/server/routes/chat/chat_handler.py`** (378 lines)
   - Older duplicate of handlers.py
   - Not referenced in current flow
   
2. **`/server/routes/chat.py`**
   - Just re-exports router
   - Unnecessary indirection

### Legacy References
- Comments about removed ConversationHistory system
- Old conversation management code (replaced by SessionState)

## Session Management

### Current Implementation
```python
class SessionState:
    messages: List[Dict]        # Full conversation
    short_messages: List[Dict]  # Summarized version
    current_tool_name: str      # Active tool tracking
    pdf_base64: str            # PDF processing state
    screenshot: str            # Screenshot state
```

### Session Flow
1. Session ID from frontend metadata
2. Get or create session in memory
3. Messages stored in session state
4. Automatic summarization when approaching token limits
5. No database persistence (in-memory only)

## Configuration Management

### Hierarchy
```
1. Environment Variables (highest priority)
2. config/local.yaml
3. config/environments/{env}.yaml  
4. config/base.yaml
5. config/app.yaml (lowest priority)
```

### Runtime Updates
- `GET /codai/chat/config` - Read current config
- `POST /codai/chat/config` - Update config
- Updates saved to `local.yaml` (issue: mixes deployment and runtime config)

## Token Management & Summarization

### Automatic Summarization
- Triggers at 80% of max context (configurable)
- Keeps first 2, middle 2, last 5 message pairs
- Replaces older messages with summary
- Sends updated message list to frontend

### Token Counting
- Uses Anthropic's token counter
- Includes system prompt, tools, messages
- Real-time updates sent to frontend

## Areas for Improvement

### 1. Configuration Storage
- **Issue**: Runtime config changes modify deployment files
- **Solution**: Use database for runtime settings (like API keys)

### 2. Code Duplication
- **Issue**: Multiple implementations of similar functionality
- **Solution**: Remove `chat_handler.py`, consolidate message formatting

### 3. Session Persistence
- **Issue**: Sessions only in memory
- **Solution**: Add database persistence option

### 4. Expert Mode Latency
- **Issue**: Two-phase approach adds latency
- **Solution**: Consider single-phase with prompt engineering

### 5. Error Handling
- **Issue**: Inconsistent error formats
- **Solution**: Standardize error responses

## Best Practices for Enhancement

1. **Follow Existing Patterns**
   - Use SessionState for state management
   - Format SSE messages with existing helpers
   - Use established error patterns

2. **Maintain Separation**
   - Router: HTTP handling only
   - Handler: Business logic
   - Core: API integration
   
3. **Configuration**
   - Read from config_manager
   - Don't hardcode values
   - Use hierarchical overrides

4. **Streaming**
   - Always check for client disconnect
   - Send token updates regularly
   - Handle tool results with proper tags

5. **Testing Entry Points**
   - Test via `/codai/chat/stream` endpoint
   - Include session_id in metadata
   - Set expert_mode_enabled in metadata

## Common Pitfalls

1. Don't modify `handlers.py` without understanding token management flow
2. Expert mode requires both server config AND client preference
3. Session state is not persisted between server restarts
4. Tool results need proper tagging for frontend display
5. Summarization can be triggered mid-conversation

## Future Enhancements

1. **Database-backed Sessions**
   - Persist conversations across restarts
   - Enable conversation sharing
   
2. **Optimized Expert Mode**
   - Single-phase implementation
   - Cached domain analysis
   
3. **Real-time Config Updates**
   - WebSocket/SSE for config changes
   - No page refresh required

4. **Enhanced Error Recovery**
   - Automatic retry logic
   - Better error messages

5. **Performance Monitoring**
   - Track response times
   - Monitor token usage
   - Alert on errors