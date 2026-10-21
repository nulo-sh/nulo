---
plan: warm-stack-1
tier: light
status: approved 2026-10-21 (Asks A1-A5 answered, D6); arc 1 running (Phase 1 done: K go, J no-go)
issues: "#1006 (arc 1: Closes on the ship path; closed as a known limit with the numbers on the no-ship path)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit round-trip (gpt-6.1-sol high) plus one Opus Plan leg
base: origin/dev at 8663cdd15
trunk: dev
post_implementation_hardening: not scheduled
---

# warm-stack-1: the network files' onboarding cost, measured before anything is built

One arc, one PR against `dev`. The owner (chat, 2026-10-21): "Plan warm-stack, give it a try!" and "Maybe just injecting some stuff into the chrome.storage.local?" Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

**What the numbers already say** (recon § Measured split): the UI registration is 5.9 % of network file time on Chrome and 4.8 % on Firefox; #991's 21-27 % also counts the dApp connect and the files' own imports. A stored profile cannot skip the key derivation: an unlock runs about the PBKDF2 work a creation does (recon § Key derivation). It skips the register page, about 0.15 s (Chrome) and 0.5 s (Firefox) per call. A second lever needs no stored state: `launchOnLocalNetwork` and `setupConnectedPlayground` close the registration popup and at once open another (`extension.ts:475-477, 608-611`), 0.9 s / 1.95 s per call. So the arc probes three arms, then builds only what passes.

**Invariant:** every file's starting state stays independent of the file before it; every account is a fresh seed's; the files that test onboarding, import, restore, reset, update or passkeys keep their own drivers.

## Outcome & Quality Bar

- **For whom:** the owner, who decides from numbers; every contributor waiting on the network lanes.
- **Excellent:** (1) each shipped change names the cost it removes, with its per-call saving per browser from the probe, confirmed on CI by a fixture line; (2) no assertion, timeout or starting state a file relies on changes; (3) what is not built is on #1006 and in the e2e-testing skill with its numbers.
- **Good enough:** browser launch, the per-file mint and the dApp connect stay.

## Assumptions

**Facts** (recon.md has the trails)
- F1 `registerProfile` creates a random profile through the UI and closes its popup (`extension.ts:356-390`); 150 of 155 calls are followed within 1 s by another `openPopup` and a wait for Home.
- F2 Each `encrypt`/`decrypt` derives a 600 000-iteration PBKDF2 key; `getPasshash` is one SHA-256. A creation seals three slots and the imported-keys DEK, an unlock opens them: four derivations each, plus one BIP-39 derivation each (`encryption-key.ts:44-45, 76-80`, `password-secret-box.ts:92-135`, `profile/service.ts:630-648, 680-696`).
- F3 An account has nothing on-chain until its first transaction; the PXE registers it on first use (`nulo-account.ts:107`); the popup's bootstrap derives the default account after a session opens (`useProfileBootstrap.ts:176`); an unlock re-derives every stored account first (`account-integrity/coordinator.ts:192-221`).
- F4 The suite writes `chrome.storage.local` only after the worker's liveness, from a scratch page (`extension.ts:315-319`); the profile repository reads storage on every call (`profile/repository.ts:47-52`).
- F5 `openPopup` records every page's console errors and uncaught throws into the launch's arrays (`wallet-pages.ts:114-145`), and files assert them empty after fixture setup (`holdings.test.ts:102-103`, `send-amount-exact.test.ts:345`, `popup-escape-layered.test.ts:157-158`).
- F6 CI noise: the pool's summed file time varies by 113 s (Chrome) and 123 s (Firefox) across the six recorded runs; per shard 48-96 s. `parseJobLog` refuses a job with a failed file; `runCosts` reads only the five shard jobs (`e2e-timings.ts:33, 87`).

**Inferences**
- I1 K saves about 0.9 s / 1.95 s per call; over the pool's calls (about 140, counted in Phase 1) about 125 s / 270 s, and 25-60 s per shard. *Superseded by Phase 1:* 1.15 s / 2.0 s net over 94 / 95 calls, about 108 s / 190 s per pool run; the critical shard's 19 calls, about 22 s / 38 s.
- I2 J's increment over K is about the register page plus any creation-only work: likely under 0.5 s per call. #1003's 0.7 s / 1.1 s came from a copied profile directory, which also carried the browser's code cache.
- I3 With P F F P P F per browser (three runs per arm) the pool resolves about 185 s (Chrome) and 201 s (Firefox); a shard's saving is direction, not significance. CI confirms the mechanism; the outcome is arithmetic over it, reported pair by pair.

**Claims that did not hold:** the PXE does not register the account at unlock (F3); no storage is written before the worker boots (F4); two renderings of one seed never agree byte for byte (random salts, IVs, DEK, MAC).

