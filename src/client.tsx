/**
 * @description ブラウザ側の本体
 *
 * 保存済みのフォントはスタイルタグ1枚で当てる 書体は配色に依存しないため light と
 * dark へ同じ値を渡し `!important` で ui-layout の presenter が body へ書く
 * インライン値より優先させる 値は設定 → 一般 の行から書き換えられ 購読経由で即座に
 * 反映する
 */

import { defineStore } from "@deepseek-ai/dsh-client-store";
import { Input } from "@deepseek-ai/dsh-client-ui-primitives";
import { useEffect, useState } from "react";
import {
	buildFontCss,
	FONT_STYLE_TAG_ID,
	type FontSettings,
	MONO_FIELD,
	NAMESPACE,
	ROW_STYLE_TAG_ID,
	readFontSettings,
	SANS_FIELD,
	STYLE_TAG_MARKER,
} from "./shared";

/**
 * この行の文言を持つ辞書 namespace
 */
const LOCALE_NAMESPACE = "ui-font";

/**
 * 設定セクションの同期状態 値は解決済みのセクション
 */
interface ScopeSnapshot {
	readonly status: "loading" | "ready" | "unavailable";
	readonly value: FontSettings | undefined;
	readonly revision: number | undefined;
}

/**
 * 1つの namespace を購読するハンドル
 */
interface SettingsScope {
	getSnapshot(): ScopeSnapshot;
	subscribe(listener: () => void): () => void;
	set(field: string, value: unknown): Promise<void>;
}

/**
 * 設定 namespace を購読するサービス
 */
interface SettingsScopeBinder {
	bind(spec: {
		namespace: string;
		decode?: (section: unknown) => FontSettings;
	}): SettingsScope;
}

/**
 * 行の状態 保存済みの値と その値が入ったリビジョン
 */
interface RowState {
	value: string;
	revision: number;
}

/**
 * 行へ渡される保存済みの値を読むフック
 */
type RowSelector = <Selected>(
	select: (state: RowState) => Selected,
) => Selected;

/**
 * 行のコンポーネントへ渡る値
 */
interface RowProps {
	readonly t: (key: string) => string;
	readonly useStore: RowSelector;
	readonly save: (value: string) => void;
}

/**
 * 行の登録で枠組みへ渡すアクション
 */
interface RowActions {
	sync(value: string, revision: number): void;
}

/**
 * 行のコンポーネントへ渡す注入面
 */
interface RowInjected {
	save(value: string): void;
}

/**
 * 行を登録するサービス
 */
interface SlotsService {
	inject(name: string, callback: () => unknown): void;
	register(
		options: {
			name: string;
			id: string;
			order: number;
			store: unknown;
			locale: string;
			inject: (actions: RowActions) => RowInjected;
		},
		component: (props: RowProps) => unknown,
	): () => void;
}

/**
 * 行の文言を配るサービス
 */
interface LocaleService {
	register(
		namespace: string,
		dictionaries: Record<string, Record<string, string>>,
	): () => void;
	register(
		namespace: string,
		locale: string,
		dictionary: Record<string, string>,
	): () => void;
}

/**
 * このプラグインが使うクライアント側 cordis コンテキスト
 */
interface ClientContext {
	readonly slots: SlotsService;
	readonly locale: LocaleService;
	readonly settingsScope: SettingsScopeBinder;
	readonly logger?: { warn?(...args: unknown[]): void };
	/**
	 * @description プラグインの寿命に紐づけて副作用を登録する
	 * @param callback - 登録する副作用 返した関数は破棄時に呼ばれる
	 * @param label - 診断用の名前
	 */
	effect(callback: () => (() => void) | undefined, label: string): void;
}

/**
 * 行の見た目 General セクションの既存行と同じ寸法と色を使う
 */
const ROW_CSS = [
	`.${STYLE_TAG_MARKER}-row{align-items:center;gap:8px;padding:16px 0;display:flex;border-bottom:.5px solid var(--dsw-alias-border-l2)}`,
	`.${STYLE_TAG_MARKER}-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}`,
	`.${STYLE_TAG_MARKER}-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}`,
	`.${STYLE_TAG_MARKER}-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}`,
	`.${STYLE_TAG_MARKER}-invalid{color:var(--dsw-alias-label-error,var(--dsw-alias-label-secondary))}`,
	`.${STYLE_TAG_MARKER}-control{align-items:center;gap:8px;display:inline-flex}`,
	`.${STYLE_TAG_MARKER}-input{width:280px}`,
].join("");

