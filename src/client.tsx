/**
 * @description ブラウザ側の本体
 *
 * 保存済みのフォントはスタイルタグ1枚で当てる 書体は配色に依存しないため light と
 * dark へ同じ値を渡し `!important` で ui-layout の presenter が body へ書く
 * インライン値より優先させる 値は設定 → 一般 の行から書き換えられ 購読経由で即座に
 * 反映する 行は文字列入力ではなく端末に入っている書体の一覧から選ぶ形にし
 * フォールバックの順番は並べ替えで決められるようにする
 */

import { defineStore } from "@deepseek-ai/dsh-client-store";
import {
	IconCheckOutline14,
	IconChevronLeftOutline14,
	IconChevronRightOutline14,
	IconCloseFill14,
	IconPlusOutline16,
	IconSearchOutline16,
	Input,
	useAnchoredPosition,
	useDismissOnOutsidePointer,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { useEffect, useRef, useState } from "react";
import {
	buildFontCss,
	FONT_STYLE_TAG_ID,
	type FontSettings,
	formatFontStack,
	MONO_FIELD,
	NAMESPACE,
	parseFontStack,
	quoteFamily,
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
 * 一覧へ一度に並べる書体の上限 端末によっては千件を超える
 */
const MAX_VISIBLE_FONTS = 300;

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
	readonly t: (key: string, params?: Record<string, string>) => string;
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
 * 端末に入っている書体を列挙するブラウザ API
 */
type LocalFontQuery = () => Promise<readonly { readonly family: string }[]>;

/**
 * 書体の一覧を読んだ結果
 */
interface CatalogState {
	readonly status: "unsupported" | "loading" | "denied" | "ready";
	readonly families: readonly string[];
}

/**
 * 一覧へ並べる1行
 */
interface FontOption {
	readonly key: string;
	readonly label: string;
	readonly selected: boolean;
	readonly custom: boolean;
}

/**
 * 行の見た目 General セクションの既存行と同じ寸法と色を使う
 */
const ROW_CSS = [
	`.${STYLE_TAG_MARKER}-row{align-items:center;gap:8px;padding:16px 0;display:flex;border-bottom:.5px solid var(--dsw-alias-border-l2)}`,
	`.${STYLE_TAG_MARKER}-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:24px;display:flex}`,
	`.${STYLE_TAG_MARKER}-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}`,
	`.${STYLE_TAG_MARKER}-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}`,
	`.${STYLE_TAG_MARKER}-chips{align-items:center;flex-wrap:wrap;gap:4px;display:flex}`,
	`.${STYLE_TAG_MARKER}-chip{align-items:center;gap:2px;height:24px;padding:0 2px 0 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-l2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;display:inline-flex}`,
	`.${STYLE_TAG_MARKER}-chipLabel{max-width:200px;font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
	`.${STYLE_TAG_MARKER}-chipButton{align-items:center;justify-content:center;width:20px;height:20px;padding:0;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:4px;display:inline-flex}`,
	`.${STYLE_TAG_MARKER}-chipButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-l3)}`,
	`.${STYLE_TAG_MARKER}-chipButton:disabled{opacity:.35;cursor:default}`,
	`.${STYLE_TAG_MARKER}-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}`,
	`.${STYLE_TAG_MARKER}-preview{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
	`.${STYLE_TAG_MARKER}-control{align-items:center;flex:none;display:inline-flex}`,
	`.${STYLE_TAG_MARKER}-add{align-items:center;gap:6px;height:28px;padding:0 10px;color:var(--dsw-alias-label-primary);cursor:pointer;background:var(--dsw-alias-bg-l2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;display:inline-flex;font-size:13px;line-height:18px}`,
	`.${STYLE_TAG_MARKER}-add:hover{background:var(--dsw-alias-bg-l3)}`,
	`.${STYLE_TAG_MARKER}-panel{position:fixed;z-index:40;flex-direction:column;width:300px;max-height:360px;padding:8px;background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;box-shadow:0 8px 24px #0003;display:flex}`,
	`.${STYLE_TAG_MARKER}-note{padding:4px 2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}`,
	`.${STYLE_TAG_MARKER}-list{flex-direction:column;gap:2px;flex:1;min-height:0;overflow-y:auto;display:flex}`,
	`.${STYLE_TAG_MARKER}-option{align-items:center;justify-content:space-between;gap:8px;width:100%;padding:4px 8px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:4px;display:flex;font-size:13px;line-height:20px}`,
	`.${STYLE_TAG_MARKER}-option:hover{background:var(--dsw-alias-bg-l2)}`,
	`.${STYLE_TAG_MARKER}-optionSelected{background:var(--dsw-alias-bg-l2)}`,
	`.${STYLE_TAG_MARKER}-optionLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
	`.${STYLE_TAG_MARKER}-footer{justify-content:flex-end;padding-top:6px;display:flex}`,
	`.${STYLE_TAG_MARKER}-done{height:26px;padding:0 10px;color:var(--dsw-alias-label-primary);cursor:pointer;background:var(--dsw-alias-bg-l2);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;font-size:12px}`,
	`.${STYLE_TAG_MARKER}-search{width:100%}`,
].join("");

/**
 * 行の文言 英語が基準で日本語と中国語を添える
 */
const DICTIONARIES: Record<string, Record<string, string>> = {
	en: {
		"sans.title": "Body font",
		"sans.description": "Families for the conversation and the interface",
		"mono.title": "Code font",
		"mono.description": "Families for code blocks and monospaced text",
		"stack.preview": "Aa あいうえお 0123 {} => ();",
		"stack.add": "Add font",
		"stack.empty": "No font yet",
		"stack.search": "Search fonts",
		"stack.loading": "Reading the fonts installed on this machine…",
		"stack.denied":
			"Font access was refused, so a short list of common families is shown",
		"stack.unsupported":
			"This browser cannot list installed fonts, so a short list of common families is shown",
		"stack.custom": "Add “{name}”",
		"stack.remove": "Remove {name}",
		"stack.earlier": "Move {name} earlier",
		"stack.later": "Move {name} later",
		"stack.done": "Done",
	},
	zh: {
		"sans.title": "正文字体",
		"sans.description": "会话与界面使用的字体",
		"mono.title": "代码字体",
		"mono.description": "代码块与等宽文本使用的字体",
		"stack.preview": "Aa あいうえお 0123 {} => ();",
		"stack.add": "添加字体",
		"stack.empty": "尚未选择字体",
		"stack.search": "搜索字体",
		"stack.loading": "正在读取本机已安装的字体…",
		"stack.denied": "未获得字体访问权限，改为显示常用字体列表",
		"stack.unsupported": "此浏览器无法列出已安装字体，改为显示常用字体列表",
		"stack.custom": "添加“{name}”",
		"stack.remove": "移除 {name}",
		"stack.earlier": "将 {name} 前移",
		"stack.later": "将 {name} 后移",
		"stack.done": "完成",
	},
};

/**
 * 日本語の文言 日本語ロケールが無い場合は英語へ落ちる
 */
const JAPANESE: Record<string, string> = {
	"sans.title": "本文フォント",
	"sans.description": "会話とUIに使う書体",
	"mono.title": "コードフォント",
	"mono.description": "コードと等幅表示に使う書体",
	"stack.preview": "Aa あいうえお 0123 {} => ();",
	"stack.add": "フォントを追加",
	"stack.empty": "まだ選ばれていません",
	"stack.search": "フォントを検索",
	"stack.loading": "この端末に入っているフォントを読み込んでいます…",
	"stack.denied":
		"フォントへのアクセスが許可されなかったため よく使う書体の一覧を出しています",
	"stack.unsupported":
		"このブラウザは導入済みフォントを列挙できないため よく使う書体の一覧を出しています",
	"stack.custom": "「{name}」を追加",
	"stack.remove": "{name} を外す",
	"stack.earlier": "{name} を前に出す",
	"stack.later": "{name} を後ろへ送る",
	"stack.done": "完了",
};

/**
 * 端末の書体を列挙できない場合に出す一覧
 */
const FALLBACK_FAMILIES: readonly string[] = [
	"BIZ UDPGothic",
	"BIZ UDGothic",
	"Noto Sans JP",
	"Noto Sans Mono CJK JP",
	"Source Han Code JP",
	"Hiragino Kaku Gothic ProN",
	"Hiragino Sans",
	"Yu Gothic UI",
	"Yu Gothic",
	"Meiryo",
	"MS Gothic",
	"JetBrains Mono",
	"Fira Code",
	"Cascadia Code",
	"Cascadia Mono",
	"Source Code Pro",
	"Consolas",
	"SF Mono",
	"Menlo",
	"Monaco",
	"Inter",
	"Segoe UI",
	"Helvetica Neue",
	"Arial",
	"Verdana",
	"Tahoma",
	"Georgia",
	"Times New Roman",
	"Cambria",
	"Calibri",
	"system-ui",
	"sans-serif",
	"serif",
	"monospace",
];

/**
 * @description 端末に入っている書体を読む
 *
 * 許可が下りた場合だけ実際の一覧を返す 使えない場合と拒否された場合は同梱の一覧へ
 * 落として 選べる書体が無くなる状態を作らない 結果の保持は呼び出し側が行う
 * @returns 書体の一覧と その出どころ
 */
async function loadCatalog(): Promise<CatalogState> {
	const host = globalThis as { queryLocalFonts?: LocalFontQuery };
	const query = host.queryLocalFonts;
	if (typeof query !== "function") {
		return { families: FALLBACK_FAMILIES, status: "unsupported" };
	}
	try {
		const fonts = await query.call(globalThis);
		const families = new Set<string>();
		for (const font of fonts) {
			const name = font.family.trim();
			if (name !== "") families.add(name);
		}
		return families.size === 0
			? { families: FALLBACK_FAMILIES, status: "unsupported" }
			: {
					families: [...families].sort((left, right) =>
						left.localeCompare(right),
					),
					status: "ready",
				};
	} catch {
		return { families: FALLBACK_FAMILIES, status: "denied" };
	}
}

/**
 * @description 一覧へ並べる候補を組み立てる
 *
 * 選択済みの書体は一覧に無くても外せるように先頭へ混ぜる 検索語が一覧のどれとも
 * 一致しない場合は その名前をそのまま追加できる行を足す
 * @param catalog - 読み込んだ書体の一覧
 * @param selected - 現在選ばれている書体の並び
 * @param query - 検索語
 * @param t - 文言を引く関数
 * @returns 並べる行
 */
function buildOptions(
	catalog: CatalogState,
	selected: readonly string[],
	query: string,
	t: RowProps["t"],
): FontOption[] {
	const needle = query.trim().toLowerCase();
	const known = new Set(catalog.families.map((name) => name.toLowerCase()));
	const options: FontOption[] = [];
	for (const family of selected) {
		if (known.has(family.toLowerCase())) continue;
		// 検索中は一覧に無い書体も絞り込む 無関係な行が先頭へ残ると選び間違える
		if (needle !== "" && !family.toLowerCase().includes(needle)) continue;
		options.push({
			custom: false,
			key: `selected:${family}`,
			label: family,
			selected: true,
		});
	}
	let matched = 0;
	for (const family of catalog.families) {
		if (needle !== "" && !family.toLowerCase().includes(needle)) continue;
		matched += 1;
		if (matched > MAX_VISIBLE_FONTS) break;
		options.push({
			custom: false,
			key: family,
			label: family,
			selected: selected.some(
				(current) => current.toLowerCase() === family.toLowerCase(),
			),
		});
	}
	if (needle !== "") {
		const exact = options.some(
			(option) =>
				option.custom === false && option.label.toLowerCase() === needle,
		);
		if (!exact) {
			options.push({
				custom: true,
				key: `custom:${query.trim()}`,
				label: t("stack.custom", { name: query.trim() }),
				selected: false,
			});
		}
	}
	return options;
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
 * @description 並びの中の1つを前後へ動かす
 * @param families - 現在の並び
 * @param index - 動かす位置
 * @param offset - 動かす向き
 * @returns 動かした後の並び 動かせない場合は同じ並び
 */
function moveFamily(
	families: readonly string[],
	index: number,
	offset: number,
): string[] {
	const target = index + offset;
	if (index < 0 || index >= families.length) return [...families];
	if (target < 0 || target >= families.length) return [...families];
	const next = [...families];
	const [moved] = next.splice(index, 1);
	if (moved === undefined) return [...families];
	next.splice(target, 0, moved);
	return next;
}

/**
 * @description 1つのフォントを選ぶ行を作る
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
		const [families, setFamilies] = useState<string[]>(() =>
			parseFontStack(persisted),
		);
		const [open, setOpen] = useState(false);
		const [query, setQuery] = useState("");
		const [catalog, setCatalog] = useState<CatalogState>({
			families: [],
			status: "loading",
		});
		const anchorRef = useRef<HTMLDivElement | null>(null);
		const panelRef = useRef<HTMLDivElement | null>(null);
		const catalogRef = useRef<CatalogState | null>(null);
		const position = useAnchoredPosition({
			anchorRef,
			gap: 6,
			margin: 12,
			open,
			panelRef,
			side: "bottom",
		});
		useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef);
		useEffect(() => {
			setFamilies(parseFontStack(persisted));
		}, [persisted]);
		useEffect(() => {
			if (!open) return;
			const cached = catalogRef.current;
			if (cached !== null) {
				setCatalog(cached);
				return;
			}
			let cancelled = false;
			void loadCatalog().then((next) => {
				if (cancelled) return;
				catalogRef.current = next;
				setCatalog(next);
			});
			return () => {
				cancelled = true;
			};
		}, [open]);
		useEffect(() => {
			// 枠組みの Input は ref を取れないため 開いた後に中から探して合わせる
			if (!open) return;
			panelRef.current?.querySelector("input")?.focus();
		}, [open, catalog.status]);

		const commit = (next: readonly string[]) => {
			setFamilies([...next]);
			const value = formatFontStack(next);
			if (value !== persisted) props.save(value);
		};
		const toggle = (option: FontOption) => {
			if (option.custom) {
				commit([...families, option.key.slice("custom:".length)]);
				setQuery("");
				return;
			}
			const exists = families.some(
				(family) => family.toLowerCase() === option.label.toLowerCase(),
			);
			if (exists) {
				commit(
					families.filter(
						(family) => family.toLowerCase() !== option.label.toLowerCase(),
					),
				);
				return;
			}
			commit([...families, option.label]);
		};
		const options = buildOptions(catalog, families, query, props.t);
		const preview = formatFontStack(families);
		return (
			<div className={`${STYLE_TAG_MARKER}-row`}>
				<div className={`${STYLE_TAG_MARKER}-rowText`}>
					<div className={`${STYLE_TAG_MARKER}-title`}>{props.t(titleKey)}</div>
					<div className={`${STYLE_TAG_MARKER}-desc`}>
						{props.t(descriptionKey)}
					</div>
					<div className={`${STYLE_TAG_MARKER}-chips`}>
						{families.length === 0 ? (
							<span className={`${STYLE_TAG_MARKER}-empty`}>
								{props.t("stack.empty")}
							</span>
						) : null}
						{families.map((family, index) => (
							<span className={`${STYLE_TAG_MARKER}-chip`} key={family}>
								<span
									className={`${STYLE_TAG_MARKER}-chipLabel`}
									style={{ fontFamily: quoteFamily(family) }}
								>
									{family}
								</span>
								<button
									type="button"
									className={`${STYLE_TAG_MARKER}-chipButton`}
									aria-label={props.t("stack.earlier", { name: family })}
									disabled={index === 0}
									onClick={() => {
										commit(moveFamily(families, index, -1));
									}}
								>
									<IconChevronLeftOutline14 />
								</button>
								<button
									type="button"
									className={`${STYLE_TAG_MARKER}-chipButton`}
									aria-label={props.t("stack.later", { name: family })}
									disabled={index === families.length - 1}
									onClick={() => {
										commit(moveFamily(families, index, 1));
									}}
								>
									<IconChevronRightOutline14 />
								</button>
								<button
									type="button"
									className={`${STYLE_TAG_MARKER}-chipButton`}
									aria-label={props.t("stack.remove", { name: family })}
									onClick={() => {
										commit(families.filter((current) => current !== family));
									}}
								>
									<IconCloseFill14 />
								</button>
							</span>
						))}
					</div>
					<div
						className={`${STYLE_TAG_MARKER}-preview`}
						style={preview === "" ? undefined : { fontFamily: preview }}
					>
						{props.t("stack.preview")}
					</div>
				</div>
				<div className={`${STYLE_TAG_MARKER}-control`} ref={anchorRef}>
					<button
						type="button"
						className={`${STYLE_TAG_MARKER}-add`}
						aria-expanded={open}
						aria-haspopup="listbox"
						onClick={() => {
							setQuery("");
							setOpen(!open);
						}}
					>
						<IconPlusOutline16 />
						<span>{props.t("stack.add")}</span>
					</button>
				</div>
				{open ? (
					<div
						className={`${STYLE_TAG_MARKER}-panel`}
						ref={panelRef}
						role="listbox"
						aria-multiselectable="true"
						aria-label={props.t(titleKey)}
						style={
							position === null
								? undefined
								: { left: position.left, top: position.top }
						}
					>
						<Input
							aria-label={props.t("stack.search")}
							className={`${STYLE_TAG_MARKER}-search`}
							icon={<IconSearchOutline16 />}
							placeholder={props.t("stack.search")}
							spellCheck={false}
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
							}}
						/>
						{catalog.status === "loading" ? (
							<div className={`${STYLE_TAG_MARKER}-note`}>
								{props.t("stack.loading")}
							</div>
						) : null}
						{catalog.status === "denied" ? (
							<div className={`${STYLE_TAG_MARKER}-note`}>
								{props.t("stack.denied")}
							</div>
						) : null}
						{catalog.status === "unsupported" ? (
							<div className={`${STYLE_TAG_MARKER}-note`}>
								{props.t("stack.unsupported")}
							</div>
						) : null}
						<div className={`${STYLE_TAG_MARKER}-list`}>
							{options.map((option) => (
								<button
									type="button"
									key={option.key}
									role="option"
									aria-selected={option.selected}
									className={`${STYLE_TAG_MARKER}-option${option.selected ? ` ${STYLE_TAG_MARKER}-optionSelected` : ""}`}
									style={
										option.custom
											? undefined
											: { fontFamily: quoteFamily(option.label) }
									}
									onClick={() => {
										toggle(option);
									}}
								>
									<span className={`${STYLE_TAG_MARKER}-optionLabel`}>
										{option.label}
									</span>
									{option.selected ? <IconCheckOutline14 /> : null}
								</button>
							))}
						</div>
						<div className={`${STYLE_TAG_MARKER}-footer`}>
							<button
								type="button"
								className={`${STYLE_TAG_MARKER}-done`}
								onClick={() => {
									setOpen(false);
								}}
							>
								{props.t("stack.done")}
							</button>
						</div>
					</div>
				) : null}
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
