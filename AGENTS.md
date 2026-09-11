# Repository Guidelines

## Project Structure & Module Organization

`src/index.ts` is the inert host half of the plugin: it exists so the package is an enabled Loader entry whose `dsh.client` bundle client-modules serves. `src/client.ts` is the browser half that overrides the font tokens through the theme service. `build.ts` emits `lib/` with Bun's bundler: the host half as ESM and the browser half as CJS wrapped in the `window.__ModuleLoader__.load({ id, factory })` loader format. `lib/` is tracked generated output — update `src/`, run `bun run build`, and commit both. `cordis.patch.yml` inserts the plugin row; tests live in `tests/**/*.test.ts` and run against the built `lib/client.js` so the shipped artifact is what gets verified.

## Build, Test, and Development Commands

Use the Bun version declared by `packageManager` in `package.json`.

- `bun install --frozen-lockfile` installs exactly the locked dependencies.
- `bun run build` regenerates `lib/index.js` and `lib/client.js`.
- `bun run check` runs TypeScript type-checking without emitting files.
- `bun run lint` checks `src/`, `tests/`, `build.ts`, and the JSON manifests with Biome.
- `bun run format` applies Biome fixes, including unsafe ones.
- `bun test` runs the Bun test suite.
- `npm pack --dry-run --ignore-scripts` verifies the publishable file set.

Before committing, run lint, type-checking, build, and tests. CI repeats them on Linux and fails when the committed `lib/` differs from a fresh build.

## Coding Style & Naming Conventions

Write strict TypeScript ESM and follow the shared Biome and TypeScript configurations referenced by `biome.json` and `tsconfig.json`. Biome enforces tab indentation, double quotes, and expanded JSON; write JSDoc in Japanese and keep it to what the code cannot say. Use `camelCase` for functions and variables, `PascalCase` for types, and named exports only — the client bundle must export exactly the `apply` and `inject` plugin face.

## Testing Guidelines

Use `bun:test` with `describe`, `test`, and `expect`, and name files `*.test.ts`. Tests load `lib/client.js` with a stubbed `window.__ModuleLoader__` and assert the real contract: the module id equals the package name, the exported plugin face is correct, the theme path stacks a token layer with `JetBrains Mono` in both palettes, and the fallback path installs and removes a stylesheet. Rebuild before testing when `src/` changed.

## Commit & Pull Request Guidelines

Use short, imperative, sentence-case subjects. Keep each commit focused and explain behavior or install effects in the body. PRs should summarize the behavior change, list the verification commands that ran, and note any DSH version the change depends on.
