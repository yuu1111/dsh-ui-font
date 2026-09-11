# dsh-ui-font

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) の Web GUI の書体を差し替えるプラグイン ソースは strict TypeScript で書き Biome と共有プリセット [`@yuu1111/biome-config`](https://www.npmjs.com/package/@yuu1111/biome-config) [`@yuu1111/tsconfig`](https://www.npmjs.com/package/@yuu1111/tsconfig) で検査し Bun で束ねる

[English](README.md)

## 作った理由

DSH の Web GUI は **設定 → 一般** で配色と会話本文のフォントサイズを選べるが、書体（フォントファミリー）は変更できない `dsh-client-ui-theme` の `base.css` に次の2つが固定値で入っている

| トークン | 使われる場所 | 既定値 |
| --- | --- | --- |
| `--dsw-font-family` | 本文とUI全般 | `-apple-system, BlinkMacSystemFont, "Segoe UI", ...` |
| `--ds-font-family-code` | コードブロックと等幅表示 | `"SF Mono", "JetBrains Mono", "Fira Code", Consolas, ...` |

このプラグインは `ctx.theme.overrideTokens()` で配色テーマの上にトークン層を重ねる そのため `light` / `dark` / `system` を切り替えても書体は維持され、DSH インストール先のファイルは一切変更しない（npm update で元に戻ることもない）

## 導入

```powershell
dsh plugin --profile web add dsh-ui-font
dsh web
```

`dsh plugin` はパッケージをプロファイルへ導入し、`dsh.bundle` を宣言する依存を `dsh.profile.bundles` へ自動で追加する 手作業での patch 編集は不要

起動中の `dsh web` は `dsh.profile.bundles` を起動時に一度だけ組む 監視対象はユーザーの patch 層（`cordis.patch.yml`）だけなので、**導入後は `dsh web` を再起動する** ブラウザの再読み込みだけでは反映されない

削除は `dsh plugin --profile web remove dsh-ui-font`

## 設定

`src/client.ts` 冒頭の2定数を書き換え バンドルを再生成してから再起動する

| 定数 | 既定値 | 対象 |
| --- | --- | --- |
| `FONT_SANS` | `"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", ...` | 本文とUI |
| `FONT_MONO` | `"JetBrains Mono", "SF Mono", "Fira Code", Consolas, ...` | コードと等幅表示 |

```powershell
bun run build   # lib/index.js と lib/client.js を書き直す
```

JetBrains Mono は日本語グリフを持たないため、既定の `FONT_SANS` は日本語を BIZ UDPGothic と Noto Sans JP へ落とす ラテン書体の後ろに日本語対応フォントを1つ以上残さないと、日本語が意図しない書体へ落ちる 本文は元の書体のままコードだけ変える場合は次の値に戻す

```ts
const FONT_SANS = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Yu Gothic UI\", Meiryo, sans-serif";
```

## リポジトリ構成

| パス | 役割 |
| --- | --- |
| `src/index.ts` | 何もしないホスト側 クライアントバンドルは有効な Loader エントリへしか配信されないため行の存在が必要 |
| `src/client.ts` | ブラウザ側 フォント定数とトークン層の本体 |
| `build.ts` | Bun によるビルド ホスト側は ESM ブラウザ側は CJS にしてローダー形式へ包む |
| `cordis.patch.yml` | `ui-font` 行をプロファイルツリーへ挿入する |
| `lib/` | `bun run build` と `prepack` が生成する 追跡しないためローカルと公開 tarball の中にだけ存在する |
| `tests/client.test.ts` | ビルド済み `lib/client.js` に対する契約テスト |

## 仕組み

- `build.ts` は `src/client.ts` を CJS へ束ね `window.__ModuleLoader__.load({ id, factory })` で包む バンドルの id は client-modules がパッケージ名でモジュールを引くため `package.json` から読む
- `src/client.ts` は `inject: ["theme"]` を宣言してから `overrideTokens("dsh-ui-font", {...})` を呼ぶ ui-layout の presenter が解決済みトークンを `document.body` のインラインカスタムプロパティとして書き出すため、`body` の値が `:root` の宣言を全子孫で上書きする
- テーマサービスに `overrideTokens()` が無い DSH では `:root, body` 向けのスタイルタグへ自動で切り替える（この経路のみ `!important` を使う）

`--dsw-font-mono` は既定のスタイルシートに宣言が無いが、一部コンポーネントが `var(--dsw-font-mono, ui-monospace, monospace)` として読むため併せて上書きする

## 開発

```powershell
bun install
bun run check    # @yuu1111/tsconfig/bun.json を使った tsc --noEmit
bun run lint     # biome check .
bun run format   # biome check --write --unsafe .
bun run test     # lib/ をビルドしてからテストを実行する
bun run build    # lib/ を再生成する
```

公開せずに手元のチェックアウトを実プロファイルで試す場合はパスで導入し 変更のたびに `bun run build` を実行する

```powershell
dsh plugin --profile web add "link:$((Resolve-Path .\dsh-ui-font).Path)"
```

## リリース

`version` を上げて commit し 対応するタグ（`v0.1.0` ↔ `0.1.0`）で GitHub Release を公開する `.github/workflows/release.yml` が `contents: read` の job で tarball を作り タグと `package.json` の version を照合したうえで 別 job から npm trusted publishing（`--provenance`）で公開するため 長期の npm token を保存しない

## 検証済み環境

- DSH `0.1.5-rc.2`（`@deepseek-ai/dsh-client-ui-theme` `0.1.5-rc.2`）Windows 11 / Chromium
- `bun test` モジュールID 公開するプラグイン面 トークン層 退避のスタイルタグ
- 実ブラウザでの確認 バンドルが `/plugins/??dsh-ui-font/client.js` から配信され `--dsw-font-family` が `document.body` のインラインスタイルへ入り `var(--dsw-font-family)` が設定したスタックへ解決される

## ライセンス

MIT
