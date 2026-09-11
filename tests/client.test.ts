import { describe, expect, test } from "bun:test";
import manifest from "../package.json";
import type { PluginContext, TokenOverrides } from "../src/client";

/**
 * バンドルが公開するプラグイン面
 */
interface PluginFace {
	apply(ctx: PluginContext): void;
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
 * 最小の style 要素スタブ
 */
interface FakeTag {
	readonly dataset: Record<string, string>;
	textContent: string;
	removed: boolean;
	remove(): void;
}

const registrations: Registration[] = [];

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
 * ビルド済みバンドルが公開するプラグイン面を取り出す
 */
function loadPluginFace(): PluginFace {
	const [registration] = registrations;
	if (registration === undefined)
		throw new Error("バンドルがモジュールを登録していない");
	return registration.factory(() => undefined);
}

/**
 * 最小の style 要素を作る
 */
function createFakeTag(): FakeTag {
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

describe("ビルド済みクライアントバンドル", () => {
	test("パッケージ名をモジュールIDとして登録する", () => {
		const [registration] = registrations;
		expect(registration).toBeDefined();
		expect(registration?.id).toBe(manifest.name);
	});

	test("Cordis が読むプラグイン面を公開する", () => {
		const face = loadPluginFace();
		expect(face.inject).toEqual(["theme"]);
		expect(typeof face.apply).toBe("function");
	});
});

describe("apply", () => {
	test("テーマサービスがあればトークン層として積む", () => {
		const stacked: { source: string; tokens: TokenOverrides }[] = [];
		const effects: string[] = [];
		const disposers: (() => void)[] = [];
		const layerDisposer = () => {};
		const theme = {
			overrideTokens(source: string, tokens: TokenOverrides) {
				stacked.push({ source, tokens });
				return layerDisposer;
			},
		};
		const ctx: PluginContext = {
			theme,
			effect(callback, label) {
				effects.push(label);
				const disposer = callback();
				if (disposer !== undefined) disposers.push(disposer);
			},
		};

		loadPluginFace().apply(ctx);

		expect(effects).toEqual(["dsh-ui-font: font-family tokens"]);
		expect(stacked).toHaveLength(1);
		const [layer] = stacked;
		expect(layer?.source).toBe("dsh-ui-font");
		expect(layer?.tokens["--dsw-font-family"]?.light).toContain(
			"JetBrains Mono",
		);
		expect(layer?.tokens["--dsw-font-family"]?.dark).toBe(
			layer?.tokens["--dsw-font-family"]?.light,
		);
		expect(layer?.tokens["--dsw-font-mono"]?.light).toContain("JetBrains Mono");
		expect(layer?.tokens["--ds-font-family-code"]?.light).toContain("Consolas");
		// 層の破棄はプラグインの寿命に紐づける
		expect(disposers).toEqual([layerDisposer]);
	});

	test("トークン上書きが無ければスタイルタグで代替する", () => {
		const appended: FakeTag[] = [];
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				createElement: () => createFakeTag(),
				head: {
					appendChild: (tag: FakeTag) => {
						appended.push(tag);
					},
				},
			},
		});
		let dispose: (() => void) | undefined;
		const ctx: PluginContext = {
			effect(callback) {
				dispose = callback();
			},
		};

		loadPluginFace().apply(ctx);

		expect(appended).toHaveLength(1);
		const [tag] = appended;
		expect(tag?.dataset.plugin).toBe("dsh-ui-font");
		expect(tag?.textContent).toContain("--dsw-font-family");
		expect(tag?.textContent).toContain("JetBrains Mono");
		expect(tag?.textContent).toContain("!important");
		expect(typeof dispose).toBe("function");
		dispose?.();
		expect(tag?.removed).toBe(true);
	});
});
