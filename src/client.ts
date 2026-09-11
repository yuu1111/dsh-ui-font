/**
 * @description ブラウザ側の本体 ui-theme のトークン層としてフォントを上書きする
 *
 * 書体は配色に依存しないため light と dark へ同じ値を渡す 適用は ui-layout の
 * presenter が解決済みトークンを `document.body` のインラインカスタム
 * プロパティとして書き出す経路に乗せる そのため `:root` の宣言より強く効き
 * 配色テーマを切り替えても維持される
 */

/** 配色ごとのトークン値 */
interface TokenValue {
	readonly light: string;
	readonly dark: string;
}

/** トークン名から配色ごとの値へのマップ */
export type TokenOverrides = Record<string, TokenValue>;

/** 本文とUIのフォント JetBrains Mono は日本語グリフを持たないため日本語フォントへ落とす */
const FONT_SANS =
	'"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

/** コードブロックと等幅表示のフォント */
const FONT_MONO =
	'"JetBrains Mono", "SF Mono", "Fira Code", Consolas, "Liberation Mono", monospace';

/** この上書き層の識別子 同じ source で呼び直すと層が置き換わる */
const SOURCE = "dsh-ui-font";

/** 上書きするトークン フォントは配色に依存しないため両方へ同じ値を渡す */
const TOKENS: TokenOverrides = {
	"--dsw-font-family": { light: FONT_SANS, dark: FONT_SANS },
	"--dsw-font-mono": { light: FONT_MONO, dark: FONT_MONO },
	"--ds-font-family-code": { light: FONT_MONO, dark: FONT_MONO },
};

/** ui-theme が公開するトークン上書きの最小面 */
export interface ThemeService {
	/**
	 * @description トークン上書き層を積む
	 * @param source - 層の識別子
	 * @param tokens - トークン名から配色ごとの値へのマップ
	 * @returns 積んだ層だけを外す disposer
	 */
	overrideTokens(source: string, tokens: TokenOverrides): () => void;
}

/** このプラグインが使うクライアント側 cordis コンテキスト */
export interface PluginContext {
	/** ui-theme が提供するテーマサービス inject で解決される */
	readonly theme?: Partial<ThemeService>;
	/**
	 * @description プラグインの寿命に紐づけて副作用を登録する
	 * @param callback - 登録する副作用 返した関数は破棄時に呼ばれる
	 * @param label - 診断用の名前
	 */
	effect(callback: () => (() => void) | undefined, label: string): void;
}

/** テーマサービスを待つ これで presenter が解決済みトークンとして body へ適用する */
export const inject = ["theme"];

/**
 * @description `overrideTokens` を持たないテーマ版向けの退避経路
 *
 * presenter が書くインライン style より強く効かせる必要があるため この経路だけ
 * `!important` を使う
 * @param ctx - クライアント側 cordis コンテキスト
 */
function installStyleTag(ctx: PluginContext): void {
	ctx.effect(() => {
		const tag = document.createElement("style");
		tag.dataset.plugin = SOURCE;
		tag.dataset.pluginCss = `${SOURCE}/font-family.css`;
		tag.textContent =
			":root,body{" +
			`--dsw-font-family:${FONT_SANS} !important;` +
			`--dsw-font-mono:${FONT_MONO} !important;` +
			`--ds-font-family-code:${FONT_MONO} !important;` +
			"}";
		document.head.appendChild(tag);
		return () => {
			tag.remove();
		};
	}, "dsh-ui-font: font-family stylesheet");
}

/**
 * @description フォントをテーマのトークン層として上書きする
 * @param ctx - クライアント側 cordis コンテキスト
 */
export function apply(ctx: PluginContext): void {
	const theme = ctx.theme;
	const overrideTokens = theme?.overrideTokens;
	if (theme === undefined || overrideTokens === undefined) {
		installStyleTag(ctx);
		return;
	}
	// overrideTokens は this を使うため theme を束縛して呼ぶ
	ctx.effect(
		() => overrideTokens.call(theme, SOURCE, TOKENS),
		"dsh-ui-font: font-family tokens",
	);
}
