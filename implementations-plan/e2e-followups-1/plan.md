---
plan: e2e-followups-1
tier: light
status: approved
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 210d02f1f
trunk: dev
issues: "#1313 (arc 1); #1222 (arc 2); #1300 (arc 3)"
budget: three Explore recon agents (sonnet); one Codex audit (gpt-6.1-sol, high) with its resumes; one Opus Plan leg; a fresh final Codex pass
post_implementation_hardening: not scheduled
---

# e2e-followups-1: three e2e follow-ups, test files only

Three arcs, stacked against `dev`, in the lane's order. Arc 1 makes the profile chaos `pre-update` start run from every reviewed release (#1313). Arcs 2 and 3 are triages: each reproduces its flake at retry 0 with instrumentation, then fixes at the cause or records the evidence on the issue (#1222, #1300; D9 says which closes). Only test files, fixtures and e2e docs change; nothing under `src/` or `packages/`, and no workflow. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: none ([OWNER-ASKS.md](OWNER-ASKS.md)); asks A1 and A2 below are the orchestrator's. Size: over the light target, because two arcs are triages with pre-registered decisions.

## The findings and what held

- **#1313: demonstrated on both browsers, and larger than filed.** (a) From v1.1.0 the start check reds as the issue shows (recon, baselines). (b) **New, demonstrated:** from v1.0.0 the start passes, then the first open of `P1` waits 30 s for a network-reset takeover that never shows (`O5 the update's first open could not be answered`). `releasedTestnet` parses plaintext network rows only. v1.0.0 and v1.1.0 seal them, so it reads the chain as moved, but both seed `dev`'s Testnet. The issue's "Runs from v0.31.0 and v1.0.0 still work" does not hold for v1.0.0. Consequence: no seeded chaos run can start from any sealing release (test-only).
- **#1222: holds as observed; cause unknown.** e2e-infra-3 measured no miss under two-CPU contention (D4 inconclusive). The issue's two "Possible fix" options (a longer bound, skipping the cancel half) break the panel rule. No CI failure in the last 200 Firefox smoke PR runs; smoke's two retries would absorb one, so the first-attempt logs are unsearched.
- **#1300: holds; not a direct cascade.** "With the seed" does not apply: no seed feeds this shard. Seven tests passed between the two failures, one on its own browser. The failing attempt's log has a `Script terminated by timeout` in a zod parse under the offscreen page's `proveTx`, 18 s after B's row was created. B reached `proving` with no `[same-token] re-ask` line, which every green run prints. That path means B's built fee fit the cap it was given (`transfer-executor.ts:372-373`), so the second failure is a fee or basis question, not a stall. One green run shows a slow-script kill too, in an ABI decode.

## Outcome & Quality Bar

- **For whom:** whoever runs a chaos campaign before a promote, and every contributor whose PR meets a red Firefox lane.
- **Excellent:** (1) a seeded chaos run starts from v0.31.0, v1.0.0 and v1.1.0 on both browsers. It treats each release's passkey row and Testnet as that release left them, with no per-release branch in the run. (2) Each triage ends on evidence: a cause named and fixed where it lives, or numbers that let the next reader reopen the issue on a precise condition.
- **Good enough:** no new e2e scenario; no CI lane changes; a product fault found in a triage is reported, not fixed.

## Assumptions

