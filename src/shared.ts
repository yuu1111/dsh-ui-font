/**
 * @description ホスト側とブラウザ側で共有する定義
 *
 * ここには値と純粋関数だけを置く ブラウザ側のバンドルは実行時に何も解決できないため
 * 共有できるのは型と定数と副作用のない変換に限られる
 */

/**
 * 設定 namespace の名前
 */
export const NAMESPACE = "ui-font";

/**
 * 本文とUIのフォントスタックを持つフィールド名
 */
export const SANS_FIELD = "sans";

/**
 * コードと等幅表示のフォントスタックを持つフィールド名
 */
export const MONO_FIELD = "mono";

/**
 * 既定の本文フォント JetBrains Mono は日本語グリフを持たないため日本語フォントへ落とす
 */
export const DEFAULT_SANS =
	'"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

/**
 * 既定の等幅フォント
 */
export const DEFAULT_MONO =
	'"JetBrains Mono", "SF Mono", "Fira Code", Consolas, "Liberation Mono", monospace';

/**
 * 上書きするトークン コード用の2つは同じ値を指す
 */
export const SANS_VARIABLE = "--dsw-font-family";

/**
 * 等幅トークン 旧名の箇所が残っているため両方を上書きする
 */
export const MONO_VARIABLES = [
	"--dsw-font-mono",
	"--ds-font-family-code",
] as const;

/**
 * スタイルタグを見分けるための印
 */
export const STYLE_TAG_MARKER = "dsh-ui-font";

/**
 * ブラウザ側がフォントを当てるスタイルタグの識別子
 */
export const FONT_STYLE_TAG_ID = `${STYLE_TAG_MARKER}/font-family.css`;

/**
 * ブラウザ側が設定行の見た目を持つスタイルタグの識別子
 */
export const ROW_STYLE_TAG_ID = `${STYLE_TAG_MARKER}/settings-row.css`;

/**
 * 1つの設定セクションが持つ値
 */
export interface FontSettings {
	readonly sans: string;
	readonly mono: string;
}

/**
 * 設定値の既定値
 */
export const DEFAULT_SETTINGS: FontSettings = {
	sans: DEFAULT_SANS,
	mono: DEFAULT_MONO,
};

/**
 * @description スタイルシートへ埋め込める形へフォントスタックを整える
 *
 * 設定値は利用者が書くため 波括弧やセミコロンが混ざるとスタイルシート全体を壊す
 * 危険な文字を落とし 空白を詰めてから使う
 * @param value - 設定に保存されたフォントスタック
 * @returns 安全なフォントスタック 空になった場合は既定値
 */
export function sanitizeFontStack(value: unknown): string {
	if (typeof value !== "string") return "";
	const cleaned = value
		// スタイルシートを壊す文字と制御文字を落とす
		.replace(/[{};<>]/g, " ")
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned;
}

/**
 * @description 設定セクションから1つのフィールドを読む
 *
 * 設定値は共有の設定ストアから来るため 形は確かめずに名前で引く
 * @param section - 設定セクションの値
 * @param field - 読むフィールド名
 * @returns 入っていればその値 無ければ undefined
 */
function readField(section: unknown, field: string): unknown {
	if (typeof section !== "object" || section === null) return undefined;
	for (const [key, value] of Object.entries(section)) {
		if (key === field) return value;
	}
	return undefined;
}

/**
 * @description 設定セクションからフォントスタックを取り出す
 *
 * 未設定 空文字 壊れた値のいずれも既定値へ寄せる
 * @param section - 設定セクションの値
 * @returns 空にならないフォントスタックの組
 */
export function readFontSettings(section: unknown): FontSettings {
	const sans = sanitizeFontStack(readField(section, SANS_FIELD));
	const mono = sanitizeFontStack(readField(section, MONO_FIELD));
	return {
		sans: sans === "" ? DEFAULT_SANS : sans,
		mono: mono === "" ? DEFAULT_MONO : mono,
	};
}

/**
 * @description フォントを上書きするスタイルシートを組み立てる
 *
 * `!important` は ui-layout の presenter が body へ書くインライン値を上回るために要る
 * 配色テーマを切り替えてもフォントは変わらないため light と dark で同じ値を使う
 * @param settings - 適用するフォントスタック
 * @returns 1行のスタイルシート
 */
export function buildFontCss(settings: FontSettings): string {
	const declarations = [
		`${SANS_VARIABLE}:${settings.sans} !important`,
		...MONO_VARIABLES.map((name) => `${name}:${settings.mono} !important`),
	];
	return `:root,body{${declarations.join(";")};}`;
}

/**
 * 引用符を付けずに書ける総称フォント名
 */
export const GENERIC_FAMILIES: readonly string[] = [
	"cursive",
	"emoji",
	"fantasy",
	"fangsong",
	"math",
	"monospace",
	"sans-serif",
	"serif",
	"system-ui",
	"ui-monospace",
	"ui-rounded",
	"ui-sans-serif",
	"ui-serif",
];

/**
 * @description 1つの書体名をフォントスタックへ書ける形にする
 *
 * 空白や記号を含む名前は引用符が要る 総称フォント名は引用符を付けると別物になるため
 * そのまま返す 危険な文字は先に落とす
 * @param name - 書体名
 * @returns スタックへ書ける1要素 空になった場合は空文字
 */
export function quoteFamily(name: unknown): string {
	const cleaned = sanitizeFontStack(name).replace(/^["']|["']$/g, "");
	if (cleaned === "") return "";
	if (GENERIC_FAMILIES.includes(cleaned.toLowerCase())) {
		return cleaned.toLowerCase();
	}
	// 識別子として書ける名前は引用符を省き 既定値と同じ見た目にそろえる
	if (/^[A-Za-z][A-Za-z0-9-]*$/.test(cleaned)) return cleaned;
	return `"${cleaned.replace(/"/g, "")}"`;
}

/**
 * @description フォントスタックを書体名の並びへ分ける
 *
 * 引用符は外し 空要素と重複は落とす 順番はフォールバックの優先順位そのもの
 * @param value - 保存済みのフォントスタック
 * @returns 書体名の並び
 */
export function parseFontStack(value: unknown): string[] {
	if (typeof value !== "string") return [];
	const families: string[] = [];
	for (const part of value.split(",")) {
		const cleaned = sanitizeFontStack(part).replace(/^["']|["']$/g, "");
		if (cleaned === "" || families.includes(cleaned)) continue;
		families.push(cleaned);
	}
	return families;
}

/**
 * @description 書体名の並びをフォントスタックへ戻す
 *
 * 空の並びはそのまま空文字になる 呼び出し側は既定値へ寄せること
 * @param families - 書体名の並び
 * @returns スタイルシートへ書けるフォントスタック
 */
export function formatFontStack(families: readonly string[]): string {
	const parts: string[] = [];
	for (const family of families) {
		const quoted = quoteFamily(family);
		if (quoted !== "") parts.push(quoted);
	}
	return parts.join(", ");
}
