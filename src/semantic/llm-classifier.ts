/**
 * LLM Classifier for ICCR v1.0
 * Classifies user requests using a small LLM (Ollama, OpenRouter, or OpenAI)
 */

import { ClassificationResult, IntentType, ComplexityLevel } from './types';
import { ICCRDatabase } from '../storage/database';
import * as crypto from 'crypto';

export interface LLMClassifierConfig {
    provider: 'ollama' | 'openrouter' | 'openai';
    model: string;
    baseURL?: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
    enableCache?: boolean;
    cacheTTL?: number;
}

export class LLMClassifier {
    private config: LLMClassifierConfig;
    private db?: ICCRDatabase;

    constructor(config: LLMClassifierConfig, db?: ICCRDatabase) {
        this.config = {
            temperature: 0.1,
            maxTokens: 150,
            enableCache: true,
            cacheTTL: 3600,
            ...config
        };
        this.db = db;
    }

    /**
     * Classify user request using LLM
     * 
     * @param request - User's request text
     * @returns Classification result
     * 
     * Time: 50-200ms (depends on model and provider)
     * Accuracy: 85-95% (depends on model)
     */
    async classify(request: string): Promise<ClassificationResult> {
        // Check cache first
        if (this.config.enableCache && this.db) {
            const hash = this.hashRequest(request);
            const cached = this.db.getCachedClassification(hash);

            if (cached) {
                console.log('[LLMClassifier] Cache hit');
                return cached;
            }
        }

        // Call LLM
        const startTime = Date.now();
        const prompt = this.buildPrompt(request);

        try {
            const response = await this.callLLM(prompt);
            const classification = this.parseResponse(response);

            const elapsed = Date.now() - startTime;
            console.log(`[LLMClassifier] Classified in ${elapsed}ms: ${classification.intent}/${classification.complexity}`);

            // Cache result
            if (this.config.enableCache && this.db) {
                const hash = this.hashRequest(request);
                this.db.saveCachedClassification(hash, request, classification, this.config.cacheTTL!);
            }

            return classification;
        } catch (error) {
            console.error('[LLMClassifier] Classification failed:', error);
            throw error;
        }
    }

    /**
     * Build classification prompt
     */
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

    /**
     * Call LLM based on provider
     */
    private async callLLM(prompt: string): Promise<string> {
        switch (this.config.provider) {
            case 'ollama':
                return this.callOllama(prompt);
            case 'openrouter':
                return this.callOpenRouter(prompt);
            case 'openai':
                return this.callOpenAI(prompt);
            default:
                throw new Error(`Unknown provider: ${this.config.provider}`);
        }
    }

    /**
     * Call Ollama API
     */
    private async callOllama(prompt: string): Promise<string> {
        const baseURL = this.config.baseURL || 'http://localhost:11434';

        const response = await fetch(`${baseURL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config.model,
                prompt,
                stream: false,
                options: {
                    temperature: this.config.temperature,
                    num_predict: this.config.maxTokens
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.response;
    }

    /**
     * Call OpenRouter API
     */
    private async callOpenRouter(prompt: string): Promise<string> {
        if (!this.config.apiKey) {
            throw new Error('OpenRouter API key not provided');
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
                'HTTP-Referer': 'https://github.com/musistudio/claude-code-router',
                'X-Title': 'ICCR Classifier'
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Call OpenAI API
     */
    private async callOpenAI(prompt: string): Promise<string> {
        if (!this.config.apiKey) {
            throw new Error('OpenAI API key not provided');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Parse LLM response
     */
    private parseResponse(response: string): ClassificationResult {
        try {
            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = response.trim();

            // Remove markdown code blocks if present
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
            }

            const parsed = JSON.parse(jsonStr);

            // Validate required fields
            if (!parsed.intent || !parsed.complexity) {
                throw new Error('Missing required fields: intent or complexity');
            }

            // Validate intent
            if (!Object.values(IntentType).includes(parsed.intent)) {
                console.warn(`[LLMClassifier] Unknown intent: ${parsed.intent}, defaulting to GENERAL`);
                parsed.intent = IntentType.GENERAL;
            }

            // Validate complexity
            if (!Object.values(ComplexityLevel).includes(parsed.complexity)) {
                console.warn(`[LLMClassifier] Unknown complexity: ${parsed.complexity}, defaulting to MODERATE`);
                parsed.complexity = ComplexityLevel.MODERATE;
            }

            return {
                intent: parsed.intent as IntentType,
                complexity: parsed.complexity as ComplexityLevel,
                domain: Array.isArray(parsed.domain) ? parsed.domain : ['general'],
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
                reasoning: parsed.reasoning || 'No reasoning provided'
            };
        } catch (error) {
            console.error('[LLMClassifier] Failed to parse response:', response);
            throw new Error(`Invalid JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Hash request for caching
     */
    private hashRequest(request: string): string {
        return crypto.createHash('sha256').update(request.toLowerCase().trim()).digest('hex');
    }
}
