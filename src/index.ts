/**
 * ホスト側の本体
 *
 * フォントはプラグインの config が持つ フィールドを volatile にしてあるため 設定文書から
 * 書き換えられ 保存は利用者のプロファイルの patch へ落ちる 値は生きた参照として渡るので
 * 読むたびに `.get()` で取り出す 保存済みのフォントはサーバーが配る index へスタイルとして
 * 差し込み クライアント側プラグインが動き出す前の描画でも効くようにする
 */

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import {
	buildFontCss,
	DEFAULT_MONO,
	DEFAULT_SANS,
	type FontSettings,
	MONO_FIELD,
	readFontSettings,
	SANS_FIELD,
} from "./shared";

/**
 * フォントスタックとして受け付ける最大文字数
 */
const MAX_STACK_LENGTH = 200;

/**
 * スタイルシートを壊す文字を弾く 値は利用者が書くため括弧とセミコロンだけ禁じる
 */
const SAFE_STACK_PATTERN = /^[^{};<>]*$/;

/**
 * ホスト側が読む設定
 *
 * volatile にしたフィールドは生きた参照として渡る 設定文書の値が変わると同じ参照の
 * `.get()` が新しい値を返すため 参照を持ち回って読むたびに取り出す
 */
export interface Config {
	/**
	 * 本文とUIへ当てるフォントスタック
	 */
	readonly [SANS_FIELD]: Volatile<string>;

	/**
	 * コードと等幅表示へ当てるフォントスタック
	 */
	readonly [MONO_FIELD]: Volatile<string>;
}

/**
 * 設定セクションのスキーマ
 *
 * 既定値はこのプラグインが同梱するフォントスタック `volatile()` を付けたフィールドだけが
 * 設定 → 一般 の面から書き換えられ 保存はプロファイルの patch へ落ちる
 */
export const Config = z.object({
	[SANS_FIELD]: z
		.string()
		.max(MAX_STACK_LENGTH)
		.pattern(SAFE_STACK_PATTERN)
		.default(DEFAULT_SANS)
		.description("CSS font-family list for the conversation and the UI")
		.volatile(),
	[MONO_FIELD]: z
		.string()
		.max(MAX_STACK_LENGTH)
		.pattern(SAFE_STACK_PATTERN)
		.default(DEFAULT_MONO)
		.description("CSS font-family list for code and monospaced text")
		.volatile(),
});

/**
 * index へ差し込むスタイル行 形は webserver の注入契約に合わせる
 */
interface StyleInjection {
	readonly kind: "style";
	readonly text: string;
}

/**
 * 設定サービスが公開する面
 */
interface SettingsForms {
	/**
	 * 呼び出したプラグインが自前の設定面を持つことを伝える
	 *
	 * 自前の面がある場合はスキーマからの自動生成を止める 呼び出しごとに1つだけ登録でき
	 * 二重に呼ぶと例外になる
	 * @param presentation - 自動生成するかの指定
	 * @param owner - この面を持つプラグインの実体
	 * @returns 登録を解除する関数
	 */
	configure(presentation: { auto?: boolean }, owner?: unknown): () => void;
}

/**
 * 設定サービスが現れた時の子コンテキスト
 */
interface HostSettingsContext {
	/**
	 * 設定サービス
	 */
	readonly settings: SettingsForms;

	/**
	 * プラグインの寿命に紐づけて副作用を登録する
	 * @param callback - 登録する副作用 返した関数は破棄時に呼ばれる
	 * @param label - 診断用の名前
	 */
	effect(callback: () => (() => void) | undefined, label?: string): void;
}

/**
 * このプラグインが使うホスト側 cordis コンテキスト
 */
interface HostContext {
	/**
	 * サービスが揃うまで待ってから副作用を登録する
	 * @param names - 待つサービス名
	 * @param callback - 揃った後に呼ばれる関数
	 */
	inject(
		names: readonly string[],
		callback: (ctx: HostSettingsContext) => void,
	): void;

	/**
	 * このプラグインの実体 設定の面を自分のものとして登録するために渡す
	 */
	readonly fiber: unknown;

	/**
	 * イベントを購読する
	 * @param event - イベント名
	 * @param listener - 購読する関数
	 */
	on(event: string, listener: (table: StyleInjection[]) => void): void;
}

/**
 * 現在のフォント設定を読む
 *
 * 値は index を配るたびに読む ここで固定すると保存された変更が次の描画へ届かない
 * @param config - 生きた参照を持つプラグインの設定
 * @returns 適用するフォントスタック
 */
function readSettings(config: Config): FontSettings {
	return readFontSettings({
		[MONO_FIELD]: config[MONO_FIELD].get(),
		[SANS_FIELD]: config[SANS_FIELD].get(),
	});
}

/**
 * フォントのスタイル行を組み立てる
 *
 * クライアント側プラグインが動き出す前の描画でも保存済みのフォントを使う
 * @param settings - 適用するフォントスタック
 * @returns webserver の index へ積む行
 */
function fontStyleInjection(settings: FontSettings): StyleInjection {
	return { kind: "style", text: buildFontCss(settings) };
}

/**
 * フォント設定を設定文書へ公開し 初回描画用のスタイルを配る
 * @param ctx - ホスト側 cordis コンテキスト
 * @param config - プラグインの設定
 */
export function apply(ctx: HostContext, config: Config): void {
	// 面はブラウザ側が自前で出すため スキーマからの自動生成は止める
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.effect(
			() => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
			"dsh-ui-font: settings form policy",
		);
	});
	ctx.on("webserver/index-inject", (table) => {
		table.push(fontStyleInjection(readSettings(config)));
	});
}
