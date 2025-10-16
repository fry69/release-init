# Release Automation Initializer

This document describes the `src/main.ts` init tool that adds GitHub workflows
and release automation to existing Deno projects.

## Overview

The `@fry69/release` package provides a command-line tool to bootstrap release
automation in any Deno project. It copies the same workflows and tools that
`@fry69/release` itself uses, making your repository a living example.

## Usage

### Install to Current Directory

```bash
deno run -A jsr:@fry69/release
```

### Install to Specific Directory

```bash
deno run -A jsr:@fry69/release ../my-project
```

### Options

```
-f, --force    Overwrite existing files without prompting
-y, --yes      Skip confirmation prompt (auto-confirm)
-q, --quiet    Suppress non-essential output
-h, --help     Show help message
-v, --version  Show version
```

### Examples

```bash
# Interactive installation in current directory
deno run -A jsr:@fry69/release

# Non-interactive installation
deno run -A jsr:@fry69/release --yes ~/my-project

# Force overwrite existing files
deno run -A jsr:@fry69/release --force .
```

## What Gets Installed

### GitHub Workflows

- `.github/workflows/ci.yml` - Continuous Integration (lint, format, test)
- `.github/workflows/release.yml` - Build & release binaries workflow
- `.github/workflows/publish.yml` - JSR publishing workflow

### Release Tools

- `tools/release.ts` - Version bump & release automation script
- `tools/get-changelog.ts` - Extract changelog entries for versions
- `tools/get-meta.ts` - Extract project metadata from deno.json
- `tools/update-changelog.ts` - Update CHANGELOG.md with release dates

## Requirements

- Target directory must be a Deno project (have `deno.json` or `deno.jsonc`)
- Existing files will not be overwritten unless `--force` is used

## Template Source

The init tool reads templates directly from the package's `.github/workflows/`
and `tools/` directories. This means:

1. **No duplication** - Templates are the actual working files
2. **Self-documenting** - Look at this repo to see templates in action
3. **Always in sync** - Templates are tested with every release
4. **Version-locked** - Installing a specific version gives you exact templates
   from that release

## After Installation

1. **Review workflows** - Check `.github/workflows/` and customize as needed
2. **Add deno.json tasks** (optional):
   ```json
   {
     "tasks": {
       "release": "deno run -A tools/release.ts"
     }
   }
   ```
3. **Create CHANGELOG.md** - Required for release notes
4. **Commit and push** - Trigger CI workflow
5. **Release when ready**:
   ```bash
   deno run -A tools/release.ts patch
   ```

## Architecture

The init tool uses `import.meta.url` to resolve template paths at runtime:

```typescript
// Get package root relative to src/main.ts
const packageRoot = new URL("..", import.meta.url).pathname;

// Read templates from actual directories
const ciYml = await Deno.readTextFile(
  join(packageRoot, ".github", "workflows", "ci.yml"),
);
```

This approach:

- ✅ Works with JSR package distribution
- ✅ No build step required
- ✅ Templates stay in native format
- ✅ Easy to maintain and update

## Testing

The init tool is comprehensively tested:

```bash
# Run init tool tests
deno test -A tests/init-tool.test.ts

# Run all tests
deno task test
```

Tests cover:

- Help and version flags
- Validation (Deno project detection)
- Conflict detection (existing files)
- Successful installation
- Template readability from package structure

## Development

To test locally during development:

```bash
# Show help
deno run -A src/main.ts --help

# Install to temp directory
deno run -A src/main.ts --yes /tmp/test-project

# Use the deno.json task
deno task init --help
```

## Implementation Details

### File Mapping

The tool copies 7 files total:

- 3 GitHub workflow YAML files
- 4 TypeScript tool scripts

### Validation Steps

1. Check target directory exists
2. Verify it's a directory (not a file)
3. Check for `deno.json` or `deno.jsonc`
4. Scan for existing files (unless `--force`)
5. Confirm with user (unless `--yes`)

### Error Handling

- Clear error messages for common issues
- Non-zero exit codes on failure
- Graceful handling of permissions errors
- Validates source files are readable

## See Also

- [Main README](../README.md) - Package overview
- [Release Tool Documentation](../tools/release.ts) - Release automation details
- [Test Documentation](../tests/tools/README.md) - Testing approach
