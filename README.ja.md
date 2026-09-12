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

**設定 → 一般** を開くと 保存済みの書体が順番どおりのチップで並び そのスタックで組んだ見本と **フォントを追加** ボタンが出る

| 行 | 設定キー | 対象 |
| --- | --- | --- |
| 本文フォント | `sans` | 本文とUI全般 |
| コードフォント | `mono` | コードブロックと等幅表示 |

**フォントを追加** を押すと この端末に入っている書体の一覧が検索つきで開く 一覧はブラウザの `queryLocalFonts()` で読み 各行はその書体自身で描く 初回は Chrome がフォントへのアクセスを確認する すでにスタックへ入っている書体には印が付き 選ぶと末尾へ足される 続けて選べるようパネルは開いたままになる ブラウザが一覧を出せない場合や確認を拒否した場合は よく使う書体の短い一覧へ落ちてその旨を表示する 一覧に無い名前を検索した場合は `「名前」を追加` の行が出るため ブラウザが解決できる書体はどのみち使える

各チップには 前へ出す 後ろへ送る 外す の3つのボタンが付く 並び順がそのままフォールバックの順番になるため 日本語対応フォントはラテン書体の後ろへ残す 変更はその場で保存され スタックが変わらない場合は何も書かない

保存される値はこれまでどおり CSS の `font-family` リストなので 手で編集してもよい 波括弧 セミコロン 山括弧はスタイルシートへ埋め込む前に落とす 書き換えたフィールドだけが保存され 残りは同梱の既定値を使う

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
| `src/client.tsx` | ブラウザ側 スタイルシートの適用と設定2行の登録（書体の選択UIを含む） |
| `src/shared.ts` | 両側で共有する値 namespace 既定値 無害化 スタックの分解と整形 スタイルシートの組み立て |
| `build.ts` | Bun によるビルド ホスト側は ESM ブラウザ側は CJS にしてローダー形式へ包む |
| `cordis.patch.yml` | `ui-font` 行をプロファイルツリーへ挿入する |
| `quality.config.ts` `knip.ts` | 品質ゲート `quality-check` が回す engine と opt-in の規則 Knip の入口 |
| `lib/` | `bun run build` と `prepack` が生成する 追跡しないためローカルと公開 tarball の中にだけ存在する |
| `tests/host.test.ts` `tests/client.test.ts` `tests/shared.test.ts` | ビルド済み `lib/` に対する契約テスト |

## 仕組み

- ホスト側は `ctx.inject(["settings"], ...)` の中で `settings.installSection(ctx, "ui-font", Config, config, hooks)` を呼ぶ プラグインの Loader `config:` が base 層 保存済みの `settings.yaml` のセクションがその上 フィールドを省略した config はスキーマの既定値が埋める
- ホスト側は `webserver/index-inject` へ `{ kind: "style" }` の行を1つ積む 行は index を配るたびに集められ `<head>` の直後へ入るため 最初の描画から保存済みのスタックが効き `settings.yaml` の手編集も再起動なしで次の再読み込みに乗る
- ブラウザ側は `inject: ["slots", "locale", "settingsScope"]` を宣言し `settingsScope.bind()` で `ui-font` を購読して `style[data-plugin-css="dsh-ui-font/font-family.css"]` の1枚を追従させる トークンを書く権威は1つで 両側とも同じ `:root,body{... !important}` を出す クライアント側が後から積むタグが同じ強さでは後勝ちになり ホスト側の行はクライアントが動き出す前を覆う
- 行は `settings.general.item` スロットへ `id: "dsh-ui-font-sans"` / `"dsh-ui-font-mono"` `order: 70` / `71` で登録するため 組み込みの配色とフォントサイズの行の後ろへ並ぶ 辞書は `en` `zh` `ja` を同梱し それ以外のロケールは英語へ落ちる
- 行は保存済みのスタックを書体名へ分解してチップで見せ 保存のたびに `formatFontStack()` で組み直すため 設定ファイルの中身は往復しても崩れない CSS のリストのままになる 一覧は行の描画ごとに `globalThis.queryLocalFonts()` で1度だけ読み 使えない場合 空だった場合 拒否された場合は同梱の一覧へ落ちて行が操作不能にならないようにする
- `!important` が要るのは ui-layout の presenter が解決済みトークンを `document.body` のインラインカスタムプロパティとして書くため 素の `:root` 宣言では全子孫で負ける

`--dsw-font-mono` は既定のスタイルシートに宣言が無いが、一部コンポーネントが `var(--dsw-font-mono, ui-monospace, monospace)` として読むため併せて上書きする

## 開発

```powershell
bun install
bun run check          # @yuu1111/tsconfig/bun.json を使った tsc --noEmit
bun run lint           # biome check .
bun run format         # biome check --write --unsafe .
bun run check:quality  # biome tsc knip と code comment document TSDoc の各 checker を回す
bun run test           # lib/ をビルドしてからテストを実行する
bun run build          # lib/ を再生成する
```

ブラウザ側が実行時に `require()` してよいのは shell が最初から配る `react` `react/jsx-runtime` `@deepseek-ai/dsh-client-store` `@deepseek-ai/dsh-client-ui-primitives` だけ それ以外の specifier を検出すると `build.ts` がビルドを失敗させる また shell は `react/jsx-dev-runtime` を配らないため JSX は本番ランタイムへ固定する

公開せずに手元のチェックアウトを実プロファイルで試す場合はパスで導入し 変更のたびに `bun run build` を実行する

```powershell
dsh plugin --profile web add "link:$((Resolve-Path .\dsh-ui-font).Path)"
```

## リリース

`version` を上げて commit し 対応するタグ（`v1.1.0` ↔ `1.1.0`）で GitHub Release を公開する `.github/workflows/release.yml` が `contents: read` の job で tarball を作り タグと `package.json` の version を照合したうえで 別 job から npm trusted publishing（`--provenance`）で公開するため 長期の npm token を保存しない

## 検証済み環境

- DSH `0.1.5-rc.2`（`@deepseek-ai/dsh-client-ui-settings` `0.1.5-rc.2`）Windows 11 / Chromium
- `bun test` モジュールID 公開するプラグイン面 設定セクションの登録 index のスタイル行 現在値の切り替え namespace の購読 スタイルシートの更新 行の登録 スタックの分解と整形 選択UIの各経路（導入済み一覧 同梱一覧への退避 アクセス拒否 自由入力の追加）チップの削除と並べ替え
- 実ブラウザでの確認 配信された index に設定済みスタックの `<style>` 行が入り **設定 → 一般** に2行が保存済みの書体をチップで並べる 選択UIはこの端末に入っている174書体を列挙して検索で絞り込める 書体を足すとスタックの末尾へ入り再読み込みなしで本文の計算済みフォントが変わり 外すと元へ戻り 並べ替えると順番が入れ替わる いずれの変更も `$DSH_HOME/settings.yaml` へ書かれ コンソールエラーは出ない

## ライセンス

MIT
