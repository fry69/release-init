/**
 * Unit tests for tools/get-meta.ts
 *
 * Tests metadata extraction from deno.json including:
 * - Valid configurations with various export formats
 * - Error handling for missing or invalid fields
 * - Name sanitization (scope removal, special chars)
 * - Entry point validation
 */

import { expect } from "@std/expect";
import { join } from "@std/path";

async function runGetMeta(
  tempDir: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(
    Deno.cwd(),
    "tools",
    "get-meta.ts",
  );

  const command = new Deno.Command("deno", {
    args: ["run", "-A", scriptPath],
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

async function createDenoJson(
  tempDir: string,
  config: Record<string, unknown>,
) {
  const path = join(tempDir, "deno.json");
  await Deno.writeTextFile(path, JSON.stringify(config, null, 2));
}

async function createEntryPoint(tempDir: string, path: string) {
  const fullPath = join(tempDir, path);
  const dir = join(fullPath, "..");
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(fullPath, 'export const VERSION = "1.0.0";\n');
}

Deno.test("get-meta: valid config with string exports", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "@myorg/mytool",
      version: "1.2.3",
      exports: "./src/main.ts",
    });
    await createEntryPoint(tempDir, "src/main.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tool_name=mytool");
    expect(result.stdout).toContain("tool_version=1.2.3");
    expect(result.stdout).toContain("entry=./src/main.ts");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: valid config with object exports", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "simple-tool",
      version: "2.0.0",
      exports: {
        ".": "./mod.ts",
      },
    });
    await createEntryPoint(tempDir, "mod.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tool_name=simple-tool");
    expect(result.stdout).toContain("tool_version=2.0.0");
    expect(result.stdout).toContain("entry=./mod.ts");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: sanitizes special characters in name", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "@org/my tool!@#",
      version: "1.0.0",
      exports: "./main.ts",
    });
    await createEntryPoint(tempDir, "main.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    // Special chars replaced with dashes: "my tool!@#" -> "my-tool---"
    expect(result.stdout).toContain("tool_name=my-tool---");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: handles name without scope", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "unscoped-tool",
      version: "0.1.0",
      exports: "./index.ts",
    });
    await createEntryPoint(tempDir, "index.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tool_name=unscoped-tool");
    expect(result.stdout).not.toContain("@");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: error when deno.json missing", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR: Failed to read or parse deno.json");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: error when deno.json is invalid JSON", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    const path = join(tempDir, "deno.json");
    await Deno.writeTextFile(path, "{ invalid json }");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR: Failed to read or parse deno.json");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: error when name field missing", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      version: "1.0.0",
      exports: "./main.ts",
    });
    await createEntryPoint(tempDir, "main.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "ERROR: 'name' field is required in deno.json",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: error when version field missing", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "test-tool",
      exports: "./main.ts",
    });
    await createEntryPoint(tempDir, "main.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "ERROR: 'version' field is required in deno.json",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: error when exports field missing", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "test-tool",
      version: "1.0.0",
    });

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "ERROR: 'exports' field is required in deno.json",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: error when exports format invalid", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "test-tool",
      version: "1.0.0",
      exports: {
        "./submodule": "./sub.ts",
      },
    });

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "ERROR: Invalid 'exports' format in deno.json",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: error when entry point file doesn't exist", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "test-tool",
      version: "1.0.0",
      exports: "./nonexistent.ts",
    });

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR: Entry point file");
    expect(result.stderr).toContain("does not exist");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: supports name from publish.name field", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      publish: {
        name: "@scope/published-name",
      },
      version: "1.0.0",
      exports: "./main.ts",
    });
    await createEntryPoint(tempDir, "main.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tool_name=published-name");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("get-meta: output format is correct", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "get-meta-test-" });
  try {
    await createDenoJson(tempDir, {
      name: "format-test",
      version: "3.2.1",
      exports: "./lib/mod.ts",
    });
    await createEntryPoint(tempDir, "lib/mod.ts");

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^tool_name=.+$/);
    expect(lines[1]).toMatch(/^tool_version=.+$/);
    expect(lines[2]).toMatch(/^entry=.+$/);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
