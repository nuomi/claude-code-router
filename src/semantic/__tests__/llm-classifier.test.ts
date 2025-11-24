import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LLMClassifier } from '../llm-classifier';
import { IntentType, ComplexityLevel } from '../types';

describe('LLMClassifier', () => {
    describe('constructor', () => {
        it('should create instance with Ollama config', () => {
            const classifier = new LLMClassifier({
                provider: 'ollama',
                model: 'qwen2.5:0.5b',
                baseURL: 'http://localhost:11434'
            });

            expect(classifier).toBeInstanceOf(LLMClassifier);
        });

        it('should create instance with OpenRouter config', () => {
            const classifier = new LLMClassifier({
                provider: 'openrouter',
                model: 'google/gemini-2.0-flash-exp:free',
                apiKey: 'test-key'
            });

            expect(classifier).toBeInstanceOf(LLMClassifier);
        });

        it('should throw error for unknown provider', () => {
            expect(() => {
                new LLMClassifier({
                    provider: 'unknown' as any,
                    model: 'test'
                });
            }).toThrow('Unknown provider');
        });
    });

    describe('classify', () => {
        let classifier: LLMClassifier;
        let mockLLMClient: any;

        beforeEach(() => {
            mockLLMClient = {
                generate: jest.fn()
            };

            classifier = new LLMClassifier({
                provider: 'ollama',
                model: 'qwen2.5:0.5b'
            });

            // Inject mock client
            (classifier as any).llmClient = mockLLMClient;
        });

        it('should classify code generation request', async () => {
            mockLLMClient.generate.mockResolvedValue(JSON.stringify({
                intent: 'code_generation',
                complexity: 'moderate',
                domain: ['web_backend'],
                confidence: 0.92,
                reasoning: 'User wants to create API endpoint'
            }));

            const result = await classifier.classify('Create a REST API for user login');

            expect(result).toEqual({
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web_backend'],
                confidence: 0.92,
                reasoning: 'User wants to create API endpoint'
            });
        });

        it('should classify debugging request', async () => {
            mockLLMClient.generate.mockResolvedValue(JSON.stringify({
                intent: 'debugging',
                complexity: 'simple',
                domain: ['python'],
                confidence: 0.95,
                reasoning: 'Simple syntax error fix'
            }));

            const result = await classifier.classify('Fix this Python syntax error');

            expect(result.intent).toBe(IntentType.DEBUGGING);
            expect(result.complexity).toBe(ComplexityLevel.SIMPLE);
            expect(result.confidence).toBeGreaterThan(0.9);
        });

        it('should classify architecture request as expert', async () => {
            mockLLMClient.generate.mockResolvedValue(JSON.stringify({
                intent: 'architecture',
                complexity: 'expert',
                domain: ['systems', 'devops'],
                confidence: 0.88,
                reasoning: 'Complex distributed system design'
            }));

            const result = await classifier.classify(
                'Design a microservices architecture for e-commerce with 1M+ users'
            );

            expect(result.intent).toBe(IntentType.ARCHITECTURE);
            expect(result.complexity).toBe(ComplexityLevel.EXPERT);
        });

        it('should handle invalid JSON response', async () => {
            mockLLMClient.generate.mockResolvedValue('invalid json');

            await expect(
                classifier.classify('test request')
            ).rejects.toThrow('Invalid JSON response');
        });

        it('should handle missing required fields', async () => {
            mockLLMClient.generate.mockResolvedValue(JSON.stringify({
                domain: ['web'],
                confidence: 0.8
                // Missing intent and complexity
            }));

            await expect(
                classifier.classify('test request')
            ).rejects.toThrow('Missing required fields');
        });

        it('should handle LLM API errors', async () => {
            mockLLMClient.generate.mockRejectedValue(new Error('API timeout'));

            await expect(
                classifier.classify('test request')
            ).rejects.toThrow('API timeout');
        });

        it('should include reasoning in result', async () => {
            mockLLMClient.generate.mockResolvedValue(JSON.stringify({
                intent: 'refactoring',
                complexity: 'moderate',
                domain: ['general'],
                confidence: 0.85,
                reasoning: 'Code improvement task'
            }));

            const result = await classifier.classify('Refactor this function');

            expect(result.reasoning).toBe('Code improvement task');
        });

        it('should default to general intent for ambiguous requests', async () => {
            mockLLMClient.generate.mockResolvedValue(JSON.stringify({
                intent: 'general',
                complexity: 'simple',
                domain: ['general'],
                confidence: 0.6,
                reasoning: 'Unclear intent'
            }));

            const result = await classifier.classify('help');

            expect(result.intent).toBe(IntentType.GENERAL);
            expect(result.confidence).toBeLessThan(0.7);
        });
    });

    describe('buildPrompt', () => {
        it('should include request text in prompt', () => {
            const classifier = new LLMClassifier({
                provider: 'ollama',
                model: 'qwen2.5:0.5b'
            });

            const prompt = (classifier as any).buildPrompt('test request');

            expect(prompt).toContain('test request');
            expect(prompt).toContain('JSON');
            expect(prompt).toContain('intent');
            expect(prompt).toContain('complexity');
        });
    });

    describe('parseResponse', () => {
        let classifier: LLMClassifier;

        beforeEach(() => {
            classifier = new LLMClassifier({
                provider: 'ollama',
                model: 'qwen2.5:0.5b'
            });
        });

        it('should parse valid JSON response', () => {
            const response = JSON.stringify({
                intent: 'code_generation',
                complexity: 'moderate',
                domain: ['web'],
                confidence: 0.9,
                reasoning: 'test'
            });

            const result = (classifier as any).parseResponse(response);

            expect(result.intent).toBe('code_generation');
            expect(result.complexity).toBe('moderate');
        });

        it('should use default domain if missing', () => {
            const response = JSON.stringify({
                intent: 'code_generation',
                complexity: 'moderate',
                confidence: 0.9,
                reasoning: 'test'
            });

            const result = (classifier as any).parseResponse(response);

            expect(result.domain).toEqual(['general']);
        });

        it('should use default confidence if missing', () => {
            const response = JSON.stringify({
                intent: 'code_generation',
                complexity: 'moderate',
                domain: ['web'],
                reasoning: 'test'
            });

            const result = (classifier as any).parseResponse(response);

            expect(result.confidence).toBe(0.7);
        });

        it('should use default reasoning if missing', () => {
            const response = JSON.stringify({
                intent: 'code_generation',
                complexity: 'moderate',
                domain: ['web'],
                confidence: 0.9
            });

            const result = (classifier as any).parseResponse(response);

            expect(result.reasoning).toBe('No reasoning provided');
        });
    });
});
