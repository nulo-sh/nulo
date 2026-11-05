---
plan: prover-warm-1
tier: light
status: probe done (2026-11-05), D2 verdict close; Phase 2 not built; numbers in recon.md § Probe
issues: "#1623 (arc 1 says `Closes #1623` on ship; on close the orchestrator closes it as a known limit with the numbers; on hold it waits for the owner)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit round-trip plus one Opus Plan leg
base: origin/dev at 4291a8c98
trunk: dev
post_implementation_hardening: not scheduled
---

# prover-warm-1: measure a warm browser prover, and warm it only where the numbers pay

#1623 asks whether starting bb.js's prover before Confirm shortens the first browser proof. **Phase 1** measures it on Chrome and Firefox with scratch instruments that are never committed. D2 reads the numbers as **close**, **ship** or **hold**. On close no code ships: the numbers go into [recon.md](recon.md) § Probe and the report, and the orchestrator closes #1623 as a known limit. On ship, **Phase 2** (arc 1, one PR against `dev`, no stack per D-orch-1) builds the warm-up. On hold the numbers go to the owner ([OWNER-ASKS.md](OWNER-ASKS.md) OA-1) and nothing is built. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless they name a package.

## Outcome & Quality Bar

- **For whom:** a person whose first send after the browser starts proves in the browser (no Presto).
- **Excellent:** (1) that first proof is shorter by up to the init time, and nothing else changes for them: same screens and copy, no new or earlier prompt, no earlier CRS download, a fee estimate at most 0.5 s slower at the median (R4); (2) the ship-or-close call rests on paired numbers per browser that a reader can rerun.
- **Good enough:** the warm-up is best effort. A request abandoned after its estimate wastes its init, as a rejected first proof's init does today.

## Assumptions

**Facts** (recon.md has every line):
- F1. `PrestoProver` passes no bb options, so the prover's call is `Barretenberg.initSingleton({ logger: undefined })`; bb.js picks every default.
- F2. `initSingleton` keeps the first call's promise and options for the document's life; a failed init clears it.
- F3. Init is fetch, ungzip and compile on the PXE page's thread, a main worker plus `min(cores, 32) - 1` thread workers when the page is isolated (one thread otherwise), and the CRS (32 MiB G1 + 4 MiB Grumpkin) from IndexedDB `keyval-store`, else from the CDN. None of it depends on the circuit, so one transaction shape measures it.
- F4. Chrome's offscreen document is cross-origin isolated; Firefox's frame is not, so Firefox proves on one thread and its frame shares the background page's thread (pxe-limits-1).
- F5. The PXE page survives a worker restart (Chrome) or lives as long as the background (Firefox): a cold first proof happens about once per browser session.
- F6. Presto or browser is decided inside `createChonkProof`. A Presto probe can raise the browser's local-network prompt; `prestoReached` records that a probe the person asked for once reached Presto, not that Presto runs now (`usePrestoCheck.ts:7-8`); the last outcome lives in worker memory only (`execution-coordinator.ts:189`).
- F7. Privacy § 5.9: "Browser-based proving may download … when the required data is not already cached." It names no Confirm boundary: moving a download before Confirm is an owner decision, not a text change.
- F8. The Send review sheet opens only for a private-origin send the account pays for (`components/composite/send/publish-facts.ts:101-103`, `popup/pages/send.vue:487-490`); every proving request estimates its fee, or previews its authwits, where it is reviewed: `estimateOperationFee` and, for a `default_entrypoint` send, `previewOperationAuthwits` (execute window, `popup/windows/execute/index.vue:360-363`), `estimateTransferFee` (Send page), `estimateSendTransactionFee` (wallet-built sends), all in `wallet/services/execution/service.ts`. A stored request can hold a non-proving operation, so the two request-based methods need a kind check.
- F9. pxe-limits-1 saw Chrome's first WASM proof at 18.3 s against 6.6-10.4 s for the next three, CRS download included.

