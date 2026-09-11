window.__ModuleLoader__.load({
	id: "dsh-ui-font",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/client.ts
var exports_client = {};
__export(exports_client, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(exports_client);
var FONT_SANS = '"JetBrains Mono", "BIZ UDPGothic", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';
var FONT_MONO = '"JetBrains Mono", "SF Mono", "Fira Code", Consolas, "Liberation Mono", monospace';
var SOURCE = "dsh-ui-font";
var TOKENS = {
  "--dsw-font-family": { light: FONT_SANS, dark: FONT_SANS },
  "--dsw-font-mono": { light: FONT_MONO, dark: FONT_MONO },
  "--ds-font-family-code": { light: FONT_MONO, dark: FONT_MONO }
};
var inject = ["theme"];
function installStyleTag(ctx) {
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = SOURCE;
    tag.dataset.pluginCss = `${SOURCE}/font-family.css`;
    tag.textContent = ":root,body{" + `--dsw-font-family:${FONT_SANS} !important;` + `--dsw-font-mono:${FONT_MONO} !important;` + `--ds-font-family-code:${FONT_MONO} !important;` + "}";
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "dsh-ui-font: font-family stylesheet");
}
function apply(ctx) {
  const theme = ctx.theme;
  const overrideTokens = theme?.overrideTokens;
  if (theme === undefined || overrideTokens === undefined) {
    installStyleTag(ctx);
    return;
  }
  ctx.effect(() => overrideTokens.call(theme, SOURCE, TOKENS), "dsh-ui-font: font-family tokens");
}

		return module.exports;
	}
});
