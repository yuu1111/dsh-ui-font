import { describe, expect, test } from "bun:test";
import manifest from "../package.json";

/**
 * バンドルが公開するプラグイン面
 */
interface PluginFace {
	apply(ctx: unknown): void;
	readonly inject: readonly string[];
}

/**
 * バンドルが `window.__ModuleLoader__.load` へ渡す登録内容
 */
interface Registration {
	readonly id: string;
	readonly factory: (require: (specifier: string) => unknown) => PluginFace;
}

/**
 * 枠組みへ渡す行の登録内容
 */
interface RowOptions {
	readonly name: string;
	readonly id: string;
	readonly order: number;
	readonly store: unknown;
	readonly locale: string;
	readonly inject: (actions: RowActions) => RowInjected;
}

/**
 * 行へ渡される保存済みの値と書き込み口
 */
interface RowActions {
	sync(value: string, revision: number): void;
}

/**
 * 行の保存口
 */
interface RowInjected {
	save(value: string): void;
}

/**
 * 描画した木の節
 */
interface Node {
	readonly type: unknown;
	readonly props: Record<string, unknown>;
}

/**
 * 最小の style 要素スタブ
 */
interface FakeTag {
	readonly dataset: Record<string, string>;
	textContent: string;
	removed: boolean;
	remove(): void;
}

/**
 * 設定 namespace を購読するハンドルのスタブ
 */
interface FakeScope {
	snapshot: { status: string; value: unknown; revision: number | undefined };
	readonly written: [string, unknown][];
	getSnapshot(): {
		status: string;
		value: unknown;
		revision: number | undefined;
	};
	set(field: string, value: unknown): Promise<void>;
	subscribe(listener: () => void): () => void;
	emit(): void;
}

const registrations: Registration[] = [];
const appended: FakeTag[] = [];

/**
 * 最小の style 要素を作る
 */
function createTag(): FakeTag {
	const tag: FakeTag = {
		dataset: {},
		textContent: "",
		removed: false,
		remove() {
			tag.removed = true;
		},
	};
	return tag;
}

/**
 * 属性セレクタ1つだけを解釈する タグの検索
 */
function matches(tag: FakeTag, selector: string): boolean {
	const match = /^style\[data-plugin(?:-css)?="(.+)"\]$/.exec(selector);
	if (match === null) return false;
	const [, value] = match;
	return tag.dataset.plugin === value || tag.dataset.pluginCss === value;
}

/**
 * style タグだけを持つ最小の document
 */
function createFakeDocument() {
	const tags: FakeTag[] = [];
	return {
		tags,
		createElement: () => {
			const tag = createTag();
			return tag;
		},
		head: {
			append(tag: FakeTag) {
				tags.push(tag);
				appended.push(tag);
			},
		},
		querySelector: (selector: string) =>
			tags.find((tag) => matches(tag, selector)) ?? null,
		querySelectorAll: (selector: string) =>
			tags.filter((tag) => matches(tag, selector)),
	};
}

// バンドルは読み込み時に自分自身をローダーへ登録する 先にスタブを差しておく
Object.defineProperty(globalThis, "window", {
	configurable: true,
	value: {
		__ModuleLoader__: {
			load: (registration: Registration) => {
				registrations.push(registration);
			},
		},
	},
});

// 生成物を実行時に読む 型解決の対象にすると宣言ファイルが無いため識別子を経由する
const clientBundleUrl = new URL("../lib/client.js", import.meta.url).href;

await import(clientBundleUrl);

/**
 * 2つのフックだけを持つ最小の React 代替
 */
function createHooks() {
	const cells: unknown[] = [];
	let index = 0;
	return {
		begin() {
			index = 0;
		},
		useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void] {
			const slot = index;
			index += 1;
			if (cells.length <= slot) cells[slot] = initial;
			return [
				cells[slot] as T,
				(next) => {
					cells[slot] =
						typeof next === "function"
							? (next as (p: T) => T)(cells[slot] as T)
							: next;
				},
			];
		},
		useEffect(effect: () => void) {
			effect();
		},
	};
}

