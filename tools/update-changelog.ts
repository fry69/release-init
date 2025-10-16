#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Update CHANGELOG.md with the release date for a version
 *
 * Follows Keep a Changelog format (https://keepachangelog.com/)
 *
 * Usage:
 *   update-changelog.ts <version>
 *
 * This script:
 * - Finds the version header in CHANGELOG.md
 * - Updates to Keep a Changelog format: ## [1.2.3] - YYYY-MM-DD
 * - Removes "(unreleased)" or similar markers
 * - If no header exists, creates one after the main title
 * - Square brackets make versions linkable (add link refs at bottom manually)
 *
 * @module
 */

/** Version of the update-changelog tool */
export const VERSION = "0.0.3";

const versionArg = Deno.args[0] ?? "";
if (!versionArg) {
  console.error("Usage: deno run -A tools/update-changelog.ts <version>");
  Deno.exit(1);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalize version (remove leading 'v' if present)
const version = versionArg.replace(/^v/, "");

// Get current date in YYYY-MM-DD format
const today = new Date().toISOString().split("T")[0];

try {
  const changelogPath = "CHANGELOG.md";
  const content = await Deno.readTextFile(changelogPath);
  const lines = content.split(/\r?\n/);

  // Find version header line (e.g., "## [1.2.3]" or "## 1.2.3" or "## [Unreleased]")
  const versionRx = new RegExp(
    `^(#{1,6}\\s*)(\\[?)(v?${escapeForRegex(version)})(\\]?)(.*)$`,
    "i",
  );
  const unreleasedRx = /^(#{1,6}\s*)(\[?)(Unreleased)(\]?)(.*)$/i;

  let headerIndex = -1;
  let isUnreleased = false;

  // First, try to find exact version match
  for (let i = 0; i < lines.length; i++) {
    if (versionRx.test(lines[i])) {
      headerIndex = i;
      break;
    }
  }

  // If not found, look for [Unreleased] section
  if (headerIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (unreleasedRx.test(lines[i])) {
        headerIndex = i;
        isUnreleased = true;
        break;
      }
    }
  }

  if (headerIndex !== -1) {
    // Update existing header
    const line = lines[headerIndex];
    let newLine: string;

    if (isUnreleased) {
      // Replace "Unreleased" with version and date (Keep a Changelog format)
      newLine = line.replace(
        unreleasedRx,
        `$1[${version}] - ${today}`,
      );
    } else {
      // Update existing version header (Keep a Changelog format)
      // Remove any existing date and (unreleased) markers
      newLine = line.replace(versionRx, (_, prefix, _lb, ver, _rb) => {
        // Keep a Changelog format: use brackets, no 'v' prefix
        const cleanVer = ver.replace(/^v/, "");
        return `${prefix}[${cleanVer}] - ${today}`;
      });
    }

    lines[headerIndex] = newLine;
    console.log(`✓ Updated header: ${newLine.trim()}`);
  } else {
    // No header found - create new one
    // Find where to insert (after main title, typically after first # heading)
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^#\s+/.test(lines[i])) {
        // Found main title, insert after it (skip blank lines)
        insertIndex = i + 1;
        while (insertIndex < lines.length && lines[insertIndex].trim() === "") {
          insertIndex++;
        }
        break;
      }
    }

    // Create new header section (Keep a Changelog format)
    const newHeader = `## [${version}] - ${today}`;
    const newSection = [
      "",
      newHeader,
      "",
      "### Added",
      "",
      "- Initial release",
      "",
    ];

    lines.splice(insertIndex, 0, ...newSection);
    console.log(`✓ Created new header: ${newHeader}`);
  }

  // Write back to file
  await Deno.writeTextFile(changelogPath, lines.join("\n"));
  console.log(`✓ Updated ${changelogPath}`);
} catch (err) {
  console.error(
    `Error: Failed to update CHANGELOG.md: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  Deno.exit(1);
}
