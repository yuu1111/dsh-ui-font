/**
 * @description ホスト側の本体
 *
 * フォントは設定 namespace `ui-font` の値として持ち プラグインの config を
 * 構成側の既定値（base 層）として登録する 保存済みのフォントはサーバーが配る
 * index へスタイルとして差し込み クライアント側プラグインが動き出す前の描画でも
 * 効くようにする
 */

import z from "@deepseek-ai/schemastery";
import {
	buildFontCss,
	DEFAULT_MONO,
	DEFAULT_SANS,
	type FontSettings,
	MONO_FIELD,
	NAMESPACE,
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
 * 設定セクションのスキーマ 既定値はこのプラグインが同梱するフォントスタック
 */
export const Config = z.object({
	[SANS_FIELD]: z
		.string()
		.max(MAX_STACK_LENGTH)
		.pattern(SAFE_STACK_PATTERN)
		.default(DEFAULT_SANS)
		.description("CSS font-family list for the conversation and the UI"),
	[MONO_FIELD]: z
		.string()
		.max(MAX_STACK_LENGTH)
		.pattern(SAFE_STACK_PATTERN)
		.default(DEFAULT_MONO)
		.description("CSS font-family list for code and monospaced text"),
});

/**
 * index へ差し込むスタイル行 形は webserver の注入契約に合わせる
 */
interface StyleInjection {
	readonly kind: "style";
	readonly text: string;
}

/**
 * 設定サービスが公開する登録面
 */
interface SettingsInstaller {
	/**
	 * @description 構成側の既定値を持つ設定セクションを登録する
	 * @param owner - 登録する側のコンテキスト
	 * @param namespace - 登録する namespace
	 * @param schema - セクションを解決するスキーマ
	 * @param entry - base 層かつ設定サービスが無い場合の値
	 * @param hooks - 現在値の取得口と変更通知
	 */
	installSection(
		owner: HostContext,
		namespace: string,
		schema: unknown,
		entry: FontSettings,
		hooks: {
			setSource(current: () => FontSettings): void;
			onChange(): void;
		},
	): void;
}

/**
 * このプラグインが使うホスト側 cordis コンテキスト
 */
interface HostContext {
	/**
	 * @description サービスが揃うまで待ってから副作用を登録する
	 * @param names - 待つサービス名
	 * @param callback - 揃った後に呼ばれる関数
	 */
	inject(
		names: readonly string[],
		callback: (ctx: HostContext & { settings: SettingsInstaller }) => void,
	): void;
	/**
	 * 解決済みのサービスを取り出す 未提供なら undefined
	 */
	get(name: string): unknown /**
	 * @description イベントを購読する
	 * @param event - イベント名
	 * @param listener - 購読する関数
	 */;
	on(event: string, listener: (table: StyleInjection[]) => void): void;
}

/**
 * @description プラグインの現在のフォント設定を読む
 *
 * 値は index を配るたびに読む ここで固定するとプロセスの寿命だけ古い値が残る
 * @param current - 現在値を返す関数
 * @returns 適用するフォントスタック
 */
function readSettings(current: () => FontSettings): FontSettings {
	return readFontSettings(current());
}

/**
 * @description フォントのスタイル行を組み立てる
 *
 * クライアント側プラグインが動き出す前の描画でも保存済みのフォントを使う
 * @param settings - 適用するフォントスタック
 * @returns webserver の index へ積む行
 */
function fontStyleInjection(settings: FontSettings): StyleInjection {
	return { kind: "style", text: buildFontCss(settings) };
}

/**
 * @description フォント設定を登録し 初回描画用のスタイルを配る
 * @param ctx - ホスト側 cordis コンテキスト
 * @param config - プラグインの config 既定値が入った設定
 */
export function apply(ctx: HostContext, config: FontSettings): void {
	let current: () => FontSettings = () => config;
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, NAMESPACE, Config, config, {
			setSource: (source) => {
				current = source;
			},
			// 差し込む行は index を配るたびに読み直すため通知は要らない
			onChange: () => {},
		});
	});
	ctx.on("webserver/index-inject", (table) => {
		table.push(fontStyleInjection(readSettings(current)));
	});
}
