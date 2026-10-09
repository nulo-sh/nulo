# Phase 6 — record before tightening

## The recorder and the bundler

1. **A bare side-effect import ships in every build.** The first cut put the recorder behind `import "@/e2e/csp-report-page"` (a module whose body was `if (E2E_CSP_REPORT) install…`). An unarmed Chrome build still carried `nulo:e2e:csp-violations`: rolldown keeps a bare import, and it kept the recorder module as a bare import too.
2. **A named import used only in a dead branch is not enough when several entries share the module.** `if (E2E_CSP_REPORT) recordCspViolationsInPage()` in each of the five entries, with `E2E_CSP_REPORT` imported from `src/e2e/config.ts`, still shipped the recorder. A probe module imported the same way by one entry was dropped; the same probe imported by two entries shipped. Rolldown splits a module shared by several entries into its own chunk before the minifier folds the cross-module constant, so the importer's call disappears but its `import "./csp-report-….js"` stays. (The migration fixture and the proof gate escape this because each has a single importer.)
3. **What works:** each entry tests `import.meta.env.VITE_NULO_E2E_CSP_REPORT === "1"` as a literal. Verified on Chrome: unarmed build, no `nulo:e2e:csp-violations` or `csp-report` anywhere in `dist/chrome`; armed build, the key present. `E2E_CSP_REPORT` was dropped from `config.ts`; the reason is stated in `csp-report.ts`'s header.
4. **An unused named import is dropped even when armed** (tried as a way to keep the install at the top of the import list): rolldown treated the module's top-level call as removable, and Biome flags the import anyway.

## Today's policy already records violations: zod's JIT probe

The first armed `registration.test.ts` run failed on six `script-src` / `eval` entries: two each in the background, the onboarding page and the offscreen document. Source: zod 4's `allowsEval`, which calls `new Function("")` once per realm when the first object schema is built (`zod/v4/core/util.js`, `schemas.js`). `script-src` refuses it, zod catches it and takes the non-JIT path, and the browser reports the violation anyway; zod's own comment says `jitless` exists for exactly this.

- First fix, a module calling `z.config({ jitless: true })` imported first by every entry: the onboarding and offscreen entries went clean, the background kept two. Its chunk depended on zod's chunk, and that chunk (which also builds schemas) evaluated before the call.
- Fix kept: `src/utils/zod-jitless.ts` imports nothing and sets `jitless` on `globalThis.__zod_globalConfig`, the object `z.config` writes and every copy of zod reads. With no dependencies its chunk evaluates first. `zod-jitless.test.ts` pins that `z.config()` reads the flag (it fails when the property name is changed). Registration then ran with zero entries. Parsing is unchanged: the refused probe already sent zod down the non-JIT path.
- Recorded as a deviation (D-23e).

## Probes: what the recorder hears

Method (scratch, never committed): copy the armed `dist/<browser>`, rewrite only `manifest.json`'s `extension_pages` to add `style-src 'self'; connect-src 'self'`, and run a probe spec through `launchExtension` with `EXTENSION_PATH` pointing at the copy. The spec fetches `https://csp-probe.example/…` in the background (through `evaluateInBackground`) right after launch and again in a successor after `stopBackground`, injects a `<style>` into the popup, the onboarding page and the setup page, and, on Chrome, fetches and injects a `<style>` inside the offscreen target over CDP.

| Context | Chrome | Firefox |
|---|---|---|
| Background at startup | recorded (`connect-src`) | recorded (`connect-src`) |
| Successor background after `stopBackground` | recorded (count 1 → 2) | recorded (count 1 → 2) |
| Popup | recorded (`style-src-elem`, `inline`) | recorded |
| Onboarding page | recorded | recorded |
| Setup page | recorded | recorded |
| Offscreen document (Firefox: background-page frame) | recorded (injected `style-src-elem` and `connect-src`, plus its own node traffic) | recorded through its own node traffic (`connect-src` to the testnet node); the injected step failed in the probe script (`content` is not defined in the background sandbox), not in the recorder |

Gaps, named in `tests/e2e/README.md` § CSP violations:

- **Parse-time violations.** An earlier probe with `style-src 'none'` recorded nothing for the 34 stylesheet links in the popup: every `link.sheet` was non-null, so Chrome loaded them. Chrome exempts an extension's own resources from its page CSP, and a parse-time violation would fire before the entry module installs the listener anyway. The built pages load nothing but their own scripts and stylesheets while parsing, so neither matters for this arc.
- **Dedicated workers** started by libraries (bb.js, the sqlite OPFS proxy) are not instrumented.
- **In-flight reports** from a document when `close` reads.

Observation outside the arc: on a smoke build the background and the offscreen document contact `https://lb.drpc.live` and the background `https://api.coingecko.com`, although the seed pair is armed empty. `connect-src https:` keeps both reachable; nothing here changes it.

## Close check: two fixes from the first full run

- **A disabled extension.** `migration.test.ts`'s retry button calls `runtime.reload()`; under `--load-extension` Chrome then disables the unpacked extension until the browser restarts, so the scratch page failed with `net::ERR_BLOCKED_BY_CLIENT` and the check failed two tests. The reload also discarded the record, so there is nothing to read: `readCspViolations` returns `EXTENSION_DISABLED` for that error alone and the check passes it. Firefox reloads the add-on in place and reads normally.
- **A second close.** The same tests' `afterEach` closes a launch the test already closed; the second read hit a closed connection. The record is now checked once per launch, and a second close is the plain teardown it was.

## Gate (2026-10-08, today's policy pinned, recorder armed)

- `lint`, `typecheck:all` (wrong: see `phase-7.md`), `test` (698 files), `test:ci-gating`, `lint:actions`: pass. `test:release`: 212 pass, 3 fail, all `zip-reproducible` with `Executable not found in $PATH: "zip"`; this host has no `zip`, and the arc does not touch `scripts/release`.
- Chrome smoke, 4 local shards, retry 0: 46 of 47 files pass with zero recorded violations. `passkey-retry.test.ts` failed once on `waitForToastGone(…, 1_000)` (a one-second toast window) and passed 8/8 alone.
- Firefox smoke, 4 local shards, retry 0: 46 of 47 files pass with zero recorded violations. `migration.test.ts`' throwing-migration case hit its 60 s timeout at 62 s; alone it takes 38 s armed and 38 s unarmed, so the check costs nothing measurable and the timeout was four concurrent Firefox shards on a host at load ~120. Later Firefox runs use 3 shards. (Wrong: phase 7 traced it to the close check racing the in-place reload; see `phase-7.md`.)
- Both built manifests' CSP equals the pinned string.
