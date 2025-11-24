import { ICCRDatabase } from '../storage/database.js';
import {
    ClassificationResult,
    RoutingDecision,
    ModelProfile,
    ComplexityLevel,
    IntentType
} from '../semantic/types.js';

export interface ModelSelectorConfig {
    costWeight: number;      // 0-1, weight for cost optimization
    qualityWeight: number;   // 0-1, weight for quality optimization
    latencyWeight: number;   // 0-1, weight for latency optimization
    minSampleSize: number;   // Minimum samples before trusting success rates
}

export interface ScoredModel {
    provider: string;
    model: string;
    score: number;
    profile: ModelProfile | null;
    breakdown: {
        successRateScore: number;
        costScore: number;
        qualityScore: number;
        latencyScore: number;
        bonusScore: number;
    };
}

/**
 * ModelSelector - Selects optimal model based on classification and learned profiles
 * 
 * Scoring Algorithm:
 * - 40%: Success rate for (intent, complexity) combination
 * - 30%: Cost efficiency (weighted by costWeight)
 * - 20%: Overall quality score (weighted by qualityWeight)
 * - 10%: Latency (weighted by latencyWeight)
 * - Bonus: +10% for reasoning models on expert tasks
 */
export class ModelSelector {
    private normalizedWeights: {
        cost: number;
        quality: number;
        latency: number;
    };

    constructor(
        private db: ICCRDatabase,
        private config: ModelSelectorConfig
    ) {
        // Normalize weights to sum to 1.0
        const total = config.costWeight + config.qualityWeight + config.latencyWeight;

        if (total === 0) {
            throw new Error('At least one optimization weight must be > 0');
        }

        this.normalizedWeights = {
            cost: config.costWeight / total,
            quality: config.qualityWeight / total,
            latency: config.latencyWeight / total
        };

        console.log('[ModelSelector] Initialized with weights:', this.normalizedWeights);
    }