**Inferences:**
- I1. A warm-up saves the whole init only when init ends before Confirm. The probe approves at the first moment the window allows (no reading time), so its saving is the floor; the split's total is the ceiling.
- I2. This host (188 cores, shared with other leads) runs Chrome at bb.js's 32-thread cap and overstates a 4-16 core user's headroom. The constrained run (Phase 1 step 5) reads R4 on 4 cores; every run records load1.
- I3. A warm-up beside the fee estimate competes for the PXE page's thread (ungzip, compile, IndexedDB read), and on Firefox for the whole background page. R4 measures it.
- I4. The PXE page bundles one bb.js module instance (one locked copy), so the warm-up and the prover share the singleton. R3 checks it on every H proof.
- I5. A new PXE page starts with a fresh bb.js module but not a fresh browser, so the probe measures a document-cold proof. A cold browser start may cost more or less; the plan claims nothing about it.

**Asks** (working assumption in force):
- A1. Ship or close is the owner's call per the issue. D2 decides alone only where the issue's 2 s bar or the lane's 1 s floor settles it; the zone between goes to the owner (OA-1).
- A2. "Never when Presto will prove" cannot hold without a probe. The plan ships "never when the wallet knows Presto proves" (D3); OA-2 asks the owner.
- A3. A device's first proof (no CRS cached) stays cold, so no download moves before Confirm (D4); OA-3 asks whether to warm there too.

## Decisions

| id | decision | why | rejected |
|---|---|---|---|
| D1 | Probe before code, with scratch instruments under `~/.cache/nulo-backlog/prover-warm-1/patches/`, applied for the runs and removed after | pxe-limits-1's method; nothing measured ships | committing a tracer |
| D2 | Saving = paired `C − H` of the prover's own `proved.durationMs`, both arms approved at the same predicate; median per browser; the slower browser has the larger median C. **Close:** < 1.0 s on both. **Ship:** ≥ 2.0 s on the slower browser, with R3 (one initialization: one bb.js WASM fetch in each H page once its warm-up and proof have both settled, overlap allowed, and on Chrome as many workers in the H page as in the C page) and R4 (median `E_H − E_C` < 0.5 s on both browsers, and < 0.5 s in the constrained pair). **Hold:** anything else, to the owner. A decisive median within 0.5 s of its bar, or a spread across it, first adds two pairs on that browser | close is the lane's own rule and ship the issue's own bar; a person waiting 10-40 s notices 2 s; R4 keeps the review as fast | ship at ≥ 1 s on either (the Opus leg: "larger → plan arc 1"; the issue's own bar is 2 s and its call the owner's); round 1's R1-R2 |
| D3 | Warm unless the wallet knows Presto proves: `prestoReached`, a Presto last outcome, or the `required` build; never probe | a probe can raise the local-network prompt earlier, which a person sees; a wrong guess costs one init per PXE page, no download, nothing on screen | `prover.checkPrestoStatus()` at window open; reading the newest journal row's backend on every estimate (a sealed-journal scan per keystroke-debounced estimate for a residual D4 already narrows to devices that once proved in the browser) |
| D4 | Warm only when `keyval-store` holds `g1Data` ≥ 2^19 × 64 bytes, `g2Data`, and `grumpkinG1DataV2` ≥ 2^16 × 64 bytes, the predicates bb.js's loader applies. The check opens the database without a version and aborts in `onupgradeneeded`, so it never creates one; any error reads as not cached; it closes its connection | a warm-up then never downloads, so no request leaves before Confirm; the probe times the extra read | key presence alone (a short row still downloads); `indexedDB.databases()` first (a gap before the open); a download before Confirm (OA-3) |
| D5 | One exported options constant, pinned equal to what the real `PrestoProver` passes by T1 | a mismatch would pin the page to the wrong options | `{}` written inline without a pin |
| D6 | The warm call is a factory method on the PXE page, outside every PXE lock, fired and dropped by the worker; idempotent through bb.js's own memo, which a source test pins | a proof holds the chain write lock up to 30 min; no new state | a lock-holding or awaited call; a "failed once" flag (state for an init that keeps failing, a known limit) |
| D7 | Trigger: inside the admitted callbacks of the worker's four review-time methods (F8), after their validation, queued answer and cancellation checks, the warm-up starts, not awaited, for a proving operation | every proving request reaches one of them where it is reviewed; one worker-side site, no new RPC with one caller, no popup edit; a silent, refused or non-proving request never warms | method entry (warms work the estimate refuses); `execute()` plus the Send review sheet (misses most own sends) |
| D8 | No new e2e scenario; the canaries run prover-ON on both browsers, and one probe send per browser runs on the arc build | a timing cannot gate without a timeout; the canaries catch a broken proof | a permanent warm-up e2e |

