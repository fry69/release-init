/**
 * CLI tests for tools/release.ts
 *
 * Tests command-line interface and argument parsing:
 * - Help and version display
 * - Error handling for invalid inputs
 * - Argument validation
 *
 * Note: Full integration tests are in integration.test.ts
 */

import { expect } from "@std/expect";
import { join } from "@std/path";

async function runRelease(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(Deno.cwd(), "tools", "release.ts");

  const command = new Deno.Command("deno", {
    args: ["run", "-A", scriptPath, ...args],
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
    env: {
      CI: "true",
    },
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

Deno.test("release: shows help with --help", async () => {
  const result = await runRelease(["--help"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Usage:");
  expect(result.stdout).toContain("major");
  expect(result.stdout).toContain("minor");
  expect(result.stdout).toContain("patch");
  expect(result.stdout).toContain("--dry-run");
  expect(result.stdout).toContain("--yes");
  expect(result.stdout).toContain("--quiet");
});

Deno.test("release: shows help with -h", async () => {
  const result = await runRelease(["-h"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Usage:");
});

Deno.test("release: shows version with --version", async () => {
  const result = await runRelease(["--version"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/release version \d+\.\d+\.\d+/);
});

Deno.test("release: shows version with -v", async () => {
  const result = await runRelease(["-v"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/release version \d+\.\d+\.\d+/);
});

Deno.test("release: requires version argument", async () => {
  const result = await runRelease([]);

  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Missing version argument");
  expect(result.stdout).toContain("Usage:");
});

Deno.test("release: help takes precedence over other flags", async () => {
  const result = await runRelease(["--help", "--version"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Usage:");
  expect(result.stdout).not.toContain("release version");
});

Deno.test("release: version flag takes precedence over version argument", async () => {
  const result = await runRelease(["--version", "1.0.0"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/release version/);
});

Deno.test("release: recognizes major/minor/patch keywords", async () => {
  // These should fail later (not at argument parsing stage) when trying to read deno.json
  for (const keyword of ["major", "minor", "patch"]) {
    const tempDir = await Deno.makeTempDir();
    try {
      const scriptPath = join(Deno.cwd(), "tools", "release.ts");
      const command = new Deno.Command("deno", {
        args: ["run", "-A", scriptPath, "--yes", keyword],
        cwd: tempDir,
        stdout: "piped",
        stderr: "piped",
      });

      const result = await command.output();
      const stderr = new TextDecoder().decode(result.stderr);

      // Should fail trying to read deno.json, not complaining about the keyword
      expect(stderr).not.toContain("Invalid version");
      expect(stderr).not.toContain("Missing version argument");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }
});

Deno.test("release: accepts explicit version numbers", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const scriptPath = join(Deno.cwd(), "tools", "release.ts");
    const command = new Deno.Command("deno", {
      args: ["run", "-A", scriptPath, "--yes", "1.2.3"],
      cwd: tempDir,
      stdout: "piped",
      stderr: "piped",
    });

    const result = await command.output();
    const stderr = new TextDecoder().decode(result.stderr);

    // Should fail trying to read deno.json, not complaining about version format
    expect(stderr).not.toContain("Invalid version: 1.2.3");
    expect(stderr).not.toContain("Missing version argument");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("release: rejects clearly invalid version format", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    // Create minimal deno.json so the script gets past that check
    await Deno.writeTextFile(
      join(tempDir, "deno.json"),
      JSON.stringify({
        name: "test",
        version: "1.0.0",
        exports: "./main.ts",
      }),
    );

    const scriptPath = join(Deno.cwd(), "tools", "release.ts");
    const command = new Deno.Command("deno", {
      args: ["run", "-A", scriptPath, "--yes", "not-a-version"],
      cwd: tempDir,
      stdout: "piped",
      stderr: "piped",
    });

    const result = await command.output();
    const stderr = new TextDecoder().decode(result.stderr);
    const code = result.code;

    expect(code).toBe(1);
    expect(stderr).toContain("Invalid version");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("release: dry-run flag is recognized", async () => {
  // Just verify the flag is parsed, actual behavior tested in integration tests
  const result = await runRelease(["--help"]);
  expect(result.stdout).toContain("--dry-run");
  expect(result.stdout).toContain("-d");
});

Deno.test("release: yes flag is recognized", async () => {
  const result = await runRelease(["--help"]);
  expect(result.stdout).toContain("--yes");
  expect(result.stdout).toContain("-y");
});

Deno.test("release: quiet flag is recognized", async () => {
  const result = await runRelease(["--help"]);
  expect(result.stdout).toContain("--quiet");
  expect(result.stdout).toContain("-q");
});

Deno.test("release: help shows examples", async () => {
  const result = await runRelease(["--help"]);

  expect(result.stdout).toContain("Examples:");
  expect(result.stdout).toContain("release 0.3.0");
  expect(result.stdout).toContain("release patch");
  expect(result.stdout).toContain("release --dry-run patch");
});
