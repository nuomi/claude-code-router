import { ICCRRouter } from './iccr-router.js';
import { ICCRDatabase } from './storage/database.js';
import { ModelProfileLearner } from './learning/profile-learner.js';
import { SemanticRouter } from './semantic/index.js';
import * as fs from 'fs';

/**
 * CLI Commands for ICCR Model Management
 */

/**
 * List all model profiles
 */
export function listModels(db: ICCRDatabase): void {
    const profiles = db.getAllModelProfiles();

    if (profiles.length === 0) {
        console.log('No model profiles found.');
        return;
    }

    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           ICCR Model Profiles                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

    // Sort by provider, then model
    profiles.sort((a, b) => {
        if (a.provider !== b.provider) {
            return a.provider.localeCompare(b.provider);
        }
        return a.model.localeCompare(b.model);
    });

    for (const profile of profiles) {
        const quality = (profile.quality_score * 100).toFixed(0);
        const cost = profile.cost_per_1m_tokens > 0
            ? `$${profile.cost_per_1m_tokens.toFixed(2)}/1M`
            : 'Free';
        const latency = profile.avg_latency_ms > 0
            ? `${profile.avg_latency_ms.toFixed(0)}ms`
            : 'N/A';

        console.log(`📊 ${profile.provider}/${profile.model}`);
        console.log(`   Quality: ${quality}% | Cost: ${cost} | Latency: ${latency}`);
        console.log(`   Samples: ${profile.sample_count} | Source: ${profile.source}`);

        if (profile.strengths.length > 0) {
            console.log(`   ✓ Strengths: ${profile.strengths.join(', ')}`);
        }

        if (profile.weaknesses.length > 0) {
            console.log(`   ✗ Weaknesses: ${profile.weaknesses.join(', ')}`);
        }

        console.log('');
    }

    console.log(`Total: ${profiles.length} model(s)\n`);
}

/**
 * Show detailed profile for a specific model
 */
export function showModel(db: ICCRDatabase, learner: ModelProfileLearner, provider: string, model: string): void {
    const profile = db.getModelProfile(provider, model);

    if (!profile) {
        console.log(`❌ Model not found: ${provider}/${model}`);
        return;
    }

    const stats = learner.getModelStats(provider, model);

    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log(`║  ${provider}/${model}`.padEnd(77) + '║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('📈 Performance Metrics:');
    console.log(`   Quality Score:    ${(profile.quality_score * 100).toFixed(1)}%`);
    console.log(`   Cost per 1M:      $${profile.cost_per_1m_tokens.toFixed(2)}`);
    console.log(`   Avg Latency:      ${profile.avg_latency_ms.toFixed(0)}ms`);
    console.log(`   Reasoning:        ${profile.supports_reasoning ? 'Yes' : 'No'}`);
    console.log('');

    console.log('📊 Learning Data:');
    console.log(`   Total Samples:    ${profile.sample_count}`);
    console.log(`   Source:           ${profile.source}`);
    console.log(`   Last Updated:     ${new Date(profile.last_updated).toLocaleString()}`);
    console.log('');

    if (profile.strengths.length > 0) {
        console.log(`✓ Strengths: ${profile.strengths.join(', ')}`);
    }

    if (profile.weaknesses.length > 0) {
        console.log(`✗ Weaknesses: ${profile.weaknesses.join(', ')}`);
    }

    if (stats && stats.intentBreakdown.length > 0) {
        console.log('\n📋 Success Rates by Intent:');
        for (const item of stats.intentBreakdown) {
            const rate = (item.successRate * 100).toFixed(0);
            const bar = '█'.repeat(Math.floor(item.successRate * 20));
            console.log(`   ${item.intent.padEnd(15)} (${item.complexity.padEnd(8)}): ${bar.padEnd(20)} ${rate}% (${item.sampleCount} samples)`);
        }
    }

    console.log('');
}

/**
 * Reset learning data for a model
 */
export function resetModel(learner: ModelProfileLearner, provider: string, model: string): void {
    console.log(`\n🔄 Resetting learning data for ${provider}/${model}...`);
    learner.resetModelProfile(provider, model);
    console.log('✅ Reset complete\n');
}

/**
 * Export all profiles to JSON file
 */
export function exportProfiles(db: ICCRDatabase, outputPath: string): void {
    const profiles = db.getAllModelProfiles();

    const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        profileCount: profiles.length,
        profiles
    };

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

    console.log(`\n✅ Exported ${profiles.length} profile(s) to ${outputPath}\n`);
}