/**
 * 最小の JSX ランタイム
 */
const jsxRuntime = {
	jsx: (type: unknown, props: Record<string, unknown>): Node => ({
		props,
		type,
	}),
	jsxs: (type: unknown, props: Record<string, unknown>): Node => ({
		props,
		type,
	}),
	Fragment: "Fragment",
};

/**
 * バンドルへ渡す最小の require
 */
function createRequire(hooks: ReturnType<typeof createHooks>) {
	return (specifier: string): unknown => {
		switch (specifier) {
			case "react":
				return { useEffect: hooks.useEffect, useState: hooks.useState };
			case "react/jsx-runtime":
				return jsxRuntime;
			case "@deepseek-ai/dsh-client-store":
				return { defineStore: (spec: unknown) => ({ spec }) };
			case "@deepseek-ai/dsh-client-ui-primitives":
				return {
					Input(props: Record<string, unknown>) {
						return { props, type: "Input" };
					},
				};
			default:
				throw new Error(`スタブしていないモジュール: ${specifier}`);
		}
	};
}

/**
 * ビルド済みバンドルが公開するプラグイン面を取り出す
 */
function loadPluginFace(): {
	face: PluginFace;
	hooks: ReturnType<typeof createHooks>;
} {
	const [registration] = registrations;
	if (registration === undefined) {
		throw new Error("バンドルがモジュールを登録していない");
	}
	const hooks = createHooks();
	return { face: registration.factory(createRequire(hooks)), hooks };
}

/**
 * 保存済みの値を返す購読ハンドルを作る
 */
function createScope(value: unknown, revision = 1): FakeScope {
	let listener: (() => void) | undefined;
	const scope: FakeScope = {
		snapshot: { status: "ready", value, revision },
		written: [],
		getSnapshot() {
			return scope.snapshot;
		},
		set(field, next) {
			scope.written.push([field, next]);
			return Promise.resolve();
		},
		subscribe(next) {
			listener = next;
			return () => {
				listener = undefined;
			};
		},
		emit() {
			listener?.();
		},
	};
	return scope;
}

/**
 * テスト1件分のクライアント実行環境を作る
 */
function createClient(value: unknown) {
	const document = createFakeDocument();
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: document,
	});
	const scope = createScope(value);
	let spec: {
		namespace: string;
		decode?: (section: unknown) => unknown;
	} = { namespace: "" };
	const rows: { options: RowOptions; component: (props: unknown) => Node }[] =
		[];
	const dictionaries: unknown[][] = [];
	const effects: string[] = [];
	const disposers: (() => void)[] = [];
	const events: string[] = [];
	const ctx = {
		settingsScope: {
			bind(next: typeof spec) {
				spec = next;
				return scope;
			},
		},
		slots: {
			inject(name: string, callback: () => unknown) {
				events.push(`inject:${name}`);
				callback();
			},
			register(options: RowOptions, component: (props: unknown) => Node) {
				rows.push({ component, options });
				return () => {};
			},
		},
		locale: {
			register(...args: unknown[]) {
				dictionaries.push(args);
				return () => {};
			},
		},
		effect(callback: () => (() => void) | undefined, label: string) {
			effects.push(label);
			const disposer = callback();
			if (disposer !== undefined) disposers.push(disposer);
		},
		logger: { warn: () => {} },
	};
	const loaded = loadPluginFace();
	loaded.face.apply(ctx);
	return {
		dictionaries,
		disposers,
		document,
		effects,
		events,
		hooks: loaded.hooks,
		rows,
		scope,
		spec,
	};
}

/**
 * 木から文字列を集める
 */
function collectText(node: unknown): string {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(collectText).join("");
	if (typeof node !== "object" || node === null) return "";
	const props = (node as Node).props;
	if (props === undefined) return "";
	return collectText(props.children);
}

/**
 * 木から指定した名前の要素を探す
 */
