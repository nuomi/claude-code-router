/**
 * Semantic Routing Orchestrator for ICCR v1.0
 * Coordinates classification and provides fallback logic
 */

import { LLMClassifier, LLMClassifierConfig } from './llm-classifier';
import { RuleBasedClassifier } from './rule-based-classifier';
import { ClassificationResult } from './types';
import { ICCRDatabase } from '../storage/database';

export interface SemanticRouterConfig {
    enabled: boolean;
    confidenceThreshold?: number;
    fallbackToRules?: boolean;
    classifier?: LLMClassifierConfig;
}

export class SemanticRouter {
    private llmClassifier?: LLMClassifier;
    private ruleBasedClassifier: RuleBasedClassifier;
    private config: SemanticRouterConfig;
    private db?: ICCRDatabase;

    constructor(config: SemanticRouterConfig, db?: ICCRDatabase) {
        this.config = {
            confidenceThreshold: 0.7,
            fallbackToRules: true,
            ...config
        };
        this.db = db;

        // Initialize classifiers
        this.ruleBasedClassifier = new RuleBasedClassifier();

        if (config.classifier) {
            this.llmClassifier = new LLMClassifier(config.classifier, db);
        }
    }

    /**
     * Classify request with automatic fallback
     */
    async classify(request: string): Promise<ClassificationResult> {
        // If semantic routing is disabled, use rule-based
        if (!this.config.enabled) {
            console.log('[SemanticRouter] Semantic routing disabled, using rule-based');
            return this.ruleBasedClassifier.classify(request);
        }

        // Try LLM classification first
        if (this.llmClassifier) {
            try {
                const result = await this.llmClassifier.classify(request);

                // Check confidence threshold
                if (result.confidence >= this.config.confidenceThreshold!) {
                    return result;
                }

                console.log(`[SemanticRouter] Low confidence (${result.confidence}), falling back to rules`);

                // Fallback to rule-based if confidence is low
                if (this.config.fallbackToRules) {
                    return this.ruleBasedClassifier.classify(request);
                }

                return result;
            } catch (error) {
                console.error('[SemanticRouter] LLM classification failed:', error);

                // Fallback to rule-based on error
                if (this.config.fallbackToRules) {
                    console.log('[SemanticRouter] Falling back to rule-based classification');
                    return this.ruleBasedClassifier.classify(request);
                }

                throw error;
            }
        }

        // No LLM classifier configured, use rule-based
        console.log('[SemanticRouter] No LLM classifier configured, using rule-based');
        return this.ruleBasedClassifier.classify(request);
    }

    /**
     * Check if LLM classifier is available
     */
    isLLMAvailable(): boolean {
        return this.llmClassifier !== undefined;
    }

    /**
     * Check if LLM classifier is available (alias)
     */
    hasLLMClassifier(): boolean {
        return this.isLLMAvailable();
    }

    /**
     * Get classifier info
     */
    getInfo(): {
        enabled: boolean;
        hasLLM: boolean;
        provider?: string;
        model?: string;
        confidenceThreshold: number;
    } {
        return {
            enabled: this.config.enabled,
            hasLLM: this.llmClassifier !== undefined,
            provider: this.config.classifier?.provider,
            model: this.config.classifier?.model,
            confidenceThreshold: this.config.confidenceThreshold!
        };
    }
}
