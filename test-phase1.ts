/**
 * Test script for ICCR Phase 1 implementation
 * Tests database, migrations, and default profiles
 */

import { ICCRDatabase } from './src/storage/database';
import { MigrationManager } from './src/storage/migrations';
import { initializeDefaultProfiles } from './src/learning/default-profiles';
import { IntentType, ComplexityLevel } from './src/semantic/types';
import * as fs from 'fs';
import * as path from 'path';

async function testPhase1() {
    console.log('='.repeat(60));
    console.log('ICCR Phase 1 Test Suite');
    console.log('='.repeat(60));
    console.log('');

    // Use a test database
    const testDbPath = path.join(__dirname, 'test-iccr.db');

    // Clean up old test database
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
        console.log('✓ Cleaned up old test database\n');
    }

    try {
        // Test 1: Database Creation
        console.log('Test 1: Database Creation');
        console.log('-'.repeat(60));
        const db = new ICCRDatabase(testDbPath);
        console.log('✓ Database created successfully\n');

        // Test 2: Run Migrations
        console.log('Test 2: Run Migrations');
        console.log('-'.repeat(60));
        await MigrationManager.initialize(db['db']);
        console.log('✓ Migrations completed\n');

        // Test 3: Initialize Default Profiles
        console.log('Test 3: Initialize Default Profiles');
        console.log('-'.repeat(60));
        await initializeDefaultProfiles(db);
        const profiles = db.getAllModelProfiles();
        console.log(`✓ Loaded ${profiles.length} default profiles:`);
        profiles.forEach(p => {
            console.log(`  - ${p.provider}/${p.model} (quality: ${p.quality_score})`);
        });
        console.log('');

        // Test 4: Get Specific Profile
        console.log('Test 4: Get Specific Profile');
        console.log('-'.repeat(60));
        const deepseekProfile = db.getModelProfile('deepseek', 'deepseek-chat');
        if (deepseekProfile) {
            console.log('✓ Retrieved deepseek-chat profile:');
            console.log(`  Quality: ${deepseekProfile.quality_score}`);
            console.log(`  Cost: $${deepseekProfile.cost_per_1m_tokens}/1M tokens`);
            console.log(`  Latency: ${deepseekProfile.avg_latency_ms}ms`);
            console.log(`  Strengths: ${deepseekProfile.strengths.join(', ')}`);
        } else {
            throw new Error('Failed to retrieve deepseek-chat profile');
        }
        console.log('');

        // Test 5: Update Profile
        console.log('Test 5: Update Profile');
        console.log('-'.repeat(60));
        if (deepseekProfile) {
            deepseekProfile.quality_score = 0.90;
            deepseekProfile.sample_count = 10;
            deepseekProfile.success_rates = {
                'code_generation_moderate': { rate: 0.92, count: 10 }
            };
            db.saveModelProfile(deepseekProfile);

            const updated = db.getModelProfile('deepseek', 'deepseek-chat');
            if (updated && updated.quality_score === 0.90) {
                console.log('✓ Profile updated successfully');
                console.log(`  New quality score: ${updated.quality_score}`);
                console.log(`  Sample count: ${updated.sample_count}`);
            } else {
                throw new Error('Profile update failed');
            }
        }
        console.log('');

        // Test 6: Save Routing Decision
        console.log('Test 6: Save Routing Decision');
        console.log('-'.repeat(60));
        const decisionId = db.saveRoutingDecision(
            'test-request-1',
            'test-session-1',
            {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web_backend'],
                confidence: 0.92,
                reasoning: 'Test classification'
            },
            {
                provider: 'deepseek',
                model: 'deepseek-chat',
                confidence: 0.89,
                reasoning: 'Test decision',
                estimatedCost: 0.001,
                estimatedQuality: 0.85,
                estimatedLatency: 1200,
                alternatives: []
            }
        );
        console.log(`✓ Routing decision saved with ID: ${decisionId}\n`);

        // Test 7: Save Routing Outcome
        console.log('Test 7: Save Routing Outcome');
        console.log('-'.repeat(60));
        db.saveRoutingOutcome({
            decisionId: decisionId.toString(),
            timestamp: Date.now(),
            success: true,
            quality: 0.9,
            actualCost: 0.0012,
            actualLatency: 1150,
            errorOccurred: false
        });
        console.log('✓ Routing outcome saved\n');

        // Test 8: Classification Cache
        console.log('Test 8: Classification Cache');
        console.log('-'.repeat(60));
        const testHash = 'test-hash-123';
        db.saveCachedClassification(
            testHash,
            'Create a React component',
            {
                intent: IntentType.CODE_GENERATION,
                complexity: ComplexityLevel.MODERATE,
                domain: ['web_frontend'],
                confidence: 0.95,
                reasoning: 'Cached test'
            },
            3600
        );

        const cached = db.getCachedClassification(testHash);
        if (cached && cached.intent === IntentType.CODE_GENERATION) {
            console.log('✓ Classification cached and retrieved successfully');
            console.log(`  Intent: ${cached.intent}`);
            console.log(`  Confidence: ${cached.confidence}`);
        } else {
            throw new Error('Cache test failed');
        }
        console.log('');

        // Test 9: Database Statistics
        console.log('Test 9: Database Statistics');
        console.log('-'.repeat(60));
        const stats = db.getStats();
        console.log('✓ Database statistics:');
        console.log(`  Profiles: ${stats.profiles}`);
        console.log(`  Decisions: ${stats.decisions}`);
        console.log(`  Outcomes: ${stats.outcomes}`);
        console.log(`  Cache entries: ${stats.cacheEntries}`);
        console.log('');

        // Test 10: Clean Up
        console.log('Test 10: Clean Up');
        console.log('-'.repeat(60));
        db.close();
        console.log('✓ Database closed\n');

        // Final Summary
        console.log('='.repeat(60));
        console.log('✅ ALL TESTS PASSED!');
        console.log('='.repeat(60));
        console.log('');
        console.log('Phase 1 implementation is working correctly:');
        console.log('  ✓ Database creation and migrations');
        console.log('  ✓ Default profile loading');
        console.log('  ✓ Profile CRUD operations');
        console.log('  ✓ Routing decision tracking');
        console.log('  ✓ Outcome collection');
        console.log('  ✓ Classification caching');
        console.log('  ✓ Statistics and utilities');
        console.log('');
        console.log(`Test database created at: ${testDbPath}`);
        console.log('You can inspect it with: sqlite3 test-iccr.db');
        console.log('');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        process.exit(1);
    }
}

// Run tests
testPhase1().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
