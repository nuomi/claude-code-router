import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ModelSelector } from '../model-selector';
import { IntentType, ComplexityLevel } from '../types';
import type { Database } from '../../storage/database';
import type { ModelProfile } from '../../learning/profile-learner';

describe('ModelSelector', () => {
    let mockDb: jest.Mocked<Database>;
    let selector: ModelSelector;

    beforeEach(() => {
        mockDb = {
            getModelProfile: jest.fn(),
            saveModelProfile: jest.fn(),
            getModelProfiles: jest.fn(),
        } as any;

        selector = new ModelSelector(mockDb, {
            costWeight: 0.3,
            qualityWeight: 0.5,
            latencyWeight: 0.2
        });
    });

    describe('constructor', () => {
        it('should normalize weights to sum to 1.0', () => {
            const selector = new ModelSelector(mockDb, {
                costWeight: 3,
                qualityWeight: 5,
                latencyWeight: 2
            });

            const config = (selector as any).config;
            const sum = config.costWeight + config.qualityWeight + config.latencyWeight;

            expect(sum).toBeCloseTo(1.0, 5);
        });

        it('should accept already normalized weights', () => {
            const selector = new ModelSelector(mockDb, {
                costWeight: 0.3,
                qualityWeight: 0.5,
                latencyWeight: 0.2
            });

            const config = (selector as any).config;

            expect(config.costWeight).toBeCloseTo(0.3, 5);
            expect(config.qualityWeight).toBeCloseTo(0.5, 5);
            expect(config.latencyWeight).toBeCloseTo(0.2, 5);
        });
    });

    describe('selectModel', () => {
        const mockProfiles: Record<string, ModelProfile> = {
            'deepseek-chat': {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: ['code_generation', 'debugging'],
                weaknesses: [],
                quality_score: 0.85,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1200,
                supports_reasoning: false,
                success_rates: {
                    'code_generation_moderate': { rate: 0.90, count: 50 }
                },
                source: 'learned_from_usage',
                sample_count: 100,
                last_updated: Date.now()
            },
            'claude-3.5-sonnet': {
                provider: 'openrouter',
                model: 'anthropic/claude-3.5-sonnet',
                strengths: ['code_generation', 'explanation'],
                weaknesses: [],
                quality_score: 0.95,
                cost_per_1m_tokens: 3.0,
                avg_latency_ms: 2000,
                supports_reasoning: false,
                success_rates: {
                    'code_generation_moderate': { rate: 0.95, count: 30 }
                },
                source: 'public_benchmark',
                sample_count: 50,
                last_updated: Date.now()
            },
            'deepseek-reasoner': {
                provider: 'deepseek',
                model: 'deepseek-reasoner',
                strengths: ['architecture', 'complex_reasoning'],
                weaknesses: ['simple_tasks'],
                quality_score: 0.92,
                cost_per_1m_tokens: 0.55,
                avg_latency_ms: 3500,
                supports_reasoning: true,
                success_rates: {
                    'architecture_expert': { rate: 0.88, count: 20 }
                },
                source: 'public_benchmark',
                sample_count: 25,
                last_updated: Date.now()
            }
        };

        beforeEach(() => {
            mockDb.getModelProfile.mockImplementation(async (provider, model) => {
                const key = model.split('/').pop() || model;
                return mockProfiles[key] || null;
            });
        });

        it('should select cheap model for simple task', async () => {
            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const availableModels = [
                { provider: 'deepseek', model: 'deepseek-chat' },
                { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' }
            ];

            const decision = await selector.selectModel(classification, availableModels);

            // Should prefer deepseek-chat (cheaper, good success rate)
            expect(decision.model).toBe('deepseek-chat');
            expect(decision.estimatedCost).toBeLessThan(1.0);
        });

        it('should select reasoning model for expert task', async () => {
            const classification = {
                intent: IntentType.ARCHITECTURE,
                complexity: ComplexityLevel.EXPERT,
                domain: ['systems'],
                confidence: 0.88,
                reasoning: 'Complex architecture'
            };

            const availableModels = [
                { provider: 'deepseek', model: 'deepseek-chat' },
                { provider: 'deepseek', model: 'deepseek-reasoner' }
            ];

            const decision = await selector.selectModel(classification, availableModels);

            // Should prefer reasoner for expert tasks
            expect(decision.model).toBe('deepseek-reasoner');
            expect(decision.reasoning).toContain('reasoning');
        });

        it('should include alternatives in decision', async () => {
            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const availableModels = [
                { provider: 'deepseek', model: 'deepseek-chat' },
                { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
                { provider: 'deepseek', model: 'deepseek-reasoner' }
            ];

            const decision = await selector.selectModel(classification, availableModels);

            expect(decision.alternatives).toHaveLength(2);
            expect(decision.alternatives[0]).toHaveProperty('provider');
            expect(decision.alternatives[0]).toHaveProperty('model');
            expect(decision.alternatives[0]).toHaveProperty('score');
        });

        it('should handle unknown model gracefully', async () => {
            mockDb.getModelProfile.mockResolvedValue(null);

            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.SIMPLE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const availableModels = [
                { provider: 'unknown', model: 'unknown-model' }
            ];

            const decision = await selector.selectModel(classification, availableModels);

            expect(decision.model).toBe('unknown-model');
            expect(decision.confidence).toBe(0.5); // Neutral score for unknown
        });

        it('should prioritize quality when quality weight is high', async () => {
            const qualitySelector = new ModelSelector(mockDb, {
                costWeight: 0.1,
                qualityWeight: 0.8,
                latencyWeight: 0.1
            });

            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const availableModels = [
                { provider: 'deepseek', model: 'deepseek-chat' },
                { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' }
            ];

            const decision = await qualitySelector.selectModel(classification, availableModels);

            // Should prefer claude (higher quality)
            expect(decision.model).toBe('anthropic/claude-3.5-sonnet');
        });

        it('should prioritize cost when cost weight is high', async () => {
            const costSelector = new ModelSelector(mockDb, {
                costWeight: 0.8,
                qualityWeight: 0.1,
                latencyWeight: 0.1
            });

            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const availableModels = [
                { provider: 'deepseek', model: 'deepseek-chat' },
                { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' }
            ];

            const decision = await costSelector.selectModel(classification, availableModels);

            // Should prefer deepseek (cheaper)
            expect(decision.model).toBe('deepseek-chat');
        });

        it('should include estimated metrics in decision', async () => {
            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const availableModels = [
                { provider: 'deepseek', model: 'deepseek-chat' }
            ];

            const decision = await selector.selectModel(classification, availableModels);

            expect(decision).toHaveProperty('estimatedCost');
            expect(decision).toHaveProperty('estimatedQuality');
            expect(decision).toHaveProperty('estimatedLatency');
            expect(decision.estimatedCost).toBeGreaterThan(0);
            expect(decision.estimatedQuality).toBeGreaterThan(0);
            expect(decision.estimatedLatency).toBeGreaterThan(0);
        });
    });

    describe('scoreModel', () => {
        it('should score based on success rate', () => {
            const profile: ModelProfile = {
                provider: 'test',
                model: 'test',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 1.0,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {
                    'code_generation_moderate': { rate: 0.95, count: 50 }
                },
                source: 'learned_from_usage',
                sample_count: 50,
                last_updated: Date.now()
            };

            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const score = (selector as any).scoreModel(profile, classification);

            expect(score).toBeGreaterThan(0.5);
            expect(score).toBeLessThanOrEqual(1.0);
        });

        it('should give bonus for reasoning capability on expert tasks', () => {
            const reasoningProfile: ModelProfile = {
                provider: 'test',
                model: 'test-reasoner',
                strengths: [],
                weaknesses: [],
                quality_score: 0.9,
                cost_per_1m_tokens: 1.0,
                avg_latency_ms: 2000,
                supports_reasoning: true,
                success_rates: {},
                source: 'public_benchmark',
                sample_count: 10,
                last_updated: Date.now()
            };

            const expertClassification = {
                intent: IntentType.ARCHITECTURE,
                complexity: ComplexityLevel.EXPERT,
                domain: ['systems'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const score = (selector as any).scoreModel(reasoningProfile, expertClassification);

            expect(score).toBeGreaterThan(0.6);
        });

        it('should return neutral score for unknown model', () => {
            const score = (selector as any).scoreModel(null, {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.SIMPLE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            });

            expect(score).toBe(0.5);
        });
    });

    describe('explainChoice', () => {
        it('should generate reasoning with success rate', () => {
            const choice = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                profile: {
                    success_rates: {
                        'code_generation_moderate': { rate: 0.90, count: 50 }
                    },
                    cost_per_1m_tokens: 0.14,
                    quality_score: 0.85
                },
                successRate: 0.90
            };

            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const reasoning = (selector as any).explainChoice(choice, classification);

            expect(reasoning).toContain('deepseek-chat');
            expect(reasoning).toContain('code_generation');
            expect(reasoning).toContain('moderate');
            expect(reasoning).toContain('90%');
        });

        it('should handle unknown model in reasoning', () => {
            const choice = {
                provider: 'test',
                model: 'test-model',
                profile: null
            };

            const classification = {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.SIMPLE,
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            };

            const reasoning = (selector as any).explainChoice(choice, classification);

            expect(reasoning).toContain('no historical data');
        });
    });
});
