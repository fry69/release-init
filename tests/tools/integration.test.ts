/**
 * Integration tests for tool scripts
 *
 * Tests the interaction between multiple tools in realistic workflows:
 * - Complete release workflow
 * - Metadata extraction used by other tools
 * - Changelog updates followed by extractions
 * - Cross-platform path handling
 */

import { expect } from "@std/expect";
import { join } from "@std/path";

interface TestProject {
  dir: string;
  cleanup: () => Promise<void>;
}

async function createTestProject(
  name: string,
  version: string = "1.0.0",
): Promise<TestProject> {
  const dir = await Deno.makeTempDir({ prefix: `integration-${name}-` });

  const cleanup = async () => {
    await Deno.remove(dir, { recursive: true });
  };

  try {
    // Create deno.json
    const denoJson = {
      name: `@test/${name}`,
      version,
      exports: "./src/main.ts",
      license: "MIT",
    };
    await Deno.writeTextFile(
      join(dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    // Create src/main.ts
    await Deno.mkdir(join(dir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(dir, "src", "main.ts"),
      `export const VERSION = "${version}";\nconsole.log("App v" + VERSION);\n`,
    );

    // Create CHANGELOG.md
    await Deno.writeTextFile(
      join(dir, "CHANGELOG.md"),
      `# Changelog

## [Unreleased]

### Added
- Work in progress

## [${version}] - 2024-01-01

### Added
- Initial release
`,
    );

    // Initialize git
    const commands: [string, string[]][] = [
      ["git", ["init"]],
      ["git", ["config", "user.name", "Test User"]],
      ["git", ["config", "user.email", "test@example.com"]],
      ["git", ["add", "-A"]],
      ["git", ["commit", "-m", "Initial commit"]],
    ];

    for (const [cmd, args] of commands) {
      const command = new Deno.Command(cmd, {
        args,
        cwd: dir,
        stdout: "null",
        stderr: "null",
      });
      const result = await command.output();
      if (!result.success) {
        throw new Error(`Failed to run: ${cmd} ${args.join(" ")}`);
      }
    }

    return { dir, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function runTool(
  dir: string,
  tool: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(Deno.cwd(), "tools", `${tool}.ts`);

  const command = new Deno.Command("deno", {
    args: ["run", "-A", scriptPath, ...args],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
    env: { CI: "true" },
  });

  const result = await command.output();
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    code: result.code,
  };
}

Deno.test("integration: get-meta extracts correct metadata", async () => {
  const project = await createTestProject("meta-test", "2.5.7");
  try {
    const result = await runTool(project.dir, "get-meta");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tool_name=meta-test");
    expect(result.stdout).toContain("tool_version=2.5.7");
    expect(result.stdout).toContain("entry=./src/main.ts");

    // Parse output
    const lines = result.stdout.trim().split("\n");
    const meta: Record<string, string> = {};
    for (const line of lines) {
      const [key, value] = line.split("=");
      meta[key] = value;
    }

    expect(meta.tool_name).toBe("meta-test");
    expect(meta.tool_version).toBe("2.5.7");
    expect(meta.entry).toBe("./src/main.ts");
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: update and extract changelog", async () => {
  const project = await createTestProject("changelog-test", "1.0.0");
  try {
    // Update changelog for version 1.1.0
    const updateResult = await runTool(project.dir, "update-changelog", [
      "1.1.0",
    ]);
    expect(updateResult.code).toBe(0);

    // Extract the updated changelog
    const extractResult = await runTool(project.dir, "get-changelog", [
      "1.1.0",
    ]);
    expect(extractResult.code).toBe(0);
    expect(extractResult.stdout).toContain("## [1.1.0]");
    expect(extractResult.stdout).toContain("Work in progress");
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: metadata after version changes", async () => {
  const project = await createTestProject("full-release", "1.0.0");
  try {
    // Step 1: Get current metadata
    const metaBefore = await runTool(project.dir, "get-meta");
    expect(metaBefore.code).toBe(0);
    expect(metaBefore.stdout).toContain("tool_version=1.0.0");

    // Step 2: Manually update version in deno.json
    const denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    denoJson.version = "1.1.0";
    await Deno.writeTextFile(
      join(project.dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    // Step 3: Get updated metadata
    const metaAfter = await runTool(project.dir, "get-meta");
    expect(metaAfter.code).toBe(0);
    expect(metaAfter.stdout).toContain("tool_version=1.1.0");

    // Step 4: Update changelog for new version
    const updateResult = await runTool(project.dir, "update-changelog", [
      "1.1.0",
    ]);
    expect(updateResult.code).toBe(0);

    // Step 5: Extract changelog for new version
    const changelog = await runTool(project.dir, "get-changelog", ["1.1.0"]);
    expect(changelog.code).toBe(0);
    expect(changelog.stdout).toContain("## [1.1.0]");
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: multiple version updates", async () => {
  const project = await createTestProject("multi-bump", "0.1.0");
  try {
    // First update: 0.1.0 -> 0.1.1
    await runTool(project.dir, "update-changelog", ["0.1.1"]);

    let denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    denoJson.version = "0.1.1";
    await Deno.writeTextFile(
      join(project.dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    let meta = await runTool(project.dir, "get-meta");
    expect(meta.code).toBe(0);
    expect(meta.stdout).toContain("tool_version=0.1.1");

    // Second update: 0.1.1 -> 0.2.0
    await runTool(project.dir, "update-changelog", ["0.2.0"]);

    denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    denoJson.version = "0.2.0";
    await Deno.writeTextFile(
      join(project.dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    meta = await runTool(project.dir, "get-meta");
    expect(meta.code).toBe(0);
    expect(meta.stdout).toContain("tool_version=0.2.0");

    // Verify both versions in changelog
    const changelog = await Deno.readTextFile(
      join(project.dir, "CHANGELOG.md"),
    );
    expect(changelog).toContain("## [0.2.0]");
    expect(changelog).toContain("## [0.1.1]");
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: changelog version history", async () => {
  const project = await createTestProject("changelog-history", "1.0.0");
  try {
    // Release 1.1.0
    await runTool(project.dir, "update-changelog", ["1.1.0"]);

    // Create new Unreleased section and commit
    const changelog1 = await Deno.readTextFile(
      join(project.dir, "CHANGELOG.md"),
    );
    const withUnreleased = `# Changelog

## [Unreleased]

### Added
- Feature for 1.2.0

${changelog1.split("\n").slice(2).join("\n")}`;

    await Deno.writeTextFile(
      join(project.dir, "CHANGELOG.md"),
      withUnreleased,
    );

    // Release 1.2.0
    await runTool(project.dir, "update-changelog", ["1.2.0"]);

    // Verify all versions are present
    const finalChangelog = await Deno.readTextFile(
      join(project.dir, "CHANGELOG.md"),
    );
    expect(finalChangelog).toContain("## [1.2.0]");
    expect(finalChangelog).toContain("## [1.1.0]");
    expect(finalChangelog).toContain("## [1.0.0]");

    // Extract each version
    for (const version of ["1.0.0", "1.1.0", "1.2.0"]) {
      const extract = await runTool(project.dir, "get-changelog", [version]);
      expect(extract.code).toBe(0);
      expect(extract.stdout).toContain(`## [${version}]`);
    }
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: cross-platform path handling", async () => {
  const project = await createTestProject("path-test", "1.0.0");
  try {
    // Create nested directory structure
    const nestedPath = join(project.dir, "lib", "core", "utils");
    await Deno.mkdir(nestedPath, { recursive: true });

    // Update deno.json to use nested entry point
    const denoJson = {
      name: "@test/path-test",
      version: "1.0.0",
      exports: {
        ".": "./lib/core/utils/mod.ts",
      },
    };
    await Deno.writeTextFile(
      join(project.dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    // Create entry point
    await Deno.writeTextFile(
      join(nestedPath, "mod.ts"),
      `export const VERSION = "1.0.0";\n`,
    );

    // Test get-meta with nested paths
    const result = await runTool(project.dir, "get-meta");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("entry=./lib/core/utils/mod.ts");

    // Verify path separators work correctly (cross-platform)
    const entryLine = result.stdout.split("\n").find((l) =>
      l.startsWith("entry=")
    );
    expect(entryLine).toBeDefined();
    const entryPath = entryLine!.split("=")[1];

    // Verify file exists using the extracted path
    const fullPath = join(project.dir, entryPath);
    const stat = await Deno.stat(fullPath);
    expect(stat.isFile).toBe(true);
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: error handling cascade", async () => {
  const project = await createTestProject("error-cascade", "1.0.0");
  try {
    // Remove entry point to cause error
    await Deno.remove(join(project.dir, "src", "main.ts"));

    // get-meta should fail
    const metaResult = await runTool(project.dir, "get-meta");
    expect(metaResult.code).toBe(1);
    expect(metaResult.stderr).toContain("does not exist");

    // release should also fail
    const releaseResult = await runTool(project.dir, "release", [
      "--yes",
      "--dry-run",
      "patch",
    ]);
    expect(releaseResult.code).toBe(1);
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: changelog without Unreleased section", async () => {
  const project = await createTestProject("no-unreleased", "1.0.0");
  try {
    // Create changelog without Unreleased section
    await Deno.writeTextFile(
      join(project.dir, "CHANGELOG.md"),
      `# Changelog

## [1.0.0] - 2024-01-01

### Added
- Initial release
`,
    );

    // Update for new version
    const updateResult = await runTool(project.dir, "update-changelog", [
      "1.1.0",
    ]);
    expect(updateResult.code).toBe(0);

    // Verify new section was created
    const changelog = await Deno.readTextFile(
      join(project.dir, "CHANGELOG.md"),
    );
    expect(changelog).toContain("## [1.1.0]");
    expect(changelog).toContain("## [1.0.0]");

    // New version should come before old version
    expect(changelog.indexOf("## [1.1.0]")).toBeLessThan(
      changelog.indexOf("## [1.0.0]"),
    );
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: custom entry point detection", async () => {
  const project = await createTestProject("custom-entry", "1.0.0");
  try {
    // Change to custom entry point
    const denoJson = {
      name: "@test/custom-entry",
      version: "1.0.0",
      exports: "./index.ts",
    };
    await Deno.writeTextFile(
      join(project.dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    // Create custom entry point
    await Deno.writeTextFile(
      join(project.dir, "index.ts"),
      `export const VERSION = "1.0.0";\n`,
    );

    // Verify get-meta detects the custom entry point
    const result = await runTool(project.dir, "get-meta");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("entry=./index.ts");
    expect(result.stdout).toContain("tool_name=custom-entry");
  } finally {
    await project.cleanup();
  }
});

Deno.test("integration: metadata extraction for CI/CD", async () => {
  const project = await createTestProject("cicd-meta", "2.1.3");
  try {
    // Simulate CI/CD environment extracting metadata
    const result = await runTool(project.dir, "get-meta");
    expect(result.code).toBe(0);

    // Parse as environment variables (like in GitHub Actions)
    const envVars: Record<string, string> = {};
    for (const line of result.stdout.trim().split("\n")) {
      const [key, value] = line.split("=");
      envVars[key] = value;
    }

    // Verify metadata can be used for build
    expect(envVars.tool_name).toBe("cicd-meta");
    expect(envVars.tool_version).toBe("2.1.3");
    expect(envVars.entry).toBe("./src/main.ts");

    // Verify entry point exists (as CI would do)
    const entryPath = join(project.dir, envVars.entry);
    const stat = await Deno.stat(entryPath);
    expect(stat.isFile).toBe(true);
  } finally {
    await project.cleanup();
  }
});
