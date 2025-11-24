import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ModelProfileLearner, ModelProfile } from '../profile-learner';
import type { Database } from '../../storage/database';

describe('ModelProfileLearner', () => {
    let mockDb: jest.Mocked<Database>;
    let learner: ModelProfileLearner;

    beforeEach(() => {
        mockDb = {
            getModelProfile: jest.fn(),
            saveModelProfile: jest.fn(),
            updateModelMetrics: jest.fn(),
        } as any;

        learner = new ModelProfileLearner(mockDb);
    });

    describe('updateProfile', () => {
        it('should create default profile for new model', async () => {
            mockDb.getModelProfile.mockResolvedValue(null);

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

            expect(mockDb.saveModelProfile).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                    sample_count: 1,
                    source: 'learned_from_usage'
                })
            );
        });

        it('should update existing profile with exponential moving average', async () => {
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {},
                source: 'learned_from_usage',
                sample_count: 10,
                last_updated: Date.now()
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

            await learner.updateProfile({
                provider: 'deepseek',
                model: 'deepseek-chat',
                intent: 'code_generation',
                complexity: 'moderate',
                success: true,
                quality: 1.0,
                cost: 0.0014,
                latency: 1200
            });

            expect(mockDb.saveModelProfile).toHaveBeenCalledWith(
                expect.objectContaining({
                    // EMA: 0.8 * 0.9 + 1.0 * 0.1 = 0.82
                    quality_score: expect.closeTo(0.82, 2),
                    sample_count: 11
                })
            );
        });

        it('should update success rate for intent-complexity pair', async () => {
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {
                    'code_generation_moderate': { rate: 0.8, count: 10 }
                },
                source: 'learned_from_usage',
                sample_count: 10,
                last_updated: Date.now()
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

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

            const savedProfile = mockDb.saveModelProfile.mock.calls[0][0] as ModelProfile;

            // New rate: (0.8 * 10 + 1) / 11 = 0.818...
            expect(savedProfile.success_rates['code_generation_moderate'].rate).toBeCloseTo(0.818, 2);
            expect(savedProfile.success_rates['code_generation_moderate'].count).toBe(11);
        });

        it('should add to strengths when success rate > 85%', async () => {
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {
                    'code_generation_moderate': { rate: 0.84, count: 5 }
                },
                source: 'learned_from_usage',
                sample_count: 5,
                last_updated: Date.now()
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

            // This success will push rate above 0.85
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

            const savedProfile = mockDb.saveModelProfile.mock.calls[0][0] as ModelProfile;

            expect(savedProfile.strengths).toContain('code_generation');
        });

        it('should add to weaknesses when success rate < 50%', async () => {
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {
                    'creative_writing_simple': { rate: 0.6, count: 5 }
                },
                source: 'learned_from_usage',
                sample_count: 5,
                last_updated: Date.now()
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

            // Multiple failures to push below 0.5
            for (let i = 0; i < 5; i++) {
                await learner.updateProfile({
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                    intent: 'creative_writing',
                    complexity: 'simple',
                    success: false,
                    quality: 0.3,
                    cost: 0.0014,
                    latency: 1200
                });
            }

            const savedProfile = mockDb.saveModelProfile.mock.calls[4][0] as ModelProfile;

            expect(savedProfile.weaknesses).toContain('creative_writing');
        });

        it('should update latency with exponential moving average', async () => {
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {},
                source: 'learned_from_usage',
                sample_count: 10,
                last_updated: Date.now()
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

            await learner.updateProfile({
                provider: 'deepseek',
                model: 'deepseek-chat',
                intent: 'code_generation',
                complexity: 'moderate',
                success: true,
                quality: 0.9,
                cost: 0.0014,
                latency: 1500
            });

            const savedProfile = mockDb.saveModelProfile.mock.calls[0][0] as ModelProfile;

            // EMA: 1000 * 0.9 + 1500 * 0.1 = 1050
            expect(savedProfile.avg_latency_ms).toBeCloseTo(1050, 0);
        });

        it('should update actual cost when provided', async () => {
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {},
                source: 'learned_from_usage',
                sample_count: 10,
                last_updated: Date.now()
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

            await learner.updateProfile({
                provider: 'deepseek',
                model: 'deepseek-chat',
                intent: 'code_generation',
                complexity: 'moderate',
                success: true,
                quality: 0.9,
                cost: 0.0020,
                latency: 1200
            });

            const savedProfile = mockDb.saveModelProfile.mock.calls[0][0] as ModelProfile;

            expect(savedProfile.cost_per_1m_tokens).toBe(0.0020);
        });

        it('should preserve user_configured source', async () => {
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: ['code_generation'],
                weaknesses: [],
                quality_score: 0.9,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {},
                source: 'user_configured',
                sample_count: 0,
                last_updated: Date.now()
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

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

            const savedProfile = mockDb.saveModelProfile.mock.calls[0][0] as ModelProfile;

            expect(savedProfile.source).toBe('user_configured');
        });

        it('should update timestamp', async () => {
            const oldTimestamp = Date.now() - 10000;
            const existingProfile: ModelProfile = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                strengths: [],
                weaknesses: [],
                quality_score: 0.8,
                cost_per_1m_tokens: 0.14,
                avg_latency_ms: 1000,
                supports_reasoning: false,
                success_rates: {},
                source: 'learned_from_usage',
                sample_count: 10,
                last_updated: oldTimestamp
            };

            mockDb.getModelProfile.mockResolvedValue(existingProfile);

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

            const savedProfile = mockDb.saveModelProfile.mock.calls[0][0] as ModelProfile;

            expect(savedProfile.last_updated).toBeGreaterThan(oldTimestamp);
        });
    });

    describe('createDefaultProfile', () => {
        it('should create profile with neutral defaults', () => {
            const profile = (learner as any).createDefaultProfile('test', 'test-model');

            expect(profile).toEqual({
                provider: 'test',
                model: 'test-model',
                strengths: [],
                weaknesses: [],
                quality_score: 0.7,
                cost_per_1m_tokens: 0,
                avg_latency_ms: 0,
                supports_reasoning: false,
                success_rates: {},
                source: 'learned_from_usage',
                sample_count: 0,
                last_updated: expect.any(Number)
            });
        });
    });

    describe('updateStrengths', () => {
        it('should add intent to strengths when success rate > 85%', () => {
            const successRates = {
                'code_generation_moderate': { rate: 0.90, count: 10 }
            };

            const strengths = (learner as any).updateStrengths(successRates, 'code_generation');

            expect(strengths).toContain('code_generation');
        });

        it('should not add intent when sample count < 5', () => {
            const successRates = {
                'code_generation_moderate': { rate: 0.90, count: 3 }
            };

            const strengths = (learner as any).updateStrengths(successRates, 'code_generation');

            expect(strengths).not.toContain('code_generation');
        });

        it('should not add duplicate strengths', () => {
            const successRates = {
                'code_generation_simple': { rate: 0.90, count: 10 },
                'code_generation_moderate': { rate: 0.88, count: 10 }
            };

            const strengths = (learner as any).updateStrengths(successRates, 'code_generation');

            expect(strengths.filter((s: string) => s === 'code_generation')).toHaveLength(1);
        });
    });

    describe('updateWeaknesses', () => {
        it('should add intent to weaknesses when success rate < 50%', () => {
            const successRates = {
                'creative_writing_simple': { rate: 0.40, count: 10 }
            };

            const weaknesses = (learner as any).updateWeaknesses(successRates, 'creative_writing');

            expect(weaknesses).toContain('creative_writing');
        });

        it('should not add intent when sample count < 5', () => {
            const successRates = {
                'creative_writing_simple': { rate: 0.40, count: 3 }
            };

            const weaknesses = (learner as any).updateWeaknesses(successRates, 'creative_writing');

            expect(weaknesses).not.toContain('creative_writing');
        });
    });
});
