/**
 * Turns zod's JIT off in this realm. Zod compiles an object schema's fast path with `new Function`,
 * which the extension's `script-src` refuses, and it probes for that once, when the first object
 * schema is built: the refused probe is reported as a CSP violation even though zod catches it.
 * Parsing is unchanged, since the refused probe already sent zod down this path.
 *
 * It must run before the first object schema is built. Every entry imports it first and it imports
 * nothing, so the bundler evaluates it ahead of zod in every entry; a module that imported zod to
 * call `z.config` could land after a chunk that had already built one. Zod 4 reads its config from
 * this global, the object `z.config` writes.
 */
const shared = globalThis as { __zod_globalConfig?: { jitless?: boolean } }
shared.__zod_globalConfig ??= {}
shared.__zod_globalConfig.jitless = true
export {}
