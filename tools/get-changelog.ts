#!/usr/bin/env -S deno run --allow-read
/**
 * Extract changelog entry for a specific version
 *
 * Liberal in what it accepts - handles various common changelog formats:
 * - Keep a Changelog: ## [1.2.3] - 2024-01-15
 * - With v prefix: ### v1.2.3
 * - Without brackets: ## 1.2.3 - 2024-01-15
 * - Unreleased sections: ## [Unreleased]
 *
 * Usage:
 *   get-changelog.ts <version>
 *
 * Outputs the changelog section to stdout
 *
 * @module
 */

const versionArg = Deno.args[0] ?? "";
if (!versionArg) {
  console.error("Usage: deno run -A tools/get-changelog.ts <version>");
  Deno.exit(1);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalize version (remove leading 'v' if present)
const version = versionArg.replace(/^v/, "");
let content: string;
try {
  const md = await Deno.readTextFile("CHANGELOG.md");
  const lines = md.split(/\r?\n/);

  // Liberal pattern matching - accepts various formats:
  // ## [1.2.3] - 2024-01-15   (Keep a Changelog)
  // ## [1.2.3]                (Keep a Changelog without date)
  // ## 1.2.3 - 2024-01-15     (without brackets)
  // ### v1.2.3                (with v prefix)
  // # 1.2.3                   (any heading level)
  const hdrRx = new RegExp(
    `^#{1,6}\\s*\\[?v?${
      escapeForRegex(version)
    }\\]?(?:\\s+-\\s+\\d{4}-\\d{2}-\\d{2})?`,
    "i",
  );

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (hdrRx.test(lines[i])) {
      start = i;
      break;
    }
  }

  if (start === -1) {
    // Fallback: try finding "## [Unreleased]" or "## Unreleased"
    // This handles Keep a Changelog's unreleased section
    const unreleasedRx = /^#{1,6}\s*\[?Unreleased\]?/i;
    start = lines.findIndex((l) => unreleasedRx.test(l));
  }
  if (start === -1) {
    content =
      `No changelog entry found for version ${version} and no 'Unreleased' section present.`;
  } else {
    // Gather content until next same-or-higher-level heading
    // Determine the heading level of the found section
    const startLine = lines[start];
    const startLevel = startLine.match(/^(#{1,6})/)?.[1].length ?? 2;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+\S/);
      if (match) {
        const level = match[1].length;
        // Stop at same or higher level heading (lower number = higher level)
        if (level <= startLevel) {
          end = i;
          break;
        }
      }
    }

    content = lines.slice(start, end).join("\n").trim();

    // Optional: Strip link references at the end (Keep a Changelog format)
    // Link refs look like: [1.2.3]: https://github.com/...
    content = content.replace(/\n\n\[[\d.]+\]:\s+https?:\/\/.+$/s, "");
  }
} catch (err) {
  content = `Failed to read CHANGELOG.md: ${
    err instanceof Error ? err.message : String(err)
  }`;
}
// Output to stdout
console.log(content);
