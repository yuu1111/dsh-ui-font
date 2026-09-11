/**
 * @description lib/ をビルドする
 *
 * ホスト側は ESM のまま出し ブラウザ側は CJS へ束ねてから client-modules が
 * 配信するローダー形式（`window.__ModuleLoader__.load({ id, factory })`）へ包む
 * バンドルの id はモジュール名として使われるため package.json の name と一致させる
 */

import { readFile, rm, writeFile } from "node:fs/promises";
import manifest from "./package.json";

/** 配信側がモジュール名として使う値 */
const MODULE_ID = manifest.name;

/** 出力先 DSH のプラグイン慣例に合わせる */
const OUT_DIR = "lib";

/** 配信されるバンドルは読み込み時に自分自身をローダーへ登録する */
const LOADER_HEAD = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(MODULE_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
`;

/** ローダーの factory から プラグイン面を返して閉じる */
const LOADER_TAIL = `
\t\treturn module.exports;
\t}
});
`;

/**
 * @description 失敗したビルドのログを出して中断する
 * @param label - どちらのビルドか
 * @param result - Bun.build の結果
 */
function assertBuilt(
	label: string,
	result: { success: boolean; logs: readonly unknown[] },
): void {
	if (result.success) return;
	for (const log of result.logs) console.error(log);
	throw new Error(`${label} のビルドに失敗した`);
}

await rm(OUT_DIR, { force: true, recursive: true });

assertBuilt(
	"host",
	await Bun.build({
		entrypoints: ["src/index.ts"],
		outdir: OUT_DIR,
		target: "node",
		format: "esm",
	}),
);

assertBuilt(
	"client",
	await Bun.build({
		entrypoints: ["src/client.ts"],
		outdir: OUT_DIR,
		target: "browser",
		format: "cjs",
	}),
);

const clientPath = `${OUT_DIR}/client.js`;
const bundle = await readFile(clientPath, "utf8");
await writeFile(clientPath, LOADER_HEAD + bundle + LOADER_TAIL);

console.log(`built ${OUT_DIR}/index.js and ${clientPath} for ${MODULE_ID}`);
