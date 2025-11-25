/**
 * Database migration system for ICCR
 * Handles schema versioning and migrations
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

export class MigrationManager {
    private db: Database.Database;
    private migrationsDir: string;

    constructor(db: Database.Database, migrationsDir?: string) {
        this.db = db;
        this.migrationsDir = migrationsDir || this.resolveMigrationsDir();
        console.log(`[Migrations] Looking for migrations in: ${this.migrationsDir}`);
    }

    private resolveMigrationsDir(): string {
        // Try relative to dist (bundled)
        const distPath = path.join(__dirname, '../migrations');
        if (fs.existsSync(distPath)) {
            return distPath;
        }

        // Try relative to src/storage (source)
        const srcPath = path.join(__dirname, '../../migrations');
        if (fs.existsSync(srcPath)) {
            return srcPath;
        }

        // Fallback to default (source path)
        return srcPath;
    }

    /**
     * Run all pending migrations
     */
    async runMigrations(): Promise<void> {
        // Get current schema version
        const currentVersion = this.getCurrentVersion();
        console.log(`[Migrations] Current schema version: ${currentVersion}`);

        // Get all migration files
        const migrations = this.getMigrationFiles();

        if (migrations.length === 0) {
            console.log('[Migrations] No migration files found');
            return;
        }

        // Filter pending migrations
        const pending = migrations.filter(m => m.version > currentVersion);

        if (pending.length === 0) {
            console.log('[Migrations] Database is up to date');
            return;
        }

        console.log(`[Migrations] Running ${pending.length} pending migration(s)...`);

        // Run each migration in a transaction
        for (const migration of pending) {
            console.log(`[Migrations] Running migration ${migration.version}: ${migration.name}`);

            try {
                this.runMigration(migration);
                this.setCurrentVersion(migration.version);
                console.log(`[Migrations] ✓ Migration ${migration.version} completed`);
            } catch (error) {
                console.error(`[Migrations] ✗ Migration ${migration.version} failed:`, error);
                throw error;
            }
        }

        console.log('[Migrations] All migrations completed successfully');
    }

    /**
     * Get current schema version from metadata table
     */
    private getCurrentVersion(): number {
        try {
            const row = this.db.prepare(`
        SELECT value FROM metadata WHERE key = 'schema_version'
      `).get() as { value: string } | undefined;

            return row ? parseInt(row.value, 10) : 0;
        } catch (error) {
            // Metadata table doesn't exist yet, version is 0
            return 0;
        }
    }

    /**
     * Update schema version in metadata table
     */
    private setCurrentVersion(version: number): void {
        this.db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value, updated_at)
      VALUES ('schema_version', ?, ?)
    `).run(version.toString(), Date.now());
    }

    /**
     * Get all migration files sorted by version
     */
    private getMigrationFiles(): Array<{
        version: number;
        name: string;
        path: string;
    }> {
        if (!fs.existsSync(this.migrationsDir)) {
            return [];
        }

        const files = fs.readdirSync(this.migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        return files.map(file => {
            // Parse version from filename (e.g., "001_initial_schema.sql")
            const match = file.match(/^(\d+)_(.+)\.sql$/);
            if (!match) {
                throw new Error(`Invalid migration filename: ${file}`);
            }

            return {
                version: parseInt(match[1], 10),
                name: match[2],
                path: path.join(this.migrationsDir, file)
            };
        });
    }

    /**
     * Run a single migration file
     */
    private runMigration(migration: { version: number; name: string; path: string }): void {
        const sql = fs.readFileSync(migration.path, 'utf-8');

        // Run in transaction
        const transaction = this.db.transaction(() => {
            this.db.exec(sql);
        });

        transaction();
    }

    /**
     * Initialize database with schema if needed
     */
    static async initialize(db: Database.Database): Promise<void> {
        const manager = new MigrationManager(db);
        await manager.runMigrations();
    }
}