function findNode(node: unknown, name: string): Node | undefined {
	if (typeof node !== "object" || node === null) return undefined;
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findNode(child, name);
			if (found !== undefined) return found;
		}
		return undefined;
	}
	const element = node as Node;
	const type = element.type as { name?: string } | undefined;
	if (type?.name === name) return element;
	return findNode(element.props?.children, name);
}

describe("ビルド済みクライアントバンドル", () => {
	test("パッケージ名をモジュールIDとして登録する", () => {
		const [registration] = registrations;
		expect(registration).toBeDefined();
		expect(registration?.id).toBe(manifest.name);
	});

	test("Cordis が読むプラグイン面を公開する", () => {
		const { face } = loadPluginFace();
		expect(face.inject).toEqual(["slots", "locale", "settingsScope"]);
		expect(typeof face.apply).toBe("function");
	});
});

describe("apply", () => {
	test("設定 namespace を購読し スタイルタグ1枚でフォントを当てる", () => {
		const { document, rows, scope, spec } = createClient({
			sans: '"Test Sans", sans-serif',
			mono: '"Test Mono", monospace',
		});

		expect(spec.namespace).toBe("ui-font");
		expect(spec.decode?.({ sans: "a", mono: "b" })).toEqual({
			sans: "a",
			mono: "b",
		});
		expect(spec.decode?.(undefined)).toMatchObject({
			mono: expect.any(String),
		});
		expect(rows.map((row) => row.options.id)).toEqual([
			"dsh-ui-font-sans",
			"dsh-ui-font-mono",
		]);
		expect(rows.map((row) => row.options.order)).toEqual([70, 71]);
		expect(rows.map((row) => row.options.locale)).toEqual([
			"ui-font",
			"ui-font",
		]);
		expect(rows.every((row) => row.options.store !== undefined)).toBe(true);

		// 行の見た目とフォントは別のタグで持つ
		const fontTags = () =>
			document.tags.filter(
				(tag) => tag.dataset.pluginCss === "dsh-ui-font/font-family.css",
			);
		expect(
			document.tags.some(
				(tag) => tag.dataset.pluginCss === "dsh-ui-font/settings-row.css",
			),
		).toBe(true);
		expect(fontTags()).toHaveLength(1);
		const [tag] = fontTags();
		expect(tag?.dataset.plugin).toBe("dsh-ui-font");
		expect(tag?.textContent).toContain('"Test Sans", sans-serif');
		expect(tag?.textContent).toContain('"Test Mono", monospace');
		expect(tag?.textContent).toContain("--ds-font-family-code");
		expect(tag?.textContent).toContain("!important");

		// 値が届く前はホスト側が差し込んだタグをそのまま使う
		scope.snapshot = {
			status: "loading",
			value: undefined,
			revision: undefined,
		};
		scope.emit();
		expect(fontTags()).toHaveLength(1);
		expect(fontTags()[0]?.textContent).toContain('"Test Sans", sans-serif');
	});

	test("同じ値ではタグを増やさず 変わった値だけを書き換える", () => {
		const { document, scope } = createClient({ sans: "A", mono: "B" });
		const fontTags = () =>
			document.tags.filter(
				(tag) => tag.dataset.pluginCss === "dsh-ui-font/font-family.css",
			);
		expect(fontTags()).toHaveLength(1);

		scope.emit();
		expect(fontTags()).toHaveLength(1);

		scope.snapshot = {
			status: "ready",
			value: { sans: "Next Sans", mono: "Next Mono" },
			revision: 2,
		};
		scope.emit();

		expect(fontTags()).toHaveLength(1);
		expect(fontTags()[0]?.textContent).toContain("Next Sans");
		expect(fontTags()[0]?.textContent).toContain("Next Mono");
	});

	test("設定 → 一般 の行を辞書つきで登録する", () => {
		const { dictionaries, effects, events, rows } = createClient({
			sans: "A",
			mono: "B",
		});

		expect(events).toEqual([
			"inject:settings.general.item",
			"inject:settings.general.item",
		]);
		expect(dictionaries[0]?.[0]).toBe("ui-font");
		expect(Object.keys(dictionaries[0]?.[1] as object).sort()).toEqual([
			"en",
			"zh",
		]);
		expect(dictionaries[1]?.slice(0, 2)).toEqual(["ui-font", "ja"]);
		expect(effects).toContain("dsh-ui-font: settings adoption");
		expect(effects).toContain("dsh-ui-font: settings row dictionaries");
		expect(effects).toContain("dsh-ui-font: settings row stylesheet");

		const synced: [string, number][] = [];
		const injected = rows[0]?.options.inject({
			sync: (value, revision) => {
				synced.push([value, revision]);
			},
		});
		expect(synced).toEqual([["A", 1]]);
		injected?.save("Saved Sans");
		expect(rows[0]?.options.store).toBeDefined();
	});

	test("行の保存は設定へ書き戻す", () => {
		const { rows, scope } = createClient({ sans: "A", mono: "B" });
		const injected = rows[1]?.options.inject({ sync: () => {} });
		injected?.save("Saved Mono");
		expect(scope.written).toEqual([["mono", "Saved Mono"]]);
	});
});

