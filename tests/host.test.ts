import { describe, expect, test } from "bun:test";
import { DEFAULT_MONO, DEFAULT_SANS } from "../src/shared";

/**
 * 差し込まれたスタイル行
 */
interface StyleRow {
	readonly kind: string;
	readonly text: string;
}

/**
 * 生きた設定値の参照
 */
interface VolatileRef<T> {
	get(): T;
}

/**
 * 解決済みの設定
 */
interface ResolvedConfig {
	readonly sans: VolatileRef<string>;
	readonly mono: VolatileRef<string>;
}

/**
 * 書き換えられる生きた参照を作る
 * @param initial - 最初に返す値
 * @returns 値を差し替えられる参照
 */
function createRef(initial: string): VolatileRef<string> & {
	set(value: string): void;
} {
	let current = initial;
	return {
		get: () => current,
		set: (value) => {
			current = value;
		},
	};
}

/**
 * 設定サービスが現れた時の子コンテキスト
 */
interface HostSettingsContext {
	readonly settings: {
		configure(presentation: { auto?: boolean }, owner?: unknown): () => void;
	};
	effect(callback: () => (() => void) | undefined, label?: string): void;
}

/**
 * 面の登録内容
 */
interface Configured {
	readonly presentation: { auto?: boolean };
	readonly owner: unknown;
}

/**
 * テスト1件分のホスト実行環境を作る
 * @param config - プラグインへ渡す生きた設定
 */
function createHost(config: ResolvedConfig) {
	const configured: Configured[] = [];
	const effects: string[] = [];
	const listeners: ((table: StyleRow[]) => void)[] = [];
	let callback: ((ctx: HostSettingsContext) => void) | undefined;
	const fiber = { label: "test-fiber" };
	const host = {
		fiber,
		inject(names: readonly string[], next: typeof callback) {
			expect(names).toEqual(["settings"]);
			callback = next;
		},
		on(event: string, listener: (table: StyleRow[]) => void) {
			expect(event).toBe("webserver/index-inject");
			listeners.push(listener);
		},
	};
	return {
		config,
		configured,
		effects,
		host,
		/** 設定サービスが現れた状態にして副作用を走らせる */
		attachSettings() {
			callback?.({
				settings: {
					configure: (presentation, owner) => {
						configured.push({ owner, presentation });
						return () => {};
					},
				},
				effect: (register, label) => {
					if (label !== undefined) effects.push(label);
					register();
				},
			});
		},
		/** index を配る時に積まれる行を集める */
		emit() {
			const table: StyleRow[] = [];
			for (const listener of listeners) listener(table);
			return table;
		},
	};
}

const moduleUrl = new URL("../lib/index.js", import.meta.url).href;
const hostModule = (await import(moduleUrl)) as {
	apply(ctx: unknown, config: ResolvedConfig): void;
	Config: ((value: unknown) => ResolvedConfig) & {
		toJSON(): unknown;
	};
};

describe("設定スキーマ", () => {
	test("未設定なら同梱のフォントスタックを使う", () => {
		const resolved = hostModule.Config({});
		expect(resolved.sans.get()).toBe(DEFAULT_SANS);
		expect(resolved.mono.get()).toBe(DEFAULT_MONO);
	});

	test("スタイルシートを壊す文字を弾く", () => {
		expect(() => hostModule.Config({ sans: "Bad} Sans" })).toThrow();
		expect(() => hostModule.Config({ mono: "Bad; Mono" })).toThrow();
	});

	test("ブラウザ側が読み直せる形へ直列化できる", () => {
		expect(hostModule.Config.toJSON()).toBeDefined();
	});
});

describe("apply", () => {
	test("自前の設定面を出すため 自動生成の面を止める", () => {
		const client = createHost({
			mono: createRef("Config Mono"),
			sans: createRef("Config Sans"),
		});
		hostModule.apply(client.host, client.config);
		client.attachSettings();

		expect(client.configured).toHaveLength(1);
		expect(client.configured[0]?.presentation).toEqual({ auto: false });
		expect(client.configured[0]?.owner).toBe(client.host.fiber);
		expect(client.effects).toContain("dsh-ui-font: settings form policy");
	});

	test("index へスタイル行を1つ差し込む", () => {
		const client = createHost({
			mono: createRef("Config Mono"),
			sans: createRef("Config Sans"),
		});
		hostModule.apply(client.host, client.config);
		const table = client.emit();

		expect(table).toHaveLength(1);
		const [row] = table;
		expect(row?.kind).toBe("style");
		expect(row?.text).toContain("Config Sans");
		expect(row?.text).toContain("Config Mono");
		expect(row?.text).toContain("--dsw-font-family");
		expect(row?.text).toContain("--dsw-font-mono");
		expect(row?.text).toContain("--ds-font-family-code");
		expect(row?.text).toContain("!important");
		expect(row?.text).not.toContain("</style");
	});

	test("保存済みの値は生きた参照から読む", () => {
		const sans = createRef("Config Sans");
		const mono = createRef("Config Mono");
		const client = createHost({ mono, sans });
		hostModule.apply(client.host, client.config);

		sans.set("Saved Sans");
		mono.set("Saved Mono");
		const [row] = client.emit();
		expect(row?.text).toContain("Saved Sans");
		expect(row?.text).toContain("Saved Mono");
		expect(row?.text).not.toContain("Config Sans");
	});

	test("壊れた保存値は既定値へ寄せる", () => {
		const client = createHost({
			mono: createRef(""),
			sans: createRef("Bad} Sans"),
		});
		hostModule.apply(client.host, client.config);

		const [row] = client.emit();
		expect(row?.text).not.toContain("Bad}");
		expect(row?.text).toContain("Bad Sans");
		expect(row?.text).toContain(DEFAULT_MONO);
	});
});
