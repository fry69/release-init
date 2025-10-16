#!/usr/bin/env -S deno run --allow-read
/**
 * Extract project metadata from deno.json
 *
 * Reads deno.json and outputs metadata in GitHub Actions output format:
 * - tool_name: sanitized package name (without scope)
 * - tool_version: current version
 * - entry: main entry point path
 * - has_compile_task: whether compile:ci task exists
 *
 * This tool is used by the release workflow to determine build configuration.
 *
 * Usage:
 *   get-meta.ts
 *
 * Outputs to stdout in GITHUB_OUTPUT format (key=value pairs)
 *
 * @module
 */

/** Version of the get-meta tool */
export const VERSION = "0.0.2";

let raw;
try {
  raw = JSON.parse(await Deno.readTextFile("deno.json"));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("ERROR: Failed to read or parse deno.json:", message);
  Deno.exit(1);
}

// Extract and validate name
const rawName = raw.name ?? (raw.publish && raw.publish.name);
if (!rawName) {
  console.error("ERROR: 'name' field is required in deno.json");
  Deno.exit(1);
}
// sanitize name (strip scope @org/name -> name, and disallow strange chars)
const name = String(rawName).replace(/^@.*\//, "").replace(
  /[^a-zA-Z0-9._-]/g,
  "-",
);

// Extract and validate version
if (!raw.version) {
  console.error("ERROR: 'version' field is required in deno.json");
  Deno.exit(1);
}
const version = raw.version;

// Extract and validate entry point from exports
// Deno supports: "exports": "./src/mod.ts" or "exports": { ".": "./src/mod.ts" }
let entry;
if (!raw.exports) {
  console.error("ERROR: 'exports' field is required in deno.json");
  console.error(
    '  Expected: "exports": "./src/main.ts" or "exports": { ".": "./src/main.ts" }',
  );
  Deno.exit(1);
}

if (typeof raw.exports === "string") {
  entry = raw.exports;
} else if (
  typeof raw.exports === "object" && raw.exports["."] &&
  typeof raw.exports["."] === "string"
) {
  entry = raw.exports["."];
} else {
  console.error("ERROR: Invalid 'exports' format in deno.json");
  console.error(
    '  Expected: "exports": "./src/main.ts" or "exports": { ".": "./src/main.ts" }',
  );
  Deno.exit(1);
}

// Verify entry point file exists
try {
  await Deno.stat(entry);
} catch {
  console.error(`ERROR: Entry point file '${entry}' does not exist`);
  Deno.exit(1);
}

// Check if compile:ci task exists (optional - for conditional binary compilation)
const hasCompileTask = raw.tasks && typeof raw.tasks === "object" &&
  "compile:ci" in raw.tasks;

// Output to stdout in format: tool_name=<name>\ntool_version=<version>\nentry=<entry>\nhas_compile_task=<true|false>
console.log(
  `tool_name=${name}\ntool_version=${version}\nentry=${entry}\nhas_compile_task=${
    hasCompileTask ? "true" : "false"
  }`,
);