**Asks (orchestrator; answered 2026-10-21, D6):**
- A1 Admit K, a lever the brief does not name: the same cost removed at its cause, with no stored state.
- A2 Read the brief's "saving on the critical shard" as rule (c) below, judged on both browsers. A real K saving on Chrome passes it about two times in three. Alternative c′: the pool's direction plus the mechanism line.
- A3 Read "no file slower" as e2e-clocks-1's approved rule (d); a literal reading is unmeasurable at three runs per arm.
- A4 Replace "byte for byte except ids and timestamps" with: decoded fields equal under an exact allowlist, and a healthy unlock (relevant only on a J go).
- A5 No committed seed pool in this arc: J renders its rows at run time or stops as a known limit.

## Architecture & Implementation (arc 1, branch `warm-stack-1-a1` off `origin/dev`, this plan's commit cherry-picked first)

### Phase 1: the probe and the go gate ✓ (K go on both browsers, J no-go: [lessons/phase-1.md](lessons/phase-1.md))
- Scratch, never committed: `apps/extension/tests/e2e/network/_probe-warm-stack.test.ts`. One reference launch onboards through the UI and saves its storage before the switch and after it. Then twelve cycles per arm in rotating blocks (U K J, K J U, J U K, …), each from `launchExtension()` through the switch on Local:
  - **U** (today): `registerProfile`, `openPopup`, Home, `switchToLocalNetwork`.
  - **K**: the registration steps on a popup the caller keeps, then the switch.
  - **J**: the rows a fork-side `createProfile` of the production `ProfileService` over `FakeBrowserApi` writes (the recipe of `profile/service.integration.test.ts`), written from the scratch page; `openPopup`, the auth page, the test password, unlock, Home with `balance-amount`, the switch.
- Per cycle, every arm: the onboarding segment (helper start to Home on the page that switches, rendering and injection included) and the switch, logged; the launch's `consoleErrors` and `pageErrors` empty; the header on the same default network before the switch; `nulo:ui:activeAccount` changed at the switch; after the switch, the storage keys equal the reference's as a sorted list (counts kept) once every generated id in a key (the profile's, each network's, each account address) is replaced by a placeholder named from its row's stable identity (the profile; a network's kind and chain id; an account's chain, type and index), after checking each entity key against its row and each pointer against the row it names.
- Once per run: the fork's cold `import()` and `createProfile` times. Statically over the pool's files: the calls K and J would change, and the files that still open a fresh popup over an onboarded wallet.
- **G1:** K goes on if U − K is positive on both browsers with disjoint interquartile ranges. J goes on only if J's saving over K, times its calls, is at least 2 % of a browser's pool file time with its range clear of zero, render included. Every verdict and number goes to `lessons/phase-1.md` and #1006.
- **Validation gate:** the probe green at retry 0 on both browsers through `agent.sh`, load1 logged, the file deleted. Layers: e2e-live-network.

