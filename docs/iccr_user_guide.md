# ICCR User Guide

> **Intelligent Claude Code Router** - Automatic semantic routing for optimal model selection

> [!NOTE]
> This guide covers **ICCR v1.0** which uses LLM classification + SQLite learning.  
> See [Roadmap](./roadmap.md) for future features (embeddings, vector DB, ONNX models).

## Table of Contents

1. [What is ICCR?](#what-is-iccr)
2. [Quick Start](#quick-start)
3. [How It Works](#how-it-works)
4. [Configuration](#configuration)
5. [CLI Commands](#cli-commands)
6. [Use Cases](#use-cases)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

---

## What is ICCR?

ICCR enhances Claude Code Router with **intelligent semantic routing** that automatically selects the best model for each task based on:

- 📝 **Intent** - What you're trying to do (code generation, debugging, etc.)
- 🎯 **Complexity** - How difficult the task is (simple, moderate, complex, expert)
- 💰 **Cost** - Balancing quality with API costs
- 📊 **Past Performance** - Learning from what worked before

### Key Benefits

| Feature | Classic CCR | ICCR |
|---------|-------------|------|
| **User Input** | Must type keywords like "code", "cheap" | Natural language, no keywords needed |
| **Complexity Awareness** | ❌ None | ✅ Routes simple tasks to cheap models |
| **Learning** | ❌ Static | ✅ Improves over time |
| **Cost Optimization** | ⚠️ Manual | ✅ Automatic |
| **Domain Support** | ⚠️ Requires keyword config | ✅ Works for any domain |

---

## Quick Start

### 1. Enable ICCR

Add to your `~/.claude-code-router/config.json`:

```json
{
  "routes": {
    "default": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    }
  },
  "semanticRouting": {
    "enabled": true
  }
}
```

### 2. Set Up Classifier (Choose One)

#### Option A: Local (Free, Private) - Recommended

Install Ollama:
```bash
# macOS
brew install ollama

# Start Ollama
ollama serve

# ICCR will auto-download qwen2.5:0.5b on first run
```

#### Option B: Cloud (Easy Setup)

Set OpenRouter API key:
```bash
export OPENROUTER_API_KEY="your-key-here"
```

ICCR will use free Gemini Flash model for classification.

### 3. Start CCR

```bash
ccr start

# You'll see:
✓ Ollama detected at localhost:11434
✓ Using qwen2.5:0.5b for semantic routing
✓ ICCR ready (semantic routing enabled)
```

### 4. Use Naturally

Just ask in natural language - no keywords needed!

```
❌ Old way: "code 帮我生成一个登录API"
✅ New way: "帮我生成一个登录API"

ICCR automatically:
- Detects intent: code_generation
- Estimates complexity: moderate
- Selects: deepseek-chat (good quality, low cost)
```

---

## How It Works

### The Routing Process

```
Your Request
    ↓
LLM Classification (50-200ms)
  - Intent: code_generation
  - Complexity: moderate
  - Domain: [web_backend]
    ↓
Check Learned Profiles (SQLite, <5ms)
  - deepseek-chat: 90% success, $0.01
  - claude-sonnet: 95% success, $0.03
    ↓
Select Best Model (<1ms)
  - Decision: deepseek-chat
  - Reason: Good enough, 3x cheaper
    ↓
Route to Model
    ↓
Track Outcome
  - Success? Quality? Cost?
  - Update profile for next time
```

### Learning Over Time

**Week 1:**
```
Request: "Fix Python syntax error"
ICCR: No data, uses default (claude-sonnet)
Result: Success, but expensive ($0.03)
```

**Week 2:**
```
Request: "Fix Python syntax error"
ICCR: Learned that deepseek-chat works (90% success)
Result: Success, cheaper ($0.01) ✅
```

**Week 4:**
```
Request: "Design distributed system"
ICCR: Learned that expert tasks need deepseek-reasoner
Result: High quality, appropriate cost ($0.15) ✅
```

---

## Configuration

### Minimal Config (Recommended)

```json
{
  "routes": {
    "default": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    }
  },
  "semanticRouting": {
    "enabled": true
  }
}
```

ICCR handles everything else automatically!

### Advanced Config

```json
{
  "routes": {
    "default": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    },
    "premium": {
      "provider": "openrouter",
      "model": "anthropic/claude-3.5-sonnet"
    }
  },
  
  "semanticRouting": {
    "enabled": true,
    "confidenceThreshold": 0.7,
    "fallbackToRules": true,
    
    "classifier": {
      "provider": "ollama",
      "model": "qwen2.5:0.5b",
      "baseURL": "http://localhost:11434"
    },
    
    "optimization": {
      "costWeight": 0.3,
      "qualityWeight": 0.5,
      "latencyWeight": 0.2
    }
  }
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable semantic routing |
| `confidenceThreshold` | `0.7` | Minimum confidence to use semantic routing (0-1) |
| `fallbackToRules` | `true` | Use classic routing if confidence is low |
| `classifier.provider` | Auto-detect | LLM provider: `ollama`, `openrouter`, `openai` |
| `classifier.model` | Auto | Model for classification |
| `optimization.costWeight` | `0.3` | How much to prioritize cost (0-1) |
| `optimization.qualityWeight` | `0.5` | How much to prioritize quality (0-1) |
| `optimization.latencyWeight` | `0.2` | How much to prioritize speed (0-1) |

---

## CLI Commands

### View Learned Profiles

```bash
$ ccr models list

Provider: deepseek, Model: deepseek-chat
├─ Quality Score: 0.87 (learned from 127 requests)
├─ Strengths: code_generation (92% success), debugging (88% success)
├─ Avg Cost: $0.0014 per request
├─ Avg Latency: 1.2s
└─ Source: learned_from_usage (updated 2 hours ago)

Provider: openrouter, Model: anthropic/claude-3.5-sonnet
├─ Quality Score: 0.95 (learned from 43 requests)
├─ Strengths: code_generation (98% success), explanation (96% success)
├─ Avg Cost: $0.032 per request
├─ Avg Latency: 2.1s
└─ Source: public_benchmark + learned_from_usage
```

### View Specific Model

```bash
$ ccr models show deepseek/deepseek-chat

Model: deepseek-chat
Provider: deepseek

Performance Metrics:
├─ Quality Score: 0.87
├─ Success Rate: 89%
├─ Sample Count: 127 requests
└─ Last Updated: 2 hours ago

Strengths:
├─ code_generation: 92% success (78 samples)
├─ debugging: 88% success (31 samples)
└─ refactoring: 85% success (18 samples)

Cost & Latency:
├─ Avg Cost: $0.0014 per request
└─ Avg Latency: 1.2s

Source: learned_from_usage
```

### Test Classification

```bash
$ ccr classify "Fix this Python bug"

Classification Result:
├─ Intent: debugging
├─ Complexity: simple
├─ Domain: [python]
├─ Confidence: 0.92
└─ Recommended Model: deepseek-chat

Reasoning:
Simple debugging task for Python. Historical data shows
deepseek-chat has 88% success rate for debugging tasks.
Estimated cost: $0.001 vs $0.02 for premium model.
```

### Reset Learned Data

```bash
$ ccr models reset

⚠ This will delete all learned model profiles.
? Are you sure? (y/N) y

✓ Reset complete. Using default profiles.
```

### Export/Import Profiles

```bash
# Export (share with team)
$ ccr models export > team-profiles.json

# Import
$ ccr models import team-profiles.json

✓ Imported 5 model profiles
✓ Merged with existing data (your data preserved)
```

### Update Default Profiles

```bash
$ ccr models update-defaults

Checking for updates...
✓ Downloaded latest profiles (v1.2.0)
✓ Updated 3 models: deepseek-chat, claude-3.5-sonnet, gemini-2.0-flash
ℹ Your learned data is preserved
```

---

## Use Cases

### Case 1: Simple Bug Fix

**Request:**
```
"Fix this Python syntax error: missing colon on line 5"
```

**ICCR Decision:**
```
Intent: debugging
Complexity: simple
Selected: deepseek-chat
Reason: Simple syntax fix, deepseek-chat has 95% success
Cost: $0.001 (vs $0.02 for premium model)
Savings: 95% 💰
```

### Case 2: Complex Architecture

**Request:**
```
"Design a microservices architecture for e-commerce with 1M+ users,
including API gateway, service mesh, and event-driven communication"
```

**ICCR Decision:**
```
Intent: architecture
Complexity: expert
Selected: deepseek-reasoner
Reason: Expert-level architecture requires reasoning capability
Cost: $0.15 (appropriate for complexity)
Quality: High ✅
```

### Case 3: Code Generation

**Request:**
```
"Create a React component for user authentication with form validation"
```

**ICCR Decision:**
```
Intent: code_generation
Complexity: moderate
Selected: claude-3.5-sonnet
Reason: Moderate complexity, claude excels at React
Cost: $0.03
Quality: Excellent ✅
```

### Case 4: Learning Example

**First Time (No Data):**
```
Request: "Optimize this SQL query"
ICCR: No historical data, uses claude-sonnet (safe choice)
Result: Success, cost $0.03
```

**After 5 Similar Requests:**
```
Request: "Optimize this SQL query"
ICCR: Learned that deepseek-chat works well (90% success)
Result: Success, cost $0.01 (3x cheaper!) 💰
```

---

## Troubleshooting

### ICCR Not Working

**Symptom:** Requests still use classic routing

**Solutions:**
1. Check config: `"semanticRouting": { "enabled": true }`
2. Verify classifier is available:
   ```bash
   # For Ollama
   curl http://localhost:11434/api/tags
   
   # For OpenRouter
   echo $OPENROUTER_API_KEY
   ```
3. Check logs: `~/.claude-code-router/logs/`

### Classification Too Slow

**Symptom:** 1-2 second delay before routing

**Solutions:**
1. Use local Ollama instead of cloud API
2. Use smaller model: `qwen2.5:0.5b` instead of `1.5b`
3. Enable caching (automatic in ICCR)

### Wrong Model Selected

**Symptom:** ICCR selects expensive model for simple task

**Solutions:**
1. Check optimization weights:
   ```json
   "optimization": {
     "costWeight": 0.5,  // Increase to prioritize cost
     "qualityWeight": 0.3,
     "latencyWeight": 0.2
   }
   ```
2. Provide feedback: ICCR will learn over time
3. Check learned profiles: `ccr models list`

### Ollama Not Detected

**Symptom:** "⚠ Ollama not detected"

**Solutions:**
1. Install Ollama: `brew install ollama`
2. Start Ollama: `ollama serve`
3. Verify: `curl http://localhost:11434/api/tags`
4. Or use OpenRouter instead (set `OPENROUTER_API_KEY`)

---

## FAQ

### Q: Does ICCR cost money?

**A:** ICCR itself is free. Classification costs depend on your setup:
- **Ollama (local)**: Free, no API costs
- **OpenRouter (cloud)**: ~$0.0001 per request with free models
- **OpenAI**: ~$0.001 per request (only if you configure it)

The actual model API calls cost the same as before.

### Q: Will ICCR slow down my requests?

**A:** Minimal impact:
- Classification: 50-200ms (vs 1-5s for actual model call)
- Total overhead: ~2-5% of request time
- Caching reduces this further for similar requests

### Q: Is my data private?

**A:** Yes, 100% local by default:
- All learning stored in local SQLite (`~/.claude-code-router/iccr.db`)
- No telemetry or phone-home
- Only external call is LLM classification (which you control)

### Q: Can I disable ICCR?

**A:** Yes, set `"semanticRouting": { "enabled": false }` to revert to classic CCR.

### Q: How accurate is the classification?

**A:** Depends on model:
- `qwen2.5:0.5b`: 85% accuracy
- `gemini-2.0-flash`: 95% accuracy
- Improves over time as ICCR learns your patterns

### Q: What if classification is wrong?

**A:** ICCR has safeguards:
- Confidence threshold (default 0.7)
- Falls back to classic routing if uncertain
- Learns from outcomes to improve

### Q: Can I use multiple models?

**A:** Yes! Configure multiple routes:
```json
{
  "routes": {
    "default": { "provider": "deepseek", "model": "deepseek-chat" },
    "premium": { "provider": "openrouter", "model": "claude-3.5-sonnet" },
    "local": { "provider": "ollama", "model": "qwen2.5-coder" }
  }
}
```

ICCR will select the best one for each task.

### Q: How do I share learned profiles with my team?

**A:**
```bash
# Export
ccr models export > team-profiles.json

# Share file with team

# Team imports
ccr models import team-profiles.json
```

### Q: Can I manually override ICCR's decision?

**A:** Yes, use `/model` command as before:
```
/model premium Design a complex system...
```

This locks the session to `premium` route.

---

## Next Steps

1. ✅ Enable ICCR in your config
2. ✅ Set up Ollama or OpenRouter
3. ✅ Use naturally - no keywords needed!
4. ✅ Check learned profiles: `ccr models list`
5. ✅ Optimize weights if needed

**Need help?** Check the [API Reference](./iccr_api_reference.md) or [Implementation Plan](./implementation_plan.md).

---

**Happy routing! 🚀**