/**
 * 木から要素を取り出す 無ければ失敗させる
 */
function requireNode(node: unknown, name: string): Node {
	const found = findNode(node, name);
	if (found === undefined) throw new Error(`要素が見つからない: ${name}`);
	return found;
}

/**
 * 要素が持つハンドラを取り出す
 */
function requireHandler<Handler>(node: Node, name: string): Handler {
	const value = node.props[name];
	if (typeof value !== "function") {
		throw new Error(`ハンドラが見つからない: ${name}`);
	}
	return value as Handler;
}

describe("設定行", () => {
	test("保存済みの値を表示し 変更を確定すると保存する", () => {
		const { hooks, rows } = createClient({ sans: "A", mono: "B" });
		const component = rows[0]?.component;
		if (component === undefined) {
			throw new Error("行が登録されていない");
		}
		const saved: string[] = [];
		const state = { revision: 1, value: "Old Sans" };
		const props = {
			save: (value: string) => {
				saved.push(value);
			},
			t: (key: string) => key,
			useStore: (select: (next: typeof state) => unknown) => select(state),
		};
		const render = () => {
			hooks.begin();
			return component(props) as Node;
		};

		let tree = render();
		expect(collectText(tree)).toContain("sans.title");
		expect(requireNode(tree, "Input").props.value).toBe("Old Sans");

		requireHandler<() => void>(requireNode(tree, "Input"), "onFocus")();
		tree = render();
		requireHandler<(event: unknown) => void>(
			requireNode(tree, "Input"),
			"onChange",
		)({ target: { value: "  New Sans  " } });
		tree = render();
		requireHandler<() => void>(requireNode(tree, "Input"), "onBlur")();
		render();

		expect(saved).toEqual(["New Sans"]);
	});

	test("スタイルシートを壊す入力は保存せず既定の説明へ戻す", () => {
		const { hooks, rows } = createClient({ sans: "A", mono: "B" });
		const component = rows[0]?.component;
		if (component === undefined) throw new Error("行が登録されていない");
		const saved: string[] = [];
		const state = { revision: 1, value: "Old Sans" };
		const props = {
			save: (value: string) => {
				saved.push(value);
			},
			t: (key: string) => key,
			useStore: (select: (next: typeof state) => unknown) => select(state),
		};
		const render = () => {
			hooks.begin();
			return component(props) as Node;
		};

		let tree = render();
		requireHandler<() => void>(requireNode(tree, "Input"), "onFocus")();
		tree = render();
		requireHandler<(event: unknown) => void>(
			requireNode(tree, "Input"),
			"onChange",
		)({ target: { value: "Bad; Sans" } });
		tree = render();
		expect(requireNode(tree, "Input").props["aria-invalid"]).toBe(true);
		expect(collectText(tree)).toContain("stack.invalid");

		requireHandler<() => void>(requireNode(tree, "Input"), "onBlur")();
		tree = render();

		expect(saved).toEqual([]);
		expect(requireNode(tree, "Input").props.value).toBe("Old Sans");
	});
});
