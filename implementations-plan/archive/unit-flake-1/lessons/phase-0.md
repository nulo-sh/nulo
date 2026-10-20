# Phase 0: reproduce #895, name the cause, sweep

Base: `origin/dev` at 4aa9d1ab. Host: 188 cores, load1 140-220 throughout. Scratch files lived under `~/.cache/nulo-backlog/unit-flake-1/`, never in the repo; the two setup files the sweep used are inlined below.

## The CI failure

Run 39332994479 attempt 1, job 118336467825 (`Unit tests / Vitest`, inside `bun run test:all`): `StaleNetworkConfirm.test.ts:169:38`, `expected [ [] ] to have a length of 2 but got 1`. The file ran in 126 ms for 6 tests there; here it runs in 194-391 ms. No Vue warning or unhandled error in the job log.

## What the issue asked to log, and what it showed

An instrumented copy of the file (outside the repo, same config, `focus-trap` aliased so its mock applies) logged at the reopened click: one `stale-confirm-submit` node, `disabled` absent, the latch `submitted` false. So neither suspect held: no stale node, no latch left set. The click reached a live, enabled button whose handler did not run.

## The cause

`@vue/runtime-dom` 3.5.42 `createInvoker`: the first Vue listener an event reaches stamps `e._vts = Date.now()`; every later Vue listener on its path returns early when `e._vts <= invoker.attached`, its attach time (`getNow()`, the same clock, cached per tick). It stops a listener from answering the event that rendered it. `Popup.vue` binds `@mousedown.capture` and `@click.capture` on the sheet root, so for every click inside a sheet the sheet's capture listener is the first Vue listener reached, and the target's own listener comes second. The reopen renders the sheet root and RESET's `@click` in one flush, so both carry the same `attached`. A click in that millisecond stamps `_vts == attached`, and RESET's listener returns. jsdom's `click()` sends `detail: 0`, so `refuseCarriedClick` lets it through; the drop is Vue's.

- Probe copy, 200 runs at retry 0 under host load, click minus attach of RESET's listener at the reopened click: min 1 ms, p5 1 ms, median 3 ms, 94 of 200 at 2 ms or less; at the first click: min 3 ms, median 6 ms. A runner a few times faster reaches 0 ms.
- Deterministic repro: `vi.spyOn(Date, "now").mockReturnValue(t0)` from before the reopen to the click: red with #895's exact message, `emittedDelta: 0`, `latch: false`, one node. Advance the mock 1 ms before the click: green.
- Control: the same frozen clock with the sheet's `onClickCapture` listener removed before the click: green. The capture listener is what makes RESET's listener second.
- Before count: the unmodified file, 200 runs at retry 0, 6 in parallel under load1 140-220: 200 passed, 0 failed. Load widens the margin, so a load loop cannot show this flake; the frozen clock does.

## The sweep

