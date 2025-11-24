# ICCR API Reference

> **Technical reference for ICCR components, interfaces, and APIs**

## Table of Contents

1. [Core Interfaces](#core-interfaces)
2. [LLM Classifier API](#llm-classifier-api)
3. [Model Selector API](#model-selector-api)
4. [Profile Learner API](#profile-learner-api)
5. [Database API](#database-api)
6. [CLI API](#cli-api)
7. [Configuration Schema](#configuration-schema)

---

## Core Interfaces

### ClassificationResult

Request classification output from LLM classifier.

```typescript
interface ClassificationResult {
  intent: IntentType;
  complexity: ComplexityLevel;
  domain: string[];
  confidence: number;  // 0.0-1.0
  reasoning: string;
}

enum IntentType {
  CODE_GENERATION = 'code_generation',
  DEBUGGING = 'debugging',
  EXPLANATION = 'explanation',
  REFACTORING = 'refactoring',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation',
  ARCHITECTURE = 'architecture',
  REVIEW = 'review',
  SEARCH = 'search',
  GENERAL = 'general'
}

enum ComplexityLevel {
  SIMPLE = 'simple',      // <50 lines, basic tasks
  MODERATE = 'moderate',  // 50-200 lines, standard features
  COMPLEX = 'complex',    // 200-500 lines, multi-component
  EXPERT = 'expert'       // 500+ lines, architecture, algorithms
}
```

**Example:**
```typescript
{
  intent: 'code_generation',
  complexity: 'moderate',
  domain: ['web_backend', 'api'],
  confidence: 0.92,
  reasoning: 'User wants to create a REST API endpoint, moderate complexity'
}
```

---

### RoutingDecision

Model selection output.

```typescript
interface RoutingDecision {
  provider: string;
  model: string;
  confidence: number;  // 0.0-1.0
  reasoning: string;
  estimatedCost: number;      // USD
  estimatedQuality: number;   // 0.0-1.0
  estimatedLatency: number;   // milliseconds
  alternatives: Array<{
    provider: string;
    model: string;
    score: number;
  }>;
}
```

**Example:**
```typescript
{
  provider: 'deepseek',
  model: 'deepseek-chat',
  confidence: 0.89,
  reasoning: 'Moderate code generation task. deepseek-chat has 90% success rate.',
  estimatedCost: 0.0014,
  estimatedQuality: 0.87,
  estimatedLatency: 1200,
  alternatives: [
    { provider: 'openrouter', model: 'claude-3.5-sonnet', score: 0.85 },
    { provider: 'deepseek', model: 'deepseek-reasoner', score: 0.72 }
  ]
}
```

---

### ModelProfile

Learned model capabilities and performance.

```typescript
interface ModelProfile {
  provider: string;
  model: string;
  
  // Capabilities
  strengths: string[];      // Intents where success rate > 85%
  weaknesses: string[];     // Intents where success rate < 50%
  
  // Performance metrics
  quality_score: number;    // 0.0-1.0, overall quality
  cost_per_1m_tokens: number;  // USD
  avg_latency_ms: number;
  supports_reasoning: boolean;
  
  // Success rates per (intent, complexity)
  success_rates: Record<string, {
    rate: number;   // 0.0-1.0
    count: number;  // Sample size
  }>;
  
  // Metadata
  source: 'public_benchmark' | 'learned_from_usage' | 'auto_discovered' | 'user_configured';
  sample_count: number;
  last_updated: number;  // Unix timestamp
}
```

**Example:**
```typescript
{
  provider: 'deepseek',
  model: 'deepseek-chat',
  strengths: ['code_generation', 'debugging', 'refactoring'],
  weaknesses: ['creative_writing'],
  quality_score: 0.87,
  cost_per_1m_tokens: 0.14,
  avg_latency_ms: 1200,
  supports_reasoning: false,
  success_rates: {
    'code_generation_simple': { rate: 0.95, count: 42 },
    'code_generation_moderate': { rate: 0.90, count: 78 },
    'debugging_simple': { rate: 0.92, count: 31 }
  },
  source: 'learned_from_usage',
  sample_count: 127,
  last_updated: 1732464000
}
```

---

### RoutingOutcome

Feedback data for learning.

```typescript
interface RoutingOutcome {
  decision_id: string;
  timestamp: number;
  
  // Actual metrics
  success: boolean;
  quality: number;       // 0.0-1.0
  actual_cost: number;   // USD
  actual_latency: number;  // milliseconds
  
  // Error tracking
  error_occurred: boolean;
  error_message?: string;
}
```

---

## LLM Classifier API

### Class: `LLMClassifier`

Classifies user requests using a small LLM.

#### Constructor

```typescript
constructor(config: {
  provider: 'ollama' | 'openrouter' | 'openai';
  model: string;
  baseURL?: string;
  apiKey?: string;
})
```

**Parameters:**
- `provider`: LLM provider to use
- `model`: Model name (e.g., `qwen2.5:0.5b`, `gpt-4o-mini`)
- `baseURL`: Optional base URL (for Ollama)
- `apiKey`: Optional API key (for OpenRouter/OpenAI)

**Example:**
```typescript
const classifier = new LLMClassifier({
  provider: 'ollama',
  model: 'qwen2.5:0.5b',
  baseURL: 'http://localhost:11434'
});
```

#### Method: `classify()`

```typescript
async classify(request: string): Promise<ClassificationResult>
```

**Parameters:**
- `request`: User's request text

**Returns:** `ClassificationResult`

**Throws:** `Error` if LLM call fails

**Time Complexity:** O(1) - ~50-200ms depending on model

**Example:**
```typescript
const result = await classifier.classify(
  "Create a React component for user login"
);

console.log(result);
// {
//   intent: 'code_generation',
//   complexity: 'moderate',
//   domain: ['web_frontend'],
//   confidence: 0.92,
//   reasoning: 'Standard React component creation'
// }
```

---

## Model Selector API

### Class: `ModelSelector`

Selects optimal model based on classification and learned profiles.

#### Constructor

```typescript
constructor(
  db: Database,
  config: {
    costWeight: number;      // 0-1
    qualityWeight: number;   // 0-1
    latencyWeight: number;   // 0-1
  }
)
```

**Parameters:**
- `db`: Database instance
- `config.costWeight`: How much to prioritize cost (0-1)
- `config.qualityWeight`: How much to prioritize quality (0-1)
- `config.latencyWeight`: How much to prioritize latency (0-1)

**Note:** Weights are automatically normalized to sum to 1.0

**Example:**
```typescript
const selector = new ModelSelector(db, {
  costWeight: 0.3,
  qualityWeight: 0.5,
  latencyWeight: 0.2
});
```

#### Method: `selectModel()`

```typescript
async selectModel(
  classification: ClassificationResult,
  availableModels: Array<{ provider: string; model: string }>
): Promise<RoutingDecision>
```

**Parameters:**
- `classification`: Classification result from LLM classifier
- `availableModels`: Models from user config

**Returns:** `RoutingDecision`

**Time Complexity:** O(n) where n = number of available models (~5ms for typical configs)

**Scoring Algorithm:**
```
score = (success_rate × 0.4) + 
        (cost_efficiency × costWeight × 0.3) + 
        (quality_score × qualityWeight × 0.2) + 
        (latency_score × latencyWeight × 0.1) +
        (capability_bonus × 0.1)
```

**Example:**
```typescript
const decision = await selector.selectModel(
  {
    intent: 'code_generation',
    complexity: 'moderate',
    domain: ['web_backend'],
    confidence: 0.92,
    reasoning: '...'
  },
  [
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'openrouter', model: 'claude-3.5-sonnet' }
  ]
);

console.log(decision.model);  // 'deepseek-chat'
console.log(decision.reasoning);  // 'Moderate code generation...'
```

---

## Profile Learner API

### Class: `ModelProfileLearner`

Updates model profiles based on actual outcomes.

#### Constructor

```typescript
constructor(db: Database)
```

#### Method: `updateProfile()`

```typescript
async updateProfile(outcome: {
  provider: string;
  model: string;
  intent: string;
  complexity: string;
  success: boolean;
  quality: number;
  cost: number;
  latency: number;
}): Promise<void>
```

**Parameters:**
- `outcome`: Routing outcome data

**Returns:** `void` (updates database asynchronously)

**Time Complexity:** O(1) - ~5ms (async, non-blocking)

**Learning Algorithm:**
```typescript
// Exponential moving average (alpha = 0.1)
new_quality = old_quality × 0.9 + actual_quality × 0.1

// Success rate update
new_rate = (old_rate × old_count + (success ? 1 : 0)) / (old_count + 1)

// Strength discovery
if (success_rate > 0.85 && sample_count >= 5) {
  add_to_strengths(intent)
}
```

**Example:**
```typescript
await learner.updateProfile({
  provider: 'deepseek',
  model: 'deepseek-chat',
  intent: 'code_generation',
  complexity: 'moderate',
  success: true,
  quality: 0.9,
  cost: 0.0014,
  latency: 1200
});

// Profile is updated in background
```

---

## Database API

### Class: `Database`

SQLite database operations.

#### Method: `getModelProfile()`

```typescript
async getModelProfile(
  provider: string,
  model: string
): Promise<ModelProfile | null>
```

**Returns:** Model profile or `null` if not found

**Time Complexity:** O(1) - ~1ms (indexed query)

#### Method: `saveModelProfile()`

```typescript
async saveModelProfile(profile: ModelProfile): Promise<void>
```

**Time Complexity:** O(1) - ~2ms

#### Method: `getModelProfiles()`

```typescript
async getModelProfiles(): Promise<ModelProfile[]>
```

**Returns:** All model profiles

**Time Complexity:** O(n) where n = number of profiles

#### Method: `saveRoutingDecision()`

```typescript
async saveRoutingDecision(decision: {
  request_id: string;
  session_id?: string;
  classification: ClassificationResult;
  decision: RoutingDecision;
}): Promise<string>  // Returns decision_id
```

#### Method: `saveRoutingOutcome()`

```typescript
async saveRoutingOutcome(outcome: RoutingOutcome): Promise<void>
```

---

## CLI API

### Command: `ccr models list`

List all learned model profiles.

**Usage:**
```bash
ccr models list [--json]
```

**Options:**
- `--json`: Output as JSON

**Output:**
```
Provider: deepseek, Model: deepseek-chat
├─ Quality Score: 0.87 (learned from 127 requests)
├─ Strengths: code_generation (92% success), debugging (88% success)
├─ Avg Cost: $0.0014 per request
├─ Avg Latency: 1.2s
└─ Source: learned_from_usage (updated 2 hours ago)
```

### Command: `ccr models show`

Show detailed profile for specific model.

**Usage:**
```bash
ccr models show <provider>/<model>
```

**Example:**
```bash
ccr models show deepseek/deepseek-chat
```

### Command: `ccr models reset`

Reset all learned profiles.

**Usage:**
```bash
ccr models reset [--confirm]
```

**Options:**
- `--confirm`: Skip confirmation prompt

### Command: `ccr models export`

Export learned profiles to JSON.

**Usage:**
```bash
ccr models export [--output <file>]
```

**Example:**
```bash
ccr models export --output team-profiles.json
# or
ccr models export > team-profiles.json
```

### Command: `ccr models import`

Import profiles from JSON.

**Usage:**
```bash
ccr models import <file>
```

**Example:**
```bash
ccr models import team-profiles.json
```

### Command: `ccr classify`

Test classification on a request.

**Usage:**
```bash
ccr classify <request>
```

**Example:**
```bash
ccr classify "Fix this Python bug"

Classification Result:
├─ Intent: debugging
├─ Complexity: simple
├─ Domain: [python]
├─ Confidence: 0.92
└─ Recommended Model: deepseek-chat
```

---

## Configuration Schema

### Full Schema

```typescript
interface ICCRConfig {
  // Existing CCR config
  routes: Record<string, RouteConfig>;
  defaultModel: string;
  providers: Record<string, ProviderConfig>;
  
  // ICCR semantic routing
  semanticRouting?: {
    enabled: boolean;
    confidenceThreshold?: number;  // Default: 0.7
    fallbackToRules?: boolean;     // Default: true
    
    classifier?: {
      provider: 'ollama' | 'openrouter' | 'openai';
      model: string;
      baseURL?: string;
      apiKey?: string;
    };
    
    optimization?: {
      costWeight?: number;      // Default: 0.3
      qualityWeight?: number;   // Default: 0.5
      latencyWeight?: number;   // Default: 0.2
    };
  };
  
  // Optional: Manual model capabilities
  modelCapabilities?: Record<string, {
    strengths?: string[];
    weaknesses?: string[];
    quality_score?: number;
    cost_per_1m_tokens?: number;
    supports_reasoning?: boolean;
    notes?: string;
  }>;
}
```

### Validation Rules

1. **Weights must sum to 1.0** (auto-normalized if not)
2. **Confidence threshold: 0.0-1.0**
3. **Quality scores: 0.0-1.0**
4. **Cost: >= 0**

### Default Values

```typescript
const DEFAULTS = {
  semanticRouting: {
    enabled: false,
    confidenceThreshold: 0.7,
    fallbackToRules: true,
    optimization: {
      costWeight: 0.3,
      qualityWeight: 0.5,
      latencyWeight: 0.2
    }
  }
};
```

---

## Error Handling

### Classification Errors

```typescript
try {
  const result = await classifier.classify(request);
} catch (error) {
  if (error.code === 'OLLAMA_NOT_AVAILABLE') {
    // Fallback to rule-based
    const result = await ruleBasedClassifier.classify(request);
  } else if (error.code === 'API_KEY_MISSING') {
    console.error('OpenRouter API key not set');
  } else {
    throw error;
  }
}
```

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `OLLAMA_NOT_AVAILABLE` | Ollama not running | Start Ollama or use cloud provider |
| `API_KEY_MISSING` | API key not set | Set `OPENROUTER_API_KEY` or `OPENAI_API_KEY` |
| `MODEL_NOT_FOUND` | Model not available | Download model or use different one |
| `CLASSIFICATION_FAILED` | LLM returned invalid JSON | Check LLM output, may need different model |
| `LOW_CONFIDENCE` | Confidence < threshold | Falls back to rule-based routing |

---

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Typical Time |
|-----------|-----------|--------------|
| LLM Classification | O(1) | 50-200ms |
| Profile Lookup | O(1) | <1ms (indexed) |
| Model Selection | O(n) | <5ms (n=models) |
| Feedback Collection | O(1) | ~5ms (async) |
| **Total Overhead** | - | **~50-200ms** |

### Space Complexity

| Component | Size |
|-----------|------|
| Default Profiles | ~5KB |
| SQLite Database | ~100KB-1MB (grows with usage) |
| In-Memory Cache | ~10MB |

### Scalability

- **Requests**: Handles 100+ requests/second
- **Profiles**: Supports 100+ model profiles
- **History**: Stores 10K+ routing decisions efficiently

---

## Integration Example

```typescript
import { LLMClassifier, ModelSelector, ModelProfileLearner, Database } from 'iccr';

// Initialize
const db = new Database('~/.claude-code-router/iccr.db');
const classifier = new LLMClassifier({ provider: 'ollama', model: 'qwen2.5:0.5b' });
const selector = new ModelSelector(db, { costWeight: 0.3, qualityWeight: 0.5, latencyWeight: 0.2 });
const learner = new ModelProfileLearner(db);

// Classify request
const classification = await classifier.classify(userRequest);

// Select model
const decision = await selector.selectModel(classification, availableModels);

// Route to model
const response = await routeToModel(decision.provider, decision.model, userRequest);

// Collect feedback
await learner.updateProfile({
  provider: decision.provider,
  model: decision.model,
  intent: classification.intent,
  complexity: classification.complexity,
  success: !response.error,
  quality: calculateQuality(response),
  cost: response.usage.total_cost,
  latency: response.latency
});
```

---

## Version History

- **v1.0.0** (Planned): Initial release
  - LLM classification
  - Auto-learning profiles
  - CLI commands
  - Backward compatibility

---

**For implementation details, see [Implementation Plan](./implementation_plan.md)**  
**For user guide, see [User Guide](./iccr_user_guide.md)**
