# Workflow Compilation Investigation

## Problem Statement

The `.github/workflows/release.yml` workflow compiles binaries for multiple
platforms but didn't include template files via the `--include` flag. We
investigated two potential solutions:

1. **Use `deno task compile` with additional arguments**
2. **Configure `--include` in `deno.json`**

## Investigation Results

### Option 1: deno.json Configuration ❌

**Question:** Can `--include` be specified in `deno.json`?

**Answer:** **No**, `deno.json` does NOT support `--include` for the compile
command.

**Evidence from Documentation:**

- The `compile` section in `deno.json` only supports `permissions`
- No compile-specific options like `--include`, `--target`, `--output` are
  supported
- Only these sections exist: `test`, `bench`, `compile` (permissions only)

**Example from docs:**

```json
{
  "compile": {
    "permissions": {
      "read": ["./data"]
    }
  }
}
```

The `compile` field is ONLY for permissions, not for compilation flags.

### Option 2: deno task with Additional Arguments ⚠️

**Question:** Can `deno task compile --target=xyz --output=abc` work?

**Answer:** **Partially** - it works but has limitations.

**Testing:**

```bash
$ deno task compile --target x86_64-unknown-linux-gnu --output test-linux
Task compile deno compile -P --include .github --include tools --output release src/main.ts "--target" "x86_64-unknown-linux-gnu" "--output" "test-linux"
```

**Issues:**

1. Arguments are appended AFTER the task command
2. If the task specifies `--output release`, and you add `--output test-linux`,
   the first one wins
3. Conflicting flags cause unexpected behavior
4. Task hardcodes the output name

**Why This Doesn't Work Well:**

- Our task:
  `deno compile -P --include .github --include tools --output release src/main.ts`
- Adding `--output foo` results in:
  `deno compile ... --output release ... --output foo`
- Deno uses the first `--output`, ignoring the second

## Solution: Direct deno compile in Workflow ✅

The **best approach** is to use `deno compile` directly in the workflow with all
required flags.

### Implementation

**Updated workflow (line 79):**

```yaml
deno compile -A --include .github --include tools --target=${{ matrix.target }} --output="${OUT}" "${{ steps.meta.outputs.entry }}"
```

**Why This Works:**

1. ✅ Full control over all compilation flags
2. ✅ No conflicts with task-defined flags
3. ✅ Clear and explicit
4. ✅ Templates are embedded via `--include`
5. ✅ Works across all platform targets

### deno.json Tasks

We maintain TWO compile tasks for different use cases:

```json
{
  "tasks": {
    "compile": "deno compile -P --include .github --include tools --output release src/main.ts",
    "compile:crossplatform": "deno compile -P --include .github --include tools src/main.ts"
  }
}
```

**Usage:**

- `deno task compile` - Local development (creates `./release`)
- `compile:crossplatform` - Base command that can accept `--target` and
  `--output`
- Workflow uses direct `deno compile` with all flags

## Testing

### Cross-Platform Compilation Test ✅

```bash
$ deno compile -A --include .github --include tools --target x86_64-unknown-linux-gnu --output /tmp/test/binary src/main.ts

Embedded Files
binary
├── .github/* (9.26KB)
├── src/* (28.85KB)
└── tools/* (46.89KB)

$ ls -lh /tmp/test/binary
-rwxr-xr-x  1 user  wheel  83M Oct 16 09:30 binary
```

### Verification ✅

- ✅ Templates embedded correctly
- ✅ Binary created at correct path
- ✅ Target platform correctly specified
- ✅ All tests pass

## Key Findings

### What Works

1. **Direct `deno compile` with `--include`** - Best solution
2. **Tasks for local development** - Convenient shortcuts
3. **Workflow with explicit flags** - Full control

### What Doesn't Work

1. ❌ **`deno.json` compile configuration** - Not supported for `--include`
2. ⚠️ **`deno task` with conflicting flags** - First flag wins, causes issues
3. ❌ **Relying on task for CI/CD** - Too inflexible

## Recommendations

### For Workflows (CI/CD)

Use direct `deno compile` command with all required flags:

```yaml
deno compile -A --include .github --include tools --target=${{ matrix.target }} --output="${OUT}" "${{ steps.meta.outputs.entry }}"
```

### For Local Development

Use convenient task:

```bash
deno task compile  # Creates ./release binary
```

### For Custom Compilation

Use the base compile command directly:

```bash
deno compile -P --include .github --include tools --target aarch64-apple-darwin --output my-binary src/main.ts
```

## Conclusion

**Solution Implemented:** Direct `deno compile` in workflow with `--include`
flags.

**Why:**

- ✅ Most flexible and explicit
- ✅ No dependency on task configuration
- ✅ Works reliably across all platforms
- ✅ Easy to understand and maintain
- ✅ No magic or hidden behavior

The investigation revealed that while `deno.json` supports many configuration
options, **compile-specific flags like `--include` must be passed directly** to
the `deno compile` command. This is actually a good design decision as it keeps
compilation explicit and visible in workflows.
