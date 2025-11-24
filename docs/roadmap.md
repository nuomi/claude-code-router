# ICCR Roadmap

> **Version History and Future Plans**

## Version 1.0 (Current) - Core Intelligence

**Status**: In Development  
**Target Release**: Q1 2025  
**Philosophy**: Simple, practical, auto-learning

### ✅ Features Included

#### 1. **LLM-Based Classification**
- Small LLM (Ollama/OpenRouter) classifies requests
- Extracts: intent, complexity, domain
- Fallback to rule-based if LLM unavailable
- ~50-200ms overhead

#### 2. **SQLite-Based Learning**
- Stores model profiles locally
- Tracks routing decisions and outcomes
- Auto-learns strengths/weaknesses
- Exponential moving average updates

#### 3. **Intelligent Model Selection**
- Multi-factor scoring (success rate, cost, quality, latency)
- Configurable optimization weights
- Reasoning generation
- Alternative suggestions

#### 4. **Auto-Discovery**
- Ships with default model profiles
- Learns from actual usage
- Discovers model capabilities automatically
- No manual configuration needed

#### 5. **CLI Tools**
- `ccr models list` - View learned profiles
- `ccr models show` - Detailed model info
- `ccr classify` - Test classification
- `ccr models export/import` - Share profiles

#### 6. **Backward Compatibility**
- Semantic routing disabled by default
- Falls back to classic CCR
- No breaking changes
- Gradual adoption path

### 🎯 Technical Architecture (v1.0)

```
User Request
    ↓
LLM Classifier (Ollama/OpenRouter)
  - Intent classification
  - Complexity estimation
    ↓
SQLite Database
  - Model profiles
  - Success rates
  - Cost/latency data
    ↓
Model Selector
  - Multi-factor scoring
  - Optimization
    ↓
Route to Model
    ↓
Feedback Collection
  - Track outcome
  - Update profiles
```

### 📦 Dependencies (v1.0)

**Required:**
- `better-sqlite3` - Local database
- Existing CCR dependencies

**Optional:**
- Ollama (for local classification)
- OpenRouter API key (for cloud classification)

**Total Package Size**: ~15MB (vs ~10MB for classic CCR)

---

## Version 2.0 (Future) - Advanced Intelligence

**Status**: Planned  
**Target Release**: Q3 2025  
**Philosophy**: Scale, precision, collaboration

### 🚀 Planned Features

#### 1. **Vector Database Integration**
- Semantic similarity search
- Find similar past requests
- Better for large teams (10K+ requests)
- Options: SQLite-VSS, Qdrant

**Why not v1.0?**
- Overkill for individual users (<1K requests)
- Adds complexity (embeddings, indexing)
- SQLite queries sufficient for small scale

#### 2. **Embedding Service**
- Generate request embeddings
- Enable semantic search
- Cache embeddings locally
- Options: OpenAI, local models

**Why not v1.0?**
- Not needed without vector DB
- LLM classification works well
- Adds API costs

#### 3. **ONNX ML Models**
- Local intent classifier (~50MB)
- Local complexity estimator (~50MB)
- Faster than LLM (~10ms vs ~100ms)
- No API calls needed

**Why not v1.0?**
- Requires training data
- Increases package size (100MB+)
- LLM classification accurate enough

#### 4. **Team Collaboration**
- Shared profile repository
- Cross-user learning
- Privacy-preserving aggregation
- Team analytics

#### 5. **Advanced Routing Strategies**
- Multi-model ensembles
- A/B testing
- Canary deployments
- Custom routing algorithms

#### 6. **Enhanced UI**
- Web dashboard
- Real-time insights
- Cost analytics
- Performance graphs

---

## Version 3.0 (Vision) - Autonomous Intelligence

**Status**: Research  
**Target Release**: 2026+  
**Philosophy**: Self-optimizing, context-aware

### 🔮 Visionary Features

#### 1. **Context-Aware Routing**
- Understand project context
- Learn from codebase
- Personalized routing per project

#### 2. **Multi-Agent Workflows**
- Route sub-tasks to different models
- Orchestrate complex workflows
- Automatic task decomposition

#### 3. **Federated Learning**
- Learn from community (opt-in)
- Privacy-preserving
- Improve default profiles

#### 4. **Predictive Routing**
- Anticipate user needs
- Pre-warm models
- Reduce latency

---

## Migration Path

### Classic CCR → ICCR v1.0

**Effort**: Minimal (5 minutes)

```json
// Add to existing config.json
{
  "semanticRouting": {
    "enabled": true,
    "classifier": {
      "provider": "ollama",
      "model": "qwen2.5:0.5b"
    }
  }
}
```

**Benefits:**
- ✅ Automatic routing (no keywords)
- ✅ Cost optimization
- ✅ Learns over time
- ✅ No breaking changes

### ICCR v1.0 → v2.0

**Effort**: Low (configuration update)

```json
// Add to config.json
{
  "semanticRouting": {
    "vectorDB": {
      "type": "sqlite-vss",
      "enabled": true
    },
    "embedding": {
      "provider": "openai",
      "model": "text-embedding-3-small"
    }
  }
}
```

**Benefits:**
- ✅ Better similarity search
- ✅ Faster classification (ONNX)
- ✅ Team collaboration

---

## Feature Comparison

| Feature | Classic CCR | v1.0 | v2.0 | v3.0 |
|---------|-------------|------|------|------|
| **Keyword Routing** | ✅ | ✅ | ✅ | ✅ |
| **LLM Classification** | ❌ | ✅ | ✅ | ✅ |
| **Auto-Learning** | ❌ | ✅ | ✅ | ✅ |
| **Cost Optimization** | ❌ | ✅ | ✅ | ✅ |
| **Vector Search** | ❌ | ❌ | ✅ | ✅ |
| **ONNX Models** | ❌ | ❌ | ✅ | ✅ |
| **Team Collaboration** | ❌ | ❌ | ✅ | ✅ |
| **Context-Aware** | ❌ | ❌ | ❌ | ✅ |
| **Multi-Agent** | ❌ | ❌ | ❌ | ✅ |

---

## Timeline

```
2024 Q4: Planning & Design ✅
2025 Q1: v1.0 Development (Current)
2025 Q2: v1.0 Release & Stabilization
2025 Q3: v2.0 Development
2025 Q4: v2.0 Release
2026+:   v3.0 Research
```

---

## Contributing

We welcome contributions! Priority areas for v1.0:

1. **Testing**: Unit tests, integration tests
2. **Documentation**: Tutorials, examples
3. **Model Profiles**: Benchmark data for popular models
4. **Bug Reports**: Issues, edge cases

For v2.0+ features, please discuss in GitHub Discussions first.

---

## Questions?

- **v1.0 Implementation**: See [Implementation Plan](./implementation_plan.md)
- **User Guide**: See [User Guide](./iccr_user_guide.md)
- **API Reference**: See [API Reference](./iccr_api_reference.md)

---

**Last Updated**: 2025-11-25
