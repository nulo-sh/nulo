# Phase 0: planning log

## Probes (planner, 2026-10-10, base af4afcc)

- #249: under `bash`, GNU grep 3.11 with the guard's exact line: `<marked file> --retry=0` → no output (exit 2 swallowed); `--exclude <file>` consumed as grep's own option; `-t <name>` invalid option; the name filter `import-handshake` is not a path. The guard passes in all four.
- #249: `bun run vitest list --filesOnly --config vitest.e2e.network.config.ts <args>` (vitest 4.1.10): no args 117 files, `--shard=2/4` 117, `<file> --retry=0` 1, `import-handshake` 2, `--exclude transfers` 116, `--reporter=json --outputFile=…` 1 (no file written), `-t` 1, `nosuchfile` 0, unknown flag exit 1. About 0.7 s; stdout holds only relative paths, one per line; the vite config warning goes to stderr; nothing written to `.e2e-state`.
- #269: armed Chrome smoke build; an untracked diagnostic spec (deleted after) wrapped `IntersectionObserver` before a reload and ran twelve iterations of: Settings to the top, settle hidden, Tab walk of 20 to 53 presses, the `clickBelowBar` scroll, the 5 s opacity wait. Result: 4 of 12 timed out. Every failure followed a callback that delivered `[true, false]`; the bar class lacked the visible class while the hero's bottom sat 298 to 1108 px above the scrollport. Callbacks with one entry never left a wrong state. Firefox was not probed: the cause is in the page code and the fix does not depend on the browser.
- #272: `backup-import-stalled-network.test.ts` with its `describe.skipIf(isFirefox)` replaced locally by a plain `describe` (reverted after), `NULO_E2E_BROWSER=firefox NULO_E2E_RETRY=0 bun run e2e:agent …` on an unarmed (prover-ON) build: 2 of 2 tests passed, the main one in 113 s. Ports came from the host registry and were released.
- #274: armed Chrome smoke build, an untracked spec (deleted after): six times, Settings open, then in one page call `location.hash = "/popup/general"` and the helper's own `querySelector('[data-testid="tokens-menu-trigger"]')?.click()`, then its 2 s wait for `tokens-menu-import`. 6 of 6: the trigger was absent at the click and the item never showed.
- #275: puppeteer-core 25.8.0: `cdp/utils.js:94-105` returns `valueFromPrimitiveRemoteObject(details.exception)` for a non-error exception without `objectId`; `cdp/Page.js:711` emits it as `pageerror`. `bidi/Frame.js:227-242` always emits `new Error(entry.text ?? '')`.

## The #269 diagnostic, to rerun (Phase 1.5)

Save as `apps/extension/tests/e2e/_diag269.test.ts` (untracked; delete after), build the armed Chrome dist, run `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/_diag269.test.ts --retry=0` in `apps/extension`, and read the `[diag269]` lines. At `af4afcc` it reported `failures=4` of 12.

```ts
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { clickNavTab, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { tabAround } from "./helpers/pointer-probes"

const BAR_OPACITY = () => {
	let o = 1
	for (let el = document.querySelector('[data-testid="page-title-bar"]'); el; el = el.parentElement) o *= Number(getComputedStyle(el).opacity)
	return o
}

async function state(page: Page) {
	return page.evaluate(() => {
		const wrapper = document.querySelector('[data-testid="settings-page"]') as HTMLElement
		const hero = document.querySelector('[data-testid="page-hero"]') as HTMLElement
		const bar = document.querySelector('[data-testid="page-title-bar"]')?.parentElement as HTMLElement
		const io = (window as unknown as { __io: { n: number }[] }).__io
		return {
			heroBottomBelowTop: hero.getBoundingClientRect().bottom - wrapper.getBoundingClientRect().top,
			barClass: bar.className,
			lastCallbacks: io.slice(-4),
		}
	})
}

test("diag 269", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	await page.evaluateOnNewDocument(() => {
		const Orig = window.IntersectionObserver
		const w = window as unknown as { __io: unknown[] }
		w.__io = []
		window.IntersectionObserver = class extends Orig {
			constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
				super((entries, obs) => {
					w.__io.push({ n: entries.length, v: entries.map((e) => e.isIntersecting) })
					cb(entries, obs)
				}, opts)
			}
		}
	})
	await seedUsdQuoteAndReload(page)
	await page.bringToFront()
	await clickNavTab(page, "settings")
	await waitForHash(page, "#/popup/settings")
	await page.waitForSelector('[data-testid="settings-page"] [data-testid="page-hero-title"]', { visible: true, timeout: 10_000 })
	let failures = 0
	for (let i = 0; i < 12; i++) {
		await page.evaluate(() => {
			;(document.querySelector('[data-testid="settings-page"]') as HTMLElement).scrollTop = 0
		})
		await page.waitForFunction(`(${BAR_OPACITY})() === 0`, { timeout: 5_000, polling: 50 })
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
		await tabAround(page, 20 + i * 3)
		await page.evaluate(() => {
			const wrapper = document.querySelector('[data-testid="settings-page"]') as HTMLElement
			const bar = document.querySelector('[data-testid="page-title-bar"]') as HTMLElement
			const row = document.querySelector('[data-testid="setting-nav-networks"]') as HTMLElement
			wrapper.scrollTop += row.getBoundingClientRect().top - wrapper.getBoundingClientRect().top - bar.getBoundingClientRect().height + 8
		})
		const ok = await page
			.waitForFunction(`(${BAR_OPACITY})() === 1`, { timeout: 5_000, polling: 50 })
			.then(() => true)
			.catch(() => false)
		if (!ok) failures++
		console.log(`[diag269] ${JSON.stringify({ i, ok, ...(await state(page)) })}`)
	}
	console.log(`[diag269] failures=${failures}`)
	expect(failures).toBe(0)
}, 600_000)
```

