/**
 * Turns zod's JIT off in this realm. Zod compiles an object schema's fast path with `new Function`,
 * which the extension's `script-src` refuses, and it probes for that once, when the first object
 * schema is built: the refused probe is reported as a CSP violation even though zod catches it.
 * Parsing is unchanged, since the refused probe already sent zod down this path.
 *
 * Every entry imports this first, and it imports nothing: a bundle chunk evaluates whole, so a
 * module that imported zod (to call `z.config`) could run only after a chunk that already built a
 * schema. Zod keeps the config `z.config` writes on this global, shared by every copy of zod.
 */
const shared = globalThis as { __zod_globalConfig?: { jitless?: boolean } }
shared.__zod_globalConfig ??= {}
shared.__zod_globalConfig.jitless = true
export {}
