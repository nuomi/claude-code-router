import { ICCRDatabase } from '../storage/database.js';
import { ModelProfile, IntentType, ComplexityLevel } from '../semantic/types.js';

export interface ProfileLearnerConfig {
    learningRate: number;         // 0-1, how quickly to adapt (default: 0.1)
    minSamples: number;           // Minimum samples before trusting rates (default: 5)
    strengthThreshold: number;    // Success rate to be considered strength (default: 0.85)
    weaknessThreshold: number;    // Success rate to be considered weakness (default: 0.50)
}

export interface OutcomeData {
    provider: string;
    model: string;
    intent: IntentType | string;
    complexity: ComplexityLevel | string;
    success: boolean;
    quality: number;    // 0-1 scale
    cost: number;       // Actual cost in dollars per 1M tokens
    latency: number;    // Milliseconds
}

/**
 * ModelProfileLearner - Automatically updates model profiles based on actual outcomes
 * 
 * Learning Strategy:
 * - Uses Exponential Moving Average (EMA) for quality and latency
 * - Tracks success rates per (intent, complexity) combination
 * - Automatically detects strengths (>85% success) and weaknesses (<50% success)
 * - Requires minimum sample size before trusting statistics
 */
export class ModelProfileLearner {
    constructor(
        private db: ICCRDatabase,
        private config: ProfileLearnerConfig = {
            learningRate: 0.1,
            minSamples: 5,
            strengthThreshold: 0.85,
            weaknessThreshold: 0.50
        }
    ) {
        console.log('[ProfileLearner] Initialized with config:', config);
    }

    /**
     * Update model profile based on actual outcome
     * Called automatically after each request completes
     * 
     * @param outcome - Request outcome data
     */
    async updateProfile(outcome: OutcomeData): Promise<void> {
        console.log(`[ProfileLearner] Processing outcome for ${outcome.provider}/${outcome.model}`);

        // Get current profile (or create default if doesn't exist)
        let profile = this.db.getModelProfile(outcome.provider, outcome.model);

        if (!profile) {
            console.log(`[ProfileLearner] No profile found, creating default for ${outcome.provider}/${outcome.model}`);
            profile = this.createDefaultProfile(outcome.provider, outcome.model);
        }

        // Update quality score using Exponential Moving Average (EMA)
        const alpha = this.config.learningRate;
        const oldQuality = profile.quality_score;
        profile.quality_score = oldQuality * (1 - alpha) + outcome.quality * alpha;

        console.log(`[ProfileLearner] Quality: ${oldQuality.toFixed(3)} → ${profile.quality_score.toFixed(3)}`);

        // Update cost (use actual cost if available)
        if (outcome.cost > 0) {
            profile.cost_per_1m_tokens = outcome.cost;
        }

        // Update latency using EMA
        const oldLatency = profile.avg_latency_ms;
        profile.avg_latency_ms = oldLatency * (1 - alpha) + outcome.latency * alpha;

        // Update success rate for this (intent, complexity) combination
        const intentKey = `${outcome.intent}_${outcome.complexity}`;
        const currentRate = profile.success_rates[intentKey] || { rate: 0, count: 0 };

        const newCount = currentRate.count + 1;
        const successValue = outcome.success ? 1 : 0;
        const newRate = (currentRate.rate * currentRate.count + successValue) / newCount;

        profile.success_rates[intentKey] = { rate: newRate, count: newCount };

        console.log(`[ProfileLearner] Success rate for ${intentKey}: ` +
            `${(currentRate.rate * 100).toFixed(0)}% (${currentRate.count}) → ` +
            `${(newRate * 100).toFixed(0)}% (${newCount})`);

        // Update strengths/weaknesses based on all success rates
        profile.strengths = this.updateStrengths(profile.success_rates);
        profile.weaknesses = this.updateWeaknesses(profile.success_rates);

        // Update metadata
        if (profile.source !== 'user_configured') {
            profile.source = 'learned_from_usage';
        }
        profile.sample_count += 1;
        profile.last_updated = Date.now();

        // Save updated profile
        this.db.saveModelProfile(profile);

        console.log(`[ProfileLearner] Updated ${outcome.provider}/${outcome.model}: ` +
            `quality=${profile.quality_score.toFixed(2)}, ` +
            `samples=${profile.sample_count}, ` +
            `strengths=[${profile.strengths.join(', ')}], ` +
            `weaknesses=[${profile.weaknesses.join(', ')}]`);
    }

    /**
     * Create a default profile for a new model
     */
    private createDefaultProfile(provider: string, model: string): ModelProfile {
        return {
            provider,
            model,
            strengths: [],
            weaknesses: [],
            quality_score: 0.7,  // Neutral starting point
            cost_per_1m_tokens: 0,
            avg_latency_ms: 0,
            supports_reasoning: false,
            success_rates: {},
            source: 'auto_discovered',
            sample_count: 0,
            last_updated: Date.now()
        };
    }

    /**
     * Update strengths based on success rates
     * A model is strong at an intent if success rate > threshold and enough samples
     */
    private updateStrengths(
        successRates: Record<string, { rate: number; count: number }>
    ): string[] {
        const strengths: string[] = [];

        for (const [key, data] of Object.entries(successRates)) {
            const intent = key.split('_')[0];

            // Add to strengths if success rate > threshold and enough samples
            if (data.rate > this.config.strengthThreshold && data.count >= this.config.minSamples) {
                if (!strengths.includes(intent)) {
                    strengths.push(intent);
                }
            }
        }

        return strengths.sort();
    }

    /**
     * Update weaknesses based on success rates
     * A model is weak at an intent if success rate < threshold and enough samples
     */
    private updateWeaknesses(
        successRates: Record<string, { rate: number; count: number }>
    ): string[] {
        const weaknesses: string[] = [];

        for (const [key, data] of Object.entries(successRates)) {
            const intent = key.split('_')[0];

            // Add to weaknesses if success rate < threshold and enough samples
            if (data.rate < this.config.weaknessThreshold && data.count >= this.config.minSamples) {
                if (!weaknesses.includes(intent)) {
                    weaknesses.push(intent);
                }
            }
        }

        return weaknesses.sort();
    }

    /**
     * Get learning statistics for a model
     */
    getModelStats(provider: string, model: string): {
        profile: ModelProfile | null;
        totalSamples: number;
        intentBreakdown: Array<{
            intent: string;
            complexity: string;
            successRate: number;
            sampleCount: number;
        }>;
    } | null {
        const profile = this.db.getModelProfile(provider, model);

        if (!profile) {
            return null;
        }

        const intentBreakdown = Object.entries(profile.success_rates).map(([key, data]) => {
            const [intent, complexity] = key.split('_');
            return {
                intent,
                complexity,
                successRate: data.rate,
                sampleCount: data.count
            };
        });

        return {
            profile,
            totalSamples: profile.sample_count,
            intentBreakdown: intentBreakdown.sort((a, b) => b.sampleCount - a.sampleCount)
        };
    }

    /**
     * Reset learning data for a model (useful for testing or manual reset)
     */
    resetModelProfile(provider: string, model: string): void {
        const profile = this.db.getModelProfile(provider, model);

        if (profile) {
            profile.quality_score = 0.7;
            profile.success_rates = {};
            profile.strengths = [];
            profile.weaknesses = [];
            profile.sample_count = 0;
            profile.last_updated = Date.now();
            profile.source = 'auto_discovered';

            this.db.saveModelProfile(profile);

            console.log(`[ProfileLearner] Reset profile for ${provider}/${model}`);
        }
    }
}
