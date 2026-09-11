window.__ModuleLoader__.load({
	id: "dsh-ui-font",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/** 本文とUIのフォント JetBrains Monoは日本語グリフを持たないためBIZ UDPGothicとNoto Sans JPへ落とす */
		const FONT_SANS = "\"JetBrains Mono\", \"BIZ UDPGothic\", \"Noto Sans JP\", \"Yu Gothic UI\", Meiryo, sans-serif";
		/** コードブロックと等幅表示のフォント */
		const FONT_MONO = "\"JetBrains Mono\", \"SF Mono\", \"Fira Code\", Consolas, \"Liberation Mono\", monospace";
		/** この上書き層の識別子 同じsourceで再度呼ぶと層が置き換わる */
		const SOURCE = "dsh-ui-font";
		/** 上書きするトークン フォントは配色に依存しないためlightとdarkへ同じ値を渡す */
		const TOKENS = {
			"--dsw-font-family": { light: FONT_SANS, dark: FONT_SANS },
			"--dsw-font-mono": { light: FONT_MONO, dark: FONT_MONO },
			"--ds-font-family-code": { light: FONT_MONO, dark: FONT_MONO }
		};
		/** テーマサービスを待つ これでpresenterが解決済みのトークンとしてbodyへ適用する */
		const inject = ["theme"];

		/**
		 * トークン上書きを持たないテーマ版向けの退避経路
		 * インラインstyleより強く効かせるためimportantを付ける
		 * @param ctx - client cordis context
		 */
		function installStyleTag(ctx) {
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = SOURCE;
				tag.dataset.pluginCss = `${SOURCE}/font-family.css`;
				tag.textContent = `:root,body{`
					+ `--dsw-font-family:${FONT_SANS} !important;`
					+ `--dsw-font-mono:${FONT_MONO} !important;`
					+ `--ds-font-family-code:${FONT_MONO} !important;`
					+ `}`;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "dsh-ui-font: font-family stylesheet");
		}

		/**
		 * テーマサービスのトークン層としてフォントを上書きする
		 * @param ctx - client cordis context
		 */
		function apply(ctx) {
			const theme = ctx.theme;
			if (typeof theme?.overrideTokens === "function") {
				ctx.effect(() => theme.overrideTokens(SOURCE, TOKENS), "dsh-ui-font: font-family tokens");
				return;
			}
			installStyleTag(ctx);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
