# dsh-ui-font

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) の Web GUI で 本文とコードの書体を **設定 → 一般** から設定できるようにするプラグイン

[English](README.md)

## 作った理由

DSH の Web GUI は **設定 → 一般** で配色と会話本文のフォントサイズを選べるが、書体（フォントファミリー）は変更できない `dsh-client-ui-theme` の `base.css` に次の2つが固定値で入っている

| トークン | 使われる場所 | 既定値 |
| --- | --- | --- |
| `--dsw-font-family` | 本文とUI全般 | `-apple-system, BlinkMacSystemFont, "Segoe UI", ...` |
| `--dsw-font-mono` `--ds-font-family-code` | コードブロックと等幅表示 | `"SF Mono", "JetBrains Mono", "Fira Code", Consolas, ...` |

このプラグインはその設定画面へ2行を追加し 選んだスタックを `$DSH_HOME/settings.yaml` へ保存して適用する DSH インストール先のファイルは一切変更しないため npm update で元に戻ることもない

## 導入

```powershell
dsh plugin --profile web add dsh-ui-font
dsh web
```

`dsh plugin` はパッケージをプロファイルへ導入し、`dsh.bundle` を宣言する依存を `dsh.profile.bundles` へ自動で追加する 手作業での patch 編集は不要

起動中の `dsh web` は `dsh.profile.bundles` を起動時に一度だけ組む 監視対象はユーザーの patch 層（`cordis.patch.yml`）だけなので、**導入後は `dsh web` を再起動する** ブラウザの再読み込みだけでは反映されない

削除は `dsh plugin --profile web remove dsh-ui-font`

## 設定

**設定 → 一般** を開き どちらかの行を書き換える 値はブラウザの `font-family` と同じ書式のリストで書く

| 行 | 設定キー | 対象 |
| --- | --- | --- |
| 本文フォント | `sans` | 本文とUI全般 |
| コードフォント | `mono` | コードブロックと等幅表示 |

確定はフォーカスを外すか Enter で 取り消しは Escape 無効な値は保存済みの値へ戻る 値はスタイルシートへ埋め込むため波括弧 セミコロン 山括弧は受け付けない 書き換えたフィールドだけが保存され 残りは同梱の既定値を使う

```yaml
# $DSH_HOME/settings.yaml
ui-font:
  sans: '"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", sans-serif'
```

起動中のサーバーはこのファイルを監視しているため 手で編集した場合も次の再読み込みで反映される 既定値のままなら `ui-font` セクションは存在しない

| 設定キー | 同梱の既定値 |
| --- | --- |
| `sans` | `"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif` |
| `mono` | `"JetBrains Mono", "SF Mono", "Fira Code", Consolas, "Liberation Mono", monospace` |

JetBrains Mono は日本語グリフを持たないため、既定の `sans` は日本語を BIZ UDPGothic と Noto Sans JP へ落とす ラテン書体の後ろに日本語対応フォントを1つ以上残さないと、日本語が意図しない書体へ落ちる

プロファイル側ではプラグインの Loader `config:` も使える 保存値の下に重なる base 層になる 例は `cordis.patch.yml` のコメントを参照

## リポジトリ構成

| パス | 役割 |
| --- | --- |
| `src/index.ts` | ホスト側 `ui-font` 設定セクションの登録と 配信する index へのスタックの差し込み |
| `src/client.tsx` | ブラウザ側 スタイルシートの適用と設定2行の登録 |
| `src/shared.ts` | 両側で共有する値 namespace 既定値 無害化 スタイルシートの組み立て |
| `build.ts` | Bun によるビルド ホスト側は ESM ブラウザ側は CJS にしてローダー形式へ包む |
| `cordis.patch.yml` | `ui-font` 行をプロファイルツリーへ挿入する |
| `lib/` | `bun run build` と `prepack` が生成する 追跡しないためローカルと公開 tarball の中にだけ存在する |
| `tests/host.test.ts` `tests/client.test.ts` | ビルド済み `lib/` に対する契約テスト |

## 仕組み

- ホスト側は `ctx.inject(["settings"], ...)` の中で `settings.installSection(ctx, "ui-font", Config, config, hooks)` を呼ぶ プラグインの Loader `config:` が base 層 保存済みの `settings.yaml` のセクションがその上 フィールドを省略した config はスキーマの既定値が埋める
- ホスト側は `webserver/index-inject` へ `{ kind: "style" }` の行を1つ積む 行は index を配るたびに集められ `<head>` の直後へ入るため 最初の描画から保存済みのスタックが効き `settings.yaml` の手編集も再起動なしで次の再読み込みに乗る
- ブラウザ側は `inject: ["slots", "locale", "settingsScope"]` を宣言し `settingsScope.bind()` で `ui-font` を購読して `style[data-plugin-css="dsh-ui-font/font-family.css"]` の1枚を追従させる トークンを書く権威は1つで 両側とも同じ `:root,body{... !important}` を出す クライアント側が後から積むタグが同じ強さでは後勝ちになり ホスト側の行はクライアントが動き出す前を覆う
- 行は `settings.general.item` スロットへ `id: "dsh-ui-font-sans"` / `"dsh-ui-font-mono"` `order: 70` / `71` で登録するため 組み込みの配色とフォントサイズの行の後ろへ並ぶ 辞書は `en` `zh` `ja` を同梱し それ以外のロケールは英語へ落ちる
- `!important` が要るのは ui-layout の presenter が解決済みトークンを `document.body` のインラインカスタムプロパティとして書くため 素の `:root` 宣言では全子孫で負ける

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

ブラウザ側が実行時に `require()` してよいのは shell が最初から配る `react` `react/jsx-runtime` `@deepseek-ai/dsh-client-store` `@deepseek-ai/dsh-client-ui-primitives` だけ それ以外の specifier を検出すると `build.ts` がビルドを失敗させる また shell は `react/jsx-dev-runtime` を配らないため JSX は本番ランタイムへ固定する

公開せずに手元のチェックアウトを実プロファイルで試す場合はパスで導入し 変更のたびに `bun run build` を実行する

```powershell
dsh plugin --profile web add "link:$((Resolve-Path .\dsh-ui-font).Path)"
```

## リリース

`version` を上げて commit し 対応するタグ（`v1.0.0` ↔ `1.0.0`）で GitHub Release を公開する `.github/workflows/release.yml` が `contents: read` の job で tarball を作り タグと `package.json` の version を照合したうえで 別 job から npm trusted publishing（`--provenance`）で公開するため 長期の npm token を保存しない

## 検証済み環境

- DSH `0.1.5-rc.2`（`@deepseek-ai/dsh-client-ui-settings` `0.1.5-rc.2`）Windows 11 / Chromium
- `bun test` モジュールID 公開するプラグイン面 設定セクションの登録 index のスタイル行 現在値の切り替え namespace の購読 スタイルシートの更新 行の登録 行の編集経路
- 実ブラウザでの確認 配信された index に設定済みスタックの `<style>` 行が入り **設定 → 一般** に2行が保存値つきで並ぶ 行を編集すると `$DSH_HOME/settings.yaml` へ `ui-font:` が書かれ 再読み込みなしで本文の計算済みフォントが変わる セクションを消すと既定値へ戻る

## ライセンス

MIT
