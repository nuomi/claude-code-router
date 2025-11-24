# ICCR Implementation Plan (Revised)

> **Status**: Draft v2.0  
> **Version**: 2.0 - Auto-Learning Design  
> **Last Updated**: 2025-11-25

> [!IMPORTANT]
> **v1.0 Scope**: This plan covers ICCR v1.0 which uses **LLM classification + SQLite learning**.  
> **NOT in v1.0**: Embeddings, Vector DB, ONNX models (these are v2.0+ features).  
> See [Roadmap](./roadmap.md) for version comparison.

## Executive Summary

ICCR (Intelligent Claude Code Router) enhances the existing CCR by adding **automatic semantic routing** that:
- ✅ Understands request intent and complexity using a small LLM
- ✅ Learns model capabilities from actual usage (no manual configuration)
- ✅ Optimizes routing for cost, quality, and latency
- ✅ Works with any domain/project (no hardcoded keywords)
- ✅ Maintains full backward compatibility with CCR

**Key Innovation**: Zero-config intelligence - ICCR ships with default model profiles and learns from your usage patterns.

---

## Table of Contents

1. [What ICCR Adds Over CCR](#1-what-iccr-adds-over-ccr)
2. [Architecture Overview](#2-architecture-overview)
3. [Project Structure](#3-project-structure)
4. [Core Components](#4-core-components)
5. [Implementation Phases](#5-implementation-phases)
6. [Database Schema](#6-database-schema)
7. [Configuration](#7-configuration)
8. [CLI Enhancements](#8-cli-enhancements)
9. [Dependencies](#9-dependencies)
10. [Questions for Decision](#10-questions-for-decision)

---

## 1. What ICCR Adds Over CCR

### Current CCR Limitations

```json
// User must configure keywords manually
{
  "routes": {
    "code": {
      "provider": "openrouter",
      "model": "claude-3.5-sonnet",
      "match": ["代码", "code", "function", "bug"]  // ← Manual maintenance
    }
  }
}
```

**Problems:**
- ❌ User must remember to type keywords
- ❌ No complexity awareness (simple vs expert tasks)
- ❌ No automatic cost optimization
- ❌ Session lock problem
- ❌ Doesn't work across different domains

### ICCR Enhancements

```
User: "帮我生成一个用户登录的 API 路由"  (no keywords needed!)

ICCR:
1. LLM Classification (50-200ms)
   → Intent: code_generation
   → Complexity: moderate
   → Domain: [web_backend]

2. Model Selection (<5ms)
   → Check learned profiles
   → deepseek-chat: 90% success, $0.01
   → claude-sonnet: 95% success, $0.03
   → Decision: deepseek-chat (good enough, 3x cheaper)

3. Track Outcome
   → Success: yes
   → Quality: 4.5/5
   → Update profile: deepseek-chat even better for this task
```

**Value Added:**
- ✅ Natural language input (no keywords)
- ✅ Complexity-aware routing
- ✅ Automatic cost optimization
- ✅ Learns from outcomes
- ✅ Domain agnostic

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         User Request                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Semantic Routing (if enabled)                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ LLM Classifier (50-200ms)                            │   │
│  │ - Ollama/OpenRouter/OpenAI                           │   │
│  │ - Input: User request text                           │   │
│  │ - Output: {intent, complexity, domain, confidence}   │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Model Profile Lookup (SQLite, <5ms)                        │
│  - Check learned profiles for this (intent, complexity)      │
│  - Get success rates, costs, quality scores                  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Model Selection (<1ms)                                      │
│  - Score candidates: success_rate × 0.4 + cost × 0.3 + ...  │
│  - Select best model                                         │
│  - Generate reasoning                                        │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Route to Provider (existing CCR logic)                      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Feedback Collection (async, no latency impact)              │
│  - Track: success, quality, cost, latency                    │
│  - Update model profiles                                     │
│  - Discover strengths/weaknesses                             │
└─────────────────────────────────────────────────────────────┘
```

**Total Overhead**: ~50-200ms for LLM classification (vs 1-5s for actual model API call)

---

## 3. Project Structure

```
claude-code-router/
├── src/
│   ├── index.ts                    # MODIFY: Add ICCR integration
│   ├── server.ts                   # MODIFY: Add feedback hooks
│   ├── cli.ts                      # MODIFY: Add model management commands
│   │
│   ├── semantic/                   # NEW: Semantic routing
│   │   ├── index.ts               # Main orchestrator
│   │   ├── llm-classifier.ts      # LLM-based classification
│   │   ├── model-selector.ts      # Model selection logic
│   │   └── types.ts               # Type definitions
│   │
│   ├── learning/                   # NEW: Auto-learning
│   │   ├── profile-learner.ts     # Learn from outcomes
│   │   ├── model-discovery.ts     # Auto-discover new models
│   │   ├── default-profiles.ts    # Shipped model profiles
│   │   └── feedback-collector.ts  # Collect feedback
│   │
│   ├── storage/                    # NEW: Data persistence
│   │   ├── database.ts            # SQLite operations
│   │   ├── migrations.ts          # Schema migrations
│   │   └── queries.ts             # Common queries
│   │
│   └── utils/
│       ├── router.ts              # MODIFY: Add semantic routing
│       └── modelSelector.ts       # MODIFY: Integrate ICCR
│
├── data/                           # NEW: Default data
│   └── default-model-profiles.json # Shipped profiles
│
├── migrations/                     # NEW: Database migrations
│   └── 001_initial_schema.sql
│
└── docs/
    └── implementation_plan.md     # This file
```

---

## 4. Core Components

### 4.1 LLM Classifier

**File**: `src/semantic/llm-classifier.ts`

```typescript
import { IntentType, ComplexityLevel } from './types';

export interface ClassificationResult {
  intent: IntentType;
  complexity: ComplexityLevel;
  domain: string[];
  confidence: number;
  reasoning: string;
}

export class LLMClassifier {
  private llmClient: LLMClient;
  
  constructor(config: {
    provider: 'ollama' | 'openrouter' | 'openai';
    model: string;
    baseURL?: string;
    apiKey?: string;
  }) {
    this.llmClient = new LLMClient(config);
  }
  
  /**
   * Classify user request using LLM
   * 
   * @param request - User's request text
   * @returns Classification result
   * @throws Error if LLM call fails
   * 
   * Time: 50-200ms (depends on model)
   * Accuracy: 85-95% (depends on model)
   */
  async classify(request: string): Promise<ClassificationResult> {
    const prompt = this.buildPrompt(request);
    
    try {
      const response = await this.llmClient.generate(prompt, {
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: 'json' }
      });
      
      return this.parseResponse(response);
    } catch (error) {
      console.error('[LLMClassifier] Classification failed:', error);
      throw error;
    }
  }
  
  private buildPrompt(request: string): string {
    return `Analyze this coding request and classify it.

Request: "${request}"

Respond with JSON only:
{
  "intent": "code_generation|debugging|explanation|refactoring|testing|architecture|documentation|review|search|general",
  "complexity": "simple|moderate|complex|expert",
  "domain": ["web_frontend", "web_backend", "data_science", "devops", "systems", "mobile", "general"],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Classification rules:
- intent: What the user wants to do
- complexity:
  * simple: basic tasks, syntax fixes, simple functions (<50 lines)
  * moderate: standard features, common patterns (50-200 lines)
  * complex: multi-component systems, optimization (200-500 lines)
  * expert: architecture, distributed systems, advanced algorithms (500+ lines)
- domain: Technical areas involved (can be multiple)
- confidence: How certain you are (0.0-1.0)
- reasoning: Brief explanation of your classification

JSON:`;
  }
  
  private parseResponse(response: string): ClassificationResult {
    try {
      const parsed = JSON.parse(response);
      
      // Validate required fields
      if (!parsed.intent || !parsed.complexity) {
        throw new Error('Missing required fields');
      }
      
      return {
        intent: parsed.intent as IntentType,
        complexity: parsed.complexity as ComplexityLevel,
        domain: parsed.domain || ['general'],
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || 'No reasoning provided'
      };
    } catch (error) {
      console.error('[LLMClassifier] Failed to parse response:', response);
      throw new Error(`Invalid JSON response: ${error.message}`);
    }
  }
}

// LLM client wrapper
class LLMClient {
  constructor(private config: any) {}
  
  async generate(prompt: string, options: any): Promise<string> {
    // Implementation depends on provider
    if (this.config.provider === 'ollama') {
      return this.callOllama(prompt, options);
    } else if (this.config.provider === 'openrouter') {
      return this.callOpenRouter(prompt, options);
    } else if (this.config.provider === 'openai') {
      return this.callOpenAI(prompt, options);
    }
    throw new Error(`Unknown provider: ${this.config.provider}`);
  }
  
  private async callOllama(prompt: string, options: any): Promise<string> {
    const response = await fetch(`${this.config.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature,
          num_predict: options.max_tokens
        }
      })
    });
    
    const data = await response.json();
    return data.response;
  }
  
  private async callOpenRouter(prompt: string, options: any): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        response_format: options.response_format
      })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
  
  private async callOpenAI(prompt: string, options: any): Promise<string> {
    // Similar to OpenRouter
    // Implementation omitted for brevity
    throw new Error('Not implemented');
  }
}
```

### 4.2 Model Profile Learner

**File**: `src/learning/profile-learner.ts`

```typescript
import { Database } from '../storage/database';

export interface ModelProfile {
  provider: string;
  model: string;
  strengths: string[];
  weaknesses: string[];
  quality_score: number;
  cost_per_1m_tokens: number;
  avg_latency_ms: number;
  supports_reasoning: boolean;
  success_rates: Record<string, { rate: number; count: number }>;
  source: 'public_benchmark' | 'learned_from_usage' | 'auto_discovered' | 'user_configured';
  sample_count: number;
  last_updated: number;
}

export class ModelProfileLearner {
  constructor(private db: Database) {}
  
  /**
   * Update model profile based on actual outcome
   * Called automatically after each request
   * 
   * @param outcome - Request outcome data
   * 
   * Time: ~5ms (async, no blocking)
   */
  async updateProfile(outcome: {
    provider: string;
    model: string;
    intent: string;
    complexity: string;
    success: boolean;
    quality: number;  // 0-1 scale
    cost: number;     // Actual cost in dollars
    latency: number;  // Milliseconds
  }): Promise<void> {
    // Get current profile (or create default)
    let profile = await this.db.getModelProfile(outcome.provider, outcome.model);
    
    if (!profile) {
      profile = this.createDefaultProfile(outcome.provider, outcome.model);
    }
    
    // Update quality score (exponential moving average)
    const alpha = 0.1; // Learning rate
    profile.quality_score = profile.quality_score * (1 - alpha) + outcome.quality * alpha;
    
    // Update cost (use actual cost)
    if (outcome.cost > 0) {
      profile.cost_per_1m_tokens = outcome.cost;
    }
    
    // Update latency (exponential moving average)
    profile.avg_latency_ms = profile.avg_latency_ms * (1 - alpha) + outcome.latency * alpha;
    
    // Update success rate for this intent
    const intentKey = `${outcome.intent}_${outcome.complexity}`;
    const currentRate = profile.success_rates[intentKey] || { rate: 0, count: 0 };
    
    const newCount = currentRate.count + 1;
    const newRate = (currentRate.rate * currentRate.count + (outcome.success ? 1 : 0)) / newCount;
    
    profile.success_rates[intentKey] = { rate: newRate, count: newCount };
    
    // Update strengths/weaknesses based on success rates
    profile.strengths = this.updateStrengths(profile.success_rates, outcome.intent);
    profile.weaknesses = this.updateWeaknesses(profile.success_rates, outcome.intent);
    
    // Update metadata
    profile.source = profile.source === 'user_configured' ? 'user_configured' : 'learned_from_usage';
    profile.sample_count += 1;
    profile.last_updated = Date.now();
    
    // Save updated profile
    await this.db.saveModelProfile(profile);
    
    console.log(`[ProfileLearner] Updated ${outcome.provider}/${outcome.model}: ` +
                `quality=${profile.quality_score.toFixed(2)}, ` +
                `samples=${profile.sample_count}`);
  }
  
  private createDefaultProfile(provider: string, model: string): ModelProfile {
    return {
      provider,
      model,
      strengths: [],
      weaknesses: [],
      quality_score: 0.7, // Neutral starting point
      cost_per_1m_tokens: 0,
      avg_latency_ms: 0,
      supports_reasoning: false,
      success_rates: {},
      source: 'learned_from_usage',
      sample_count: 0,
      last_updated: Date.now()
    };
  }
  
  private updateStrengths(
    successRates: Record<string, { rate: number; count: number }>,
    currentIntent: string
  ): string[] {
    const strengths: string[] = [];
    
    for (const [key, data] of Object.entries(successRates)) {
      const intent = key.split('_')[0];
      
      // Add to strengths if success rate > 85% and enough samples
      if (data.rate > 0.85 && data.count >= 5) {
        if (!strengths.includes(intent)) {
          strengths.push(intent);
        }
      }
    }
    
    return strengths;
  }
  
  private updateWeaknesses(
    successRates: Record<string, { rate: number; count: number }>,
    currentIntent: string
  ): string[] {
    const weaknesses: string[] = [];
    
    for (const [key, data] of Object.entries(successRates)) {
      const intent = key.split('_')[0];
      
      // Add to weaknesses if success rate < 50% and enough samples
      if (data.rate < 0.5 && data.count >= 5) {
        if (!weaknesses.includes(intent)) {
          weaknesses.push(intent);
        }
      }
    }
    
    return weaknesses;
  }
}
```

### 4.3 Model Selector

**File**: `src/semantic/model-selector.ts`

```typescript
import { Database } from '../storage/database';
import { ClassificationResult } from './llm-classifier';
import { ModelProfile } from '../learning/profile-learner';

export interface RoutingDecision {
  provider: string;
  model: string;
  confidence: number;
  reasoning: string;
  estimatedCost: number;
  estimatedQuality: number;
  estimatedLatency: number;
  alternatives: Array<{
    provider: string;
    model: string;
    score: number;
  }>;
}

export class ModelSelector {
  constructor(
    private db: Database,
    private config: {
      costWeight: number;      // 0-1
      qualityWeight: number;   // 0-1
      latencyWeight: number;   // 0-1
    }
  ) {
    // Normalize weights
    const total = config.costWeight + config.qualityWeight + config.latencyWeight;
    this.config.costWeight /= total;
    this.config.qualityWeight /= total;
    this.config.latencyWeight /= total;
  }
  
  /**
   * Select optimal model based on classification
   * 
   * @param classification - LLM classification result
   * @param availableModels - Models from user config
   * @returns Routing decision
   * 
   * Time: <5ms
   */
  async selectModel(
    classification: ClassificationResult,
    availableModels: Array<{ provider: string; model: string }>
  ): Promise<RoutingDecision> {
    // Get profiles for all available models
    const profiles = await Promise.all(
      availableModels.map(m => this.db.getModelProfile(m.provider, m.model))
    );
    
    // Score each model
    const scored = profiles.map((profile, i) => ({
      ...availableModels[i],
      profile,
      score: this.scoreModel(profile, classification)
    }));
    
    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);
    
    const best = scored[0];
    
    return {
      provider: best.provider,
      model: best.model,
      confidence: best.score,
      reasoning: this.explainChoice(best, classification),
      estimatedCost: best.profile?.cost_per_1m_tokens || 0,
      estimatedQuality: best.profile?.quality_score || 0.7,
      estimatedLatency: best.profile?.avg_latency_ms || 0,
      alternatives: scored.slice(1, 4).map(s => ({
        provider: s.provider,
        model: s.model,
        score: s.score
      }))
    };
  }
  
  private scoreModel(
    profile: ModelProfile | null,
    classification: ClassificationResult
  ): number {
    if (!profile) {
      // Unknown model, return neutral score
      return 0.5;
    }
    
    let score = 0;
    
    // Factor 1: Success rate for this (intent, complexity) - 40%
    const intentKey = `${classification.intent}_${classification.complexity}`;
    const successData = profile.success_rates[intentKey];
    
    if (successData && successData.count >= 3) {
      score += successData.rate * 0.4;
    } else {
      // No data for this specific combination, use overall quality
      score += profile.quality_score * 0.4;
    }
    
    // Factor 2: Cost efficiency - 30%
    const maxCost = 10; // $10 per 1M tokens (normalize)
    const costScore = 1 - Math.min(profile.cost_per_1m_tokens / maxCost, 1);
    score += costScore * this.config.costWeight * 0.3;
    
    // Factor 3: Quality score - 20%
    score += profile.quality_score * this.config.qualityWeight * 0.2;
    
    // Factor 4: Latency - 10%
    const maxLatency = 5000; // 5 seconds (normalize)
    const latencyScore = 1 - Math.min(profile.avg_latency_ms / maxLatency, 1);
    score += latencyScore * this.config.latencyWeight * 0.1;
    
    // Bonus: Reasoning capability for expert tasks
    if (classification.complexity === 'expert' && profile.supports_reasoning) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }
  
  private explainChoice(
    choice: any,
    classification: ClassificationResult
  ): string {
    const profile = choice.profile;
    
    if (!profile) {
      return `Selected ${choice.model} (no historical data, using as default)`;
    }
    
    const intentKey = `${classification.intent}_${classification.complexity}`;
    const successData = profile.success_rates[intentKey];
    
    let reason = `Selected ${choice.model} for ${classification.intent} task (${classification.complexity} complexity). `;
    
    if (successData && successData.count >= 3) {
      reason += `Historical success rate: ${(successData.rate * 100).toFixed(0)}% (${successData.count} samples). `;
    } else {
      reason += `Overall quality score: ${(profile.quality_score * 100).toFixed(0)}%. `;
    }
    
    reason += `Estimated cost: $${profile.cost_per_1m_tokens.toFixed(4)}/1M tokens.`;
    
    return reason;
  }
}
```

### 4.4 Default Model Profiles

**File**: `data/default-model-profiles.json`

```json
{
  "profiles": [
    {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "strengths": ["code_generation", "debugging", "refactoring"],
      "weaknesses": ["creative_writing", "complex_reasoning"],
      "quality_score": 0.85,
      "cost_per_1m_tokens": 0.14,
      "avg_latency_ms": 1200,
      "supports_reasoning": false,
      "success_rates": {},
      "source": "public_benchmark",
      "sample_count": 0,
      "last_updated": 0
    },
    {
      "provider": "deepseek",
      "model": "deepseek-reasoner",
      "strengths": ["architecture", "complex_reasoning", "planning"],
      "weaknesses": ["simple_tasks", "speed"],
      "quality_score": 0.92,
      "cost_per_1m_tokens": 0.55,
      "avg_latency_ms": 3500,
      "supports_reasoning": true,
      "success_rates": {},
      "source": "public_benchmark",
      "sample_count": 0,
      "last_updated": 0
    },
    {
      "provider": "openrouter",
      "model": "anthropic/claude-3.5-sonnet",
      "strengths": ["code_generation", "explanation", "refactoring", "general"],
      "weaknesses": ["cost"],
      "quality_score": 0.95,
      "cost_per_1m_tokens": 3.0,
      "avg_latency_ms": 2000,
      "supports_reasoning": false,
      "success_rates": {},
      "source": "public_benchmark",
      "sample_count": 0,
      "last_updated": 0
    },
    {
      "provider": "openrouter",
      "model": "google/gemini-2.0-flash-exp",
      "strengths": ["search", "general", "multimodal"],
      "weaknesses": [],
      "quality_score": 0.88,
      "cost_per_1m_tokens": 0.0,
      "avg_latency_ms": 1500,
      "supports_reasoning": false,
      "success_rates": {},
      "source": "public_benchmark",
      "sample_count": 0,
      "last_updated": 0
    }
  ]
}
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Set up infrastructure without breaking existing CCR

- [ ] Database schema and migrations
- [ ] Load default model profiles on startup
- [ ] Add `semanticRouting` config section
- [ ] Backward compatibility checks

**Deliverable**: ICCR can be installed but semantic routing is disabled by default

### Phase 2: LLM Classification (Week 3-4)

**Goal**: Implement LLM-based classification

- [ ] LLM classifier with Ollama support
- [ ] Add OpenRouter/OpenAI support
- [ ] Fallback to rule-based if LLM fails
- [ ] Classification caching

**Deliverable**: Can classify requests, but still uses old routing

### Phase 3: Model Selection (Week 5-6)

**Goal**: Implement intelligent model selection

- [ ] Model selector with scoring logic
- [ ] Profile lookup from database
- [ ] Decision reasoning generation
- [ ] Integration with existing router

**Deliverable**: Full semantic routing working end-to-end

### Phase 4: Learning (Week 7-8)

**Goal**: Implement auto-learning

- [ ] Feedback collector
- [ ] Profile learner
- [ ] Success rate tracking
- [ ] Strength/weakness discovery

**Deliverable**: ICCR learns and improves over time

### Phase 5: CLI & UX (Week 9-10)

**Goal**: User-facing features

- [ ] `ccr models list` command
- [ ] `ccr models reset` command
- [ ] Model discovery for new models
- [ ] Routing insights in logs

**Deliverable**: Production-ready ICCR v1.0

---

## 6. Database Schema

**File**: `migrations/001_initial_schema.sql`

```sql
-- Model profiles (learned capabilities)
CREATE TABLE model_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  
  -- Capabilities
  strengths TEXT, -- JSON array: ["code_generation", "debugging"]
  weaknesses TEXT, -- JSON array: ["creative_writing"]
  
  -- Performance metrics
  quality_score REAL DEFAULT 0.7,
  cost_per_1m_tokens REAL DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  supports_reasoning BOOLEAN DEFAULT 0,
  
  -- Success rates per (intent, complexity)
  success_rates TEXT, -- JSON: {"code_generation_simple": {"rate": 0.9, "count": 50}}
  
  -- Metadata
  source TEXT, -- "public_benchmark" | "learned_from_usage" | "auto_discovered" | "user_configured"
  sample_count INTEGER DEFAULT 0,
  last_updated INTEGER,
  
  UNIQUE(provider, model)
);

-- Routing decisions (for analysis)
CREATE TABLE routing_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  session_id TEXT,
  timestamp INTEGER NOT NULL,
  
  -- Classification
  intent TEXT,
  complexity TEXT,
  domain TEXT, -- JSON array
  confidence REAL,
  
  -- Decision
  selected_provider TEXT NOT NULL,
  selected_model TEXT NOT NULL,
  reasoning TEXT,
  estimated_cost REAL,
  estimated_quality REAL
);

-- Routing outcomes (for learning)
CREATE TABLE routing_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  
  -- Actual metrics
  success BOOLEAN,
  quality REAL, -- 0-1 scale
  actual_cost REAL,
  actual_latency INTEGER,
  
  -- Error tracking
  error_occurred BOOLEAN DEFAULT 0,
  error_message TEXT,
  
  FOREIGN KEY (decision_id) REFERENCES routing_decisions(id)
);

-- Indexes
CREATE INDEX idx_profiles_provider_model ON model_profiles(provider, model);
CREATE INDEX idx_decisions_timestamp ON routing_decisions(timestamp);
CREATE INDEX idx_decisions_session ON routing_decisions(session_id);
CREATE INDEX idx_outcomes_decision ON routing_outcomes(decision_id);
```

---

## 7. Configuration

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
    "enabled": true,
    "classifier": {
      "provider": "ollama",
      "model": "qwen2.5:0.5b"
    }
  }
}
```

### Full Config (Advanced)

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
  },
  
  "modelCapabilities": {
    "ollama,my-custom-model": {
      "strengths": ["code_generation"],
      "quality_score": 0.9,
      "notes": "Fine-tuned for Python"
    }
  }
}
```

---

## 8. CLI Enhancements

```bash
# View learned model profiles
$ ccr models list

Provider: deepseek, Model: deepseek-chat
├─ Quality Score: 0.87 (learned from 127 requests)
├─ Strengths: code_generation (92% success), debugging (88% success)
├─ Avg Cost: $0.0014 per request
├─ Avg Latency: 1.2s
└─ Source: learned_from_usage (updated 2 hours ago)

# View specific model details
$ ccr models show deepseek/deepseek-chat

# Reset learned profiles
$ ccr models reset

# Export profiles (share with team)
$ ccr models export > team-profiles.json

# Import profiles
$ ccr models import team-profiles.json

# Test classification
$ ccr classify "Fix this Python bug"
Intent: debugging
Complexity: simple
Domain: [python]
Confidence: 0.92
Recommended: deepseek-chat
```

---

## 9. Dependencies

### New Dependencies (v1.0)

```json
{
  "dependencies": {
    "better-sqlite3": "^9.2.0"  // Local database for profiles
  }
}
```

**That's it!** No embeddings, no vector DB, no ONNX models in v1.0.

### Optional Runtime Dependencies

- **Ollama** (recommended): For local, free LLM classification
- **OpenRouter API Key**: For cloud-based classification

### Future Dependencies (v2.0+)

These are **NOT** needed for v1.0:

```json
{
  "optionalDependencies": {
    // v2.0: Vector database
    "vectordb": "^0.4.0",
    "sqlite-vss": "^0.1.0",
    
    // v2.0: Embeddings
    "@xenova/transformers": "^2.6.0",
    
    // v2.0: ONNX models
    "onnxruntime-node": "^1.16.0"
  }
}
```

See [Roadmap](./roadmap.md) for v2.0 features.

---

## 10. Implementation Decisions & Answers

### Q1: LLM Classifier Provider

**Decision: Support all three with smart auto-detection**

**Implementation:**

```typescript
// Auto-detect and fallback chain
async function initializeClassifier(config: any): Promise<LLMClassifier> {
  // Priority 1: User's explicit config
  if (config.semanticRouting?.classifier) {
    return new LLMClassifier(config.semanticRouting.classifier);
  }
  
  // Priority 2: Check if Ollama is running locally
  if (await isOllamaAvailable()) {
    console.log('✓ Using Ollama for classification (free, local)');
    return new LLMClassifier({
      provider: 'ollama',
      model: 'qwen2.5:0.5b',
      baseURL: 'http://localhost:11434'
    });
  }
  
  // Priority 3: Use OpenRouter if API key available
  if (process.env.OPENROUTER_API_KEY) {
    console.log('✓ Using OpenRouter for classification (~$0.0001/request)');
    return new LLMClassifier({
      provider: 'openrouter',
      model: 'google/gemini-2.0-flash-exp:free',
      apiKey: process.env.OPENROUTER_API_KEY
    });
  }
  
  // Priority 4: Fallback to rule-based (no LLM)
  console.warn('⚠ No LLM available, using rule-based classification');
  return new RuleBasedClassifier();
}
```

**User Experience:**
```bash
$ ccr start

Checking for LLM classifier...
✓ Ollama detected at localhost:11434
✓ Using qwen2.5:0.5b for semantic routing
✓ ICCR ready (semantic routing enabled)

# OR if Ollama not available:
⚠ Ollama not detected
ℹ Install Ollama for free local classification: https://ollama.ai
ℹ Or set OPENROUTER_API_KEY for cloud classification (~$0.0001/request)
✓ Using rule-based classification (fallback mode)
```

**Rationale:**
- **Ollama**: Best for privacy, zero cost, but requires setup
- **OpenRouter**: Best for ease of use, minimal cost with free models
- **OpenAI**: Most accurate but expensive, only if user explicitly configures
- **Rule-based fallback**: Always works, even without any LLM

---

### Q2: Default Classifier Model

**Decision: `qwen2.5:0.5b` for Ollama, `gemini-2.0-flash-exp:free` for OpenRouter**

**Model Comparison:**

| Model | Size | Latency | Accuracy | Cost | Use Case |
|-------|------|---------|----------|------|----------|
| `qwen2.5:0.5b` | 500MB | ~50ms | 85% | Free | ✅ **Local (recommended)** |
| `qwen2.5:1.5b` | 1GB | ~100ms | 90% | Free | Local (if RAM available) |
| `gemini-2.0-flash-exp:free` | Cloud | ~200ms | 95% | Free | ✅ **Cloud (recommended)** |
| `gpt-4o-mini` | Cloud | ~200ms | 95% | $0.001 | Cloud (if user pays) |

**Configuration:**

```typescript
const DEFAULT_MODELS = {
  ollama: 'qwen2.5:0.5b',      // Fast, small, good enough
  openrouter: 'google/gemini-2.0-flash-exp:free',  // Free tier
  openai: 'gpt-4o-mini'         // If user explicitly wants OpenAI
};
```

**Auto-download for Ollama:**

```bash
$ ccr start

Checking Ollama models...
✗ qwen2.5:0.5b not found
? Download qwen2.5:0.5b (500MB) for semantic routing? (Y/n) y

Downloading qwen2.5:0.5b...
████████████████████ 100% (500MB/500MB)
✓ Model ready
```

**Rationale:**
- `qwen2.5:0.5b` is the sweet spot: small enough to run anywhere, fast enough for real-time, accurate enough for routing
- Gemini Flash is free on OpenRouter and very accurate
- Users can always override in config if they want higher accuracy

---

### Q3: Model Profile Distribution

**Decision: Ship with npm package (~5KB)**

**Implementation:**

```typescript
// src/learning/default-profiles.ts
import defaultProfiles from '../../data/default-model-profiles.json';

export function loadDefaultProfiles(): ModelProfile[] {
  return defaultProfiles.profiles;
}

// On first run, seed database with defaults
async function initializeDatabase(db: Database) {
  const existingProfiles = await db.getModelProfiles();
  
  if (existingProfiles.length === 0) {
    console.log('Initializing model profiles...');
    const defaults = loadDefaultProfiles();
    
    for (const profile of defaults) {
      await db.saveModelProfile(profile);
    }
    
    console.log(`✓ Loaded ${defaults.length} default model profiles`);
  }
}
```

**File Size:**
- `default-model-profiles.json`: ~5KB (15-20 models)
- Negligible impact on npm package size

**Update Strategy:**
```bash
# Update profiles from latest benchmarks
$ ccr models update-defaults

Checking for updated model profiles...
✓ Downloaded latest profiles (v1.2.0)
✓ Updated 3 models: deepseek-chat, claude-3.5-sonnet, gemini-2.0-flash
ℹ Your learned data is preserved
```

**Rationale:**
- 5KB is negligible (CCR is already ~10MB with dependencies)
- Users get instant value without network requests
- Can still update profiles later
- Learned data always takes precedence over defaults

---

### Q4: Privacy & Data Collection

**Decision: 100% local by default, opt-in telemetry in v2.0**

**Implementation:**

```typescript
// All data stays local in SQLite
const DB_PATH = path.join(homedir(), '.claude-code-router', 'iccr.db');

// No telemetry by default
const config = {
  telemetry: {
    enabled: false,  // Default: disabled
    anonymous: true,
    endpoint: null
  }
};
```

**Privacy Guarantees:**

1. ✅ **All learning is local**: Model profiles, routing decisions, outcomes stored in local SQLite
2. ✅ **No external calls**: Except for LLM classification (which user controls)
3. ✅ **No tracking**: No analytics, no phone-home
4. ✅ **User owns data**: Can export, delete, or share profiles

**Future Opt-in Telemetry (v2.0):**

```json
{
  "telemetry": {
    "enabled": true,
    "anonymous": true,
    "shareProfiles": true
  }
}
```

If enabled:
- Send anonymous aggregated stats (e.g., "deepseek-chat has 90% success for code_generation")
- Help improve default profiles for everyone
- User can opt-out anytime

**Rationale:**
- Privacy is critical for coding tools (may contain sensitive code)
- Local-first aligns with CCR's philosophy
- Opt-in telemetry can improve defaults in future without compromising privacy

---

### Q5: Backward Compatibility

**Decision: Optional feature in CCR (semantic routing disabled by default)**

**Implementation:**

```typescript
// src/index.ts (main entry point)

async function run(options: RunOptions = {}) {
  const config = await loadConfig();
  
  // Check if semantic routing is enabled
  const semanticRoutingEnabled = config.semanticRouting?.enabled ?? false;
  
  if (semanticRoutingEnabled) {
    console.log('✓ ICCR semantic routing enabled');
    return runWithSemanticRouting(config, options);
  } else {
    console.log('✓ Using classic CCR routing');
    return runClassicRouting(config, options);
  }
}
```

**Migration Path:**

| Phase | Version | Default Behavior | User Action |
|-------|---------|------------------|-------------|
| **Phase 1** | v1.0.80 | Classic CCR | Opt-in to ICCR |
| **Phase 2** | v1.1.0 | Classic CCR + prompt | Encouraged to try ICCR |
| **Phase 3** | v2.0.0 | ICCR enabled | Can opt-out to classic |

**Phase 1 (v1.0.80)**: ICCR ships, disabled by default
```json
{
  "routes": { "default": { ... } }
  // No semanticRouting section = classic CCR
}
```

**Phase 2 (v1.1.0)**: Encourage adoption
```bash
$ ccr start

ℹ New: Intelligent routing available!
ℹ Add "semanticRouting": {"enabled": true} to config
ℹ Learn more: ccr docs semantic-routing
```

**Phase 3 (v2.0.0)**: Semantic routing enabled by default
```json
{
  "semanticRouting": {
    "enabled": true  // Default in v2.0
  }
}
```

Users can still disable:
```json
{
  "semanticRouting": {
    "enabled": false  // Revert to classic CCR
  }
}
```

**Rationale:**
- **No breaking changes**: Existing users unaffected
- **Gradual adoption**: Users can try ICCR when ready
- **Easy rollback**: Can disable if issues arise
- **Single package**: No need to maintain two separate packages

---

## Summary of Decisions

| Question | Decision | Key Benefit |
|----------|----------|-------------|
| **Q1: LLM Provider** | Support all, auto-detect: Ollama → OpenRouter → Rule-based | Flexibility + ease of use |
| **Q2: Classifier Model** | `qwen2.5:0.5b` (Ollama) / `gemini-2.0-flash-exp:free` (OpenRouter) | Best speed/accuracy/cost balance |
| **Q3: Profile Distribution** | Ship with npm (~5KB) | Instant value, zero setup |
| **Q4: Privacy** | 100% local, no telemetry | Privacy-first, user owns data |
| **Q5: Compatibility** | Optional feature, disabled by default | Zero breaking changes |

---

## Revised Implementation Timeline

With these decisions finalized:

**Week 1-2: Foundation**
- ✅ Database schema with migrations
- ✅ Load default profiles (shipped with npm)
- ✅ Config parsing with backward compatibility
- ✅ Auto-detection logic for LLM providers

**Week 3-4: LLM Classification**
- ✅ Ollama integration with auto-download
- ✅ OpenRouter integration (free tier)
- ✅ Rule-based fallback
- ✅ Classification caching

**Week 5-6: Model Selection**
- ✅ Profile-based scoring algorithm
- ✅ Routing decision logic with reasoning
- ✅ Integration with existing router
- ✅ Confidence threshold handling

**Week 7-8: Learning**
- ✅ Feedback collection (async)
- ✅ Profile updates (exponential moving average)
- ✅ Strength/weakness discovery
- ✅ Success rate tracking

**Week 9-10: Polish & Release**
- ✅ CLI commands (`ccr models list/reset/export/import`)
- ✅ Documentation and examples
- ✅ Testing (unit + integration)
- ✅ Performance optimization

**Target: ICCR v1.0 (CCR v1.0.80) - 10 weeks**

---

## Next Steps

1. ✅ Review this plan
2. ⏳ Answer the 5 questions above
3. ⏳ Create feature branch: `git checkout -b feature/iccr`
4. ⏳ Start Phase 1 implementation
5. ⏳ Iterate and test

---

**End of Implementation Plan v2.0**
