import { application } from "@yuu1111/knip-config/application";

export default {
	...application,
	// package.json の exports は生成物を指すため 公開面は source で示す
	entry: ["src/index.ts", "src/client.tsx", "quality.config.ts"],
	// quality-checkは実行時にnode_modules/.binから解決する
	ignoreDependencies: [
		"@yuu1111/code-style-check",
		"@yuu1111/comment-check",
		"@yuu1111/document-style-check",
		"@yuu1111/tsdoc-check",
	],
};
