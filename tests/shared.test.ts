import { describe, expect, test } from "bun:test";
import {
	buildFontCss,
	DEFAULT_MONO,
	DEFAULT_SANS,
	formatFontStack,
	parseFontStack,
	quoteFamily,
	sanitizeFontStack,
} from "../src/shared";

describe("フォントスタックの分解と整形", () => {
	test("同梱の既定値は書式を変えずに往復する", () => {
		expect(formatFontStack(parseFontStack(DEFAULT_SANS))).toBe(DEFAULT_SANS);
		expect(formatFontStack(parseFontStack(DEFAULT_MONO))).toBe(DEFAULT_MONO);
	});

	test("引用符を外し 空要素と重複を落とす", () => {
		expect(
			parseFontStack('"JetBrains Mono", monospace, , "JetBrains Mono"'),
		).toEqual(["JetBrains Mono", "monospace"]);
		expect(parseFontStack(undefined)).toEqual([]);
		expect(parseFontStack("  ")).toEqual([]);
	});

	test("総称フォントと識別子はそのまま それ以外は引用符で囲む", () => {
		expect(quoteFamily("Consolas")).toBe("Consolas");
		expect(quoteFamily("JetBrains Mono")).toBe('"JetBrains Mono"');
		expect(quoteFamily("BIZ UDPGothic")).toBe('"BIZ UDPGothic"');
		expect(quoteFamily("monospace")).toBe("monospace");
		expect(quoteFamily("Sans-Serif")).toBe("sans-serif");
		expect(quoteFamily("  Bad; Name  ")).toBe('"Bad Name"');
		expect(quoteFamily("{}")).toBe("");
		expect(quoteFamily(undefined)).toBe("");
	});

	test("危険な文字は落としてから組み立てる", () => {
		expect(sanitizeFontStack("Bad} Sans;<>")).toBe("Bad Sans");
		expect(parseFontStack("Bad} Sans, monospace")).toEqual([
			"Bad Sans",
			"monospace",
		]);
		expect(buildFontCss({ mono: "B", sans: "A" })).toBe(
			":root,body{--dsw-font-family:A !important;--dsw-font-mono:B !important;--ds-font-family-code:B !important;}",
		);
	});
});
