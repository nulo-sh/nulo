# Phase 2: the reset in a browser, before and after

The runs used an uncommitted overlay of `tests/e2e/security-reset.test.ts`: a third test that turns on Developer and Debug Mode, refuses the testnet RPC, reloads, opens Settings → FPCs (which calls `getFpcs` on mount), waits for the witness, then resets. Witness: a stored `Discovering missing protocol FPCs` line after the reload, a later `pxe` `Request received … registerContract`, and a later `pxe` `foundation:retry` line, so discovery's registration was in its retry loop at submit. "Purge" is submit to profile row and tombstone gone, polled every 100 ms. Before = `19399c82`'s `fpc/service.ts` and `network/service.ts` built in; after = the arc head. Armed smoke builds, `--retry=0`, load1 under 150 throughout.

| Run | Chrome before (ms) | Chrome after (ms) | Firefox before (ms) | Firefox after (ms) |
|---|---|---|---|---|
| 1 | 4,136 | 3,018 | 8,262 | 2,548 |
| 2 | 8,930 | 2,986 | 8,611 | 2,591 |
| 3 | 8,958 | 3,027 | 8,099 | 1,942 |
| 4 | 8,576 | 2,987 | 8,205 | 2,470 |
| 5 | 4,223 | 2,689 | 8,708 | 2,771 |

- **What it shows.** Every run had discovery's registration retrying at submit. Before, the purge waited on the FPC lock for the rest of the retry chain (two Chrome runs submitted late in it, hence about 4 s). After, it ends within one backoff sleep of the in-flight registration (≤ 3 s, I1): `clearChainState` raises the stop, and a sleeping attempt wakes and fails.
- **The lock line is not in the trail.** No `fpc` `Lock: acquired (waited …)` line was stored in any run, before included, so its absence proves nothing here: the purge removes the profile's Developer Mode before the trail's next flush. The purge times are the evidence.
- **Outcome criterion 3 restated.** The plan expected the seeded case's 0.5-2.3 s; with a registration in flight the floor is its backoff sleep, so the after runs read 1.9-3.0 s. The gate's bound (under 5 s) holds.
- **Committed file** (`bun run test:e2e -- tests/e2e/security-reset.test.ts --retry=0`, two tests): Chrome 25.9 s before, 25.6 s after; Firefox 36.9 s before, 34.7 s after; green on both sides.
- **Harness gotchas.** `NULO_E2E_BROWSER=` (empty) is refused by the smoke global setup; unset it for Chrome. Home's gas leg did not reach `getFpcs` again after the reload in this flow, so the overlay drives discovery from Settings → FPCs; `location.hash` there is redirected back to Home, `navigateToSettings(page, "fpcs")` is not. The trail is a rolling window: filter it by message (`readSwLogTrail(page, { match })`), never take its tail.

Overlay patch (applied with `git apply`, removed with `git checkout --`): the third test reads as follows, plus `navigateToSettings`, `setDebugMode`, `setDeveloperMode` from `./fixtures/helpers` and `readSwLogTrail` from `./fixtures/journal`.

```ts

// UNCOMMITTED MEASUREMENT OVERLAY (fpc-discovery-1): the refused-node reset with discovery retrying.
test("overlay: reset while discovery retries against the refused node", async ({ registeredExtensionPerTest: ctx }) => {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page)
	await setDeveloperMode(page, true)
	await setDebugMode(page, true)
	const node = await interceptRpc(ctx.browser, ctx.extensionId, TESTNET_RPC_ORIGIN, { kind: "refuse" })
	try {
		await reloadExtensionPage(page)
		await waitForHash(page, "#/popup/general")
		// The FPC list reads getFpcs on mount, so its discovery starts against the refused node.
		const sinceMs = Date.now()
		await navigateToSettings(page, "fpcs")
		type Line = { source?: string; data?: unknown[]; timestamp?: number }
		const text = (l: Line) => `${l.source ?? ""} ${JSON.stringify(l.data ?? [])}`
		const witnessDeadline = Date.now() + 40_000
		let witness = ""
		while (Date.now() < witnessDeadline) {
			const discovering = ((await readSwLogTrail(page, { match: "Discovering missing protocol FPCs", limit: 5 })) as Line[]).find(
				(l) => (l.timestamp ?? 0) >= sinceMs,
			)
			const after = (l: Line | undefined, t: number | undefined) => l !== undefined && (l.timestamp ?? 0) >= (t ?? 0)
			const registering = ((await readSwLogTrail(page, { match: "Request received.*registerContract", limit: 5 })) as Line[]).find((l) =>
				after(l, discovering?.timestamp),
			)
			const retries = (await readSwLogTrail(page, { match: "foundation:retry", limit: 100 })) as Line[]
			const retry = retries.find((l) => l.source === "pxe" && after(l, registering?.timestamp))
			if (discovering && registering && retry) {
				witness = `discover@${discovering.timestamp} register@${registering.timestamp} pxeRetry@${retry.timestamp}`
				break
			}
			await new Promise((r) => setTimeout(r, 250))
		}
		if (!witness) {
			for (const m of ["Discover", "registerContract"]) {
				const d = (await readSwLogTrail(page, { match: m, limit: 30 })) as Line[]
				for (const l of d) console.log(`[overlay-dump ${m}] ${l.timestamp} ${text(l).slice(0, 160)}`)
			}
		}
		expect(witness, "discovery was retrying against the refused node before the reset").not.toBe("")
		const hitsAtSubmit = await node.hits()
		await resetProfile(page)
		const submitted = Date.now()
		let purgedAt = 0
		while (Date.now() - submitted < 30_000) {
			const gone = await page.evaluate(async (id: string) => {
				const keys = Object.keys(await chrome.storage.local.get(null))
				return !keys.includes(`nulo:core:profiles@${id}`) && !keys.includes(`nulo:core:profile-tombstones@${id}`)
			}, scope.profileId)
			if (gone) {
				purgedAt = Date.now()
				break
			}
			await new Promise((r) => setTimeout(r, 100))
		}
		const trail = (await readSwLogTrail(page, { match: "Lock: acquired", limit: 200 })) as Line[]
		const fpcWaits = trail.filter((l) => l.source === "fpc").map((l) => text(l).match(/waited (\d+)ms/)?.[1])
		console.log(
			`[overlay] witness=${witness} | purge=${purgedAt ? purgedAt - submitted : "timeout"}ms | fpcLockWaits=${JSON.stringify(fpcWaits)} | hits ${hitsAtSubmit}->${await node.hits()}`,
		)
		expect(purgedAt).toBeGreaterThan(0)
		await page.waitForFunction(() => window.location.hash.includes("/popup/register"), { timeout: 10_000 })
	} finally {
		await node.stop()
	}
}, 120_000)
```