## Consults

- Round 1, Codex (gpt-6.1-sol, high, read-only, default login), session 01a12833-7519-7ef0-83d8-054ff4fd3a18, on plan v1 and Outline B. Verdict: reject (guard selection/path mismatch, broadened suppression, unproved dropdown fix). Nine findings; the planner verified each against the tree (vitest `formatFilesAsString` prefixes `[project]` and is root-relative, `formatFilesAsJSON` gives absolute `moduleId`; `setTheme` reads the first trigger while `clickByTestId` clicks the last; a string primitive "Client disconnected" is recorded today and v1 would have dropped it; v1's item click via `clickByTestId` would have widened the 2 s item budget to 10 s). Dispositions in plan.md § Audit verdicts.
- Round 1, Opus Plan agent (opus), on plan v1 and Outline B, in parallel with Codex. Verdict: conditional approve (with conditions: its findings 1-5 fixed before implementation). Nine findings; checked against the tree (`extension-network-e2e-soak.yml` can dispatch prover-ON with `--shard`; `SKILL.md:99-101` states the old guard; the flake ledger has no row for #269; `clickByTestId`'s default is 10 s). Its probe left a stray file in the system temp directory; the planner removed it. Dispositions in plan.md § Audit verdicts.
- Decision after round 1 (planner, on both legs): plan v2. Where the legs differed, the planner took Codex's absolute-path listing over Opus's temp-file-free parsing (paths independent of `--root` and projects) and kept the pre-shard rule against Codex's sequencer-sharding CLI (D2).
- Round 2, Codex final fresh pass (gpt-6.1-sol, high, new session 01a12843-d06d-76c2-87b7-cd18dfdce700) on plan v2 with the ledger. Verdict: reject (watch-mode guard bypass; sanctioned rerun over a known product race). Six findings, all accepted (#3 in part). Planner probes: `vitest run --config … --watch no-such-file-anywhere` waited until `timeout` killed it (watch mode); `vitest list --filesOnly --watch=false … --watch|-w|--watch=true <file>` exits 1 with "Expected a single value for option -w, --watch", and without a caller `--watch` lists normally. **Invalid probe, corrected in round 3:** it ran under zsh, which passed the unquoted `$a` flags as one word. Plan v3 written.
- Round 3, the same Codex session resumed on plan v3. Verdict: reject (short watch alias still bypasses the guard). Three findings, all accepted. Planner re-probe as a bash script (vitest 4.1.10): `list --filesOnly --watch=false -w <file>` exits 0 and lists 1 file (cac's alias reconciliation lets `-w` overwrite the sentinel: the bypass is real); `--watch=false --watch <file>` exits 1; `--watch=false --watch=false <file>` exits 1 (the sentinel refused a caller's own non-watch flag); `run -w` and `run --watch` stay in watch mode until `timeout` (exit 124). `parseCLI` from `vitest/node` on Node 24, the caller's arguments read from `process.argv`: `-w`, `--watch`, `--watch=true` give `watch: true`; `--watch=false`, `--no-watch`, `-w=false` give `false`; no watch flag gives nothing; `--watch --watch=false` throws "Expected a single value for option \"-w, --watch\", received [true, false]"; `--no-such-flag` does not throw. Puppeteer 25.8.0 `Frame.waitForFunction` delegates to `mainRealm()` (`api/Frame.js:584-586`), so a main-world wrap of the DOM query methods sees the opener's attempts. Plan v4 written: `parseCLI` watch check (D12), an observed navigation barrier for #274, D3 aligned with D13.
- Round 4, the same Codex session resumed on plan v4. Verdict: reject (strict-boolean watch check still permits watch mode). One finding, accepted. Planner re-probe: `--watch.enabled=true` and `--watch.enabled=false` parse to `{enabled: "true"}` / `{enabled: "false"}`; `-w=true`, `--watch=0` and `--watch=no` parse to `true`; vitest's `run()` sets `options.run = !options.watch`, so every truthy value is watch mode. Plan v5: `Boolean(options.watch)` and a dotted-flag test case.
- Round 5, the same Codex session resumed on plan v5. Verdict: approve. The panel converged; the plan goes to the orchestrator.
- Account note: the planner's shell inherited `CODEX_ACCOUNT=best`, so `run-codex.sh` picked the roster account with the most headroom (the `alejo-icloud` home for session 01a12843-d06d-76c2-87b7-cd18dfdce700, which every resume kept) instead of the default login the common brief names. No consult failed on quota or auth; the deviation does not touch any verdict.
