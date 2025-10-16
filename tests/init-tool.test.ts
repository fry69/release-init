/**
 * Tests for src/main.ts (init/installation tool)
 *
 * These tests verify the basic functionality of the release automation
 * initializer without actually performing file operations.
 */

import { expect } from "@std/expect";
import { join } from "@std/path";

Deno.test("init tool - help flag works", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/main.ts", "--help"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await cmd.output();
  const stdout = new TextDecoder().decode(result.stdout);

  expect(result.success).toBe(true);
  expect(stdout).toContain("Release Automation Initializer");
  expect(stdout).toContain("Usage:");
  expect(stdout).toContain("--force");
  expect(stdout).toContain("--yes");
  expect(stdout).toContain(".github/workflows/");
});

Deno.test("init tool - version flag works", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/main.ts", "--version"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await cmd.output();
  const stdout = new TextDecoder().decode(result.stdout);

  expect(result.success).toBe(true);
  expect(stdout).toMatch(/release version \d+\.\d+\.\d+/);
});

Deno.test("init tool - fails on non-existent directory", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/main.ts", "--yes", "/tmp/nonexistent-dir-12345"],
    stdout: "piped",
    stderr: "piped",
  });

  const result = await cmd.output();
  const stderr = new TextDecoder().decode(result.stderr);

  expect(result.success).toBe(false);
  expect(stderr).toContain("does not exist");
});

Deno.test("init tool - fails on non-Deno project", async () => {
  // Create a temporary directory without deno.json
  const tempDir = await Deno.makeTempDir();

  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "src/main.ts", "--yes", tempDir],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await cmd.output();
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.success).toBe(false);
    expect(stderr).toContain("not a Deno project");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("init tool - detects existing files without --force", async () => {
  // Create a temporary Deno project with an existing tools/release.ts
  const tempDir = await Deno.makeTempDir();

  try {
    // Create deno.json
    await Deno.writeTextFile(
      join(tempDir, "deno.json"),
      JSON.stringify({ name: "test", version: "0.0.1" }),
    );

    // Create existing file
    await Deno.mkdir(join(tempDir, "tools"), { recursive: true });
    await Deno.writeTextFile(
      join(tempDir, "tools", "release.ts"),
      "// existing file",
    );

    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "src/main.ts", "--yes", tempDir],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await cmd.output();
    const stderr = new TextDecoder().decode(result.stderr);
    const stdout = new TextDecoder().decode(result.stdout);
    const output = stderr + stdout;

    expect(result.success).toBe(false);
    expect(output).toContain("already exist");
    expect(output).toContain("--force");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("init tool - successful installation with --force", async () => {
  // Create a temporary Deno project
  const tempDir = await Deno.makeTempDir();

  try {
    // Create deno.json
    await Deno.writeTextFile(
      join(tempDir, "deno.json"),
      JSON.stringify({
        name: "test-project",
        version: "0.0.1",
        exports: "./main.ts",
      }),
    );

    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "src/main.ts",
        "--yes",
        "--force",
        "--quiet",
        tempDir,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await cmd.output();

    expect(result.success).toBe(true);

    // Verify files were created
    const workflows = [
      join(tempDir, ".github", "workflows", "ci.yml"),
      join(tempDir, ".github", "workflows", "release.yml"),
      join(tempDir, ".github", "workflows", "publish.yml"),
    ];

    const tools = [
      join(tempDir, "tools", "release.ts"),
      join(tempDir, "tools", "get-changelog.ts"),
      join(tempDir, "tools", "get-meta.ts"),
      join(tempDir, "tools", "update-changelog.ts"),
    ];

    for (const file of [...workflows, ...tools]) {
      const stat = await Deno.stat(file);
      expect(stat.isFile).toBe(true);
    }

    // Verify content is copied correctly (check one file)
    const copiedContent = await Deno.readTextFile(
      join(tempDir, "tools", "get-meta.ts"),
    );
    const originalContent = await Deno.readTextFile("tools/get-meta.ts");
    expect(copiedContent).toBe(originalContent);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("init tool - template files are readable from package", async () => {
  // This test verifies the core assumption: that template files can be read
  // from the package structure using import.meta.url

  const packageRoot = new URL("..", import.meta.url).pathname;

  // Check that source files exist and are readable
  const sourceFiles = [
    join(packageRoot, ".github", "workflows", "ci.yml"),
    join(packageRoot, ".github", "workflows", "release.yml"),
    join(packageRoot, ".github", "workflows", "publish.yml"),
    join(packageRoot, "tools", "release.ts"),
    join(packageRoot, "tools", "get-changelog.ts"),
    join(packageRoot, "tools", "get-meta.ts"),
    join(packageRoot, "tools", "update-changelog.ts"),
  ];

  for (const file of sourceFiles) {
    const content = await Deno.readTextFile(file);
    expect(content.length).toBeGreaterThan(0);
  }
});
