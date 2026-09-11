# dsh-ui-font

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) の Web GUI の書体を差し替えるプラグイン

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
dsh plugin --profile web add github:yuu1111/dsh-ui-font
dsh web
```

`dsh plugin` はプロファイルディレクトリで pnpm へ転送し、`dsh.bundle` を宣言する依存を `dsh.profile.bundles` へ自動で追加する 手作業での patch 編集は不要

起動中の `dsh web` は `dsh.profile.bundles` を起動時に一度だけ組む 監視対象はユーザーの patch 層（`cordis.patch.yml`）だけなので、**導入後は `dsh web` を再起動する** ブラウザの再読み込みだけでは反映されない

ローカルのチェックアウトを使う場合（プロファイルからシンボリックリンクで参照するため、編集後は再インストール不要で `dsh web` の再起動だけで反映される）

```powershell
git clone https://github.com/yuu1111/dsh-ui-font
dsh plugin --profile web add "link:$((Resolve-Path .\dsh-ui-font).Path)"
```

削除は `dsh plugin --profile web remove dsh-ui-font`

## 設定

`lib/client.js` 冒頭の2定数を書き換える

| 定数 | 既定値 | 対象 |
| --- | --- | --- |
| `FONT_SANS` | `"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", ...` | 本文とUI |
| `FONT_MONO` | `"JetBrains Mono", "SF Mono", "Fira Code", Consolas, ...` | コードと等幅表示 |

JetBrains Mono は日本語グリフを持たないため、既定の `FONT_SANS` は日本語を BIZ UDPGothic と Noto Sans JP へ落とす 本文は元の書体のままコードだけ変える場合は次の値に戻す

```js
const FONT_SANS = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Yu Gothic UI\", Meiryo, sans-serif";
```

編集後は `dsh web` を再起動してブラウザを再読み込みする ラテン書体の後ろに日本語対応フォントを1つ以上残さないと、日本語が意図しない書体へ落ちる

## 仕組み

- `lib/index.js` は何もしないホスト側 クライアントバンドルは有効な Loader エントリへしか配信されないため、行の存在だけが必要になる
- `lib/client.js` は `window.__ModuleLoader__.load({ id, factory })` 形式の手書きクライアントバンドル `inject: ["theme"]` を宣言したうえで `overrideTokens("dsh-ui-font", {...})` を呼ぶ ui-layout の presenter が解決済みトークンを `document.body` のインラインカスタムプロパティとして書き出すため、`body` の値が `:root` の宣言を全子孫で上書きする
- テーマサービスに `overrideTokens()` が無い DSH では `:root, body` 向けのスタイルタグへ自動で切り替える（この経路のみ `!important` を使う）

`--dsw-font-mono` は既定のスタイルシートに宣言が無いが、一部コンポーネントが `var(--dsw-font-mono, ui-monospace, monospace)` として読むため併せて上書きする

## 検証済み環境

- DSH `0.1.5-rc.2`（`@deepseek-ai/dsh-client-ui-theme` `0.1.5-rc.2`）Windows 11 / Chromium
- 実ブラウザでの確認内容 プラグインバンドルが `/plugins/??dsh-ui-font/client.js` から配信され、`--dsw-font-family` が `document.body` のインラインスタイルへ入り、`var(--dsw-font-family)` が設定したスタックへ解決される

## ライセンス

MIT