### Phase 2: build what passed (skipped on a double no-go)
- **K** (`tests/e2e/fixtures/extension.ts`): `registerProfileOnPage(ctx): Promise<Page>` returns the registration popup at Home with `balance-amount`; `registerProfile` is that plus `page.close()`, unchanged for its other callers. `launchOnLocalNetwork(phase)` continues on the returned page and logs `[onboard] <ms>` (the CI mechanism line); `setupConnectedPlayground` calls it instead of repeating its steps. `dappConnectedExtension` keeps its reopen (its page comes from the file-scoped `registeredExtension`). A console error or throw K surfaces is a race on the users' path: fixed at its cause, or K dropped.
- **J, only on its go** (skipped by G1): `injectProfile(ctx): Promise<Page>` renders a fresh profile in the fork, writes its rows after liveness, opens the popup and unlocks, on proverless network runs only. Before building: trace the worker state that depends on a profile existing at boot. One network test onboards by each path and compares the dumps under an exact allowlist of random, id and time fields, and asserts no `recovery-mode-banner` after the unlock, with a success control (a corrupted DEK slot shows it): the drift a cheaper layer cannot see is a row the popup writes.
- `.claude/skills/e2e-testing/SKILL.md` § Runtime budget: the `[onboard]` line and each arm's verdict with its numbers.
- **Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` exit 0. Layers: lint, typecheck, unit.

### Phase 3: the touched fixtures on both browsers, retry 0
- `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/{send-amount-exact,holdings,imported-account-execution,popup-escape-layered,sim-methods,authwit-variants,multi-account-from}.test.ts`, then with `NULO_E2E_BROWSER=firefox`: sends, holdings and an import over `tokenReadyExtension`, popups over `localNetworkExtension`, dApp sessions with popup-target diffs and a kept-page `createAccount` over `setupConnectedPlayground`.
- **Validation gate:** all green on both browsers, every `[onboard]` line present. Layers: e2e-live-network.

### Phase 4: review loop, then CI measurement
- The Post-implementation loop to convergence first; merge `origin/dev`; freeze the head F. **P** = F plus one commit restoring the close and reopen (and the UI path for J), `[onboard]` kept. P and F are pushed as `warm-stack-1-measure-p` and `warm-stack-1-measure-f`, so other lanes see the measurement; never a PR, deleted after.
- Per browser, `gh workflow run pr-extension-network-e2e.yml --ref <branch>` (Firefox: `pr-extension-network-e2e-firefox.yml`), in the order P F F P P F, one dispatch at a time per lane; pairs fixed by order: (P1, F1), (F2, P2), (P3, F3). Records under `~/.cache/nulo-backlog/warm-stack-1/ci/<run>/`: `parseJobLog` over every shard, heavy and canary job, every `[onboard]` line, job envelopes. A run with a failed file is judged under (a), and its pair is dispatched again for timing; every result kept.
- **Ship rule, on both browsers:** (a) no unresolved F failure: a run is invalid only if no test ran; any F failure counts unless its trace shows a cause outside the changed fixtures, with its file rerun at P and F; (b) the `[onboard]` median per call at F below P's by at least half the probe's saving; (c) the critical shard (the largest recorded total in `shard-timings.json`, the same files in both arms) has a lower summed file time at F in the median of the three pairs, a direction whose cause the per-file `[onboard]` lines prove; (d) e2e-clocks-1's rule word for word: "No other file is slower in all three pairs by more than max(10 % of its P median, 10 s) without a traced unrelated cause", over every file in every job.
- **Validation gate:** the records and the verdict table in `lessons/phase-4.md`.

### Phase 5: ship or write up
- **Ship:** the PR per Delivery, `Closes #1006`. **No ship:** drop the code commits; the PR carries the close-out and the skill's verdict lines; #1006 gets the numbers and the `known-limit` label and closes as not planned. Reopening: a cheaper unlock, a launch that keeps the code cache, or a CI design that resolves a smaller saving.
- **Validation gate:** Phase 2's commands green on the final head; `bun run check:plans` after staging.

### Alternatives not taken
- **Build the seed pool first, then measure** (the brief's order): the probe can reject the machinery in minutes; I2 predicts it will.
- **A committed seed pool** (both legs): claims bound to the sandbox's lifetime (`aztecDataDir`, kept by a reused sandbox), exhaustion sizing for about 170 launches in a full local run, crash and reuse behaviour: a coordination protocol for a saving I2 puts under the CI resolution. A plan change, if ever.
- **A stored session:** the worker restores one only at boot, so it needs a restart, which costs more than the unlock.
- **Render J's rows during the browser launch:** shares the fork's event loop with the egress guard's canary budget (#1003's D3).
- **Keep the page in `registeredExtension`:** an open popup would leak into every file using it.

## Security & Adversarial Considerations
- Test harness only; nothing reaches a bundle; the release gate's marker list is untouched. No new dependency.
- J's rows are fresh test seeds sealed under the public test password.
- The risk is a weaker gate: a fixture that hides a broken onboarding or a degraded unlock. Every file still asserts Home and its balance; K registers through the UI; J asserts a healthy unlock with a success control; files that test onboarding keep the UI; the error arrays stay asserted.
- Never open or print `apps/extension/src/wallet/constants/network-endpoints.ts`.

## UI impact

None. Test harness only; no screen, copy or timing a person meets changes.

## Decision ledger
- **D1 Probe before building** (both legs).
- **D2 K as a third arm** (A1): Opus finds it in scope; Codex asks it be surfaced, not assumed.
- **D3 J only on its own go over K, rendered at run time;** no committed pool (A5, both legs).
- **D4 The ship rule keeps the brief's critical shard and both browsers** (Codex), operationalized as (c) and (d) (A2, A3), with the PR stating each browser's critical-shard wall-clock P against F (Opus).
- **D5 J on proverless network runs only;** the canary keeps the users' path; smoke unchanged (#1003: 3.5 %).
- **D6 The orchestrator's answers (2026-10-21).** A1: K admitted; a fixture that stops closing and reopening the registration popup is inside the owner's "launch + onboarding" scope and stores nothing. A2: rule (c) as written, on both browsers, direction, the per-file `[onboard]` lines the proof that it is the lever's; c′ (the pool's direction plus the mechanism line) considered and not taken. A3: (d) is e2e-clocks-1's rule word for word. A4: the allowlist plus a healthy unlock replaces byte equality. A5: no committed seed pool; J renders at run time through the production `ProfileService`, scratch only, and ships nothing unless it passes G1. CI dispatches: one lane's measurement at a time; before each, `gh run list --workflow <lane> --status in_progress --status queued` shows no other lane's `*-measure-*` or `e2e-clocks-1*` ref, and heavy-pool-1 runs its round first.
- **D7 `[onboard]` spans the registration through the switch.** On Firefox the kept popup's switch runs 0.5 s slower (work the reopen used to absorb), so a line ending at Home would overstate K. Rule (b)'s "probe's saving" is the net: 1.15 s (Chrome) and 2.0 s (Firefox) per call.

