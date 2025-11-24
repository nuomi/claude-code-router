/**
 * Load default model profiles
 * These profiles are shipped with ICCR and used as initial data
 */

import * as fs from 'fs';
import * as path from 'path';
import { ModelProfile } from '../semantic/types';

export function loadDefaultProfiles(): ModelProfile[] {
    const profilesPath = path.join(__dirname, '../../data/default-model-profiles.json');

    if (!fs.existsSync(profilesPath)) {
        console.warn('[DefaultProfiles] default-model-profiles.json not found');
        return [];
    }

    try {
        const data = fs.readFileSync(profilesPath, 'utf-8');
        const parsed = JSON.parse(data);

        if (!parsed.profiles || !Array.isArray(parsed.profiles)) {
            console.error('[DefaultProfiles] Invalid format in default-model-profiles.json');
            return [];
        }

        console.log(`[DefaultProfiles] Loaded ${parsed.profiles.length} default profiles`);
        return parsed.profiles;
    } catch (error) {
        console.error('[DefaultProfiles] Failed to load default profiles:', error);
        return [];
    }
}

/**
 * Initialize database with default profiles if empty
 */
export async function initializeDefaultProfiles(db: any): Promise<void> {
    // Check if we already have profiles
    const existingProfiles = db.getAllModelProfiles();

    if (existingProfiles.length > 0) {
        console.log(`[DefaultProfiles] Database already has ${existingProfiles.length} profiles, skipping initialization`);
        return;
    }

    // Load and save default profiles
    const defaultProfiles = loadDefaultProfiles();

    if (defaultProfiles.length === 0) {
        console.warn('[DefaultProfiles] No default profiles to initialize');
        return;
    }

    console.log(`[DefaultProfiles] Initializing database with ${defaultProfiles.length} default profiles...`);

    for (const profile of defaultProfiles) {
        db.saveModelProfile(profile);
    }

    console.log('[DefaultProfiles] ✓ Default profiles initialized');
}