    /**
     * Select optimal model based on classification
     * 
     * @param classification - Classification result from semantic router
     * @param availableModels - Models configured by user
     * @returns Routing decision with selected model and reasoning
     */
    async selectModel(
        classification: ClassificationResult,
        availableModels: Array<{ provider: string; model: string }>
    ): Promise<RoutingDecision> {
        if (availableModels.length === 0) {
            throw new Error('No models available for selection');
        }

        console.log(`[ModelSelector] Selecting model for ${classification.intent} (${classification.complexity})`);

        // Get profiles for all available models
        const profiles = availableModels.map(m => ({
            provider: m.provider,
            model: m.model,
            profile: this.db.getModelProfile(m.provider, m.model)
        }));

        // Score each model
        const scored: ScoredModel[] = profiles.map(p => {
            const { score, breakdown } = this.scoreModel(p.profile, classification);
            return {
                provider: p.provider,
                model: p.model,
                score,
                profile: p.profile,
                breakdown
            };
        });

        // Sort by score (descending)
        scored.sort((a, b) => b.score - a.score);

        const best = scored[0];

        console.log(`[ModelSelector] Selected ${best.provider}/${best.model} (score: ${best.score.toFixed(3)})`);

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

    /**
     * Score a model based on profile and classification
     * 
     * @param profile - Model profile (or null if unknown)
     * @param classification - Classification result
     * @returns Score (0-1) and breakdown
     */
    private scoreModel(
        profile: ModelProfile | null,
        classification: ClassificationResult
    ): { score: number; breakdown: any } {
        const breakdown = {
            successRateScore: 0,
            costScore: 0,
            qualityScore: 0,
            latencyScore: 0,
            bonusScore: 0
        };

        if (!profile) {
            // Unknown model, return neutral score
            breakdown.qualityScore = 0.5;
            return { score: 0.5, breakdown };
        }

        let totalScore = 0;

        // Factor 1: Success rate for this (intent, complexity) - 40%
        const intentKey = `${classification.intent}_${classification.complexity}`;
        const successData = profile.success_rates[intentKey];

        if (successData && successData.count >= this.config.minSampleSize) {
            // Have enough data for this specific combination
            breakdown.successRateScore = successData.rate * 0.4;
            totalScore += breakdown.successRateScore;
        } else {
            // No data or insufficient samples, use overall quality
            breakdown.successRateScore = profile.quality_score * 0.4;
            totalScore += breakdown.successRateScore;
        }

        // Factor 2: Cost efficiency - 30% (weighted)
        const maxCost = 10; // $10 per 1M tokens (normalize)
        const costEfficiency = 1 - Math.min(profile.cost_per_1m_tokens / maxCost, 1);
        breakdown.costScore = costEfficiency * this.normalizedWeights.cost * 0.3;
        totalScore += breakdown.costScore;

        // Factor 3: Quality score - 20% (weighted)
        breakdown.qualityScore = profile.quality_score * this.normalizedWeights.quality * 0.2;
        totalScore += breakdown.qualityScore;

        // Factor 4: Latency - 10% (weighted)
        const maxLatency = 5000; // 5 seconds (normalize)
        const latencyEfficiency = 1 - Math.min(profile.avg_latency_ms / maxLatency, 1);
        breakdown.latencyScore = latencyEfficiency * this.normalizedWeights.latency * 0.1;
        totalScore += breakdown.latencyScore;

        // Bonus: Reasoning capability for expert tasks
        if (classification.complexity === 'expert' && profile.supports_reasoning) {
            breakdown.bonusScore = 0.1;
            totalScore += breakdown.bonusScore;
        }

        // Bonus: Model strengths match intent
        if (profile.strengths.includes(classification.intent)) {
            breakdown.bonusScore += 0.05;
            totalScore += 0.05;
        }

        // Penalty: Model weaknesses match intent
        if (profile.weaknesses.includes(classification.intent)) {
            totalScore -= 0.1;
        }

        return {
            score: Math.max(0, Math.min(totalScore, 1.0)),
            breakdown
        };
    }

    /**
     * Generate human-readable explanation for model choice
     */
    private explainChoice(
        choice: ScoredModel,
        classification: ClassificationResult
    ): string {
        const profile = choice.profile;

        if (!profile) {
            return `Selected ${choice.model} (no historical data, using as default)`;
        }

        const intentKey = `${classification.intent}_${classification.complexity}`;
        const successData = profile.success_rates[intentKey];

        let reason = `Selected ${choice.model} for ${classification.intent} task (${classification.complexity} complexity). `;

        if (successData && successData.count >= this.config.minSampleSize) {
            const successPct = (successData.rate * 100).toFixed(0);
            reason += `Historical success rate: ${successPct}% (${successData.count} samples). `;
        } else {
            reason += `Quality score: ${(profile.quality_score * 100).toFixed(0)}%. `;
        }

        // Add cost/latency info
        if (profile.cost_per_1m_tokens > 0) {
            reason += `Cost: $${profile.cost_per_1m_tokens.toFixed(2)}/1M tokens. `;
        }

        if (profile.avg_latency_ms > 0) {
            reason += `Avg latency: ${profile.avg_latency_ms.toFixed(0)}ms. `;
        }

        // Add strengths/weaknesses
        if (profile.strengths.length > 0) {
            reason += `Strengths: ${profile.strengths.join(', ')}. `;
        }

        return reason.trim();
    }

    /**
     * Get detailed scoring breakdown for debugging
     */
    async getScoreBreakdown(
        provider: string,
        model: string,
        classification: ClassificationResult
    ): Promise<ScoredModel | null> {
        const profile = this.db.getModelProfile(provider, model);

        if (!profile) {
            return null;
        }

        const { score, breakdown } = this.scoreModel(profile, classification);

        return {
            provider,
            model,
            score,
            profile,
            breakdown
        };
    }
}
