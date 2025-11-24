# ICCR v1.0 Implementation Walkthrough

This document provides a comprehensive overview of the implementation, architecture, and testing of the **Intelligent Claude Code Router (ICCR) v1.0**.

## 1. Project Overview

**Goal**: Create an intelligent routing system that automatically selects the best LLM for a given task based on intent, complexity, and learned performance data, eliminating the need for manual keyword configuration.

**Key Features**:
- **Semantic Classification**: Uses LLMs (or rule-based fallback) to understand user intent.
- **Intelligent Selection**: Scores models based on cost, quality, latency, and capabilities.
- **Auto-Learning**: Continuously updates model profiles based on real-world outcomes.
- **Privacy-First**: All learning data and profiles are stored locally in SQLite.
- **Zero Config**: Works out of the box with smart defaults.

---

## 2. System Architecture

```mermaid
graph TD
    User[User Request] --> Router[ICCR Router]
    
    subgraph "Phase 2: Classification"
        Router --> Semantic[Semantic Router]
        Semantic --> LLM[LLM Classifier]
        Semantic --> Rules[Rule-Based Fallback]
        LLM -.-> Cache[Classification Cache]
    end
    
    subgraph "Phase 3: Selection"
        Router --> Selector[Model Selector]
        Selector --> Profiles[Model Profiles (DB)]
        Selector --> Scoring[Scoring Algorithm]
    end
    
    subgraph "Phase 4: Learning"
        Router --> Outcome[Outcome Recorder]
        Outcome --> Learner[Profile Learner]
        Learner --> Profiles
    end
    
    subgraph "Phase 5: Integration"
        Router --> CLI[CLI Commands]
        Router --> API[Public API]
    end
    
    Scoring --> Decision[Routing Decision]
    Decision --> Execution[Model Execution]
    Execution --> Outcome
```

---

## 3. Implementation Phases

### Phase 1: Foundation (Database & Storage)
**Objective**: Set up the local storage infrastructure.

- **Technology**: SQLite (`better-sqlite3`)
- **Schema**:
  - `model_profiles`: Stores capabilities, quality scores, cost, latency.
  - `routing_decisions`: Logs every routing choice for auditing.
  - `routing_outcomes`: Records success/failure for learning.
  - `classification_cache`: Caches LLM classification results to reduce latency.
- **Key Components**:
  - `ICCRDatabase`: Wrapper for all DB operations.
  - `MigrationManager`: Handles schema versioning.
  - `initializeDefaultProfiles`: Loads baseline data for common models.

### Phase 2: Semantic Classification
**Objective**: Understand *what* the user wants without hardcoded keywords.

- **Primary Method**: **LLM Classification**
  - Uses a small, fast model (e.g., `qwen2.5:0.5b`, `gpt-4o-mini`) to analyze the request.
  - Extracts: `intent` (code_generation, debugging, etc.), `complexity` (simple, moderate, expert), `domain` (frontend, backend, etc.).
- **Fallback Method**: **Rule-Based Classifier**
  - Used if LLM is unavailable, slow, or low confidence (<0.7).
  - Uses regex patterns and heuristics.
- **Optimization**:
  - **Caching**: Results are cached by request hash to avoid repeated LLM calls.

### Phase 3: Model Selection
**Objective**: Choose the *best* model, not just the default one.

- **Scoring Algorithm**:
  $$ Score = (w_s \cdot Success) + (w_c \cdot CostScore) + (w_q \cdot Quality) + (w_l \cdot Latency) + Bonus $$
- **Factors**:
  - **Success Rate (40%)**: Historical success for the specific (intent, complexity) pair.
  - **Cost Efficiency (30%)**: Normalized cost per 1M tokens.
  - **Quality Score (20%)**: Learned quality rating (0-1).
  - **Latency (10%)**: Normalized average response time.
- **Bonuses/Penalties**:
  - **+10%** for models with reasoning capabilities on "expert" tasks.
  - **+5%** if model "strengths" match the intent.
  - **-10%** if model "weaknesses" match the intent.

### Phase 4: Auto-Learning
**Objective**: Improve decisions over time without user intervention.

- **Mechanism**:
  - **Feedback Loop**: Every request outcome (success/failure) is recorded.
  - **Exponential Moving Average (EMA)**: Updates quality and latency scores smoothly.
    - $NewValue = OldValue \cdot (1 - \alpha) + ActualValue \cdot \alpha$
  - **Pattern Recognition**:
    - **Strength**: >85% success rate (min 5 samples).
    - **Weakness**: <50% success rate (min 5 samples).
- **Result**: The system "learns" that Model A is great for Python but bad for Rust, or that Model B is fast but hallucinate on complex tasks.

### Phase 5: CLI & Integration
**Objective**: Make it usable and controllable.

- **Main Class**: `ICCRRouter`
  - Orchestrates the entire pipeline: `Classify` -> `Select` -> `Route` -> `Record`.
- **CLI Commands**:
  - `ccr models list`: View all profiles and their learned stats.
  - `ccr models show <id>`: Deep dive into a specific model's performance.
  - `ccr models reset`: Clear learned data for a model.
  - `ccr classify <text>`: Test how the system understands a prompt.
  - `ccr models export/import`: Backup or share learned profiles.

---

## 4. Testing & Verification

The system was verified with a comprehensive test suite for each phase.

| Phase | Test File | Scenarios Covered | Status |
|-------|-----------|-------------------|--------|
| **1** | `test-phase1.ts` | DB Schema, CRUD, Migrations | ✅ PASS |
| **2** | `test-phase2.ts` | LLM Classification, Fallback, Caching | ✅ PASS |
| **3** | `test-phase3.ts` | Scoring Logic, Optimization Weights | ✅ PASS |
| **4** | `test-phase4.ts` | Learning, EMA, Strength Detection | ✅ PASS |
| **5** | `test-phase5.ts` | **End-to-End Integration**, CLI, Perf | ✅ PASS |

**Performance Benchmarks**:
- **Routing Overhead**: <1ms (excluding LLM classification time).
- **Classification**: ~200-500ms (with LLM), <1ms (cached/rule-based).
- **Database**: <1ms for profile lookups.

---

## 5. Configuration Guide

ICCR is configured via `config.iccr.json`.

**Minimal Config**:
```json
{
  "semanticRouting": {
    "enabled": true,
    "optimization": {
      "costWeight": 1,
      "qualityWeight": 1,
      "latencyWeight": 1
    }
  }
}
```

**Advanced Config**:
```json
{
  "semanticRouting": {
    "enabled": true,
    "confidenceThreshold": 0.75,
    "classifier": {
      "provider": "ollama",
      "model": "qwen2.5:0.5b"
    },
    "learning": {
      "enabled": true,
      "learningRate": 0.1,
      "minSamples": 10
    }
  }
}
```

---

## 6. Conclusion

ICCR v1.0 transforms the Claude Code Router from a static, rule-based tool into a **dynamic, learning system**. It adapts to the user's specific workload and model performance, ensuring the right model is always used for the right task.

**Next Steps (v2.0 Roadmap)**:
- Vector embeddings for semantic similarity.
- Team profile sharing (sync learned data).
- Multi-agent collaboration (router as a manager).
