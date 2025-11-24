import { ICCRDatabase } from './storage/database.js';
import { MigrationManager } from './storage/migrations.js';
import { SemanticRouter } from './semantic/index.js';
import { ModelSelector } from './selection/model-selector.js';
import { ModelProfileLearner } from './learning/profile-learner.js';
import { initializeDefaultProfiles } from './learning/default-profiles.js';
import {
    SemanticRoutingConfig,
    ClassificationResult,
    RoutingDecision,
    IntentType,
    ComplexityLevel
} from './semantic/types.js';
import * as path from 'path';
import * as os from 'os';

export interface ICCRConfig {
    semanticRouting: SemanticRoutingConfig;
    availableModels: Array<{ provider: string; model: string }>;
    databasePath?: string;
}

export interface RouteRequest {
    text: string;
    context?: {
        sessionId?: string;
        userId?: string;
        metadata?: Record<string, any>;
    };
}

export interface RouteResponse {
    provider: string;
    model: string;
    classification: ClassificationResult;
    decision: RoutingDecision;
    requestId: string;
}

/**
 * ICCRRouter - Main integration class for Intelligent Claude Code Router
 * 
 * Orchestrates:
 * - Semantic classification (LLM + rule-based fallback)
 * - Model selection (scoring algorithm with learned profiles)
 * - Outcome tracking and learning
 */
export class ICCRRouter {
    private db: ICCRDatabase;
    private semanticRouter: SemanticRouter;
    private modelSelector: ModelSelector;
    private profileLearner: ModelProfileLearner;
    private config: ICCRConfig;
    private initialized: boolean = false;

    constructor(config: ICCRConfig) {
        this.config = config;

        // Initialize database
        const dbPath = config.databasePath || path.join(
            os.homedir(),
            '.claude-code-router',
            'iccr.db'
        );

        this.db = new ICCRDatabase(dbPath);

        // Run migrations
        const migrationManager = new MigrationManager(this.db['db']);
        migrationManager.runMigrations();

        // Initialize components
        this.semanticRouter = new SemanticRouter(config.semanticRouting, this.db);

        this.modelSelector = new ModelSelector(this.db, {
            costWeight: config.semanticRouting.optimization?.costWeight || 1,
            qualityWeight: config.semanticRouting.optimization?.qualityWeight || 1,
            latencyWeight: config.semanticRouting.optimization?.latencyWeight || 1,
            minSampleSize: config.semanticRouting.learning?.minSamples || 5
        });

        this.profileLearner = new ModelProfileLearner(this.db, {
            learningRate: config.semanticRouting.learning?.learningRate || 0.1,
            minSamples: config.semanticRouting.learning?.minSamples || 5,
            strengthThreshold: config.semanticRouting.learning?.strengthThreshold || 0.85,
            weaknessThreshold: config.semanticRouting.learning?.weaknessThreshold || 0.50
        });

        console.log('[ICCRRouter] Initialized');
    }

    /**
     * Initialize router (load default profiles if needed)
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        // Load default profiles if database is empty
        await initializeDefaultProfiles(this.db);

        this.initialized = true;
        console.log('[ICCRRouter] Ready');
    }

    /**
     * Route a request to the best model
     * 
     * @param request - User request to route
     * @returns Routing decision with selected model
     */
    async route(request: RouteRequest): Promise<RouteResponse> {
        if (!this.initialized) {
            await this.initialize();
        }

        const startTime = Date.now();

        // Step 1: Classify the request
        console.log(`[ICCRRouter] Classifying request: "${request.text.substring(0, 50)}..."`);
        const classification = await this.semanticRouter.classify(request.text);

        console.log(`[ICCRRouter] Classification: ${classification.intent} (${classification.complexity}), ` +
            `confidence: ${classification.confidence.toFixed(2)}`);

        // Step 2: Select best model
        const decision = await this.modelSelector.selectModel(
            classification,
            this.config.availableModels
        );

        console.log(`[ICCRRouter] Selected: ${decision.provider}/${decision.model} ` +
            `(score: ${decision.confidence.toFixed(3)})`);

        // Step 3: Record routing decision
        const requestId = this.generateRequestId();

        this.db.saveRoutingDecision(
            requestId,
            request.context?.sessionId || null,
            classification,
            decision
        );

        const routingTime = Date.now() - startTime;
        console.log(`[ICCRRouter] Routing completed in ${routingTime}ms`);

        return {
            provider: decision.provider,
            model: decision.model,
            classification,
            decision,
            requestId
        };
    }

    /**
     * Record outcome of a routed request (for learning)
     * 
     * @param requestId - ID from route() response
     * @param outcome - Actual outcome data
     */
    async recordOutcome(
        requestId: string,
        outcome: {
            success: boolean;
            quality?: number;        // 0-1 scale (optional)
            actualCost?: number;     // USD per 1M tokens (optional)
            actualLatency?: number;  // milliseconds (optional)
            error?: string;
        }
    ): Promise<void> {
        console.log(`[ICCRRouter] Recording outcome for request ${requestId}: ` +
            `success=${outcome.success}`);

        // Get the routing decision
        const decisions = this.db.getAllRoutingDecisions();
        const decision = decisions.find(d => d.request_id === requestId);

        if (!decision) {
            console.warn(`[ICCRRouter] No decision found for request ${requestId}`);
            return;
        }

        // Save outcome to database
        this.db.saveRoutingOutcome({
            decisionId: decision.id.toString(),
            timestamp: Date.now(),
            success: outcome.success,
            quality: outcome.quality || (outcome.success ? 0.8 : 0.3),
            actualCost: outcome.actualCost || 0,
            actualLatency: outcome.actualLatency || 0,
            errorOccurred: !outcome.success,
            errorMessage: outcome.error,
            errorType: outcome.error ? 'unknown' : undefined
        });

        // Update model profile (learning)
        if (this.config.semanticRouting.learning?.enabled !== false) {
            await this.profileLearner.updateProfile({
                provider: decision.selected_provider,
                model: decision.selected_model,
                intent: decision.intent as IntentType,
                complexity: decision.complexity as ComplexityLevel,
                success: outcome.success,
                quality: outcome.quality || (outcome.success ? 0.8 : 0.3),
                cost: outcome.actualCost || 0,
                latency: outcome.actualLatency || 0
            });
        }

        console.log(`[ICCRRouter] Outcome recorded and profile updated`);
    }

    /**
     * Get router information
     */
    getInfo(): {
        enabled: boolean;
        hasLLM: boolean;
        modelCount: number;
        totalDecisions: number;
    } {
        const profiles = this.db.getAllModelProfiles();
        const decisions = this.db.getAllRoutingDecisions();

        return {
            enabled: this.config.semanticRouting.enabled,
            hasLLM: this.semanticRouter.hasLLMClassifier(),
            modelCount: profiles.length,
            totalDecisions: decisions.length
        };
    }

    /**
     * Get database instance (for CLI tools)
     */
    getDatabase(): ICCRDatabase {
        return this.db;
    }

    /**
     * Get profile learner (for CLI tools)
     */
    getProfileLearner(): ModelProfileLearner {
        return this.profileLearner;
    }

    /**
     * Close database connection
     */
    close(): void {
        this.db.close();
        console.log('[ICCRRouter] Closed');
    }

    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