**Facts** (at the base):
- F1. `RELEASE_TRAITS` gives v0.31.0 and v1.0.0 `passkey: "retired"`, v1.1.0 `"unlocks"`; `releaseTraits(tag)` throws on an unreviewed tag (`fixtures/update/release.ts:39-50`).
- F2. On Chrome a credential lives on its page's virtual authenticator. On Firefox it lives on the session's, and `cleanup()` removes it (`firefox.ts:734-752`). `populateRelease` cleans up and closes its page (`pre-update.ts:94-98`). `startRun` adds a new authenticator on a new anchor (`start.ts:21-42`).
- F3. Parking the populating tab on `about:blank` across the update, then loading the popup into it, unlocks a v1.1.0 passkey profile on both browsers. With the tab closed and a fresh one opened instead, the press times out on Chrome (#1314 body; `update-replay.test.ts:700-722`).
- F4. A live passkey profile in the model has `credential: K<n>` and `phrase: W<n>`. Minted slots are `next.credential - 1` (`model.ts:506-530`, `:593-620`). `checkCredential` reds a live passkey profile whose credential was never bound (`checkers.ts:216-219`). Binding comes from the authenticator's create answer (`answeredBy`, `:270-282`).
- F5. `checkPreUpdate` → `startBound` checks `listed.retired === !!p.retired`. `checkLockScreens` requires an unlock and no Set up again on a non-retired selected profile (`checkers.ts:145-162`, `:984-1018`).
- F6. `s.afterUpdate` is one slot. `bindPreUpdate` sets it for every non-retired release profile (`pre-update.ts:142`). `answerUpdatedTerms` decides from the release's entries alone, so a second call after an accepted sheet waits for a sheet that never shows (`legal-drivers.ts:196-206`).
- F7. `network.getNetworks` exists at v0.31.0, v1.0.0 and v1.1.0 (`services/network/spec.ts`). `readNetworkRows` calls it (`helpers/identity-rows.ts:89`).
- F8. The pre-update start runs in no CI lane (no workflow sets `NULO_E2E_UPDATE_FROM`).
- F9. At v1.1.0 the lock screen's New profile path changes route in the same document and runs the create in the page, through `navigator.credentials.create` looked up at call time (`SelectProfilePopup.vue:79-82`, `useProfileCreateFlow.ts:62-65`, `passkey-ceremony.ts:86`; Opus read). So `capturePrf` on the populating page sees the create answer.
- F10. A queued send reaches `proving` without an ask only when its built fee does not exceed its figure (`transfer-executor.ts:364-373`). The figure's basis is the newest UI row of the same shape (`queued-fee-cap.ts:66-88`).

**Inferences:**
- I1. On Firefox, the PXE host (a frame of the background page) shares the popup's process and main thread (FIREFOX.md:36, :61), so a long synchronous parse there can stall a popup reopen. Arc 3 measures it.
- I2. One build seeded both release profiles, so `P1`'s Testnet row stands for `P2`'s.
- I3. The update's first-open surfaces (the takeover, the Terms sheet, the arrival) stay up until answered. So a `verifyAll` that opens a release profile first leaves them, and the profile's first step-level open answers them. Arc 1's first-open control tests it; if it reds in `verifyOne`, the pending answer runs there right after the open, a local fix.
- I4. `loadPopup` has no fallback for a lost first handshake (`wallet-pages.ts:179-192`); the replay's passkey case takes the same path green on both browsers. A start that reds there is triaged, never retried.

**Asks** (for the orchestrator; working assumption in brackets):
- A1. #1222 with no miss in a third measurement: close it as a known flake like #1300, or keep it open? [Keep it open with the numbers: e2e-infra-3 left it open, and the lane brief gives #1300 alone that disposition.]
- A2. On no reproduction, arc 3 ships two failure messages so the next CI miss explains itself: `waitForHash`'s timeout names the hash it last read (through `withTimeoutMessage`, `fixtures/dom.ts:83`), and the Urgent case's throw names the cap B was submitted with. This is test-only, but it opens a PR for a diagnostic, not a fix. [Ship it (D8).]

## Architecture & Implementation

### Arc 1 (#1313), `E` = `apps/extension/tests/e2e`

1. `E/helpers/profile-chaos/model.ts`: ``StartState = "empty" | `pre-update-${ReleaseTraits["passkey"]}` `` (type-only import). `startWorld("pre-update-retired")` is today's world. `startWorld("pre-update-unlocks")` gives `P2` `credential: "K1"`, `phrase: "W2"`, no `retired`, and `next: { profile: 3, credential: 2, file: 1, secret: 2, phrase: 3, name: 2 }`, so K1 takes a slot. Rewrite the start's doc comment.
2. `E/helpers/profile-chaos/spec.ts`: compute the start at load from `releaseTraits(NULO_E2E_UPDATE_FROM).passkey`, so an unreviewed tag fails the file before a browser starts. Pass the trait to `populateRelease`, `released.held` to `startRun` and `p.start` to `bindPreUpdate`. Keep the "start state" assertion as it is.
3. `E/helpers/profile-chaos/pre-update.ts`:
   - `Released` gains three fields. `testnet` holds the release's Testnet chain, read through `readNetworkRows` while `P1` is open on Home; a release with no Testnet row throws. `answers` holds the passkey's answers on the page. `held` is `{ page, auth }`, set only when the trait is `unlocks`.
   - For `unlocks`, `populateRelease` takes the capture with `takeAll`, parks the page on `about:blank` and returns `held`. It cleans up only on a throw or for `retired`.
   - `releasedTestnet` is deleted. The takeover check compares `released.testnet` with `CHAIN_IDS.TESTNET`.
   - `bindPreUpdate(s, released, start)` binds each live release passkey profile's credential through `bindCeremonies(s.bindings, { answers, picks: [] }, minted(ref))`; a refusal is a start violation (O2). It then runs `checkProfiles(world, await readProfiles(s.anchor), s.bindings)`, so the row is checked against the bound credential before any step can delete `P2` (D3).
   - The first-open answers: one entry per non-retired release profile in `s.afterUpdate`, a `Map<ProfileRef, …>` (D5). Each entry answers the takeover and the arrival from the release. The first open answers the Terms from `released.entries`, as today; once a sheet has been accepted, or none was due, every later entry asserts that no sheet shows. Where no takeover is due, it then asserts no overlay with `shownOverlays` (`fixtures/update/verify.ts:14`), as `opensWithoutTakeover` does.
4. `E/helpers/profile-chaos/state.ts`, `run.ts` `answerAfterUpdate`: take the entry of the step's open profile and delete it.
5. `E/helpers/profile-chaos/start.ts` `startRun(ctx, caps, dir, network, held?)`: with `held`, the collector watches `held.page` first, then the page is loaded with `loadPopup` and `waitForServiceReady` and becomes the anchor, and `auth` is `held.auth`. Without it, nothing changes.
6. Exports only: `loadPopup` (`E/fixtures/wallet-pages.ts`), `takeAll` (`prf-capture.ts`).
7. `apps/extension/scripts/e2e/profile-chaos-model.test.ts`: rename the start to `pre-update-retired`, and run the loops over starts (replay determinism `:180`, the slot counter `:284`, the citation sources `:667`) over all three, so `K1`'s slot is checked on every seed. Then add three tests:
   - the `unlocks` world, and seeds whose plans open `P2` by `unlockPasskey` with `K1`;
   - `checkPreUpdate` and `checkProfiles` on that world: `P2` listed as retired is O2, `K1` bound to another id is O2, the matching reading is clean;
   - its lock screen: Set up again on `P2` is O1, an unlock with no Set up again is clean.
8. `E/README.md` § Start states: the passkey row follows its release's trait, the parked tab, the Testnet read, the per-profile first open.

Trade-offs: a separate `passkey` argument threaded through `plan`, `planFromList`, `runPlan` and `bindPreUpdate` was rejected (D1). A Firefox-only reuse of the release's authenticator was rejected: `browser-seam.test.ts` bans the branch, and parking is harmless there (D2). A `testnet` trait per tag duplicates what the release answers itself (D4).

### Arc 2 (#1222): triage, then a driver change only on its evidence

Two stages of scratch probes, never committed (the e2e-testing skill, § Evidence channels); any part that ships lives on `BrowserDriver`.
- **Stage 1, page-side only:** a copy of the case, `E/_probe-picker.test.ts`. In the window's realm it records the click's time and activation, `document.hasFocus()` and `visibilityState` at the click, and the `cancel`'s time. It makes no privileged call during the case, since `chromeScript` switches windows (`webdriver-classic.ts:124-132`).
- **Stage 2, only after a stage-1 miss or a click-to-`cancel` over 1 s:** a privileged wrapper of the `@mozilla.org/filepicker;1` factory. It is armed before the case opens its windows, delegates every member to the native class, and keeps `init`, `open` and `done` (time and result) and `Services.focus.activeWindow` at `init` and `open` in a privileged buffer. Privileged calls happen only to arm it and to read it after the poll. First, 10 instrumented and 10 plain runs check that it changes nothing.

Decision, fixed before any run (D6). Only a miss past the 10 s bound counts; an outlier only starts stage 2. "On time" is within 1 s of the step before it; "late" is past 1 s.
- (a) `open` on time, `done` late: the native headless picker is the cause. On `BrowserDriver`'s Firefox launch, the session dismisses pickers. This is e2e-infra-3's change-map item 6: its own const beside `permissionRequestPrefs`, out of `FIREFOX_LAUNCH_PREFS`, pinned by `scripts/e2e/firefox-driver.test.ts`, with FIREFOX.md's row and the spec's comment. The dismissal's `done` is the Remote Agent's own, synchronous, so it removes that gap by construction; the batch below confirms it.
- (b1) No `init`: the content refused the picker (activation or focus, read from stage 1). (b2) `init` with no `open`: the parent stopped it. Find where, within test scope; a product path means stop and report.
- (c) `done` on time, `cancel` late: the page's thread was held (I1's class). No change; (d)'s disposition, with the numbers linked to #1300.
- (d) No miss: no change. Comment the numbers on #1222 and leave it open, as e2e-infra-3 did (Ask A1).