Quantize the clock so a render and the events after it share one reading (setup file added after the repo's own):

```ts
const realNow = Date.now.bind(Date)
Date.now = () => Math.floor(realNow() / 1000) * 1000
```

Neutralise Vue's guard, for triage only:

```ts
Object.defineProperty(Event.prototype, "_vts", { get: () => 0, set: () => {}, configurable: true })
```

- Extension suite (868 files, `--maxWorkers=12`) on the quantized clock: 34 tests red in 21 files. Rerun on both setups: 10 stay red, all Date arithmetic, the quantized clock's own false positives: `scripts/e2e/firefox-driver` (1), `account-state/service` (1), `operation-journal/reaper` (1), `operation-journal/service` (1), `profile/service.integration` (2), `profile/session-manager` (3), `token/service` (1). 24 tests in 14 files turn green, so their red is Vue's guard: `StaleNetworkConfirm` (2), `Popup` (1), `Popup.tooltip` (1), `LogsToolbar` (1), `FeeMethodSelector` (1), `ProfileNameField` (1), `OnboardingProfileNameField` (1), `ImportSecretForm` (2), `ImportFullBackupForm` (1), `onboarding/pages/create` (1), `popup/pages/import` (6), `profile/new` (1), `change-password` (4), `export/seed` (1).
- `packages/design` (532 tests) on both setups: all green. No other workspace mounts Vue.
- A probe patching `EventTarget.prototype.dispatchEvent` and `HTMLElement.prototype.click` logged every unstamped event whose path holds two or more Vue listeners, with the smallest gap to a non-first listener's attach time and the test-file call site. Whole suite: 102 events in 19 files. The 14 above, plus `auth.test.ts`, `NewProfileCredentials.test.ts` and `full-passkey.pins.test.ts` (all through the shared helpers), and two clicks a component sends itself (`RowTarget`'s `activate()` calls `el.click()`; `RowTarget.test.ts:80`, `TransactionIncomingCard.test.ts:138`), whose assertions do not depend on the second listener. Gaps in that run: 2-203 ms on this host; the CI-failing file's six events showed 3-15 ms.
- Call sites: most go through `tests/helpers/credential-pins.ts` (`expectMaskToggle`'s clicks, `typeNow`, `enterOn`) and `tests/helpers/press-key.ts` (`pressOn`). The rest are local raw `click()` or `dispatchEvent` calls in 9 files.
- The latch pattern the lane brief named (a latch reset in a watch on `show`): only `StaleNetworkConfirm.vue`. Fourteen `src/popup/components/popups/*Popup.vue` watch `show` for form resets; none of their tests is in the list, so none shares the cause.

## Rerunning the sweep

Each setup file runs after the repo's own, through a config that spreads the extension's (absolute paths in practice; the scratch directory sits outside the repo):

```ts
import base from "<repo>/apps/extension/vitest.config.ts"
export default { ...base, root: "<repo>/apps/extension", test: { ...base.test, setupFiles: ["<repo>/apps/extension/tests/vitest.setup.ts", "<scratch>/coarse-clock.ts"] } }
```

Run it from `apps/extension` with `bun --bun vitest run --config <scratch>/<name>.config.mts --maxWorkers=12`. A scratch file importing a workspace package does not resolve under the isolated linker; the setup files import only `node:fs`. The path probe (`DELTA_LOG=<file>`), guarded so `@vitest-environment node` files, which hold no DOM, run untouched. The phase-0 run lacked that guard, so its 40 node-environment files failed to load; they dispatch no DOM events, so the inventory stands:

```ts
// Diagnosis only: for each raw event, the smallest gap (ms) between now and the attach time of any
// Vue listener on its path other than the first one reached, i.e. the margin Vue's guard leaves.
import { appendFileSync } from "node:fs"
const LOG = process.env.DELTA_LOG as string
const veiOf = (el: object) => {
	const s = Object.getOwnPropertySymbols(el).find((k) => k.description === "_vei")
	return s ? (el as Record<symbol, Record<string, { attached: number } | undefined>>)[s] : undefined
}
function probe(target: EventTarget, type: string, bubbles: boolean, stamped: boolean) {
	if (stamped || !(target instanceof Node)) return
	const now = Date.now()
	const path: object[] = []
	for (let n: Node | null = target; n; n = n.parentNode ?? (n as unknown as ShadowRoot).host ?? null) path.push(n)
	const key = `on${type[0].toUpperCase()}${type.slice(1)}`
	const order: { attached: number }[] = []
	for (let i = path.length - 1; i >= 0; i--) {
		const inv = veiOf(path[i])?.[`${key}Capture`]
		if (inv) order.push(inv)
	}
	const own = veiOf(path[0])?.[key]
	if (own) order.push(own)
	if (bubbles) for (let i = 1; i < path.length; i++) {
		const inv = veiOf(path[i])?.[key]
		if (inv) order.push(inv)
	}
	if (order.length < 2) return
	const min = Math.min(...order.slice(1).map((inv) => now - inv.attached))
	const st = (globalThis as unknown as { expect: { getState(): { testPath?: string; currentTestName?: string } } }).expect.getState()
	const site = (new Error().stack ?? "").split("\n").filter((f) => /\.test\.ts|tests\/helpers/.test(f)).map((f) => f.replace(/^.*\/apps\/extension\//, "").replace(/\)$/, "")).slice(0, 2).join(" <- ")
	appendFileSync(LOG, `${st.testPath?.split("/apps/extension/")[1]}\t${st.currentTestName}\t${type}\t${min}\t${site}\n`)
}
// `@vitest-environment node` files have no DOM: install nothing there.
if (typeof Node !== "undefined" && typeof HTMLElement !== "undefined") {
	const dispatch = EventTarget.prototype.dispatchEvent
	EventTarget.prototype.dispatchEvent = function (event: Event) {
		probe(this, event.type, event.bubbles, Boolean((event as unknown as { _vts?: number })._vts))
		return dispatch.call(this, event)
	}
	const click = HTMLElement.prototype.click
	HTMLElement.prototype.click = function () {
		if (!this.matches(":disabled")) probe(this, "click", true, false)
		return click.call(this)
	}
}
```

It skips events that already carry a stamp, so after the fix "no test-sent entry" is partly true by construction; the quantized-clock sweep is the independent check.

## Prototype (reverted)

`tests/helpers/send-event.ts` (`sendEvent`, through test-utils' `trigger`) with `credential-pins.ts` and `press-key.ts` routed through it: the 18 consumer files 323/323 green on the real clock, and on the quantized clock only the 7 local raw sites stayed red. Patch kept in scratch; the arc rewrites it.

## Consults

- **Round 1, Codex** (gpt-6.1-sol, high, session 01a1568b, account alejo-icloud via `best`): conditional approve, 5 findings, all accepted. #1 `trigger` is no drop-in constructor: an init naming an inherited property (`bubbles`, `detail`) rejects and sends nothing (verified here: unhandled `TypeError: Attempted to assign to readonly property`); shadow-root sends lose `composed`. #2 "undefined means disabled" is too strong (shadow roots, a disabled fieldset): contract narrowed, `sendEvent` throws when nothing was sent to a control without its own `disabled`. #3 keep the first captured event (already `??=`). #4 say "no product failure demonstrated" and "real-clock rates unknown". #5 inline the probe and its config; the decisive proof is the frozen-clock negative control, the 200-run loop only a smoke check.
- **Round 2, Codex** (resume): conditional approve, 1 finding, accepted: the inlined probe threw in node-environment files instead of skipping them; it is now guarded.
- **Round 3, Codex** (resume): approve, no new findings.
- **Round 1, Opus Plan leg:** conditional approve, 7 findings, all accepted. #1 `pressOn` would report an unsent keydown as uncancelled, and eight presses on a disabled submit (`RevokeAuthwitsPopup.test.ts` :214, :233, :307, :333; `tests/helpers/send-popup-keyboard.ts` :159, :167, run by two files) will now send nothing. #2 never-happens sends must prove they were sent (`enterOn` for Enter sites; `toBeDefined()` on RESET's second click). #3 inline the probe. #4 `import.test.ts` :239 and :244 are CodeMirror's shadow-root search panel and stay raw; the exact lines are 203, 679, 689, 698, 704, 713, 724, 730. #5 document that `trigger` reshapes the event (`MouseEvent`, not composed). #6 the CLAUDE.md bullet must cover an ancestor's bubbling listener, not only Popup and Tooltip. #7 cite `runtime-dom.cjs.js:675` and `:716`.
