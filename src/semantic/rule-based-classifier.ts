/**
 * Rule-based classifier fallback for ICCR v1.0
 * Used when LLM is unavailable or confidence is low
 */

import { ClassificationResult, IntentType, ComplexityLevel } from './types';

export class RuleBasedClassifier {
    /**
     * Classify request using keyword patterns
     * 
     * Time: <1ms
     * Accuracy: 70-80%
     */
    classify(text: string): ClassificationResult {
        const lower = text.toLowerCase();

        // Classify intent
        const intent = this.classifyIntent(lower);

        // Estimate complexity
        const complexity = this.estimateComplexity(lower, text);

        // Extract domain
        const domain = this.extractDomain(lower);

        return {
            intent: intent.type,
            complexity: complexity.level,
            domain,
            confidence: Math.min(intent.confidence, complexity.confidence),
            reasoning: `Rule-based classification: ${intent.type} task with ${complexity.level} complexity`
        };
    }

    /**
     * Classify intent based on keywords
     */
    private classifyIntent(text: string): { type: IntentType; confidence: number } {
        const patterns = [
            {
                intent: IntentType.CODE_GENERATION,
                keywords: ['generate', 'create', 'write', 'implement', 'build', 'make', 'add'],
                weight: 1.0
            },
            {
                intent: IntentType.DEBUGGING,
                keywords: ['debug', 'fix', 'error', 'bug', 'issue', 'problem', 'broken', 'not working'],
                weight: 1.0
            },
            {
                intent: IntentType.EXPLANATION,
                keywords: ['explain', 'what', 'how', 'why', 'understand', 'clarify', 'describe'],
                weight: 0.8
            },
            {
                intent: IntentType.REFACTORING,
                keywords: ['refactor', 'improve', 'optimize', 'clean', 'restructure', 'simplify'],
                weight: 1.0
            },
            {
                intent: IntentType.TESTING,
                keywords: ['test', 'unit test', 'integration test', 'e2e', 'testing', 'spec'],
                weight: 1.0
            },
            {
                intent: IntentType.ARCHITECTURE,
                keywords: ['architecture', 'design', 'system', 'microservice', 'distributed', 'structure'],
                weight: 1.0
            },
            {
                intent: IntentType.SEARCH,
                keywords: ['search', 'find', 'look up', 'google', 'browse', 'lookup'],
                weight: 1.0
            },
            {
                intent: IntentType.REVIEW,
                keywords: ['review', 'check', 'audit', 'analyze code', 'inspect'],
                weight: 0.9
            },
            {
                intent: IntentType.DOCUMENTATION,
                keywords: ['document', 'docs', 'comment', 'readme', 'documentation'],
                weight: 0.9
            }
        ];

        let bestIntent = IntentType.GENERAL;
        let bestScore = 0;

        for (const pattern of patterns) {
            let score = 0;
            for (const keyword of pattern.keywords) {
                if (text.includes(keyword)) {
                    score += pattern.weight;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestIntent = pattern.intent;
            }
        }

        // Calculate confidence
        const confidence = bestScore > 0 ? Math.min(0.6 + (bestScore * 0.1), 0.85) : 0.5;

        return { type: bestIntent, confidence };
    }

    /**
     * Estimate complexity based on heuristics
     */
    private estimateComplexity(lower: string, original: string): {
        level: ComplexityLevel;
        confidence: number;
    } {
        let score = 0;

        // Factor 1: Text length
        if (original.length > 1000) score += 3;
        else if (original.length > 500) score += 2;
        else if (original.length > 200) score += 1;

        // Factor 2: Technical depth keywords
        const complexKeywords = [
            'distributed', 'scalable', 'architecture', 'microservices',
            'optimization', 'algorithm', 'performance', 'concurrent',
            'async', 'parallel', 'database design', 'system design',
            'load balancing', 'caching', 'security', 'authentication'
        ];

        for (const keyword of complexKeywords) {
            if (lower.includes(keyword)) score += 2;
        }

        // Factor 3: Multiple requirements
        const requirementIndicators = ['and', 'also', 'additionally', 'furthermore', 'plus'];
        let requirementCount = 0;
        for (const indicator of requirementIndicators) {
            if (lower.includes(indicator)) requirementCount++;
        }
        score += Math.min(requirementCount, 3);

        // Factor 4: Specific technical terms
        const expertTerms = [
            'kubernetes', 'docker', 'terraform', 'aws', 'gcp', 'azure',
            'react', 'vue', 'angular', 'typescript', 'graphql',
            'postgresql', 'mongodb', 'redis', 'kafka', 'rabbitmq'
        ];

        let techTermCount = 0;
        for (const term of expertTerms) {
            if (lower.includes(term)) techTermCount++;
        }
        if (techTermCount >= 3) score += 2;
        else if (techTermCount >= 1) score += 1;

        // Map score to complexity level
        let level: ComplexityLevel;
        let confidence: number;

        if (score >= 8) {
            level = ComplexityLevel.EXPERT;
            confidence = 0.75;
        } else if (score >= 5) {
            level = ComplexityLevel.COMPLEX;
            confidence = 0.70;
        } else if (score >= 2) {
            level = ComplexityLevel.MODERATE;
            confidence = 0.65;
        } else {
            level = ComplexityLevel.SIMPLE;
            confidence = 0.60;
        }

        return { level, confidence };
    }

    /**
     * Extract domain from text
     */
    private extractDomain(text: string): string[] {
        const domains: string[] = [];

        const domainPatterns = [
            { domain: 'web_frontend', keywords: ['react', 'vue', 'angular', 'svelte', 'frontend', 'ui', 'component'] },
            { domain: 'web_backend', keywords: ['api', 'server', 'backend', 'endpoint', 'express', 'fastify'] },
            { domain: 'data_science', keywords: ['data', 'ml', 'machine learning', 'pandas', 'numpy', 'analysis'] },
            { domain: 'devops', keywords: ['docker', 'kubernetes', 'ci/cd', 'deployment', 'infrastructure'] },
            { domain: 'systems', keywords: ['system', 'architecture', 'distributed', 'microservice'] },
            { domain: 'mobile', keywords: ['mobile', 'ios', 'android', 'react native', 'flutter'] }
        ];

        for (const pattern of domainPatterns) {
            for (const keyword of pattern.keywords) {
                if (text.includes(keyword)) {
                    if (!domains.includes(pattern.domain)) {
                        domains.push(pattern.domain);
                    }
                    break;
                }
            }
        }

        return domains.length > 0 ? domains : ['general'];
    }
}
