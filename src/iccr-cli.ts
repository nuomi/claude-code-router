#!/usr/bin/env node
/**
 * ICCR (Intelligent Claude Code Router) - Standalone CLI
 * 
 * This is a separate command-line tool for managing the intelligent routing system.
 * It can be installed alongside the main CCR without conflicts.
 */

import { ICCRRouter } from "./iccr-router";
import {
    listModels,
    showModel,
    resetModel,
    exportProfiles,
    importProfiles,
    testClassify,
    showStats
} from "./cli/iccr-commands";

const command = process.argv[2];

const HELP_TEXT = `
╔════════════════════════════════════════════════════════════════════════════╗
║  ICCR - Intelligent Claude Code Router                                    ║
╚════════════════════════════════════════════════════════════════════════════╝

Usage: iccr <command> [options]

Commands:
  models          Manage learned model profiles
    list            List all model profiles
    show <p>/<m>    Show detailed profile for provider/model
    reset <p>/<m>   Reset learning data for provider/model
    stats           Show routing statistics
    export [file]   Export profiles (default: iccr-profiles.json)
    import <file>   Import profiles from file

  classify <text> Test semantic classification on input text

  -v, version     Show version information
  -h, help        Show this help information

Examples:
  iccr models list
  iccr models show anthropic/claude-3-5-sonnet-20241022
  iccr models stats
  iccr classify "Create a React login component"
  iccr models export my-profiles.json

Database Location: ~/.iccr/iccr.db
`;

async function getICCRRouter() {
    const router = new ICCRRouter({
        semanticRouting: { enabled: true },
        availableModels: [],
        // Use ~/.iccr directory for ICCR-specific data
        databasePath: require('path').join(require('os').homedir(), '.iccr', 'iccr.db')
    });
    await router.initialize();
    return router;
}

async function main() {
    switch (command) {
        case "models": {
            const subcommand = process.argv[3];
            const router = await getICCRRouter();
            const db = router.getDatabase();
            const learner = router.getProfileLearner();

            try {
                switch (subcommand) {
                    case "list":
                        listModels(db);
                        break;
                    case "stats":
                        showStats(db);
                        break;
                    case "show": {
                        const id = process.argv[4];
                        if (!id || !id.includes('/')) {
                            console.error("❌ Usage: iccr models show <provider>/<model>");
                            console.error("   Example: iccr models show anthropic/claude-3-5-sonnet-20241022");
                            process.exit(1);
                        }
                        const [provider, model] = id.split('/');
                        showModel(db, learner, provider, model);
                        break;
                    }
                    case "reset": {
                        const id = process.argv[4];
                        if (!id || !id.includes('/')) {
                            console.error("❌ Usage: iccr models reset <provider>/<model>");
                            process.exit(1);
                        }
                        const [provider, model] = id.split('/');
                        resetModel(learner, provider, model);
                        break;
                    }
                    case "export": {
                        const file = process.argv[4] || 'iccr-profiles.json';
                        exportProfiles(db, file);
                        break;
                    }
                    case "import": {
                        const file = process.argv[4];
                        if (!file) {
                            console.error("❌ Usage: iccr models import <file>");
                            process.exit(1);
                        }
                        importProfiles(db, file);
                        break;
                    }
                    default:
                        console.log(`
Usage: iccr models <command>

Commands:
  list                  List all model profiles
  show <p>/<m>          Show detailed profile
  reset <p>/<m>         Reset learning data
  stats                 Show routing statistics
  export [file]         Export profiles (default: iccr-profiles.json)
  import <file>         Import profiles
`);
                }
            } finally {
                router.close();
            }
            break;
        }

        case "classify": {
            const text = process.argv[3];
            if (!text) {
                console.error("❌ Usage: iccr classify <text>");
                console.error("   Example: iccr classify \"Create a React component\"");
                process.exit(1);
            }

            const router = await getICCRRouter();

            try {
                // @ts-ignore - Access private semanticRouter for testing
                await testClassify(router.semanticRouter, text);
            } finally {
                router.close();
            }
            break;
        }

        case "-v":
        case "version": {
            const { version } = require("../package.json");
            console.log(`iccr version: ${version}`);
            break;
        }

        case "-h":
        case "help":
        case undefined:
            console.log(HELP_TEXT);
            break;

        default:
            console.error(`❌ Unknown command: ${command}`);
            console.log(HELP_TEXT);
            process.exit(1);
    }
}

main().catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
});