/**
 * 行の文言 英語が基準で日本語と中国語を添える
 */
const DICTIONARIES: Record<string, Record<string, string>> = {
	en: {
		"sans.title": "Body font",
		"sans.description": "Font stack for the conversation and the interface",
		"mono.title": "Code font",
		"mono.description": "Font stack for code blocks and monospaced text",
		"stack.invalid": "Braces and semicolons cannot be used",
	},
	zh: {
		"sans.title": "正文字体",
		"sans.description": "会话与界面使用的字体栈",
		"mono.title": "代码字体",
		"mono.description": "代码块与等宽文本使用的字体栈",
		"stack.invalid": "不能使用花括号与分号",
	},
};

/**
 * 日本語の文言 日本語ロケールが無い場合は英語へ落ちる
 */
const JAPANESE: Record<string, string> = {
	"sans.title": "本文フォント",
	"sans.description": "会話とUIに使うフォントスタック",
	"mono.title": "コードフォント",
	"mono.description": "コードと等幅表示に使うフォントスタック",
	"stack.invalid": "波括弧とセミコロンは使えません",
};

/**
 * @description 入力されたフォントスタックを保存してよいか判定する
 *
 * ホスト側のスキーマと同じ規則を先に見て 明らかに弾かれる値を送らない
 * @param value - 入力されたフォントスタック
 * @returns 保存してよい場合だけ true
 */
function isValidStack(value: string): boolean {
	const trimmed = value.trim();
	return trimmed !== "" && !/[{};<>]/.test(trimmed);
}

/**
 * @description 行の見た目を1枚のスタイルタグとして用意する
 * @param ctx - クライアント側 cordis コンテキスト
 */
function installRowStyles(ctx: ClientContext): void {
	ctx.effect(() => {
		if (typeof document === "undefined") return;
		const tagId = ROW_STYLE_TAG_ID;
		if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) {
			return;
		}
		const tag = document.createElement("style");
		tag.dataset.plugin = STYLE_TAG_MARKER;
		tag.dataset.pluginCss = tagId;
		tag.textContent = ROW_CSS;
		document.head.append(tag);
		return () => {
			tag.remove();
		};
	}, "dsh-ui-font: settings row stylesheet");
}

/**
 * @description フォントを当てるスタイルタグを用意する
 *
 * ホスト側も初回描画のために同じ宣言を差し込むが 属性を持たないため このタグは
 * 後から head の末尾へ積まれ 同じ強さの宣言どうしでは後勝ちになる 値がまだ
 * 届いていない間は手を触れずホスト側の値をそのまま使う
 * @returns 現在のフォントを反映する関数
 */
function createStylesheet(): (settings: FontSettings) => void {
	let tag: HTMLStyleElement | null = null;
	let lastCss = "";
	return (settings) => {
		if (typeof document === "undefined") return;
		const css = buildFontCss(settings);
		if (css === lastCss) return;
		lastCss = css;
		if (tag === null) {
			tag = document.createElement("style");
			tag.dataset.plugin = STYLE_TAG_MARKER;
			tag.dataset.pluginCss = FONT_STYLE_TAG_ID;
			document.head.append(tag);
		}
		tag.textContent = css;
	};
}

/**
 * @description 1つのフォントを編集する行を作る
 * @param field - 書き換える設定フィールド
 * @param titleKey - 見出しの辞書キー
 * @param descriptionKey - 説明の辞書キー
 * @returns 行のコンポーネントと状態
 */
