/**
 * Core type definitions for ICCR v1.0
 */

// ============================================================================
// Intent Types
// ============================================================================

export enum IntentType {
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

// ============================================================================
// Complexity Levels
// ============================================================================

export enum ComplexityLevel {
    SIMPLE = 'simple',      // <50 lines, basic tasks, syntax fixes
    MODERATE = 'moderate',  // 50-200 lines, standard features
    COMPLEX = 'complex',    // 200-500 lines, multi-component systems
    EXPERT = 'expert'       // 500+ lines, architecture, algorithms
}

// ============================================================================
// Classification Result
// ============================================================================

export interface ClassificationResult {
    intent: IntentType;
    complexity: ComplexityLevel;
    domain: string[];
    confidence: number;  // 0.0-1.0
    reasoning: string;
}

// ============================================================================
// Routing Decision
// ============================================================================

export interface RoutingDecision {
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

// ============================================================================
// Routing Outcome
// ============================================================================

export interface RoutingOutcome {
    decisionId: string;
    timestamp: number;
    success: boolean;
    quality: number;       // 0.0-1.0
    actualCost: number;    // USD
    actualLatency: number; // milliseconds
    errorOccurred: boolean;
    errorMessage?: string;
    errorType?: string;
}

// ============================================================================
// Model Profile
// ============================================================================

export interface ModelProfile {
    provider: string;
    model: string;
    strengths: string[];
    weaknesses: string[];
    quality_score: number;
    cost_per_1m_tokens: number;
    avg_latency_ms: number;
    supports_reasoning: boolean;
    success_rates: Record<string, {
        rate: number;
        count: number;
    }>;
    source: 'public_benchmark' | 'learned_from_usage' | 'auto_discovered' | 'user_configured';
    sample_count: number;
    last_updated: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface SemanticRoutingConfig {
    enabled: boolean;
    confidenceThreshold?: number;
    fallbackToRules?: boolean;

    classifier?: {
        provider: 'ollama' | 'openrouter' | 'openai';
        model: string;
        baseURL?: string;
        apiKey?: string;
        temperature?: number;
        maxTokens?: number;
        enableCache?: boolean;
        cacheTTL?: number;
    };

    optimization?: {
        costWeight: number;
        qualityWeight: number;
        latencyWeight: number;
        maxCostPerRequest?: number;
        maxLatencyMs?: number;
        minQualityScore?: number;
    };

    learning?: {
        enabled: boolean;
        learningRate?: number;
        minSamples?: number;
        strengthThreshold?: number;
        weaknessThreshold?: number;
        autoDiscovery?: boolean;
    };

    feedback?: {
        enabled: boolean;
        collectImplicit?: boolean;
        persistFeedback?: boolean;
    };
}

export interface ModelCapabilityConfig {
    strengths?: string[];
    weaknesses?: string[];
    cost_per_1m_tokens?: number;
    quality_score?: number;
    avg_latency_ms?: number;
    max_context?: number;
    supports_tools?: boolean;
    supports_reasoning?: boolean;
    supports_vision?: boolean;
    notes?: string;
}

export interface IntentRoutingConfig {
    preferredModels: string[];
    minQuality?: number;
    maxCost?: number;
}

// ============================================================================
// Database Row Types
// ============================================================================

export interface ModelProfileRow {
    id: number;
    provider: string;
    model: string;
    strengths: string;  // JSON
    weaknesses: string; // JSON
    quality_score: number;
    cost_per_1m_tokens: number;
    avg_latency_ms: number;
    supports_reasoning: number; // SQLite boolean
    success_rates: string; // JSON
    source: string;
    sample_count: number;
    last_updated: number;
    created_at: number;
}

export interface RoutingDecisionRow {
    id: number;
    request_id: string;
    session_id: string | null;
    timestamp: number;
    intent: string;
    complexity: string;
    domain: string; // JSON
    confidence: number;
    reasoning: string;
    selected_provider: string;
    selected_model: string;
    decision_reasoning: string;
    estimated_cost: number;
    estimated_quality: number;
    estimated_latency: number;
    alternatives: string; // JSON
}

export interface RoutingOutcomeRow {
    id: number;
    decision_id: number;
    timestamp: number;
    success: number; // SQLite boolean
    quality: number | null;
    actual_cost: number | null;
    actual_latency: number | null;
    error_occurred: number; // SQLite boolean
    error_message: string | null;
    error_type: string | null;
}

export interface ClassificationCacheRow {
    id: number;
    request_hash: string;
    request_text: string;
    intent: string;
    complexity: string;
    domain: string; // JSON
    confidence: number;
    reasoning: string;
    created_at: number;
    expires_at: number;
    hit_count: number;
}
