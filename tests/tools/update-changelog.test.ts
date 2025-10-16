/**
 * Unit tests for tools/update-changelog.ts
 *
 * Tests changelog updating functionality including:
 * - Updating existing version headers with dates
 * - Converting Unreleased sections to versioned releases
 * - Creating new version headers when none exist
 * - Keep a Changelog format compliance
 * - Handling various header formats
 * - Date formatting (YYYY-MM-DD)
 */

import { expect } from "@std/expect";
import { join } from "@std/path";

async function runUpdateChangelog(
  tempDir: string,
  version: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(
    Deno.cwd(),
    "tools",
    "update-changelog.ts",
  );

  const command = new Deno.Command("deno", {
    args: ["run", "-A", scriptPath, version],
    cwd: tempDir,
    stdout: "piped",
    stderr: "piped",
  });

  const result = await command.output();
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);

  return {
    stdout,
    stderr,
    code: result.code,
  };
}

async function createChangelog(tempDir: string, content: string) {
  const path = join(tempDir, "CHANGELOG.md");
  await Deno.writeTextFile(path, content);
}

async function readChangelog(tempDir: string): Promise<string> {
  const path = join(tempDir, "CHANGELOG.md");
  return await Deno.readTextFile(path);
}

// Helper to get today's date in YYYY-MM-DD format
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

Deno.test("update-changelog: updates existing version header", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.2.3]

### Added
- New feature

## [1.2.2] - 2024-01-01

### Fixed
- Bug fix
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.2.3");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Updated header");
    expect(updated).toContain(`## [1.2.3] - ${today}`);
    expect(updated).toContain("### Added");
    expect(updated).toContain("- New feature");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: converts Unreleased to version", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [Unreleased]

### Added
- Feature in progress

### Changed
- Some changes

## [1.0.0] - 2024-01-01

### Added
- Initial release
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.1.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain(`## [1.1.0] - ${today}`);
    expect(updated).toContain("### Added");
    expect(updated).toContain("- Feature in progress");
    expect(updated).not.toContain("## [Unreleased]");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: creates new header when missing", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0] - 2024-01-01

### Added
- Initial release
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.1.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Created new header");
    expect(updated).toContain(`## [1.1.0] - ${today}`);
    expect(updated).toContain("### Added");
    expect(updated).toContain("- Initial release");
    // New header should be inserted before old ones
    expect(updated.indexOf("## [1.1.0]")).toBeLessThan(
      updated.indexOf("## [1.0.0]"),
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: removes v prefix from version", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## v2.0.0

### Added
- New major release
`,
    );

    const result = await runUpdateChangelog(tempDir, "v2.0.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain(`## [2.0.0] - ${today}`);
    expect(updated).not.toContain("## v2.0.0");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: handles version without brackets", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## 1.5.0

- Feature A
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.5.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain(`## [1.5.0] - ${today}`);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: replaces existing date", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0] - 2020-01-01

### Added
- Old date
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.0.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain(`## [1.0.0] - ${today}`);
    expect(updated).not.toContain("2020-01-01");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: handles Unreleased without brackets", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## Unreleased

### Added
- Work in progress
`,
    );

    const result = await runUpdateChangelog(tempDir, "2.0.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain(`## [2.0.0] - ${today}`);
    expect(updated).not.toContain("Unreleased");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: preserves content below version", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0]

### Added
- Feature 1
- Feature 2

### Fixed
- Bug 1

## [0.9.0] - 2023-12-01

### Added
- Old feature
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.0.0");
    const updated = await readChangelog(tempDir);

    expect(result.code).toBe(0);
    expect(updated).toContain("### Added");
    expect(updated).toContain("- Feature 1");
    expect(updated).toContain("- Feature 2");
    expect(updated).toContain("### Fixed");
    expect(updated).toContain("- Bug 1");
    expect(updated).toContain("## [0.9.0] - 2023-12-01");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: requires version argument", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    const scriptPath = join(Deno.cwd(), "tools", "update-changelog.ts");

    const command = new Deno.Command("deno", {
      args: ["run", "-A", scriptPath],
      cwd: tempDir,
      stdout: "piped",
      stderr: "piped",
    });

    const result = await command.output();
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.code).toBe(1);
    expect(stderr).toContain("Usage:");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: fails gracefully on missing file", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    const result = await runUpdateChangelog(tempDir, "1.0.0");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error: Failed to update CHANGELOG.md");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: handles different heading levels", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

### 1.0.0

- Release notes
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.0.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain(`### [1.0.0] - ${today}`);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: case insensitive version matching", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [v1.0.0]

- Release notes
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.0.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    // The script removes 'v' prefix but preserves other case
    expect(updated).toContain(`## [1.0.0] - ${today}`);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: creates header after main title", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# My Project Changelog

This is a description.

## [0.1.0] - 2023-01-01

- Initial version
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.0.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain("# My Project Changelog");
    expect(updated).toContain("This is a description.");
    expect(updated).toContain(`## [1.0.0] - ${today}`);
    expect(updated).toContain("### Added");
    expect(updated).toContain("- Initial release");
    // New section should be between title and old version
    const titleIdx = updated.indexOf("# My Project");
    const newVerIdx = updated.indexOf("## [1.0.0]");
    const oldVerIdx = updated.indexOf("## [0.1.0]");
    expect(titleIdx).toBeLessThan(newVerIdx);
    expect(newVerIdx).toBeLessThan(oldVerIdx);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: handles multiple Unreleased variants", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [UNRELEASED]

### Added
- New stuff
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.0.0");
    const updated = await readChangelog(tempDir);
    const today = getTodayString();

    expect(result.code).toBe(0);
    expect(updated).toContain(`## [1.0.0] - ${today}`);
    expect(updated).not.toContain("UNRELEASED");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("update-changelog: preserves blank lines structure", async () => {
  const tempDir = await Deno.makeTempDir({
    prefix: "update-changelog-test-",
  });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0]

### Added

- Feature 1

### Fixed

- Bug 1

## [0.9.0] - 2023-12-01

- Old stuff
`,
    );

    const result = await runUpdateChangelog(tempDir, "1.0.0");
    const updated = await readChangelog(tempDir);

    expect(result.code).toBe(0);
    // Check that general structure is maintained
    expect(updated).toContain("### Added\n\n- Feature 1");
    expect(updated).toContain("### Fixed\n\n- Bug 1");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