function createFontRow(
	field: string,
	titleKey: string,
	descriptionKey: string,
) {
	const store = defineStore({
		init: (): RowState => ({ value: "", revision: -1 }),
		actions: {
			sync: (draft, value: string, revision: number) => {
				if (revision <= draft.revision) return;
				draft.value = value;
				draft.revision = revision;
			},
		},
	});

	function FontRow(props: RowProps) {
		const persisted = props.useStore((state) => state.value);
		const [draft, setDraft] = useState(persisted);
		const [focused, setFocused] = useState(false);
		useEffect(() => {
			// 入力中は手元の値を優先し それ以外は保存済みの値へ追随する
			if (!focused) setDraft(persisted);
		}, [focused, persisted]);
		const invalid = !isValidStack(draft);
		const commit = () => {
			const next = draft.trim();
			if (!isValidStack(next)) {
				setDraft(persisted);
				return;
			}
			if (next !== persisted) props.save(next);
		};
		return (
			<div className={`${STYLE_TAG_MARKER}-row`}>
				<div className={`${STYLE_TAG_MARKER}-rowText`}>
					<div className={`${STYLE_TAG_MARKER}-title`}>{props.t(titleKey)}</div>
					<div
						className={`${STYLE_TAG_MARKER}-desc${invalid ? ` ${STYLE_TAG_MARKER}-invalid` : ""}`}
					>
						{invalid ? props.t("stack.invalid") : props.t(descriptionKey)}
					</div>
				</div>
				<div className={`${STYLE_TAG_MARKER}-control`}>
					<Input
						aria-label={props.t(titleKey)}
						aria-invalid={invalid}
						className={`${STYLE_TAG_MARKER}-input`}
						spellCheck={false}
						value={draft}
						onBlur={() => {
							setFocused(false);
							commit();
						}}
						onChange={(event) => {
							setDraft(event.target.value);
						}}
						onFocus={() => {
							setFocused(true);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.currentTarget.blur();
							} else if (event.key === "Escape") {
								setDraft(persisted);
								event.currentTarget.blur();
							}
						}}
					/>
				</div>
			</div>
		);
	}

	return { field, store, FontRow };
}

/**
 * このプラグインが使うサービス
 */
export const inject = ["slots", "locale", "settingsScope"];

/**
 * @description 保存済みのフォントを当て 設定 → 一般 の行から書き換えられるようにする
 * @param ctx - クライアント側 cordis コンテキスト
 */
export function apply(ctx: ClientContext): void {
	installRowStyles(ctx);
	const stylesheet = createStylesheet();
	const scope = ctx.settingsScope.bind({
		namespace: NAMESPACE,
		decode: readFontSettings,
	});
	const report = (error: unknown) => {
		ctx.logger?.warn?.("dsh-ui-font: 設定を保存できませんでした", error);
	};
	const rows = [
		createFontRow(SANS_FIELD, "sans.title", "sans.description"),
		createFontRow(MONO_FIELD, "mono.title", "mono.description"),
	];
	// 実際に書けるのは枠組みが渡すアクションだけなので 登録時に受け取って保持する
	const actions = new Map<string, RowActions>();
	const sync = () => {
		const snapshot = scope.getSnapshot();
		const settings = snapshot.value;
		if (settings === undefined) return;
		stylesheet(settings);
		for (const row of rows) {
			actions
				.get(row.field)
				?.sync(
					row.field === SANS_FIELD ? settings.sans : settings.mono,
					snapshot.revision ?? 0,
				);
		}
	};
	ctx.effect(() => scope.subscribe(sync), "dsh-ui-font: settings adoption");
	sync();
	ctx.effect(() => {
		const disposers = [
			ctx.locale.register(LOCALE_NAMESPACE, DICTIONARIES),
			ctx.locale.register(LOCALE_NAMESPACE, "ja", JAPANESE),
		];
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, "dsh-ui-font: settings row dictionaries");
	for (const [index, row] of rows.entries()) {
		ctx.slots.inject("settings.general.item", () =>
			ctx.slots.register(
				{
					name: "settings.general.item",
					id: `${STYLE_TAG_MARKER}-${row.field}`,
					order: 70 + index,
					store: row.store,
					locale: LOCALE_NAMESPACE,
					inject: (rowActions) => {
						actions.set(row.field, rowActions);
						sync();
						return {
							save: (value: string) => {
								scope.set(row.field, value).catch(report);
							},
						};
					},
				},
				row.FontRow,
			),
		);
	}
}
