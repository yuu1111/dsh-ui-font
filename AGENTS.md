# Repository Guidelines

## Project Structure & Module Organization

`src/index.ts` is the host half: it declares both font stacks as `.volatile()` config fields, tells the settings domain it ships its own form policy through `settings.configure({ auto: false }, ctx.fiber)`, and pushes one `{ kind: "style" }` row on `webserver/index-inject`, so the saved stacks are in effect for the first paint. `src/client.tsx` is the browser half: it reads the profile entry through `ctx.configForms.get("ui-font")`, keeps a stylesheet tag in sync with the snapshot, and registers the two rows in the `settings.general.item` slot. Each row shows the stored stack as ordered chips plus a sample line, and **Add font** opens an anchored picker over the families the browser reports through `queryLocalFonts()`, with a bundled list as the fallback. `src/shared.ts` holds what both halves agree on — the namespace, the default stacks, the sanitiser, the stack parser and formatter, and the stylesheet builder. `build.ts` emits `lib/` with esbuild invoked through tsx on Node.js: the host half as ESM and the browser half as CJS wrapped in the `window.__ModuleLoader__.load({ id, factory })` loader format. `lib/` is generated and ignored by git — `pnpm run build` writes it locally and `prepack` builds it into the published tarball, so never commit it. `cordis.patch.yml` inserts the plugin row; its `id` doubles as the settings namespace, so it must stay `ui-font`. `quality.json` declares which engines `quality-check` runs and all bundled checker rules as errors, with warnings blocking and no baseline exemptions; `knip.ts` names the source entry points Knip cannot infer; tests live in `tests/**/*.test.ts` and run against the built `lib/` so the shipped artifacts are what gets verified.

## Build, Test, and Development Commands

Use Node.js 22.12.0 or newer and pnpm 10.34.6, as declared by `engines` and `packageManager` in `package.json`. CI uses Node.js 24. Bun 1.4.2 is allowed only as the runtime for the upstream `quality-check` CLI; never use it for dependency management, builds, or tests.

- `pnpm install --frozen-lockfile` installs exactly the locked dependencies.
- `pnpm run build` regenerates `lib/index.js` and `lib/client.js`.
- `pnpm run check` runs TypeScript type-checking without emitting files.
- `pnpm run lint` checks `src/`, `tests/`, the root TypeScript files, and the JSON manifests with Biome.
- `pnpm run format` applies Biome fixes, including unsafe ones.
- `pnpm run check:quality` runs the engines declared in `quality.json` — Biome, the type checker, Knip, and the code, comment, document, and TSDoc checkers — and fails when one of them fails.
- `pnpm run test` rebuilds `lib/`, then runs Vitest (`vitest run`).
- `npm pack --dry-run --ignore-scripts` verifies the publishable file set; `prepack` builds `lib/` on a real pack or publish.

Before committing, run `pnpm run check:quality` and `pnpm run test`. CI repeats the build, the quality check, the tests, and the tarball check on Linux.

## Coding Style & Naming Conventions

Write strict TypeScript ESM and follow the shared Biome and TypeScript configurations referenced by `biome.json` and `tsconfig.json`. Biome enforces tab indentation, double quotes, and expanded JSON. Write JSDoc in Japanese, keep it to what the code cannot say, and always use the multi-line block form — `/**` on its own line, the text, then `*/` on its own line — instead of a one-line `/** ... */`. The TSDoc checker requires a TSDoc comment on every exported declaration and rejects tags TSDoc does not define, so state the summary as prose rather than as `@description`. Use `camelCase` for functions and variables, `PascalCase` for types, and named exports only — the client bundle must export exactly the `apply` and `inject` plugin face.

## Client Bundle Constraints

The browser half may only `require()` modules the shell seeds: `react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-store`, and `@deepseek-ai/dsh-client-ui-primitives`. Reach everything else — `slots`, `locale`, `configForms` — through cordis services named in `inject`. `build.ts` fails when any other specifier appears in the bundle, and pins `jsxDev: false` because the shell does not seed `react/jsx-dev-runtime`. Declaring those specifiers in `dsh.client.external` is unnecessary, since they are static-table names rather than package rows.

## Testing Guidelines

Use `vitest` with `describe`, `test`, and `expect`, and name files `*.test.ts`. `tests/host.test.ts` stubs a cordis context and asserts the settings schema, the registration call, the injected style row, and the live switch of the value source. `tests/client.test.ts` loads `lib/client.js` with a stubbed `window.__ModuleLoader__`, a stub `require`, and a three-hook React stand-in (`useState`, `useEffect`, `useRef`); it asserts the module id, the exported plugin face, the namespace binding, the stylesheet tags, the row registration, the dictionary registration, and every picker path — installed list, bundled fallback, refused access, free-text add, chip removal, and reordering. Stub `globalThis.queryLocalFonts` per test and keep the catalogue in a component ref instead of module scope, or the first test decides what the rest see. `tests/shared.test.ts` covers stack parsing, quoting, sanitising, and the round trip of the shipped defaults. `pnpm run test` rebuilds `lib/` first, so the suite always checks the artifacts the tarball ships.

## Release

Bump `version`, commit, and publish a GitHub Release for the matching tag (`v1.1.0` ↔ `1.1.0`). `.github/workflows/release.yml` builds and verifies the tarball in a `contents: read` job, then publishes that artifact from a separate `id-token: write` job with npm trusted publishing, so no long-lived npm token exists. The one-time bootstrap publish (`0.0.0` under the `bootstrap` dist-tag) and the trusted publisher registration happen once per package, not per version.

## Commit & Pull Request Guidelines

Use short, imperative, sentence-case subjects. Keep each commit focused and explain behavior or install effects in the body. PRs should summarize the behavior change, list the verification commands that ran, and note any DSH version the change depends on.
