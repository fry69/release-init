/**
 * Unit tests for tools/get-changelog.ts
 *
 * Tests changelog entry extraction including:
 * - Various changelog formats (Keep a Changelog, custom formats)
 * - Version headers with/without brackets, dates, 'v' prefix
 * - Unreleased sections
 * - Multi-level headings
 * - Missing version handling
 * - Link reference stripping
 */

import { expect } from "@std/expect";
import { join } from "@std/path";

async function runGetChangelog(
  tempDir: string,
  version: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(
    Deno.cwd(),
    "tools",
    "get-changelog.ts",
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

Deno.test("get-changelog: extracts Keep a Changelog format", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.2.3] - 2024-01-15

### Added
- New feature A
- New feature B

### Fixed
- Bug fix

## [1.2.2] - 2024-01-10

### Fixed
- Previous fix
`,
    );

    const result = await runGetChangelog(tempDir, "1.2.3");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [1.2.3] - 2024-01-15");
    expect(result.stdout).toContain("New feature A");
    expect(result.stdout).toContain("New feature B");
    expect(result.stdout).toContain("Bug fix");
    expect(result.stdout).not.toContain("## [1.2.2]");
    expect(result.stdout).not.toContain("Previous fix");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: handles version without brackets", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## 2.0.0 - 2024-02-01

- Major release
- Breaking changes

## 1.9.0 - 2024-01-20

- Minor update
`,
    );

    const result = await runGetChangelog(tempDir, "2.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## 2.0.0 - 2024-02-01");
    expect(result.stdout).toContain("Major release");
    expect(result.stdout).toContain("Breaking changes");
    expect(result.stdout).not.toContain("1.9.0");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: handles version with v prefix", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

### v3.1.4

* Performance improvements
* Security updates

### v3.1.3

* Bug fixes
`,
    );

    const result = await runGetChangelog(tempDir, "v3.1.4");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("### v3.1.4");
    expect(result.stdout).toContain("Performance improvements");
    expect(result.stdout).not.toContain("v3.1.3");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: searches for version without v prefix", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## v1.5.0

- Feature X

## v1.4.0

- Feature Y
`,
    );

    // Query with "1.5.0" should find "v1.5.0"
    const result = await runGetChangelog(tempDir, "1.5.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## v1.5.0");
    expect(result.stdout).toContain("Feature X");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: handles Unreleased section", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [Unreleased]

### Added
- Work in progress feature

## [1.0.0] - 2024-01-01

### Added
- Initial release
`,
    );

    const result = await runGetChangelog(tempDir, "9.9.9"); // Non-existent version

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [Unreleased]");
    expect(result.stdout).toContain("Work in progress feature");
    expect(result.stdout).not.toContain("## [1.0.0]");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: handles version without date", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [2.1.0]

### Added
- Feature without date

## [2.0.0] - 2024-01-01

### Added
- Feature with date
`,
    );

    const result = await runGetChangelog(tempDir, "2.1.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [2.1.0]");
    expect(result.stdout).toContain("Feature without date");
    expect(result.stdout).not.toContain("2.0.0");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: stops at next same-level heading", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0] - 2024-01-01

### Added
- Feature A

### Changed
- Change B

## [0.9.0] - 2023-12-01

### Added
- Old feature
`,
    );

    const result = await runGetChangelog(tempDir, "1.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [1.0.0]");
    expect(result.stdout).toContain("Feature A");
    expect(result.stdout).toContain("Change B");
    expect(result.stdout).not.toContain("## [0.9.0]");
    expect(result.stdout).not.toContain("Old feature");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: handles different heading levels", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

### 1.0.0

#### New Features
- Feature 1
- Feature 2

### 0.9.0

- Old stuff
`,
    );

    const result = await runGetChangelog(tempDir, "1.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("### 1.0.0");
    expect(result.stdout).toContain("#### New Features");
    expect(result.stdout).toContain("Feature 1");
    expect(result.stdout).not.toContain("### 0.9.0");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: returns message when version not found", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0] - 2024-01-01

- Initial release
`,
    );

    const result = await runGetChangelog(tempDir, "9.9.9");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "No changelog entry found for version 9.9.9",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: handles missing CHANGELOG.md", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    const result = await runGetChangelog(tempDir, "1.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Failed to read CHANGELOG.md");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: strips link references", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0] - 2024-01-01

### Added
- Feature A

[1.0.0]: https://github.com/org/repo/releases/tag/v1.0.0

## [0.9.0] - 2023-12-01

### Added
- Old feature
`,
    );

    const result = await runGetChangelog(tempDir, "1.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Feature A");
    expect(result.stdout).not.toContain("[1.0.0]: https://");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: case insensitive version matching", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [V1.0.0] - 2024-01-01

- Release notes
`,
    );

    const result = await runGetChangelog(tempDir, "1.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [V1.0.0]");
    expect(result.stdout).toContain("Release notes");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: requires version argument", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    const scriptPath = join(Deno.cwd(), "tools", "get-changelog.ts");

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

Deno.test("get-changelog: handles complex nested sections", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [2.0.0] - 2024-03-01

### Added
- Feature 1
  - Sub-feature 1a
  - Sub-feature 1b

### Changed
- Change 1

### Breaking Changes
- Breaking change 1

## [1.9.0] - 2024-02-01

### Fixed
- Fix 1
`,
    );

    const result = await runGetChangelog(tempDir, "2.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [2.0.0]");
    expect(result.stdout).toContain("Sub-feature 1a");
    expect(result.stdout).toContain("Breaking change 1");
    expect(result.stdout).not.toContain("## [1.9.0]");
    expect(result.stdout).not.toContain("Fix 1");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-changelog: handles empty changelog section", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-changelog-test-" });
  try {
    await createChangelog(
      tempDir,
      `# Changelog

## [1.0.0] - 2024-01-01

## [0.9.0] - 2023-12-01

- Previous release
`,
    );

    const result = await runGetChangelog(tempDir, "1.0.0");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [1.0.0]");
    expect(result.stdout).not.toContain("0.9.0");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