## Review verdicts
- **Round 1, Codex (gpt-6.1-sol high, session 01a15f16): `reject`.** Accepted: (1) F2 miscounted the PBKDF2 work (`getPasshash` is a SHA-256): corrected; (2) P F F P P F is three runs per arm, so G1 claimed a resolution it lacks: G1 is now a worth screen, I3 states the resolution; (3) the ship rule changed silently: the brief's critical shard and both browsers restored, the operationalizations listed as A2-A4; (4) K is an amendment: A1, with Phase 1's count of files that still open a fresh popup over an onboarded wallet; (5) a derived-only unlock reaches Home with a bad DEK: J asserts no recovery banner, with a success control; (6) the probe's capture point: reference dumps before and after the switch, the same start network and the address change asserted; (7) the renderer choice: run time or a known limit, no pool without approval. Rejected: twelve dispatches per browser, since twice the CI cost still leaves a shard's saving unresolved (I3).
- **Round 2, Codex resumed: `conditional approve`.** Accepted: fresh profiles carry random ids and addresses in their storage keys, so the probe compares keys after replacing them by placeholders, counts kept and cross-references checked first. Round 1's dispositions verified.
- **Round 3, Codex resumed: `conditional approve`.** Accepted: network ids are random too (`network/service.ts` `_freshStored8`), so the rule now normalizes every generated id by its row's stable identity instead of listing kinds.
- **Round 4, Codex resumed: `approve`.** The rule closes the class; no generated id left in the fresh-onboarding key paths.
- **The answers, Codex (gpt-6.1-sol high, session 01a15f25): `approve`.** D6 records A1-A5 and the dispatch order faithfully; no contradiction with G1, (a)-(d), Phases 1-5 or Delivery.
- **Round 1, Opus Plan leg: `conditional approve`.** Accepted: G1's arithmetic (as Codex 2); F2 (as Codex 1); the error arrays asserted on every probe cycle, and any error K surfaces fixed at its cause (F5); J's probe arm injects what `createProfile` writes, the dump only a reference; J(b) out of the arc; the Firefox counts taken statically; the deviations as Asks, and the critical-shard wall-clock in the PR; `setupConnectedPlayground` through `launchOnLocalNetwork`; `multi-account-from` in Phase 3; the heavy and canary jobs parsed for (d), and a failed run's pair dispatched again; the boot-state trace before a J build; the rotating probe order. Rejected: none.

## Delivery
- **Arc 1** = Phases 1-5, one PR against `dev` (D-orch-1: no stack), ready, opened after Phase 4. Ship title: `test(e2e): network fixtures keep the registration popup instead of reopening it` (78 characters; reworded if J ships). No-ship title: `docs(plans): close warm-stack-1; the onboarding levers measured`. Body: what changed and why, the probe and CI tables per browser, each browser's critical-shard wall-clock P against F, every run id, `Closes #1006` (ship) or `Refs #1006` (no ship). No label: `tests/e2e/fixtures/**` trips both network filters.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `8663cdd15`. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review loop**, at the start of Phase 4 over the arc diff from `origin/dev`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus `general-purpose` review beside round 1; hard stop at three rounds; each round in `lessons/phase-4.md` and under Review verdicts. On a double no-go it runs over the docs-only diff.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the `## Outcome` block (`Known limits:`, `Open items:`); lessons within 8 KiB; delete `STATUS.md`; `git mv implementations-plan/warm-stack-1 implementations-plan/archive/warm-stack-1` in its own commit, index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/warm-stack-1/plan.md` succeeds, run `agent-worktree done warm-stack-1 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft)

```
/goal Arc 1 of implementations-plan/warm-stack-1/plan.md done: Phase 1's probe tables and G1 verdicts in lessons/phase-1.md and on #1006; each later phase marked ✓ or skipped by G1, its gate reported in the transcript; the Codex loop (gpt-6.1-sol high) converged, quoted; the PR open against dev (gh pr view output).
```

```
/loop 15m Drive arc 1 of implementations-plan/warm-stack-1 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits, one e2e run at a time polled in a bounded loop. Probe before building; review loop before the CI measurement. Open the PR, watch checks, report and stop. Never merge.
```
