# Compiling a Standalone Binary

The `@fry69/release` init tool can be compiled into a standalone executable that
includes all template files embedded within it. This allows distribution without
requiring Deno to be installed.

## Overview

Starting with Deno 2.1, the `--include` flag allows embedding files and
directories into compiled binaries. Our compile task leverages this to bundle
the `.github/workflows/` and `tools/` template directories.

## Compiling

### Using the Task

```bash
deno task compile
```

This creates a `release` binary in the current directory.

### Manual Compilation

```bash
deno compile -P --include .github --include tools --output release src/main.ts
```

### What Gets Embedded

The compilation process embeds:

- `.github/workflows/` directory (all workflow YAML files)
- `tools/` directory (all release automation scripts)
- All TypeScript dependencies

**Embedded Files Output:**

```
Embedded Files

release
├── .github/* (9.22KB)
├── src/* (28.85KB)
└── tools/* (46.89KB)

Files: 87.71KB
Metadata: 1.89MB
Remote modules: 543.2KB
```

## Installation

### Local Installation

```bash
deno task install:local
```

This compiles the binary and moves it to `$HOME/.local/bin/release`.

### Manual Installation

```bash
# Compile
deno task compile

# Install (choose your preferred location)
mv release /usr/local/bin/release
# or
cp release ~/.local/bin/release
# or
sudo mv release /usr/bin/release
```

## Usage

Once installed, use the binary exactly like the Deno version:

```bash
# Show help
release --help

# Install to current directory
release

# Install to specific project
release ../my-project

# Non-interactive installation
release --yes ~/dev/app
```

## How It Works

### Path Resolution

The code uses `import.meta.dirname` for Deno 2.1+ which properly resolves paths
in compiled binaries:

```typescript
function getPackageRoot(): string {
  if (import.meta.dirname) {
    // Deno 2.1+: use import.meta.dirname for compiled binaries
    return join(import.meta.dirname, "..");
  } else {
    // Fallback for older Deno versions
    const url = new URL("..", import.meta.url);
    return url.pathname;
  }
}
```

### Template Access

Templates are accessed relative to the binary's embedded file system:

```typescript
const pkgRoot = getPackageRoot();
const ciYml = await Deno.readTextFile(
  join(pkgRoot, ".github", "workflows", "ci.yml"),
);
```

## Binary Size

The compiled binary is approximately **70MB** (varies by platform) and includes:

- Deno runtime (slimmed down)
- V8 JavaScript engine
- TypeScript compiler
- All dependencies
- Template files

## Cross-Compilation

Compile for different platforms using the `--target` flag:

```bash
# macOS ARM64 (Apple Silicon)
deno compile -P --include .github --include tools \
  --target aarch64-apple-darwin \
  --output release-macos-arm64 \
  src/main.ts

# macOS x86_64 (Intel)
deno compile -P --include .github --include tools \
  --target x86_64-apple-darwin \
  --output release-macos-x64 \
  src/main.ts

# Linux x86_64
deno compile -P --include .github --include tools \
  --target x86_64-unknown-linux-gnu \
  --output release-linux-x64 \
  src/main.ts

# Linux ARM64
deno compile -P --include .github --include tools \
  --target aarch64-unknown-linux-gnu \
  --output release-linux-arm64 \
  src/main.ts

# Windows x86_64
deno compile -P --include .github --include tools \
  --target x86_64-pc-windows-msvc \
  --output release-windows-x64.exe \
  src/main.ts
```

## Verification

Test the compiled binary:

```bash
# Check help
./release --help

# Check version
./release --version

# Test installation in temp directory
cd /tmp && mkdir test-project
cd test-project
echo '{"name":"test","version":"0.0.1","exports":"./main.ts"}' > deno.json
/path/to/release --yes .

# Verify files were created
find . -type f | sort
```

## Limitations

When using compiled binaries:

- ❌ Web Storage API not available
- ❌ Web Cache not available
- ✅ File system operations work normally
- ✅ Network access works (with permissions)
- ✅ All standard Deno APIs work

## Advantages

**Compiled Binary:**

- ✅ Single file distribution
- ✅ No Deno installation required
- ✅ Faster startup (no parsing/type-checking)
- ✅ Templates bundled (offline capable)
- ✅ Cross-platform compilation

**Direct Deno Execution:**

- ✅ Smaller download (no embedded runtime)
- ✅ Automatic updates via JSR
- ✅ Easy to modify/debug
- ✅ Access to latest Deno features

## Troubleshooting

### Binary Won't Execute

On macOS, you may need to remove the quarantine attribute:

```bash
xattr -d com.apple.quarantine release
```

### Permission Denied

Make the binary executable:

```bash
chmod +x release
```

### Templates Not Found

Verify templates were embedded during compilation:

```bash
# Look for "Embedded Files" in compile output
deno task compile
```

The output should show `.github/*` and `tools/*` in the embedded files list.

## See Also

- [Deno Compile Documentation](https://docs.deno.com/runtime/reference/cli/compile/)
- [Init Tool Documentation](./INIT_TOOL.md)
- [Main README](../README.md)
