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
 * 登録された設定セクション
 */
interface Installed {
	readonly namespace: string;
	readonly schema: ((value: unknown) => unknown) & { toJSON?: () => unknown };
	readonly entry: { sans: string; mono: string };
	readonly setSource: (current: () => { sans: string; mono: string }) => void;
	readonly onChange: () => void;
}

/**
 * 設定サービスが現れた時のコンテキスト
 */
interface HostSettingsContext {
	readonly settings: {
		installSection(
			owner: unknown,
			namespace: string,
			schema: Installed["schema"],
			entry: Installed["entry"],
			hooks: { setSource: Installed["setSource"]; onChange: () => void },
		): void;
	};
}

/**
 * テスト1件分のホスト実行環境を作る
 */
function createHost(config: { sans: string; mono: string }) {
	const installed: Installed[] = [];
	const listeners: ((table: StyleRow[]) => void)[] = [];
	let callback: ((ctx: HostSettingsContext) => void) | undefined;
	const host = {
		inject(names: readonly string[], next: typeof callback) {
			expect(names).toEqual(["settings"]);
			callback = next;
		},
		get: () => undefined,
		on(event: string, listener: (table: StyleRow[]) => void) {
			expect(event).toBe("webserver/index-inject");
			listeners.push(listener);
		},
	};
	return {
		config,
		host,
		installed,
		/** 設定サービスが現れた状態にして登録を走らせる */
		attachSettings() {
			callback?.({
				settings: {
					installSection: (
						owner: unknown,
						namespace: string,
						schema: Installed["schema"],
						entry: Installed["entry"],
						hooks: { setSource: Installed["setSource"]; onChange: () => void },
					) => {
						expect(owner).toBe(host);
						installed.push({
							entry,
							namespace,
							onChange: hooks.onChange,
							schema,
							setSource: hooks.setSource,
						});
					},
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
	apply(ctx: unknown, config: { sans: string; mono: string }): void;
	Config: ((value: unknown) => { sans: string; mono: string }) & {
		toJSON(): unknown;
	};
};

describe("設定スキーマ", () => {
	test("未設定なら同梱のフォントスタックを使う", () => {
		expect(hostModule.Config({})).toEqual({
			mono: DEFAULT_MONO,
			sans: DEFAULT_SANS,
		});
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
	test("設定セクションを構成側の既定値つきで登録する", () => {
		const client = createHost({ mono: "Config Mono", sans: "Config Sans" });
		hostModule.apply(client.host, client.config);
		client.attachSettings();

		expect(client.installed).toHaveLength(1);
		const [installed] = client.installed;
		expect(installed?.namespace).toBe("ui-font");
		expect(installed?.entry).toEqual(client.config);
		expect(typeof installed?.schema).toBe("function");
		expect(typeof installed?.setSource).toBe("function");
	});

	test("index へスタイル行を1つ差し込む", () => {
		const client = createHost({ mono: "Config Mono", sans: "Config Sans" });
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

	test("保存済みの値があればそちらを使う", () => {
		const client = createHost({ mono: "Config Mono", sans: "Config Sans" });
		hostModule.apply(client.host, client.config);
		client.attachSettings();
		client.installed[0]?.setSource(() => ({
			mono: "Saved Mono",
			sans: "Saved Sans",
		}));

		const [row] = client.emit();
		expect(row?.text).toContain("Saved Sans");
		expect(row?.text).toContain("Saved Mono");
		expect(row?.text).not.toContain("Config Sans");
	});

	test("壊れた保存値は既定値へ寄せる", () => {
		const client = createHost({ mono: "Config Mono", sans: "Config Sans" });
		hostModule.apply(client.host, client.config);
		client.attachSettings();
		client.installed[0]?.setSource(() => ({ mono: "", sans: "Bad} Sans" }));

		const [row] = client.emit();
		expect(row?.text).not.toContain("Bad}");
		expect(row?.text).toContain("Bad Sans");
		expect(row?.text).toContain(DEFAULT_MONO);
	});
});