### Arc 3 (#1300): triage, a test fix only at a test cause

The two failures have different mechanisms (F10). A scratch probe, uncommitted, is a copy of the spec that opens no page and moves no focus.
- **(a), the reopen:** each `reopen` keeps a route trajectory from load to Home or timeout. Every 250 ms it reads `location.hash`, `data-service-ready`, the overlay testids (`shownOverlays`), `visibilityState` and `hasFocus()`, and keeps it on a timeout. A stall sampler (100 ms) runs in each reopened popup, which `loadPopup` brings to the front, and is re-armed on every new page. It counts a gap only while the page is visible, since FIREFOX.md:61 clamps hidden timers. A missing sampler is incomplete evidence, never "no gap".
- **(b), the Urgent case:** it keeps the cap B was submitted with: the review sheet's `send-review-fee-cap` text at the confirm press (a MutationObserver and a capture-phase press listener, armed in the page before the review), since Send replaces the queued cap on every answer until submit (`send.vue:430-434`, `:505`). It compares that text with `queuedFeeCap` of the seeded basis and of each newer same-shape row, formatted as the page formats it. A cap that changed within 250 ms of the press, or that matches two bases, leaves (b) unresolved. It also keeps the UI rows of the same shape with their `createdAt` (`readSealedRows(page, "txs")`), B's row on every poll, and B's built `estimatedFee` once B has a hash (it keeps polling past the spec's throw).
- **Attribution:** a gap is attributed only by a stack, from a slow-script kill or a Firefox profile of the run (`MOZ_PROFILER_STARTUP=1`, `MOZ_PROFILER_SHUTDOWN=<run dir>/profile.json` in the launch's environment). The profile runs only on a red, or on a gap over 5 s with no stack.

Decision (D7). A trace decides, never a correlation:
- (a) H1: the reopen's window overlaps a gap that a stack attributes to the wallet's own code. That is a product cause: finish the 10 runs, comment the numbers on #1300, change nothing under `src/`, and report it. A gap with no stack, or one outside the wallet, leaves H1 unresolved.
- (a) H3: the popup sat on another route or under an overlay. Name the route and what put it there: a state an earlier test left is fixed in the test, and a product state is reported.
- (b) H2a: the queued cap is the seeded basis's, and B's built fee fell within it. The premise raced the fee. Name a test-only control from the trace and agree it with the panel, for example the local L1's base fee pinned across the case, as `holdMining` holds blocks. Never a margin or a bound. A control that needs a product seam stops and is reported.
- (b) H2b: the queued cap came from a newer row of the same shape. The premise leaked from an earlier test of the file-scoped account. The case must make its seed the basis, and assert the queued cap it reads before the release.
- No red in 10 runs: comment the numbers, add a ledger row `(open)` with its sanctioned response, ship A2's two failure messages, and close #1300 as not planned, a known flake, as the lane brief directs (D9). Reopen on a second first-attempt failure of either fingerprint, whose new message then names its cause.

## Security & Adversarial Considerations

Test code only. The parked tab keeps a virtual authenticator's credential alive inside the automation browser, as the replay already does. No real key or secret is involved. Release zips stay digest-pinned (`releaseProblem`). The probes run privileged code only in the automation session, are never committed, and add no `PROBE` string to `dist/`. The adversarial risk is a check that passes vacuously. So the start's binding uses the authenticator's answer, not the row under test (D3). Each new never-happens check pairs with a success control, and arc 1 reruns the base's two reds as its red copy. No dependency, permission, storage shape or workflow changes.

UI impact: none on every arc (test files, fixtures and e2e docs only).

## Phase 1: the pre-update start from every release (#1313)

1. Make change-map items 1-7. Commit per item group (model and tests; populate, bind and first opens; start and spec).
2. Make item 8. Commit.

**Validation gate** (commands from the repo root unless they `cd`; `<b>` is `chrome` or `firefox`, and Firefox runs add `NULO_E2E_BROWSER=firefox`):
- **Fast gates:** `bun run lint`, `bun run typecheck:all`, `bun run test:all`, and `cd apps/extension && bun --bun vitest run scripts/e2e/profile-chaos-model.test.ts`, each exit 0.
- **Candidates:** at the committed head, with `git status --porcelain -- apps/extension` empty, `bash apps/extension/scripts/e2e/build-update-candidate.sh <b>`.
- **Seed runs:** `cd apps/extension && NULO_E2E_UPDATE_FROM=<tag> NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/<b> NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=<first> NULO_E2E_CHAOS_RUNS=<n> bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0`. Per browser, run:
  - the red copy: seed 3001 from v1.0.0 and from v1.1.0, the base's two reds;
  - seeds 8101-8105 from v1.0.0 and from v1.1.0;
  - seed 8101 from v0.31.0;
  - the first-open control: `NULO_E2E_CHAOS_ACTIONS='[{"action":"verifyAll","params":{}},{"action":"unlockPassword","params":{"target":"P1","variant":"right"}},{"action":"verifyAll","params":{}}]'` from v0.31.0, whose Testnet has moved, so `verifyAll` opens `P1` first with the takeover up (I3).
- **Empty-start control:** rebuild the armed smoke build (the e2e-testing skill, § Build-armed tests: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<b>` in `apps/extension`), then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=8101 NULO_E2E_CHAOS_RUNS=1 env -u EXTENSION_PATH bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0`.
- **Pass:** each test exits green. The two red copies now pass their start and first open. At least one `unlocks` seed per browser unlocks `P2`, read from its record. A red seed is triaged from its record (README § Chaos runs). A fault in this arc's files is fixed, and the batch reruns. A product finding is filed after a dedupe, named in the PR and not fixed; that seed counts as red-filed, and the gate still passes. Log each seed's outcome and wall-clock in lessons/phase-1.md.

## Phase 2: the picker triage (#1222)

1. Write stage 1. Run it 20 times on the host's natural load, then 10 times with its process tree under `taskset -c` on four CPUs: `cd apps/extension && NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/_probe-picker.test.ts --retry=0` on the armed smoke build. Grep the job logs of the last 100 Firefox smoke PR runs for `the picker's input clicked and cancelled` (`gh api repos/nulo-sh/nulo/actions/jobs/<id>/logs`).
2. Run stage 2 only on stage 1's trigger: its 10-and-10 control first, then the same batches until a miss or 30 more runs.
3. Apply D6's branch. Delete the probes.

**Validation gate:** every run's outcome, wall-clock and click-to-`cancel` time is in lessons/phase-2.md. Branch (a) keeps e2e-infra-3's bar: the base missed past the bound under the reproducing condition, and the fix then needs 20 runs under it with no miss and every click-to-`cancel` under 1 s, then `bun run test:ci-gating`, `cd apps/extension && bun --bun vitest run scripts/e2e/firefox-driver.test.ts`, the toolbar-panel file and the full Firefox smoke suite once at `--retry=0`, all green. The other branches need the comment posted and `git status --porcelain` empty.

## Phase 3: the heavy-shard triage (#1300)

1. Write the probe. Check it on one run: a planted 2 s busy loop in the popup shows as a gap, and a quiet run shows none over 1 s.
2. Run 10 fresh times from the repo root: `NULO_E2E_BROWSER=firefox NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 VITE_NULO_FEE_MULTIPLIER=10 NULO_E2E_OPENPOPUP_LOG=1 NODE_OPTIONS=--dns-result-order=ipv4first taskset -c <four free CPUs> bun run e2e:agent <the probe copy> tests/e2e/network/concurrent-sendtx-confirm.test.ts`. Four CPUs match the CI runner. Split the runs across tool calls under two hours each. Run the profile only on a red, or on a gap over 5 s that has no stack.
3. Apply D7's branch. Delete the probe.

**Validation gate:** all 10 runs are in lessons/phase-3.md, each with its outcome, wall-clock, per-test durations, reopen trajectories over 5 s, gaps over 1 s with their stacks, slow-script count and B's trajectory. A test fix (H2a, H2b, or H3's test branch) needs, at retry 0 and under the same pin, the real file 10 times green on Firefox and once on Chrome. A2's messages need one forced timeout of each, read in the output. Both then need `bun run lint`, `bun run typecheck:all` and `bun run test:all`. A product branch needs the comment posted and `git status --porcelain` empty.

## Delivery

One `gh stack` against `dev`; no labels at creation.
- **Arc 1** `worktree-e2e-followups-1`, Phase 1 and this plan: `test(e2e): the profile chaos pre-update start runs from every reviewed release` (78), `Closes #1313`.
- **Arc 2** `e2e-followups-1-picker`, only if branch (a) ships: `test(e2e): the firefox session dismisses file pickers` (53), `Closes #1222`.
- **Arc 3** `e2e-followups-1-heavy`, if a test fix or A2's messages ship. Its title names the fix, for example `test(e2e): the urgent re-ask case makes its seed the basis` (58) or `test(e2e): the reopen and re-ask failures name what they saw` (60). It says `Closes #1300` only with a fix; with A2 alone, the comment closes it.
- **Close-out** `e2e-followups-1-close-out`, docs only. It holds the ledger rows and records of a triage that shipped no change. An issue closed by comment is not closed again.

Each PR body states: the path, what held, the gates with counts and outcomes, each browser's suite wall-clock before and after (the e2e-testing skill, § Runtime budget; arc 1 adds no scenario, and the start runs in no CI lane), and `UI impact: none`. A triage that finds a product cause ends its arc with no PR and is reported first in the final report. No parallel lanes: arcs 2 and 3 run on a host whose load is their reproducing condition, and two e2e runs never share a worktree.

## Decision ledger

- **D1** The start names the release's passkey trait. Rejected: a second argument threaded through `plan`, `planFromList`, `runPlan` and `bindPreUpdate` (a `Plan` would stop naming its own start); an object start (every string compare and log line changes).
- **D2** The release's page and authenticator become the run's on both browsers.
- **D3** `K1` is bound from the release page's create answer, which `checkCredential` then checks against the row. Rejected: binding from the row (a self-comparison).
- **D4** The release's Testnet is read through its own `getNetworks` for every release. Rejected: a per-tag `testnet` trait; a plaintext parse with a sealed-only fallback (two paths).
- **D5** One first-open answer per release profile. The Terms are device-wide (F6): the first open answers them from the release's entries, which accepts a changed version or asserts no sheet over a current one, and every later open asserts no sheet (Opus, Codex r2). This is per-profile coverage, not a fix for a red. From v1.1.0, it checks at `P2`'s first open as well as `P1`'s: no takeover, no Terms sheet over a current acceptance, and no announce. With `P2` live, today's one slot would be set twice (`pre-update.ts:142`), and `P1`'s first open would go unchecked. Rejected: one slot fired at whichever profile opens first, which drops the other profile's checks; the first expectation read from the candidate's own record, which a wrongly written acceptance would satisfy (Codex final).
- **D6** #1222 ships a change only on a miss past its 10 s bound with a trace that names the native picker. Stage 1 makes no privileged call (Codex r1). Rejected: the session's dismissal now, which reopens e2e-infra-3 D4 with no new evidence; a longer bound; skipping the cancel half.
- **D7** #1300's arc never edits product code. H1 maps to (a) only: (b) cannot come from a stall (F10, Opus). An H1 result is reported, not worked around in the test. Rejected: a sampler in the hidden background page, whose timers Firefox clamps (Opus), and which dies with the case's own restart (Codex r2).
- **D8** Arcs 2 and 3 open a PR only when a change ships; A2's messages count (orchestrator's call).
- **D9** On no reproduction, #1300 closes as not planned with its evidence and a ledger row, as the lane brief directs. It gets no `known-limit` label, since nothing shows its conditions are unsupported (Codex r1). #1222 stays open (A1).

## Post-implementation

The plan plus `implementations-plan/README.md` § Post-implementation standard at `210d02f1f`. Plan-specific values:
- **Step 1:** absent (`code_review: off`).
- **Step 2:** per arc that ships code, at its boundary, over `git diff <arc base>...HEAD`. Use `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. One Opus `general-purpose` review runs beside round 1. Stop hard at three rounds. Then one fresh Codex pass for cross-arc issues, over `origin/dev...` the top arc, or over the landed squash's parent if arc 1 has merged.
- **Step 3:** `gh stack submit --auto`, `gh pr edit` each body, `gh pr checks <n> --watch`. Never merge.
- **Step 4:** the close-out layer. Merge `origin/dev` and read `index.md` and `lessons.md`. Write the Outcome, promote lessons after a dedupe (the file is at its budget), delete `STATUS.md`, `git mv` into `archive/` in its own commit.
- **Step 5:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-1/plan.md` succeeds, run `agent-worktree done e2e-followups-1 --merged`.

## Audit verdicts

| Round | Verdict | Taken | Rejected or kept |
|---|---|---|---|
| Codex r1 (`gpt-6.1-sol`, high, fresh) | `reject`, seven: H1 needs attribution; no reproduction is not a known limit; the picker probe moves focus and its outliers must not authorize a change; H2 misses the no-re-ask path; D5 undemonstrated and nested opens; the credential compared only after step 0; gates not copyable | all seven: stack-only attribution; #1300 closed only as the lane brief directs, #1222 open (A1, D9); the two-stage probe and the 10 s bound; B's trajectory; D5 as coverage with I3's control; `checkProfiles` at the start; copyable gates | D1, D2, D4 kept (Codex agreed) |
| Opus (Plan) | `conditional approve`, nine: (b) cannot come from a stall, and the trajectory is blind on the no-ask path; hidden-page throttling; the probe's focus; D6's two readings; branch (a)'s bar; the unchecked no-takeover branch; the start's credential check; the model loops; later Terms opens | all nine: F10, H1 → (a), H2a and H2b → (b), the queued cap and built fee; visible-only samples and a quiet control; in-wrapper focus; D6's numbers and split; e2e-infra-3's bar; `shownOverlays`; `checkProfiles` (with r1); three starts in the loops; D5's Terms per open. Its asks became A2 and the 100-run grep; I2 became F9 | the 10 s threshold read from a pref: the plan no longer uses one |
| Codex r2 (resumed) | `conditional approve`: r1's seven verified; new: the background sampler dies with test 9's restart (high); D5's Terms wording (low); the ask records (low) | all three: per-popup samplers re-armed per page, missing state incomplete; D5 restated; the intro and OWNER-ASKS synced | — |
| Codex final (fresh, `gpt-6.1-sol`, high) | `conditional approve`, three: the first Terms expectation read from the candidate's record passes vacuously (medium, shown in memory); the observed cap may precede the submitted one (medium); recon's chain id was the rollup version (low) | all three: the first open answers from `released.entries` (D5); the review sheet's cap at the confirm press, unresolved on a late change; recon corrected | — |
| Codex final, resumed | `approve`: the three fixes verified, no new finding | — | — |

## Seeds (not run; the orchestrator drives this lane)

`/goal Phases 1-3 of implementations-plan/e2e-followups-1/plan.md are ✓, each gate reported in the transcript; each shipping arc's Codex loop converged (a resumed pass with no new material finding, quoted); the stack's PRs exist with their Closes lines; each triage's issue carries its evidence; the close-out archived the plan.`

`/loop 15m Drive implementations-plan/e2e-followups-1 forward per its plan.md; never merge; stop after the PRs' checks report.`
