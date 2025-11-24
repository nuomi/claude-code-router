# Claude Code Router (CCR) - Current Features Summary

> This document summarizes the current capabilities of Claude Code Router based on user conversations and documentation analysis.

## Overview

Claude Code Router (CCR) is an open-source proxy tool that extends Claude Code's functionality by routing requests to various AI providers. It acts as an intelligent middleware layer between Claude Code and multiple AI model providers.

## Core Capabilities

### 1. Multi-Provider Support

CCR supports routing to various AI providers:
- **OpenRouter**: Access to GPT-4o, Claude, and other models
- **DeepSeek**: Cost-effective Chinese provider
- **Ollama**: Local model execution
- **Google Gemini**: Direct access to Gemini models
- **Volcengine**: ByteDance's AI platform
- **SiliconFlow**: Additional provider option

### 2. Model Routing System

The routing system operates on a **priority-based** mechanism:

1. **Manual Lock (Highest Priority)**: `/model xxx` command locks the session to a specific route
2. **Keyword Matching**: Message content matching regex patterns in `routes` configuration
3. **Default Model**: Fallback when no matches are found

### 3. Dynamic Model Switching

Users can switch models mid-conversation using the `/model` command:
- `/model code` - Switch to code-optimized model
- `/model search` - Switch to web search-enabled model
- `/model cheap` - Switch to cost-effective model
- `/model local` - Switch to local model
- `/model auto` - Return to automatic routing (recommended solution)

### 4. Route Categories

CCR supports multiple route categories for different use cases:

- **default**: General-purpose model
- **background**: Background tasks
- **think**: Complex reasoning tasks
- **longContext**: Long document processing
- **webSearch**: Web search integration
- **image**: Image generation/processing
- **code**: Code-specific tasks
- **cheap**: Cost-optimized routing
- **local**: Local model execution

## Configuration Structure

### Basic Configuration Example

```json
{
  "routes": {
    "default": {
      "provider": "openrouter",
      "model": "anthropic/claude-3.5-sonnet"
    },
    "code": {
      "provider": "openrouter",
      "model": "openai/gpt-4o",
      "match": ["代码", "code", "function", "bug"]
    },
    "search": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "match": ["搜索", "search", "查找"]
    },
    "cheap": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    },
    "local": {
      "provider": "ollama",
      "model": "qwen2.5-coder:7b"
    },
    "gemini": {
      "provider": "google",
      "model": "gemini-2.0-flash-exp"
    }
  },
  "defaultModel": "default",
  "providers": {
    "openrouter": {
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "${OPENROUTER_API_KEY}"
    },
    "deepseek": {
      "baseURL": "https://api.deepseek.com/v1",
      "apiKey": "${DEEPSEEK_API_KEY}"
    },
    "ollama": {
      "baseURL": "http://localhost:11434/v1",
      "apiKey": "ollama"
    },
    "google": {
      "baseURL": "https://generativelanguage.googleapis.com/v1beta",
      "apiKey": "${GOOGLE_API_KEY}"
    }
  }
}
```

## Routing Scenarios

### Scenario 1: Automatic Keyword Matching
**User Input**: "帮我生成一个 API 路由" (Help me generate an API route)
- **Matched Route**: `code` (matches keyword "代码")
- **Model Used**: `openai/gpt-4o` via OpenRouter

### Scenario 2: Manual Model Selection
**User Input**: "/model cheap 用最快的模型修复这个 bug"
- **Locked Route**: `cheap`
- **Model Used**: `deepseek-chat`
- **Behavior**: All subsequent messages use this route until unlocked

### Scenario 3: Web Search
**User Input**: "搜索 Next.js 15 的新特性" (Search for Next.js 15 new features)
- **Matched Route**: `search` (matches keyword "搜索")
- **Model Used**: `deepseek-chat`

### Scenario 4: Local Model
**User Input**: "/model local 分析这段代码"
- **Locked Route**: `local`
- **Model Used**: `qwen2.5-coder:7b` via Ollama
- **Benefit**: Privacy-preserving, no data sent to cloud

## Key Features

### Environment Variable Interpolation
API keys are securely managed using environment variables:
```json
"apiKey": "${OPENROUTER_API_KEY}"
```

### Request/Response Transformation
CCR supports configurable transformers to adapt requests and responses between different provider formats.

### CLI Management
- `ccr start` - Start the proxy service
- `ccr activate` - Set up environment variables
- `ccr config` - Manage configuration

### UI Management
Web-based interface for configuration and model selection.

### Custom Router
Advanced users can implement custom routing logic via JavaScript files.

## Session Lock Behavior

### Problem
Once `/model xxx` is used, the session is locked to that route, preventing automatic keyword matching.

### Solutions

1. **Add `auto` Route (Recommended)**
   ```json
   "auto": {
     "provider": "openrouter",
     "model": "anthropic/claude-3.5-sonnet"
   }
   ```
   Then use `/model auto` to return to automatic routing.

2. **Use Modified CCR Version**
   Some forks support `/model reset` or `/reset` commands.

3. **Fork and Modify**
   Remove thread-lock related code for custom behavior.

## Benefits

### 1. Freedom from Vendor Lock-in
Switch between providers and models without changing your workflow.

### 2. Cost Optimization
Route simple queries to cheaper models, complex tasks to premium models.

### 3. Privacy Control
Use local models for sensitive code or data.

### 4. Experimentation
Easily test different models for different tasks.

### 5. Bypass Restrictions
Access models that may not be directly available through Claude Code.

## Limitations of Current System

While powerful, the current CCR has some limitations:

1. **Static Rule-Based Routing**: Relies on keyword matching and manual configuration
2. **No Learning**: Cannot improve routing decisions based on past performance
3. **Manual Optimization**: Users must manually determine which models work best for which tasks
4. **Token-Based Thresholds**: Simple token counting for context length decisions
5. **No Cost-Quality Balancing**: Cannot automatically optimize for cost vs. quality trade-offs

> **Note**: These limitations are addressed in the proposed [Intelligent Claude Code Router (ICCR)](./arch_iccr.md) architecture, which adds semantic routing, machine learning, and performance feedback loops.

## Getting Started

1. **Install**: `npm install -g claude-code-router`
2. **Configure**: Edit `~/.claude-code-router/config.json`
3. **Start Service**: `ccr start`
4. **Activate Environment**: `ccr activate`
5. **Use in Claude Code**: Start using with automatic routing or `/model` commands

## Related Documentation

- [ICCR Architecture](./arch_iccr.md) - Proposed intelligent routing enhancements
- [README.md](../README.md) - Full documentation
- [README_zh.md](../README_zh.md) - Chinese documentation
