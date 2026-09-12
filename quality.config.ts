import { defineConfig } from "@yuu1111/quality-check";

/**
 * ビルドのたびに作り直す生成物 検査しても直す先が無いため対象から外す
 */
const GENERATED = ["lib"];

export default defineConfig({
	engines: {
		biome: true,
		typecheck: true,
		knip: true,
		"code-style-check": true,
		"comment-check": true,
		"document-style-check": true,
		"tsdoc-check": true,
	},
	config: {
		"code-style-check": {
			ignore: GENERATED,
		},
		"comment-check": {
			ignore: GENERATED,
			enable: ["cramped-comment", "japanese-period"],
		},
		"document-style-check": {
			ignore: GENERATED,
			enable: ["japanese-period"],
		},
		"tsdoc-check": {
			ignore: GENERATED,
			error: ["missing-doc", "single-line-doc", "tsdoc-tag"],
		},
	},
});
