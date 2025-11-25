# ICCR CLI - Quick Reference

## Overview

`iccr` is a standalone command-line tool for managing the Intelligent Claude Code Router. It can be installed alongside `ccr` without conflicts.

**Key Differences:**
- **`ccr`**: Main Claude Code Router server and routing commands
- **`iccr`**: ICCR-specific model management and classification tools

**Data Isolation:**
- `ccr`: Uses `~/.claude-code-router/` directory
- `iccr`: Uses `~/.iccr/` directory

## Installation

```bash
npm install -g @musistudio/claude-code-router
```

This installs both `ccr` and `iccr` commands globally.

## Commands

### Model Management

```bash
# List all learned model profiles
iccr models list

# Show detailed profile for a specific model
iccr models show anthropic/claude-3-5-sonnet-20241022

# View routing statistics
iccr models stats

# Reset learning data for a model
iccr models reset anthropic/claude-3-5-sonnet-20241022

# Export profiles to JSON
iccr models export my-profiles.json

# Import profiles from JSON
iccr models import my-profiles.json
```

### Classification Testing

```bash
# Test how ICCR classifies a request
iccr classify "Create a React login component"
iccr classify "Debug this memory leak"
iccr classify "Design a microservices architecture"
```

### Other

```bash
# Show version
iccr --version

# Show help
iccr --help
```

## Database Location

All ICCR data is stored in:
```
~/.iccr/iccr.db
```

This is separate from the main CCR database (`~/.claude-code-router/iccr.db`), allowing both tools to coexist peacefully on the same machine.

## Example Workflow

1. **View current profiles:**
   ```bash
   iccr models list
   ```

2. **Test classification:**
   ```bash
   iccr classify "Write unit tests for a React component"
   ```

3. **Check routing statistics:**
   ```bash
   iccr models stats
   ```

4. **Backup your learned profiles:**
   ```bash
   iccr models export ~/iccr-backup-$(date +%Y%m%d).json
   ```

5. **Reset a model that's performing poorly:**
   ```bash
   iccr models reset openai/gpt-4o-mini
   ```

## See Also

- [ICCR User Guide](./iccr_user_guide.md)
- [ICCR API Reference](./iccr_api_reference.md)
- [Implementation Walkthrough](./iccr_implementation_walkthrough.md)