## Phase 1: the probe

**Instruments** (scratch `src.patch` plus `_probe-prover-warm.test.ts`, never committed): (P1) the PXE page exposes `__pw.warm(exact, check)`: in the H arm D4's read, then `Barretenberg.initSingleton({ logger: undefined })`, the prover's exact options; or with a timestamping logger in a split page of its own; `__pw.cold()`, true while the page holds no singleton; `__pw.crsRead()`, one timed read of the three CRS rows. (P2) `chain-runtime.ts`'s `onPhase` records each phase with its data, so `proved` carries the prover's own `durationMs`. (P3) A drain over CDP (Chrome) or a sandbox in the frame (Firefox). (P4) PSS of the browser's process tree (baseline, peak and 5 s settled around the split's init), Chrome's worker targets, and the page's bb WASM fetches from `performance.getEntriesByType("resource")`. (P5) `crossOriginIsolated`, `SharedArrayBuffer`, `hardwareConcurrency`, `performance.timeOrigin`.

**Procedure:** one launch per run on the `dappConnectedExtensionWithFirstTwoAccountsCap` fixture, three runs per browser (D2 may add two), through `agent.sh` at retry 0, one at a time. Before each run, `ss -ltn` shows nothing on 59833 or 59834 (no Presto), and load1 is recorded. Each send is one 1-token `sendTx`, approved when the window first allows it; each records window open to approvable (`E`), Confirm to `proved`, and `proved.durationMs`. A new page is `closePxeHost` on Chrome or the frame's removal on Firefox, then the home page's reads; it must report `cold()` and a new `timeOrigin`.
1. S0, the first send (it deploys the account), then W, a second send in the same page. Not compared.
2. Split page: `crsRead()`, then a traced init with PSS and workers sampled; no send. bb.js's log gives fetch and ungzip, then compile; thread start and the CRS load come out as one segment.
3. C and H, each in a new page, in the order C-H on odd runs and H-C on even runs. H runs D4's read of the three rows, then `warm(true)`, the moment the window opens, so R4 sees the shipped sequence; C calls nothing.
4. Last, A: close the page, delete `keyval-store` from an extension page, send in a new page (CRS absent; recorded only).
5. One more run per browser with every browser process pinned to 4 cores (`taskset -a -p -c`, the probe's own process tree only), steps 1 and 3 only: R4's constrained pair.

**Validation gate:** every send records `proved` after `fallback` (the browser proved), P4 and P5 are present, and the split is non-empty; `git status --porcelain` after removal shows only `implementations-plan/prover-warm-1/`. Medians and spreads go into recon.md § Probe and lessons/phase-1.md with each patch's sha256; D2's verdict goes into STATUS.md. A run that fails for a host reason is rerun once and said so.

**Result (2026-11-05):** gate met; deviations in [recon.md](recon.md) § Probe: the fetch count moved to a counter in the fetch shim, because Resource Timing lists no extension-scheme fetch on Chrome; Chrome's A arm came from runs 5-6 after a probe bug; one Firefox launch was relaunched from setup. Over five pairs per browser, the median `C − H` was 970 ms on Chrome and −899 ms on Firefox, and the median `E_H − E_C` was 596 and 739 ms. D2 says **close**. The whole init measured on its own, 1.16-1.62 s, is under the issue's 2 s bar on both browsers, and R4 fails on both.

## Phase 2 (arc 1, only on D2's ship verdict): the warm-up

**File map:**
- `packages/aztec-runtime/src/pxe/browser-prover-warm.ts` (new): `BROWSER_PROVER_BB_OPTIONS` and `crsCached(idb = indexedDB)`, D4's check.
- `packages/aztec-runtime/src/pxe/browser-prover-warm.sources.test.ts` (new): pins bb.js's loader sizes (2^19, 2^16) and length predicates, and `initSingleton`'s first-call memo, so a bump that moves either reds.
- `packages/aztec-runtime/src/pxe/chain-runtime.ts`: `PxeFactory.warmBrowserProver?(): Promise<void>`; `ProductionPxeFactory` returns when `proverless`, `required` or not cached, else awaits `Barretenberg.initSingleton(BROWSER_PROVER_BB_OPTIONS)`.
- `packages/aztec-runtime/src/pxe/{spec,descriptors,service,client}.ts`: `warmBrowserProver`, `{ rpc: true, ipxe: false, requiresNetwork: false }`. The service starts the factory call, logs a failure at `debug` under `{ error }`, and answers at once.
- `src/wallet/services/execution/service.ts`: a private `warmBrowserProver()` holding D3's gate, called without await inside the admitted callbacks of `estimateTransferFee` and `estimateSendTransactionFee`, and of `estimateOperationFee` and `previewOperationAuthwits` once the stored operation's kind is in `BROADCASTING_OPERATION_KINDS`; it drops the PXE client's promise.

**Tests** (each with its success control): T1 the real `PrestoProver` with `setForceLocal(true)`, `vi.spyOn(Barretenberg, "initSingleton")` recording its argument and rejecting with a sentinel: the prover's call `toEqual(BROWSER_PROVER_BB_OPTIONS)`, and so does the factory's; T2 the factory warms nothing in `proverless`, `required` or uncached, and warms when cached; T3 `crsCached` is false and creates nothing with no database, false with a short or missing row or an open error, true with all three, and closes its connection; T4 each of the four methods warms once when admitted and ungated (a `default_entrypoint` preview included), never on invalid input, a locked wallet, a queued answer, a refused admission, `prestoReached`, a Presto last outcome or a non-proving stored operation, and its result and errors are unchanged when the warm-up rejects; `descriptors.test.ts` takes the new method.

**Validation gate:** `bun run lint`, `bun run typecheck:all`, the touched files' unit tests (`bun run test` and `bun run --cwd packages/aztec-runtime test`), `bun run check:plans`, each green at retry 0; both canaries prover-ON on Chrome and Firefox, one run each (from the worktree root, `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts`, then with `NULO_E2E_BROWSER=firefox`); one fresh-page send per browser on the arc build with P2 alone (the product trigger warms it): its `proved.durationMs` falls in Phase 1's H range and its `E` in Phase 1's `E_H` range, or the arc stops.

## UI impact

None. No screen, copy, row or format changes; no popup file changes. A change a person notices (an earlier prompt, a slower estimate) is out by D3 and R4.

## Security & Adversarial Considerations

- **Trust boundary:** a connected dApp warms only through an admitted estimate or preview of its proving request in an open window; bb.js's memo makes every warm-up after the first in a page a no-op.
- **Privacy:** D4 moves no CRS download before Confirm; D3 sends no probe to the loopback, so no prompt moves either. A failure logs at `debug` under `{ error }`.
- **Integrity:** the warm-up changes no proving input; a wrong option set (the one way it could) is D5's pin. A failed warm-up leaves the prover to init at Confirm, as today.
- **Resources:** an abandoned request holds the singleton (the CRS's 36 MiB plus WASM memory; P4 measures it) until the page ends, as any first proof does today. An init that fails after its backend starts leaks that backend each retry (bb.js does not destroy it); a known limit if arc 1 ships.
- **Supply chain:** no new dependency; bb.js stays exact-pinned on the Aztec line.

## Delivery

One PR from `prover-warm-1-a1` (cut from `origin/dev`, the plan commits cherry-picked) against `dev`: `perf(prover): warm the browser prover when a proving request is reviewed` (≤ 92 chars), body with the probe's medians per browser, the gates' outcomes and `Closes #1623`. No label at creation. The close-out lands as its final commits. No PR on a close or hold verdict.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 4291a8c98, with:
- **Review loop:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, once over arc 1's diff after Phase 2 is green; hard stop at three rounds, then report.
- **Delivery:** `gh pr create --base dev`; `gh pr checks <n> --watch` to the end.
- **Close-out:** the PR's final commits; merge `origin/dev` in first and read `index.md` and `lessons.md`.
- **Teardown:** after the merge, `agent-worktree done prover-warm-1 --merged`.
- **Approval boundaries:** a finding that adds state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval; a screen or prompt change is an owner ask.

## Audit verdicts

**Round 1** (2026-11-05; consult log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): reject.** (1) D2 replaced the issue's and the lane's rules; (2) `C − H` with H waiting for its warm-up measured the removable cost, not the wait saved; (3) a fixed arm order and three pairs; (4) the traced logger broke exact options, and bb.js's log gives no CRS split; (5) D3 cannot keep "never when Presto will prove"; (6) key presence lets a short row download, and § 5.9 sets no Confirm boundary; (7) the `execute()` trigger ran before the silent and cancel routing; (8) `__pw.same()` compared the warm-up's instance with itself, and T1's fallback weakened its pin.
- **Opus 5.5 (Plan): conditional approve.** Same (1), (5), (6), (8); also the Send review sheet opens only for private sends the account pays (F8), so a fee-estimate trigger covers every proving request with one site; `vi.mock` does not reach bb.js inside bb-prover; bb.js's log merges thread start with the CRS; 188 cores hide contention; the memo is unpinned; `databases()` then open leaves a gap; a failed init leaks.
- **Accepted:** D2 rewritten to close / ship / hold with the issue's bar and the lane's floor (OA-1); both arms approve at one predicate (I1); C-H order alternates and A runs last; exact options in H, the split in its own page, the merged segment stated; D3 narrowed and asked (OA-2); D4 reads lengths and never creates the database; D7's estimate trigger; R3 by WASM fetch count and Chrome workers; T1 by `vi.spyOn` on the real prover, no fallback; the constrained run; the memo pin; the leak as a residual.
- **Rejected:** Opus's "ship at ≥ 1 s on either browser" (the issue's bar is 2 s and its call the owner's; the zone between is a hold); Opus's journal read for D3 (D3's row).

**Round 2** (Codex, resumed): **conditional approve**, conditions: (1) F8 missed `default_entrypoint` sends, which preview authwits instead of estimating; (2) a warm-up at method entry ran before validation, the queued answer and admission; (3) "no worker started during an H proof" fails a legitimate overlap now that H approves before its warm-up ends; (4) H skipped D4's read, so R4 did not see the shipped sequence; (5) I5 claimed a cold browser start costs what a cold page does. All accepted: `previewOperationAuthwits` joins D7, every call sits inside the admitted callback (T4's negative controls), R3 counts one WASM fetch and C's worker count after both settle, H runs D4's read first, I5 says document-cold. Verified by Codex: D4's version-less open with an aborted upgrade, the visible-page origin of every estimate, D2's three verdicts, and that no owner ask blocks auto-continue.

**Round 3** (Codex, resumed): **approve**. One low wording finding: I5 ordered the savings of a cold page and a cold browser without a measurement; I5 now claims nothing about a cold browser. No regression found.

## Seeds (not run; orchestrator-owned)

```
/goal implementations-plan/prover-warm-1/plan.md: Phase 1's gate pasted with D2's verdict; on ship, Phase 2 ✓ with its gate pasted, the Codex loop converged and quoted, and its PR open against dev; on close or hold, the numbers in recon.md § Probe and no PR.
```

```
/loop 15m Drive implementations-plan/prover-warm-1 from plan.md: the probe runs first, one e2e run at a time; build arc 1 only on D2's ship verdict; stop at three red rounds.
```
