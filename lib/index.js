/**
 * Host half of dsh-ui-font
 *
 * The whole feature is browser-side (theme token overrides), so the host row
 * only exists to make the package an enabled Loader entry — client-modules
 * serves a package's `dsh.client` bundle exactly for enabled entries. The row
 * must stay inert: no services injected, no config, no state.
 */

/** Inert host plugin: the browser half owns every effect. */
export function apply() {}
