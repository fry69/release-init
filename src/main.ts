#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Release Automation Initializer
 *
 * Adds GitHub workflows and release tools to an existing Deno project.
 * Uses the same workflows and tools that @fry69/release itself uses.
 *
 * Usage:
 *   deno run -A jsr:@fry69/release [options] [target-directory]
 *   release init [options] [target-directory]
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import { bold, cyan, green, red, yellow } from "@std/fmt/colors";
import { basename, join, resolve } from "@std/path";

// Script metadata
const VERSION = "0.0.2";
const SCRIPT_NAME = "release";

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

// Helper: Show usage information
function showHelp() {
  console.log(`
${bold("Release Automation Initializer")} - Add GitHub workflows & release tools

${bold("Usage:")} ${SCRIPT_NAME} [options] [target-directory]

${bold("Arguments:")}
  target-directory   Path to existing Deno project (default: current directory)

${bold("Options:")}
  -f, --force        Overwrite existing files without prompting
  -y, --yes          Skip confirmation prompt (auto-confirm)
  -q, --quiet        Suppress non-essential output
  -h, --help         Show this help message
  -v, --version      Show script version

${bold("What gets installed:")}
  ${cyan(".github/workflows/")}
    - ci.yml           Continuous Integration workflow
    - release.yml      Build & release binaries workflow
    - publish.yml      JSR publishing workflow

  ${cyan("tools/")}
    - release.ts       Version bump & release automation
    - get-changelog.ts Extract changelog entries
    - get-meta.ts      Extract project metadata
    - update-changelog.ts Update changelog with release date

${bold("Examples:")}
  ${SCRIPT_NAME}                    # Install in current directory
  ${SCRIPT_NAME} ../my-project      # Install in ../my-project
  ${SCRIPT_NAME} --force .          # Overwrite existing files
  ${SCRIPT_NAME} --yes ~/dev/app    # Non-interactive installation

${bold("Requirements:")}
  - Target must be a Deno project (have deno.json or deno.jsonc)
  - Existing files will not be overwritten unless --force is used

${bold("After installation:")}
  1. Review and customize the generated workflows
  2. Add tasks to deno.json if desired:
     ${yellow(`"release": "deno run -A tools/release.ts"`)}
  3. Create a CHANGELOG.md file for release notes
  4. Commit and push to trigger CI workflow
`);
}

// File definitions - maps destination path to source path in package
interface FileMapping {
  dest: string;
  source: string;
  description: string;
}

// Get template files from package structure
function getPackageRoot(): string {
  // import.meta.url points to src/main.ts
  // We need to go up one level to get package root
  const url = new URL("..", import.meta.url);
  return url.pathname;
}

// Define all files to copy
function getFilesMappings(): FileMapping[] {
  const pkgRoot = getPackageRoot();

  return [
    // GitHub Workflows
    {
      dest: ".github/workflows/ci.yml",
      source: join(pkgRoot, ".github", "workflows", "ci.yml"),
      description: "CI workflow (lint, format, test)",
    },
    {
      dest: ".github/workflows/release.yml",
      source: join(pkgRoot, ".github", "workflows", "release.yml"),
      description: "Release workflow (build binaries, create GitHub release)",
    },
    {
      dest: ".github/workflows/publish.yml",
      source: join(pkgRoot, ".github", "workflows", "publish.yml"),
      description: "JSR publish workflow",
    },
    // Tools
    {
      dest: "tools/release.ts",
      source: join(pkgRoot, "tools", "release.ts"),
      description: "Release automation script",
    },
    {
      dest: "tools/get-changelog.ts",
      source: join(pkgRoot, "tools", "get-changelog.ts"),
      description: "Extract changelog entries",
    },
    {
      dest: "tools/get-meta.ts",
      source: join(pkgRoot, "tools", "get-meta.ts"),
      description: "Extract project metadata",
    },
    {
      dest: "tools/update-changelog.ts",
      source: join(pkgRoot, "tools", "update-changelog.ts"),
      description: "Update changelog with release date",
    },
  ];
}

// Check if target is a Deno project
async function validateDenoProject(targetDir: string): Promise<void> {
  const denoJson = join(targetDir, "deno.json");
  const denoJsonc = join(targetDir, "deno.jsonc");

  try {
    await Deno.stat(denoJson);
    return; // Found deno.json
  } catch {
    // Try deno.jsonc
    try {
      await Deno.stat(denoJsonc);
      return; // Found deno.jsonc
    } catch {
      exitError(
        `Target directory is not a Deno project (no deno.json or deno.jsonc found).\n  Path: ${targetDir}`,
      );
    }
  }
}

// Check if file exists
async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

// Check for conflicts (existing files)
async function checkConflicts(
  targetDir: string,
  files: FileMapping[],
  force: boolean,
): Promise<string[]> {
  const conflicts: string[] = [];

  for (const file of files) {
    const destPath = join(targetDir, file.dest);
    if (await fileExists(destPath)) {
      conflicts.push(file.dest);
    }
  }

  if (conflicts.length > 0 && !force) {
    log.blank();
    log.error("The following files already exist:");
    for (const conflict of conflicts) {
      log.info(yellow(conflict));
    }
    log.blank();
    log.info("Use --force to overwrite existing files.");
    log.blank();
    return conflicts;
  }

  return [];
}

