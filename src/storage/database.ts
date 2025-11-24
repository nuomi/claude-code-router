/**
 * Database class for ICCR v1.0
 * Handles all SQLite operations for model profiles, routing decisions, and outcomes
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import {
    ModelProfile,
    ModelProfileRow,
    RoutingDecision,
    RoutingDecisionRow,
    RoutingOutcome,
    RoutingOutcomeRow,
    ClassificationResult,
    ClassificationCacheRow
} from '../semantic/types';

export class ICCRDatabase {
    private db: Database.Database;
    private dbPath: string;

    constructor(dbPath?: string) {
        // Default path: ~/.claude-code-router/iccr.db
        this.dbPath = dbPath || path.join(homedir(), '.claude-code-router', 'iccr.db');

        // Ensure directory exists
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Open database
        this.db = new Database(this.dbPath);

        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');

        // Performance optimizations
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');

        console.log(`[ICCR Database] Opened at ${this.dbPath}`);
    }

    // ============================================================================
    // Model Profiles
    // ============================================================================

    /**
     * Get model profile by provider and model name
     */
    getModelProfile(provider: string, model: string): ModelProfile | null {
        const row = this.db.prepare(`
      SELECT * FROM model_profiles 
      WHERE provider = ? AND model = ?
    `).get(provider, model) as ModelProfileRow | undefined;

        return row ? this.rowToProfile(row) : null;
    }

    /**
     * Get all model profiles
     */
    getAllModelProfiles(): ModelProfile[] {
        const rows = this.db.prepare(`
      SELECT * FROM model_profiles 
      ORDER BY last_updated DESC
    `).all() as ModelProfileRow[];

        return rows.map(row => this.rowToProfile(row));
    }

    /**
     * Save or update model profile
     */
    saveModelProfile(profile: ModelProfile): void {
        const stmt = this.db.prepare(`
      INSERT INTO model_profiles (
        provider, model, strengths, weaknesses,
        quality_score, cost_per_1m_tokens, avg_latency_ms, supports_reasoning,
        success_rates, source, sample_count, last_updated, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, model) DO UPDATE SET
        strengths = excluded.strengths,
        weaknesses = excluded.weaknesses,
        quality_score = excluded.quality_score,
        cost_per_1m_tokens = excluded.cost_per_1m_tokens,
        avg_latency_ms = excluded.avg_latency_ms,
        supports_reasoning = excluded.supports_reasoning,
        success_rates = excluded.success_rates,
        source = excluded.source,
        sample_count = excluded.sample_count,
        last_updated = excluded.last_updated
    `);

        const now = Date.now();
        stmt.run(
            profile.provider,
            profile.model,
            JSON.stringify(profile.strengths),
            JSON.stringify(profile.weaknesses),
            profile.quality_score,
            profile.cost_per_1m_tokens,
            profile.avg_latency_ms,
            profile.supports_reasoning ? 1 : 0,
            JSON.stringify(profile.success_rates),
            profile.source,
            profile.sample_count,
            profile.last_updated || now,
            now
        );
    }

    /**
     * Delete model profile
     */
    deleteModelProfile(provider: string, model: string): void {
        this.db.prepare(`
      DELETE FROM model_profiles 
      WHERE provider = ? AND model = ?
    `).run(provider, model);
    }

    /**
     * Reset all learned profiles (keep public_benchmark and user_configured)
     */
    resetLearnedProfiles(): number {
        const result = this.db.prepare(`
      DELETE FROM model_profiles 
      WHERE source = 'learned_from_usage'
    `).run();

        return result.changes;
    }

    // ============================================================================
    // Routing Decisions
    // ============================================================================

    /**
     * Save routing decision
     */
    saveRoutingDecision(
        requestId: string,
        sessionId: string | null,
        classification: ClassificationResult,
        decision: RoutingDecision
    ): number {
        const stmt = this.db.prepare(`
      INSERT INTO routing_decisions (
        request_id, session_id, timestamp,
        intent, complexity, domain, confidence, reasoning,
        selected_provider, selected_model, decision_reasoning,
        estimated_cost, estimated_quality, estimated_latency,
        alternatives
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const result = stmt.run(
            requestId,
            sessionId,
            Date.now(),
            classification.intent,
            classification.complexity,
            JSON.stringify(classification.domain),
            classification.confidence,
            classification.reasoning,
            decision.provider,
            decision.model,
            decision.reasoning,
            decision.estimatedCost,
            decision.estimatedQuality,
            decision.estimatedLatency,
            JSON.stringify(decision.alternatives)
        );

        return result.lastInsertRowid as number;
    }

    /**
     * Get routing decision by request ID
     */
    getRoutingDecision(requestId: string): RoutingDecisionRow | null {
        return this.db.prepare(`
      SELECT * FROM routing_decisions 
      WHERE request_id = ?
    `).get(requestId) as RoutingDecisionRow | null;
    }

    // ============================================================================
    // Routing Outcomes
    // ============================================================================

    /**
     * Save routing outcome
     */
    saveRoutingOutcome(outcome: RoutingOutcome): void {
        const stmt = this.db.prepare(`
      INSERT INTO routing_outcomes (
        decision_id, timestamp, success, quality, actual_cost, actual_latency,
        error_occurred, error_message, error_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            outcome.decisionId,
            outcome.timestamp,
            outcome.success ? 1 : 0,
            outcome.quality,
            outcome.actualCost,
            outcome.actualLatency,
            outcome.errorOccurred ? 1 : 0,
            outcome.errorMessage || null,
            outcome.errorType || null
        );
    }

    /**
     * Get outcomes for a specific model
     */
    getModelOutcomes(provider: string, model: string, limit: number = 100): RoutingOutcomeRow[] {
        return this.db.prepare(`
      SELECT o.* FROM routing_outcomes o
      JOIN routing_decisions d ON o.decision_id = d.id
      WHERE d.selected_provider = ? AND d.selected_model = ?
      ORDER BY o.timestamp DESC
      LIMIT ?
    `).all(provider, model, limit) as RoutingOutcomeRow[];
    }

    // ============================================================================
    // Classification Cache
    // ============================================================================

    /**
     * Get cached classification
     */
    getCachedClassification(requestHash: string): ClassificationResult | null {
        const row = this.db.prepare(`
      SELECT * FROM classification_cache 
      WHERE request_hash = ? AND expires_at > ?
    `).get(requestHash, Date.now()) as ClassificationCacheRow | undefined;

        if (!row) return null;

        // Update hit count
        this.db.prepare(`
      UPDATE classification_cache 
      SET hit_count = hit_count + 1 
      WHERE id = ?
    `).run(row.id);

        return {
            intent: row.intent as any,
            complexity: row.complexity as any,
            domain: JSON.parse(row.domain),
            confidence: row.confidence,
            reasoning: row.reasoning
        };
    }

    /**
     * Save classification to cache
     */
    saveCachedClassification(
        requestHash: string,
        requestText: string,
        classification: ClassificationResult,
        ttlSeconds: number = 3600
    ): void {
        const now = Date.now();
        const expiresAt = now + (ttlSeconds * 1000);

        this.db.prepare(`
      INSERT INTO classification_cache (
        request_hash, request_text, intent, complexity, domain,
        confidence, reasoning, created_at, expires_at, hit_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(request_hash) DO UPDATE SET
        intent = excluded.intent,
        complexity = excluded.complexity,
        domain = excluded.domain,
        confidence = excluded.confidence,
        reasoning = excluded.reasoning,
        expires_at = excluded.expires_at
    `).run(
            requestHash,
            requestText,
            classification.intent,
            classification.complexity,
            JSON.stringify(classification.domain),
            classification.confidence,
            classification.reasoning,
            now,
            expiresAt
        );
    }

    /**
     * Clean expired cache entries
     */
    cleanExpiredCache(): number {
        const result = this.db.prepare(`
      DELETE FROM classification_cache 
      WHERE expires_at < ?
    `).run(Date.now());

        return result.changes;
    }

    // ============================================================================
    // Utilities
    // ============================================================================

    /**
     * Convert database row to ModelProfile
     */
    private rowToProfile(row: ModelProfileRow): ModelProfile {
        return {
            provider: row.provider,
            model: row.model,
            strengths: JSON.parse(row.strengths),
            weaknesses: JSON.parse(row.weaknesses),
            quality_score: row.quality_score,
            cost_per_1m_tokens: row.cost_per_1m_tokens,
            avg_latency_ms: row.avg_latency_ms,
            supports_reasoning: row.supports_reasoning === 1,
            success_rates: JSON.parse(row.success_rates),
            source: row.source as any,
            sample_count: row.sample_count,
            last_updated: row.last_updated
        };
    }

    /**
     * Get database statistics
     */
    getStats(): {
        profiles: number;
        decisions: number;
        outcomes: number;
        cacheEntries: number;
    } {
        const profiles = this.db.prepare('SELECT COUNT(*) as count FROM model_profiles').get() as { count: number };
        const decisions = this.db.prepare('SELECT COUNT(*) as count FROM routing_decisions').get() as { count: number };
        const outcomes = this.db.prepare('SELECT COUNT(*) as count FROM routing_outcomes').get() as { count: number };
        const cache = this.db.prepare('SELECT COUNT(*) as count FROM classification_cache').get() as { count: number };

        return {
            profiles: profiles.count,
            decisions: decisions.count,
            outcomes: outcomes.count,
            cacheEntries: cache.count
        };
    }

    /**
     * Close database connection
     */
    close(): void {
        this.db.close();
        console.log('[ICCR Database] Closed');
    }

    /**
     * Run vacuum to optimize database
     */
    vacuum(): void {
        this.db.prepare('VACUUM').run();
    }
}
