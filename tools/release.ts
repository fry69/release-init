#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env
/**
 * Release script - Automates version bumps, testing, and git tagging with changelog
 *
 * Usage:
 *   release [--dry-run] <version|major|minor|patch>
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import * as semver from "@std/semver";
import { bold, green, red, yellow } from "@std/fmt/colors";
import { join } from "@std/path";

// Script metadata
const VERSION = "0.0.2";
const SCRIPT_NAME = "release";

// Project root directory (current working directory)
const ROOT_DIR = Deno.cwd();

interface ProjectMeta {
  name: string;
  scope: string;
  packageName: string;
  version: string;
  entryPoint: string;
}

// Global state for quiet mode
let isQuiet = false;

// Helper: Logging with consistent formatting
const log = {
  success: (msg: string) => !isQuiet && console.log(green("✓") + " " + msg),
  warn: (msg: string) => console.log(yellow("⚠") + " " + msg),
  error: (msg: string) => console.error(red("✗") + " " + msg),
  step: (msg: string) => !isQuiet && console.log(bold(msg)),
  info: (msg: string) => !isQuiet && console.log("  " + msg),
  blank: () => !isQuiet && console.log(),
};

// Helper: Exit with error message
function exitError(msg: string): never {
  log.error(msg);
  Deno.exit(1);
}

// Helper: Run command and return success status
async function run(
  cmd: string,
  args: string[],
  opts?: { silent?: boolean },
): Promise<boolean> {
  const command = new Deno.Command(cmd, {
    args,
    cwd: ROOT_DIR,
    stdout: opts?.silent ? "null" : "inherit",
    stderr: opts?.silent ? "null" : "inherit",
  });
  const result = await command.output();
  return result.success;
}

// Helper: Run command and capture output
async function capture(cmd: string, args: string[]): Promise<string> {
  const command = new Deno.Command(cmd, {
    args,
    cwd: ROOT_DIR,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  if (!result.success) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

// Helper: Extract changelog entry for a version
async function getChangelog(version: string): Promise<string> {
  try {
    return await capture("deno", [
      "run",
      "-A",
      join(ROOT_DIR, "tools", "get-changelog.ts"),
      version,
    ]);
  } catch {
    log.warn("Could not extract changelog, using default message");
    return `Release ${version}`;
  }
}

// Helper: Read and parse project metadata
async function getProjectMeta(): Promise<ProjectMeta> {
  const denoJsonPath = join(ROOT_DIR, "deno.json");
  const content = await Deno.readTextFile(denoJsonPath);
  const config = JSON.parse(content);

  if (!config.version) throw new Error("No version found in deno.json");
  if (!config.name) throw new Error("No name found in deno.json");

  const fullName = config.name as string;
  const match = fullName.match(/^(@([^/]+)\/)?(.+)$/);
  const scope = match?.[2] || "";
  const packageName = match?.[3] || fullName;

  let entryPoint = "./src/main.ts";
  if (typeof config.exports === "string") {
    entryPoint = config.exports;
  } else if (config.exports?.["."]) {
    entryPoint = config.exports["."];
  }

  return {
    name: fullName,
    scope,
    packageName,
    version: config.version,
    entryPoint,
  };
}

// Helper: Show usage information
function showHelp() {
  console.log(`
${bold("Usage:")} ${SCRIPT_NAME} [options] <version|major|minor|patch>

${bold("Options:")}
  -d, --dry-run      Stop before pushing to GitHub
  -y, --yes          Skip confirmation prompt (auto-confirm)
  -q, --quiet        Suppress non-essential output
  -h, --help         Show this help message
  -v, --version      Show script version

${bold("Examples:")}
  ${SCRIPT_NAME} 0.3.0                # Set specific version
  ${SCRIPT_NAME} patch                # Bump patch (0.2.4 -> 0.2.5)
  ${SCRIPT_NAME} minor                # Bump minor (0.2.4 -> 0.3.0)
  ${SCRIPT_NAME} major                # Bump major (0.2.4 -> 1.0.0)
  ${SCRIPT_NAME} --dry-run patch      # Stop before pushing to GitHub
  ${SCRIPT_NAME} --yes --quiet patch  # Non-interactive mode

${bold("Note:")} This script must be run from the project root directory.
`);
}

// Parse CLI arguments
const args = parseArgs(Deno.args, {
  boolean: ["dry-run", "help", "version", "yes", "quiet"],
  alias: {
    d: "dry-run",
    h: "help",
    v: "version",
    y: "yes",
    q: "quiet",
  },
  stopEarly: false,
});

// Show help and exit
if (args.help) {
  showHelp();
  Deno.exit(0);
}

if (args.version) {
  console.log(`${SCRIPT_NAME} version ${VERSION}`);
  Deno.exit(0);
}

const versionArg = args._[0]?.toString();
if (!versionArg) {
  showHelp();
  exitError("Missing version argument.");
}

const dryRun = args["dry-run"];
const autoConfirm = args.yes;
isQuiet = args.quiet;

// Main execution
try {
  const meta = await getProjectMeta();
  const current = semver.parse(meta.version);

  // Calculate next version
  let next: semver.SemVer;
  if (["major", "minor", "patch"].includes(versionArg)) {
    next = semver.parse(meta.version);
    if (versionArg === "major") {
      next.major++;
      next.minor = 0;
      next.patch = 0;
    } else if (versionArg === "minor") {
      next.minor++;
      next.patch = 0;
    } else {
      next.patch++;
    }
    next.prerelease = [];
  } else {
    try {
      next = semver.parse(versionArg);
    } catch {
      exitError(`Invalid version: ${versionArg}`);
    }
  }

  const nextVersion = semver.format(next);

  // Show version bump and confirm
  log.blank();
  log.info(
    `${bold("Version bump:")} ${green(semver.format(current))} -> ${
      yellow(nextVersion)
    }`,
  );
  log.blank();

  // Only prompt if interactive and not auto-confirmed
  const isInteractive = Deno.stdin.isTerminal();
  if (!autoConfirm && isInteractive) {
    if (!confirm("Proceed with version update?")) {
      log.info("Cancelled.");
      Deno.exit(0);
    }
  } else if (!autoConfirm && !isInteractive) {
    exitError(
      "Running in non-interactive mode without --yes flag. Use --yes to auto-confirm or run interactively.",
    );
  }

  log.blank();

  // Update version files
  const versionFile = join(ROOT_DIR, meta.entryPoint);
  const denoJsonFile = join(ROOT_DIR, "deno.json");

  log.step(`Updating ${meta.entryPoint}...`);
  let content = await Deno.readTextFile(versionFile);
  const updated = content.replace(
    /(?:export )?const VERSION = "[^"]+";/,
    (match) => match.replace(/"[^"]+"/, `"${nextVersion}"`),
  );
  if (content === updated) {
    exitError(`Failed to update VERSION constant in ${meta.entryPoint}`);
  }
  await Deno.writeTextFile(versionFile, updated);
  log.success(`Updated ${meta.entryPoint}`);

  log.step("Updating deno.json...");
  content = await Deno.readTextFile(denoJsonFile);
  const updatedJson = content.replace(
    /"version":\s*"[^"]+"/,
    `"version": "${nextVersion}"`,
  );
  if (content === updatedJson) {
    exitError("Failed to update version in deno.json");
  }
  await Deno.writeTextFile(denoJsonFile, updatedJson);
  log.success("Updated deno.json");

  // Update CHANGELOG.md with release date
  log.step("Updating CHANGELOG.md...");
  if (
    !(await run("deno", [
      "run",
      "-A",
      join(ROOT_DIR, "tools", "update-changelog.ts"),
      nextVersion,
    ]))
  ) {
    log.warn("Failed to update CHANGELOG.md - continuing anyway");
  }

  // Run tests
  log.blank();
  log.step("Running tests...");
  log.blank();
  if (!(await run("deno", ["task", "check"]))) {
    exitError("Tests failed. Please fix issues before releasing.");
  }
  log.blank();
  log.success("All tests passed!");

  // Git operations
  log.blank();
  log.step("Creating release...");
  log.blank();

  // Extract changelog once for both commit and tag
  log.step("Extracting changelog...");
  const changelog = await getChangelog(nextVersion);

  // Commit with changelog in message body
  log.step(`Committing... chore: release v${nextVersion}`);
  const commitMessage = `chore: release v${nextVersion}\n\n${changelog}`;
  if (!(await run("git", ["commit", "-am", commitMessage]))) {
    exitError("Git commit failed. Please check git status.");
  }
  log.success("Changes committed");

  // Create annotated tag with changelog
  log.blank();
  log.step(`Creating tag... v${nextVersion}`);
  if (!(await run("git", ["tag", "-a", `v${nextVersion}`, "-m", changelog]))) {
    exitError("Git tag creation failed.");
  }
  log.success("Tag created with changelog");

  // Handle dry-run or push
  if (dryRun) {
    log.blank();
    log.warn(bold("🏃 Dry-run mode - stopping before push"));
    log.blank();
    log.step("To revert:");
    log.info(yellow(`git reset --hard HEAD~1 && git tag -d v${nextVersion}`));
    log.blank();
    log.step("To complete release:");
    log.info(yellow(`git push && git push --tags`));
    log.blank();
    printLinks(meta, nextVersion);
    Deno.exit(0);
  }

  log.blank();
  log.step("Pushing to remote...");
  if (!(await run("git", ["push"]))) {
    exitError("Git push failed.");
  }
  if (!(await run("git", ["push", "--tags"]))) {
    exitError("Git push tags failed.");
  }
  log.success("Pushed to remote");

  log.blank();
  log.success(bold(`🎉 Release v${nextVersion} complete!`));
  log.blank();
  printLinks(meta, nextVersion);
} catch (error) {
  exitError(error instanceof Error ? error.message : String(error));
}

// Helper: Print relevant links
function printLinks(meta: ProjectMeta, version: string) {
  try {
    const repoUrl = Deno.readTextFileSync(join(ROOT_DIR, ".git", "config"))
      .match(/url = (.+)/)?.[1]
      ?.replace(/\.git$/, "")
      ?.replace(/^git@github\.com:/, "https://github.com/");

    if (repoUrl) {
      log.info(`GitHub: ${yellow(`${repoUrl}/releases/tag/v${version}`)}`);
    }
    if (meta.scope) {
      log.info(`JSR: ${yellow(`https://jsr.io/${meta.name}@${version}`)}`);
    }
    log.blank();
  } catch {
    // Ignore if we can't read git config
  }
}
