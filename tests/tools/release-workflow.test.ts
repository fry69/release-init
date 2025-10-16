/**
 * Full workflow integration tests for tools/release.ts
 *
 * These tests use the --root flag to test the complete release workflow
 * in isolated temporary directories without affecting the actual project.
 *
 * Tests cover:
 * - Complete release workflow (version bump, file updates, git operations)
 * - Major, minor, and patch version bumps
 * - Explicit version setting
 * - Dry-run mode
 * - Quiet mode
 * - Changelog integration
 * - Git commit and tag creation
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
  const dir = await Deno.makeTempDir({ prefix: `release-workflow-${name}-` });

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
      tasks: {
        // Mock check task that always succeeds
        check: "echo 'Tests passed'",
      },
    };
    await Deno.writeTextFile(
      join(dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    // Create src/main.ts with VERSION constant
    await Deno.mkdir(join(dir, "src"), { recursive: true });
    await Deno.writeTextFile(
      join(dir, "src", "main.ts"),
      `export const VERSION = "${version}";\n\nconsole.log("App v" + VERSION);\n`,
    );

    // Create CHANGELOG.md
    await Deno.writeTextFile(
      join(dir, "CHANGELOG.md"),
      `# Changelog

## [${version}] - 2024-01-01

### Added
- Initial release
`,
    );

    // Create tools directory (release.ts calls update-changelog.ts)
    await Deno.mkdir(join(dir, "tools"), { recursive: true });

    // Copy the actual tool scripts
    const toolsSource = join(Deno.cwd(), "tools");
    for (const script of ["update-changelog.ts", "get-changelog.ts"]) {
      const content = await Deno.readTextFile(join(toolsSource, script));
      await Deno.writeTextFile(join(dir, "tools", script), content);
    }

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

async function runRelease(
  projectDir: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(Deno.cwd(), "tools", "release.ts");

  const command = new Deno.Command("deno", {
    args: ["run", "-A", scriptPath, "--root", projectDir, ...args],
    cwd: projectDir,
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

Deno.test("release workflow: patch version bump", async () => {
  const project = await createTestProject("patch-test", "1.2.3");
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "patch",
    ]);

    if (result.code !== 0) {
      console.log("STDOUT:", result.stdout);
      console.log("STDERR:", result.stderr);
    }

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1.2.3");
    expect(result.stdout).toContain("1.2.4");

    // Verify deno.json was updated
    const denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("1.2.4");

    // Verify src/main.ts was updated
    const mainTs = await Deno.readTextFile(join(project.dir, "src", "main.ts"));
    expect(mainTs).toContain('const VERSION = "1.2.4"');
    expect(mainTs).not.toContain('const VERSION = "1.2.3"');
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: minor version bump", async () => {
  const project = await createTestProject("minor-test", "1.2.3");
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "minor",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1.2.3");
    expect(result.stdout).toContain("1.3.0");

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("1.3.0");

    const mainTs = await Deno.readTextFile(join(project.dir, "src", "main.ts"));
    expect(mainTs).toContain('const VERSION = "1.3.0"');
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: major version bump", async () => {
  const project = await createTestProject("major-test", "1.2.3");
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "major",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1.2.3");
    expect(result.stdout).toContain("2.0.0");

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("2.0.0");

    const mainTs = await Deno.readTextFile(join(project.dir, "src", "main.ts"));
    expect(mainTs).toContain('const VERSION = "2.0.0"');
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: explicit version", async () => {
  const project = await createTestProject("explicit-test", "1.0.0");
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "2.5.7",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1.0.0");
    expect(result.stdout).toContain("2.5.7");

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("2.5.7");

    const mainTs = await Deno.readTextFile(join(project.dir, "src", "main.ts"));
    expect(mainTs).toContain('const VERSION = "2.5.7"');
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: updates CHANGELOG.md", async () => {
  const project = await createTestProject("changelog-test", "1.0.0");
  try {
    // Add Unreleased section
    await Deno.writeTextFile(
      join(project.dir, "CHANGELOG.md"),
      `# Changelog

## [Unreleased]

### Added
- New feature X
- New feature Y

### Fixed
- Bug fix Z

## [1.0.0] - 2024-01-01

### Added
- Initial release
`,
    );

    // Commit the change
    const gitAdd = new Deno.Command("git", {
      args: ["add", "-A"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitAdd.output();

    const gitCommit = new Deno.Command("git", {
      args: ["commit", "-m", "Add unreleased changes"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitCommit.output();

    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "1.1.0",
    ]);

    expect(result.code).toBe(0);

    // Verify changelog was updated
    const changelog = await Deno.readTextFile(
      join(project.dir, "CHANGELOG.md"),
    );
    expect(changelog).toContain("## [1.1.0]");
    expect(changelog).toContain("New feature X");
    expect(changelog).toContain("New feature Y");
    expect(changelog).toContain("Bug fix Z");
    expect(changelog).not.toContain("## [Unreleased]");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: creates git commit", async () => {
  const project = await createTestProject("commit-test", "1.0.0");
  try {
    await runRelease(project.dir, ["--yes", "--dry-run", "1.1.0"]);

    // Check git log
    const command = new Deno.Command("git", {
      args: ["log", "-1", "--pretty=format:%s"],
      cwd: project.dir,
      stdout: "piped",
    });
    const result = await command.output();
    const commitMessage = new TextDecoder().decode(result.stdout);

    expect(commitMessage).toContain("chore: release v1.1.0");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: creates git tag", async () => {
  const project = await createTestProject("tag-test", "1.0.0");
  try {
    await runRelease(project.dir, ["--yes", "--dry-run", "1.1.0"]);

    // Check git tags
    const command = new Deno.Command("git", {
      args: ["tag", "-l"],
      cwd: project.dir,
      stdout: "piped",
    });
    const result = await command.output();
    const tags = new TextDecoder().decode(result.stdout);

    expect(tags).toContain("v1.1.0");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: tag contains changelog", async () => {
  const project = await createTestProject("tag-message-test", "1.0.0");
  try {
    await runRelease(project.dir, ["--yes", "--dry-run", "1.1.0"]);

    // Check git tag message
    const command = new Deno.Command("git", {
      args: ["tag", "-l", "-n99", "v1.1.0"],
      cwd: project.dir,
      stdout: "piped",
    });
    const result = await command.output();
    const tagInfo = new TextDecoder().decode(result.stdout);

    expect(tagInfo).toContain("v1.1.0");
    expect(tagInfo).toContain("Initial release");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: dry-run doesn't push", async () => {
  const project = await createTestProject("dryrun-test", "1.0.0");
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "1.1.0",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry-run mode");
    expect(result.stdout).toContain("stopping before push");
    expect(result.stdout).toContain("To revert:");
    expect(result.stdout).toContain("git reset");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: quiet mode suppresses output", async () => {
  const project = await createTestProject("quiet-test", "1.0.0");
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--quiet",
      "--dry-run",
      "patch",
    ]);

    expect(result.code).toBe(0);
    // Quiet mode should still show warnings and dry-run message
    expect(result.stdout).toContain("Dry-run mode");
    // Quiet mode reduces output (but update-changelog.ts also produces ✓)
    // Just verify output is shorter than normal mode
    expect(result.stdout.length).toBeLessThan(1000);
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: fails without VERSION constant", async () => {
  const project = await createTestProject("no-version-test", "1.0.0");
  try {
    // Create main.ts without VERSION constant
    await Deno.writeTextFile(
      join(project.dir, "src", "main.ts"),
      `console.log("Hello");\n`,
    );

    const gitAdd = new Deno.Command("git", {
      args: ["add", "-A"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitAdd.output();

    const gitCommit = new Deno.Command("git", {
      args: ["commit", "-m", "Remove VERSION"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitCommit.output();

    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "1.1.0",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Failed to update VERSION constant");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: handles custom entry point", async () => {
  const project = await createTestProject("custom-entry-test", "1.0.0");
  try {
    // Update deno.json to use custom entry point
    const denoJson = {
      name: "@test/custom-entry-test",
      version: "1.0.0",
      exports: "./mod.ts",
      tasks: {
        check: "echo 'Tests passed'",
      },
    };
    await Deno.writeTextFile(
      join(project.dir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    // Create custom entry point
    await Deno.writeTextFile(
      join(project.dir, "mod.ts"),
      `export const VERSION = "1.0.0";\n`,
    );

    const gitAdd = new Deno.Command("git", {
      args: ["add", "-A"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitAdd.output();

    const gitCommit = new Deno.Command("git", {
      args: ["commit", "-m", "Custom entry point"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitCommit.output();

    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "1.1.0",
    ]);

    expect(result.code).toBe(0);

    // Verify custom entry point was updated
    const modTs = await Deno.readTextFile(join(project.dir, "mod.ts"));
    expect(modTs).toContain('const VERSION = "1.1.0"');
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: preserves prerelease info", async () => {
  const project = await createTestProject("prerelease-test", "1.0.0-beta.1");
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "1.0.0-rc.1",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1.0.0-beta.1");
    expect(result.stdout).toContain("1.0.0-rc.1");

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("1.0.0-rc.1");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: patch clears prerelease", async () => {
  const project = await createTestProject(
    "patch-prerelease-test",
    "1.0.0-beta.1",
  );
  try {
    const result = await runRelease(project.dir, [
      "--yes",
      "--dry-run",
      "patch",
    ]);

    expect(result.code).toBe(0);
    // Patch should bump to 1.0.1 (clearing prerelease)
    expect(result.stdout).toContain("1.0.1");

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("1.0.1");
  } finally {
    await project.cleanup();
  }
});

Deno.test("release workflow: multiple sequential releases", async () => {
  const project = await createTestProject("sequential-test", "1.0.0");
  try {
    // First release: 1.0.0 -> 1.0.1
    let result = await runRelease(project.dir, ["--yes", "--dry-run", "patch"]);
    expect(result.code).toBe(0);

    let denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("1.0.1");

    // Commit for next release
    const gitAdd = new Deno.Command("git", {
      args: ["add", "-A"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitAdd.output();

    const gitCommit = new Deno.Command("git", {
      args: ["commit", "--amend", "-m", "Release 1.0.1"],
      cwd: project.dir,
      stdout: "null",
    });
    await gitCommit.output();

    // Second release: 1.0.1 -> 1.1.0
    result = await runRelease(project.dir, ["--yes", "--dry-run", "minor"]);
    expect(result.code).toBe(0);

    denoJson = JSON.parse(
      await Deno.readTextFile(join(project.dir, "deno.json")),
    );
    expect(denoJson.version).toBe("1.1.0");

    // Verify changelog has both versions
    const changelog = await Deno.readTextFile(
      join(project.dir, "CHANGELOG.md"),
    );
    expect(changelog).toContain("## [1.1.0]");
    expect(changelog).toContain("## [1.0.0]");
  } finally {
    await project.cleanup();
  }
});
