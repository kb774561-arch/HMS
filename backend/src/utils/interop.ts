/**
 * Packages such as helmet and express-rate-limit ship separate ESM and CommonJS
 * builds/typings. Depending on how a toolchain resolves them (local tsc vs the
 * Vercel build), a default import yields either the function itself or the
 * CommonJS `module.exports` object that holds it under `.default`. Unwrap both.
 */
export function cjsDefault<T>(mod: T): T extends { default: infer D } ? D : T {
  const m = mod as { default?: unknown } | null;
  return (m !== null && typeof m === "object" && "default" in m ? m.default : mod) as T extends { default: infer D } ? D : T;
}