/**
 * Import profiles from JSON file
 */
export function importProfiles(db: ICCRDatabase, inputPath: string): void {
    if (!fs.existsSync(inputPath)) {
        console.log(`❌ File not found: ${inputPath}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

    if (!data.profiles || !Array.isArray(data.profiles)) {
        console.log('❌ Invalid profile file format');
        return;
    }

    console.log(`\n📥 Importing ${data.profiles.length} profile(s)...`);

    let imported = 0;
    let skipped = 0;

    for (const profile of data.profiles) {
        const existing = db.getModelProfile(profile.provider, profile.model);

        if (existing && existing.sample_count > profile.sample_count) {
            console.log(`   ⏭️  Skipped ${profile.provider}/${profile.model} (existing has more samples)`);
            skipped++;
        } else {
            db.saveModelProfile(profile);
            console.log(`   ✓ Imported ${profile.provider}/${profile.model}`);
            imported++;
        }
    }

    console.log(`\n✅ Import complete: ${imported} imported, ${skipped} skipped\n`);
}

/**
 * Test classification on a text input
 */
export async function testClassify(router: SemanticRouter, text: string): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         Classification Test                                ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`📝 Input: "${text}"\n`);

    const startTime = Date.now();
    const result = await router.classify(text);
    const elapsed = Date.now() - startTime;

    console.log('📊 Classification Result:');
    console.log(`   Intent:       ${result.intent}`);
    console.log(`   Complexity:   ${result.complexity}`);
    console.log(`   Domain:       ${result.domain.join(', ')}`);
    console.log(`   Confidence:   ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Reasoning:    ${result.reasoning}`);
    console.log(`   Time:         ${elapsed}ms`);
    console.log('');
}

/**
 * Show routing statistics
 */
export function showStats(db: ICCRDatabase): void {
    const profiles = db.getAllModelProfiles();
    const decisions = db.getAllRoutingDecisions();

    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                          ICCR Statistics                                   ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Overall:');
    console.log(`   Total Models:     ${profiles.length}`);
    console.log(`   Total Decisions:  ${decisions.length}`);

    const totalSamples = profiles.reduce((sum, p) => sum + p.sample_count, 0);
    console.log(`   Total Samples:    ${totalSamples}`);
    console.log('');

    // Model usage breakdown
    const modelUsage: Record<string, number> = {};
    for (const decision of decisions) {
        const key = `${decision.selected_provider}/${decision.selected_model}`;
        modelUsage[key] = (modelUsage[key] || 0) + 1;
    }

    if (Object.keys(modelUsage).length > 0) {
        console.log('📈 Most Used Models:');
        const sorted = Object.entries(modelUsage).sort((a, b) => b[1] - a[1]);
        for (const [model, count] of sorted.slice(0, 5)) {
            const percentage = ((count / decisions.length) * 100).toFixed(1);
            console.log(`   ${model.padEnd(40)} ${count} (${percentage}%)`);
        }
        console.log('');
    }

    // Intent breakdown
    const intentCounts: Record<string, number> = {};
    for (const decision of decisions) {
        intentCounts[decision.intent] = (intentCounts[decision.intent] || 0) + 1;
    }

    if (Object.keys(intentCounts).length > 0) {
        console.log('🎯 Intent Distribution:');
        const sorted = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]);
        for (const [intent, count] of sorted) {
            const percentage = ((count / decisions.length) * 100).toFixed(1);
            const bar = '█'.repeat(Math.floor((count / decisions.length) * 30));
            console.log(`   ${intent.padEnd(20)} ${bar.padEnd(30)} ${percentage}%`);
        }
        console.log('');
    }
}
