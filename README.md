# dsh-ui-font

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI plugin that changes the UI typeface.

[日本語](README.ja.md)

## Why this exists

The DSH Web GUI exposes the color scheme and the conversation font size in **Settings → General**, but not the font family. `dsh-client-ui-theme` ships `base.css` with two hardcoded stacks:

| Token | Used by | Stock value |
| --- | --- | --- |
| `--dsw-font-family` | body text and UI chrome | `-apple-system, BlinkMacSystemFont, "Segoe UI", ...` |
| `--ds-font-family-code` | code blocks and monospace UI | `"SF Mono", "JetBrains Mono", "Fira Code", Consolas, ...` |

This plugin stacks a token layer over the active theme through `ctx.theme.overrideTokens()`, so the typeface survives `light` / `dark` / `system` switches and no file inside the DSH installation is modified (an npm update cannot revert it).

## Install

```powershell
dsh plugin --profile web add github:yuu1111/dsh-ui-font
dsh web
```

`dsh plugin` forwards to pnpm inside the profile directory and appends dependency packages that declare `dsh.bundle` to `dsh.profile.bundles` automatically, so no manual patch editing is required. Refresh the browser afterwards.

From a local checkout instead (the package is symlinked into the profile, so later edits apply on browser reload):

```powershell
git clone https://github.com/yuu1111/dsh-ui-font
dsh plugin --profile web add "link:$((Resolve-Path .\dsh-ui-font).Path)"
```

Uninstall with `dsh plugin --profile web remove dsh-ui-font`.

## Configure

Edit the two constants at the top of `lib/client.js`:

| Constant | Shipped default | Applies to |
| --- | --- | --- |
| `FONT_SANS` | `"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", ...` | body text and UI |
| `FONT_MONO` | `"JetBrains Mono", "SF Mono", "Fira Code", Consolas, ...` | code and monospace |

JetBrains Mono carries no CJK glyphs, so the shipped `FONT_SANS` falls back to BIZ UDPGothic and Noto Sans JP for Japanese text. To keep the stock UI font and change code only:

```js
const FONT_SANS = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Yu Gothic UI\", Meiryo, sans-serif";
```

Reload the browser after editing — the host row does not need a restart. Keep at least one CJK-capable family after the Latin font, or Japanese text falls back to whatever the browser picks.

## How it works

- `lib/index.js` is an inert host half. A package's `dsh.client` bundle is served only for enabled Loader entries, so the row has to exist even though the host half does nothing.
- `lib/client.js` is a hand-written client bundle in the `window.__ModuleLoader__.load({ id, factory })` format. It declares `inject: ["theme"]`, then calls `overrideTokens("dsh-ui-font", {...})`. The ui-layout presenter writes the resolved tokens onto `document.body` as inline custom properties, and a value set on `body` overrides the `:root` declaration for every descendant.
- On a DSH version whose theme service has no `overrideTokens()`, the plugin falls back to appending a `:root, body` stylesheet with `!important`.

`--dsw-font-mono` is not declared by the stock sheets; some components read it through `var(--dsw-font-mono, ui-monospace, monospace)`, so the override claims it too.

## Verified with

- DSH `0.1.5-rc.2` (`@deepseek-ai/dsh-client-ui-theme` `0.1.5-rc.2`), Windows 11 / Chromium
- End-to-end check in a real browser: the plugin bundle is served from `/plugins/??dsh-ui-font/client.js`, `--dsw-font-family` lands on the `document.body` inline style, and `var(--dsw-font-family)` resolves to the configured stack

## License

MIT
