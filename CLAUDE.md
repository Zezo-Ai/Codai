# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Application Overview

CODAI - Evolved Intelligence. Turn ideas into production-ready apps and solutions with zero code required. Built with Python FastAPI backend and Next.js frontend, CODAI transforms natural language descriptions into complete applications.

**Created by [Arian Rudd](https://x.com/AriRudd)** | **Website**: [codai.ai](https://codai.ai)

## Development Commands

### Initial Setup

#### Windows Users
```powershell
# PowerShell setup wizard (recommended)
.\setup.ps1

# Or use traditional setup
python -m setup
```

#### Linux/macOS Users
```bash
# Bash setup wizard (recommended)
./setup.sh

# Or use Python module directly
python -m setup

# Backend only setup
python -m setup setup --skip-frontend

# Frontend only setup  
python -m setup setup --skip-backend
```

### Running the Application
```bash
# Start backend server (default port 8000)
python run_server.py

# Start backend with specific environment and logging
python run_server.py --env development --log-level debug

# Start frontend (port 8001)
cd frontend
npm run dev
```

### Testing and Quality
```bash
# Backend tests  
pytest                     # Run Python tests
pytest -v                  # Verbose output
pytest --cov              # Run with coverage
pytest tests/test_api.py  # Run specific test file

# Frontend tests
cd frontend
npm test                   # Run Jest tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report

# Frontend linting and build
npm run lint               # Next.js ESLint
npm run dev:turbo         # Development with Turbopack (faster)
npm run build              # Production build
```

### Development Tools
```bash
# Check system requirements
python -m setup check

# Validate environment
python -m setup validation

# View setup commands
python -m setup --help
```

## Architecture Overview

### Backend Structure
- **Core API**: FastAPI with async/await, direct Anthropic SDK integration
- **Configuration**: Hierarchical YAML system (ENV vars → local.yaml → environment/*.yaml → base.yaml → app.yaml)
- **Tools System**: Computer use (PyAutoGUI/Selenium), file operations, web tools, PDF processing
- **Real-time Chat**: WebSocket-style streaming with sophisticated message processing
- **Extended Thinking**: Native Anthropic API feature with configurable token budgets (1024-16000)
- **Model Support**: Claude 4 Opus, Claude 4 Sonnet (default), Claude 3.5 Haiku

### Frontend Structure  
- **Framework**: Next.js 15 with React 19, Turbopack for development
- **State**: Zustand for global state, sophisticated conversation management
- **UI**: Radix UI components with Tailwind CSS, Framer Motion animations
- **Features**: Conversation Inspector, monitoring dashboard, session management

### Key Architectural Patterns
- **Configuration Hierarchy**: Environment Variables → local.yaml → environment/*.yaml → base.yaml
- **Hot Reload**: Automatic server restart on Python file changes in core directories
- **Error Boundaries**: Comprehensive error handling with recovery mechanisms
- **Session Management**: Persistent conversations with import/export capabilities

## Technology Stack

### Backend Dependencies
- `anthropic` - Claude API integration with beta features (computer-use-2025-01-24)
- `fastapi>=0.109.1` - Web framework with async support
- `uvicorn` - ASGI server with hot reload via watchfiles
- `pydantic` - Data validation and settings management
- `selenium>=4.16.0` - Web interaction automation
- `pyautogui` - Computer vision and automation
- `beautifulsoup4>=4.12.0` - Web scraping
- `pyyaml>=6.0.1` - Configuration management
- `poetry` - Dependency management (pyproject.toml)

### Frontend Dependencies
- `next@^15.1.5` - React framework with App Router
- `react@^19.0.0` - UI library with React 19 features
- `@radix-ui/*` - UI component primitives
- `tailwindcss` - CSS framework with custom animations
- `framer-motion` - Animation library
- `zustand` - State management
- `react-markdown` - Markdown rendering with syntax highlighting
- `@swc/jest` - Fast test runner with SWC compilation

## Configuration System

### Environment Files
- `config/base.yaml` - Base configuration (server, tools, AI settings)
- `config/environments/development.yaml` - Development overrides
- `config/environments/production.yaml` - Production settings
- `config/local.yaml` - Local development overrides (git ignored)

### Required Environment Variables
```bash
APP_ENV=development                     # Environment selection

# Auto-generated on first run if not provided:
ENCRYPTION_SECRET=<64-char-hex-secret>  # For API key encryption

# Optional - can be set via UI instead
ANTHROPIC_API_KEY=your-api-key         # Fallback if no user key provided
```

**Note**: Since the latest update, `ENCRYPTION_SECRET` is automatically generated on first server start if not found. It's saved to `.encryption_secret` and `.env` files.

### Port Configuration
- Backend: Port 8000 (configurable via base.yaml)
- Frontend: Port 8001 (Next.js development)

## Extended Thinking Configuration

Extended thinking is a native Anthropic API feature for complex reasoning:

```yaml
ai:
  extended_thinking:
    enabled: true
    budget_tokens: 5000        # Token budget (1024-16000)
    show_thinking: true        # Display thinking blocks
    auto_detect: true          # Auto-enable for complex tasks
```

Token budgets scale based on task complexity:
- Simple tasks: 1024 tokens
- Standard tasks: 4000 tokens  
- Complex tasks: 8000 tokens
- Very complex tasks: 16000 tokens

The system automatically detects complex tasks based on patterns in `core/api/conversation/preparation.py` and dynamically adjusts the thinking budget.

## Key Features

### API Key Management
- **Secure Storage**: User API keys encrypted with AES-256-GCM
- **Session-based**: Keys tied to browser sessions
- **UI Management**: Add/test/remove keys via Settings
- **Backend Storage**: Keys stored in SQLite/PostgreSQL
- **Audit Trail**: All operations logged for security

### AI Mode Switcher
- **Model Selection**: Switch between Claude models in UI
- **Persistent Choice**: Selection saved in localStorage
- **Dynamic Loading**: Models loaded from configuration
- **Fallback Support**: Graceful degradation to default model

### Conversation Inspector
- Message analysis and debugging tools
- Bulk operations with range selection
- Import/export conversation data
- Manual and automatic summarization

### Monitoring Dashboard
- Real-time log viewing and analysis
- Performance metrics (token usage, response times)
- Error rate monitoring and alerts
- System health tracking

### Computer Use Tools
- Screen capture and automation via PyAutoGUI
- Web interaction through Selenium
- File operations with safety checks
- PDF processing capabilities

## Development Workflow

1. **Initial Setup**: Run `python -m setup` for full environment configuration
2. **Backend Development**: Use `python run_server.py --env development --log-level debug` for detailed logging
3. **Frontend Development**: Use `npm run dev` with Turbopack for fast reload
4. **Testing**: Run `npm test` for frontend Jest tests
5. **Quality Checks**: Run `npm run lint` for code quality

## Security and CORS

- Development: CORS enabled for localhost with flexible origins
- Production: Secure CORS configuration with specific allowed origins
- Rate limiting: 60 requests per minute per IP
- Input sanitization and XSS protection
- API key validation for protected endpoints

## Logging and Monitoring

- Structured logging with JSON format and log rotation
- Performance monitoring with alerts for error rates and response times
- Token usage tracking for AI interactions
- Advanced log cleanup and retention policies

## Claude API Integration

The application uses the Anthropic SDK directly with beta features:

- **API Client**: `core/api/client.py` - Main Claude integration point
- **Conversation Preparation**: `core/api/conversation/preparation.py` - Handles extended thinking detection
- **Message Processing**: `server/routes/chat/message_handler.py` - Streaming and tool handling
- **Model Configuration**: `core/configuration.py` - ModelConfig class for validation

Key integration points:
```python
# Extended thinking with computer use beta
anthropic.Anthropic(beta={"computer-use-2025-01-24"})

# Streaming with thinking parameter preservation
{"role": "assistant", "content": [], "thinking": thinking_content}
```

## File Structure Notes

- `server/routes/` - API endpoints organized by feature
- `core/api/` - Claude API integration and conversation management
- `tools/` - Computer use, file operations, web tools
- `frontend/src/components/` - React components organized by feature
- `frontend/src/hooks/` - Custom React hooks for state management
- `config/` - YAML configuration files with environment hierarchy
- `setup/` - Python module-based setup system