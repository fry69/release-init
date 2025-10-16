# Simplification: Using `Deno.cwd()` Instead of `import.meta.filename`

## Summary

Successfully simplified `release.ts` to use `Deno.cwd()` for determining the
project root directory instead of `import.meta.filename`. This removed the need
for the `--root` flag and made the code more consistent with the other tool
scripts.

## Motivation

### The Problem

The `release.ts` script was using `import.meta.filename` to calculate the
project root:

```typescript
let ROOT_DIR = join(dirname(import.meta.filename!), "..");
```

This made it impossible to test in isolation without a `--root` flag to override
the detected path. However, this was inconsistent with the other tool scripts.

### Key Finding: Inconsistency

All other helper scripts already used relative paths from `cwd`:

- `get-meta.ts`: `await Deno.readTextFile("deno.json")`
- `get-changelog.ts`: `await Deno.readTextFile("CHANGELOG.md")`
- `update-changelog.ts`: `await Deno.readTextFile("CHANGELOG.md")`

**Only `release.ts` was different** - it was the odd one out.

### Actual Usage Patterns

1. **deno.json task**: `"release": "deno run -A tools/release.ts"` → runs from
   project root
2. **GitHub workflows**: `deno run -A tools/get-meta.ts` → runs from checkout
   root
3. **Developer workflow**: Always `deno task release` from project root

Nobody runs `cd tools && ./release.ts` or uses absolute paths in practice.

## Changes Made

### 1. Simplified `tools/release.ts`

**Before:**

```typescript
import { dirname, join } from "@std/path";

let ROOT_DIR = join(dirname(import.meta.filename!), "..");
```

**After:**

```typescript
import { join } from "@std/path";

const ROOT_DIR = Deno.cwd();
```

### 2. Removed `--root` Flag

**Removed from parseArgs:**

```typescript
// Removed: string: ["root"]
// Removed: r: "root" alias
```

**Removed override logic:**

```typescript
// DELETED:
if (args.root) {
  ROOT_DIR = args.root as string;
  if (!isQuiet) {
    log.info(`Using custom root directory: ${ROOT_DIR}`);
  }
}
```

**Updated help text:**

- Removed `-r, --root <path>` option
- Removed `--root /tmp/project patch` example
- Added note: "This script must be run from the project root directory."

### 3. Simplified `tests/tools/release-workflow.test.ts`

**Before:**

```typescript
const command = new Deno.Command("deno", {
  args: ["run", "-A", scriptPath, "--root", projectDir, ...args],
  cwd: projectDir,
  //...
});
```

**After:**

```typescript
const command = new Deno.Command("deno", {
  args: ["run", "-A", scriptPath, ...args],
  cwd: projectDir, // Just set cwd - that's it!
  //...
});
```

### 4. Updated Documentation

- **tests/tools/README.md**: Replaced `--root` flag section with simpler
  "Workflow Testing Strategy" explaining the cwd approach
- **Deleted**: `docs/ROOT_FLAG_IMPLEMENTATION.md` (no longer relevant)
- **Created**: This document to explain the simplification

## Benefits

✅ **Simpler code** - Removed ~20 lines of code ✅ **Consistent** - All tools
work the same way (using cwd) ✅ **Matches reality** - Aligns with how tools are
actually used ✅ **Simpler tests** - Just set `cwd`, no special flag needed ✅
**More intuitive** - "Run from project root" is standard practice ✅
**Cross-platform safe** - `Deno.cwd()` returns absolute path

## Cross-Platform Compatibility

No issues with Windows or other platforms because:

1. `Deno.cwd()` returns an **absolute path** (e.g., `/tmp/test-project` or
   `C:\Temp\test-project`)
2. All file operations use `join(Deno.cwd(), "relative/path")` → absolute paths
3. Tests set `cwd: projectDir` in `Deno.Command` → script runs inside the temp
   directory
4. No cross-directory relative paths involved

## Test Results

All **83 tests pass** with the simplified approach:

```
ok | 83 passed | 0 failed (5s)
```

Test suite includes:

- 13 tests for `get-meta.ts`
- 15 tests for `get-changelog.ts`
- 15 tests for `update-changelog.ts`
- 14 tests for `release.ts` CLI
- 10 integration tests
- 15 full workflow tests
- 1 framework test

## Usage

### Normal Usage (unchanged)

```bash
# From project root
deno task release patch
```

or

```bash
# From project root
deno run -A tools/release.ts patch
```

### Testing (simplified)

```typescript
const command = new Deno.Command("deno", {
  args: ["run", "-A", "tools/release.ts", "patch"],
  cwd: tempProjectDir, // Script automatically uses this as project root
  stdout: "piped",
  stderr: "piped",
});
```

## Conclusion

This simplification removes unnecessary complexity while maintaining full
functionality and improving consistency across all tool scripts. The `--root`
flag was solving a problem we created by using `import.meta.filename` instead of
following the simpler pattern used by all other tools.

**Result**: Cleaner code, simpler tests, better consistency, same functionality.