// Copy a single file
async function copyFile(
  sourcePath: string,
  destPath: string,
  description: string,
): Promise<void> {
  try {
    // Read from package
    const content = await Deno.readTextFile(sourcePath);

    // Ensure destination directory exists
    const destDir = destPath.substring(0, destPath.lastIndexOf("/"));
    await Deno.mkdir(destDir, { recursive: true });

    // Write to target
    await Deno.writeTextFile(destPath, content);

    log.success(`${description}`);
  } catch (error) {
    throw new Error(
      `Failed to copy ${sourcePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// Main installation function
async function install(
  targetDir: string,
  force: boolean,
): Promise<void> {
  log.blank();
  log.step(`Installing release automation to: ${cyan(targetDir)}`);
  log.blank();

  // Validate target is a Deno project
  await validateDenoProject(targetDir);
  log.success("Validated Deno project");

  // Get file mappings
  const files = getFilesMappings();

  // Check for conflicts
  const conflicts = await checkConflicts(targetDir, files, force);
  if (conflicts.length > 0) {
    Deno.exit(1);
  }

  if (force && conflicts.length > 0) {
    log.warn(`Overwriting ${conflicts.length} existing file(s)`);
  }

  // Copy all files
  log.blank();
  log.step("Installing files...");
  log.blank();

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const destPath = join(targetDir, file.dest);
    try {
      await copyFile(file.source, destPath, file.dest);
      successCount++;
    } catch (error) {
      log.error(
        `Failed to install ${file.dest}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      errorCount++;
    }
  }

  log.blank();

  if (errorCount > 0) {
    exitError(
      `Installation completed with errors: ${successCount} succeeded, ${errorCount} failed`,
    );
  }

  log.success(bold(`✨ Successfully installed ${successCount} files!`));
  log.blank();

  // Post-installation instructions
  printNextSteps(targetDir);
}

// Print next steps after installation
function printNextSteps(targetDir: string) {
  const isCurrentDir = resolve(targetDir) === resolve(Deno.cwd());
  const dirPrefix = isCurrentDir ? "" : `cd ${basename(targetDir)} && `;

  log.step("Next steps:");
  log.blank();

  log.info("1. Review the generated workflows:");
  log.info(`   ${yellow(`${dirPrefix}cat .github/workflows/ci.yml`)}`);
  log.blank();

  log.info("2. (Optional) Add tasks to your deno.json:");
  log.info(`   ${cyan(`"tasks": {`)}`);
  log.info(`   ${cyan(`  "release": "deno run -A tools/release.ts"`)}`);
  log.info(`   ${cyan(`}`)}`);
  log.blank();

  log.info("3. Create a CHANGELOG.md file if you don't have one:");
  log.info(`   ${yellow(`${dirPrefix}touch CHANGELOG.md`)}`);
  log.blank();

  log.info("4. Commit and push to trigger CI:");
  log.info(`   ${yellow(`${dirPrefix}git add .`)}`);
  log.info(
    `   ${yellow(`${dirPrefix}git commit -m "chore: add release automation"`)}`,
  );
  log.info(`   ${yellow(`${dirPrefix}git push`)}`);
  log.blank();

  log.info("5. When ready to release:");
  log.info(`   ${yellow(`${dirPrefix}deno run -A tools/release.ts patch`)}`);
  log.blank();

  log.info(bold("📚 Documentation:"));
  log.info(`   GitHub: ${cyan("https://github.com/fry69/release")}`);
  log.info(`   JSR: ${cyan("https://jsr.io/@fry69/release")}`);
  log.blank();
}

// Parse CLI arguments
const args = parseArgs(Deno.args, {
  boolean: ["force", "help", "version", "yes", "quiet"],
  alias: {
    f: "force",
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

// Show version and exit
if (args.version) {
  console.log(`${SCRIPT_NAME} version ${VERSION}`);
  Deno.exit(0);
}

// Extract target directory
const targetArg = args._[0]?.toString() || ".";
const targetDir = resolve(targetArg);
const force = args.force;
const autoConfirm = args.yes;
isQuiet = args.quiet;

// Main execution
try {
  // Verify target directory exists
  try {
    const stat = await Deno.stat(targetDir);
    if (!stat.isDirectory) {
      exitError(`Target is not a directory: ${targetDir}`);
    }
  } catch {
    exitError(`Target directory does not exist: ${targetDir}`);
  }

  // Show what will be installed
  if (!isQuiet) {
    log.blank();
    log.info(bold("Release Automation Initializer"));
    log.info(`Target: ${cyan(targetDir)}`);
    log.info(`Force overwrite: ${force ? yellow("yes") : "no"}`);
    log.blank();
  }

  // Confirmation prompt (unless --yes or --quiet)
  const isInteractive = Deno.stdin.isTerminal();
  if (!autoConfirm && isInteractive && !isQuiet) {
    const files = getFilesMappings();
    log.info(`This will install ${files.length} files to your project.`);
    log.blank();

    if (!confirm("Continue with installation?")) {
      log.info("Installation cancelled.");
      Deno.exit(0);
    }
  } else if (!autoConfirm && !isInteractive) {
    exitError(
      "Running in non-interactive mode without --yes flag. Use --yes to auto-confirm or run interactively.",
    );
  }

  // Perform installation
  await install(targetDir, force);
} catch (error) {
  exitError(error instanceof Error ? error.message : String(error));
}
