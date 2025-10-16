# Tool Tests

Comprehensive unit and integration tests for the release automation tools.

## Test Structure

### Unit Tests

Individual tool script tests with extensive coverage:

- **`get-meta.test.ts`** (13 tests)
  - Validates metadata extraction from `deno.json`
  - Tests various `exports` formats (string, object)
  - Name sanitization and scope handling
  - Error cases (missing fields, invalid JSON, missing files)
  - Output format validation

- **`get-changelog.test.ts`** (15 tests)
  - Extracts changelog entries for specific versions
  - Supports multiple formats (Keep a Changelog, custom)
  - Handles versions with/without brackets, dates, 'v' prefix
  - Unreleased section fallback
  - Multi-level heading navigation
  - Link reference stripping

- **`update-changelog.test.ts`** (15 tests)
  - Updates version headers with release dates
  - Converts Unreleased sections to versioned releases
  - Creates new headers when missing
  - Keep a Changelog format compliance
  - Date normalization (YYYY-MM-DD)
  - Preserves content structure

- **`release-cli.test.ts`** (14 tests)
  - Command-line interface validation
  - Help and version display
  - Argument parsing (major/minor/patch keywords)
  - Flag recognition (--dry-run, --yes, --quiet)
  - Error handling for invalid inputs

### Integration Tests

- **`integration.test.ts`** (10 tests)
  - Tool interaction workflows
  - Metadata extraction → changelog updates → extraction cycle
  - Multiple version update sequences
  - Cross-platform path handling (Windows/Unix)
  - Custom entry point detection
  - Error cascading between tools
  - CI/CD simulation scenarios

## Running Tests

```bash
# Run all tool tests
deno test -A tests/tools/

# Run specific test file
deno test -A tests/tools/get-meta.test.ts

# Run with filtering
deno test -A tests/tools/ --filter "get-meta"

# Run with coverage
deno test -A tests/tools/ --coverage=coverage/
deno coverage coverage/
```

## Test Features

### ✅ Operating System Independence

- Uses `@std/path` for cross-platform path handling
- Tests run correctly on Windows, macOS, and Linux
- Path separators handled automatically

### ✅ Temporary Directory Management

- All tests use `Deno.makeTempDir()` for isolation
- Proper cleanup in `finally` blocks
- No interference between test runs

### ✅ Expect-Style Assertions

- Modern `@std/expect` API throughout
- Readable assertion syntax: `expect(value).toBe(expected)`
- Rich matchers: `toContain()`, `toMatch()`, `toBe()`, etc.

### ✅ Comprehensive Coverage

- Success paths and error conditions
- Edge cases and boundary conditions
- Various input formats and configurations
- Git repository initialization and operations

## Test Philosophy

1. **Isolation**: Each test creates its own temporary environment
2. **Cleanup**: Resources are always cleaned up, even on failure
3. **Clarity**: Test names clearly describe what is being tested
4. **Independence**: Tests don't depend on each other
5. **Realistic**: Integration tests simulate real-world workflows

## Notes

- The `release.ts` script is challenging to test in full isolation because it
  uses `import.meta.filename` to determine the project root directory
- Full release workflow testing would require mocking or modifying the actual
  project files
- We focus on CLI interface testing and integration with other tools instead
- For complete release workflow validation, manual testing or CI/CD testing is
  recommended

## Adding New Tests

When adding tests for new tools:

1. Create a new test file: `tests/tools/your-tool.test.ts`
2. Use `expect` style assertions from `@std/expect`
3. Use `Deno.makeTempDir()` for temporary directories
4. Import path utilities from `@std/path`
5. Clean up resources in `finally` blocks
6. Include both success and error test cases
7. Test cross-platform compatibility where relevant

Example template:

```typescript
import { expect } from "@std/expect";
import { join } from "@std/path";

async function runYourTool(
  tempDir: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(Deno.cwd(), "tools", "your-tool.ts");
  const command = new Deno.Command("deno", {
    args: ["run", "-A", scriptPath, ...args],
    cwd: tempDir,
    stdout: "piped",
    stderr: "piped",
  });

  const result = await command.output();
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    code: result.code,
  };
}

Deno.test("your-tool: basic functionality", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "your-tool-test-" });
  try {
    // Setup
    await Deno.writeTextFile(join(tempDir, "config.json"), "{}");

    // Execute
    const result = await runYourTool(tempDir, ["arg1", "arg2"]);

    // Assert
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("expected output");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
```
