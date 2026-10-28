---
plan: chaos-4
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 2914b9699
trunk: dev
status: arc 1 merged (#1324); arc 2 implemented, its review loop next
issues: "#1157 (its Possible fix phase 2 and the scenario list's in-process items)"
post_implementation_hardening: not scheduled
---

## Goal

#1157's phase 2: a seeded sequence test that drives the real profile service graph in process under `apps/extension/tests/COMPOSITION-TESTS.md`, from `tests/e2e/helpers/profile-chaos/model.ts`'s catalog and `plan()`; a fixed seed set in the unit suite under a stated budget and an armed long mode. Then the issue's in-process scenarios. Test files, helpers and docs only. `E` is `apps/extension`, `PC` is `E/tests/e2e/helpers/profile-chaos`, `PS` is `E/src/wallet/services/profile`; recon in [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** a maintainer who changes `ProfileService` or `SessionManager`, and the reviewer of that PR. They meet the test as a red unit run.
- **Excellent:** (1) a red seed names its seed, step, action, symbolic params and oracle, prints the plan, and replays from the seed alone; (2) the fixed set holds its budget on every PR and drives every action of its surface; (3) every reader, every oracle clause and every scenario has a break fixture that proves it can fail.
- **Good enough:** what needs bb, an extension page or the network stays the e2e model's; no product change.

## Assumptions

**Facts** (verified; recon.md § Facts):
- F1. `PC/model.ts` imports only `E/tests/e2e/fixtures/chaos-seed.ts` and `PC/citations.ts`; `PC/checkers.ts` adds `./model`, `./citations` and one type-only `@/` import. `PC/collect.ts` runs in a page through Puppeteer.
- F2. The unit suite runs `src/**` and `scripts/**` tests, not `tests/e2e/**`; `E/scripts/e2e/profile-chaos-model.test.ts` imports the model and checkers and pins no per-seed plan.
- F3. `fakeBrowser` is a module singleton under every `FakeBrowserApi`; its `reset()` empties each area and removes every listener, `onAlarm`'s and `onChanged`'s included, and its alarms never fire on their own (`@webext-core/fake-browser` 2.0.1). `IService` has no stop hook.
- F4. The lock screen's pick is UI storage (`E/src/utils/lastActiveProfile.ts`). Before every passkey prompt the page calls `getPasskeyUnlockParams` (`E/src/popup/pages/auth.vue:124`, `.../export/seed.vue:122`, `.../security/unlock-method.vue:139`).
- F5. `materializeCredential` is the one call between a passkey answer and its use inside the service (`PS/service.ts:958`, `:2228`, `:1400`), and production's body is `PasskeyCredential.create(data)` (`E/src/wallet/services/passkey/service.ts:104`).
- F6. Strict mode lives in `nulo:config` through `ConfigStore` (`E/src/wallet/config/store.ts`), which captures `chrome.storage.local` at construction (`store.test.ts:11-20` points it at a test store). Toggling strict on runs `void this.clearBearer()` under the facade lock (`PS/session-manager.ts:777`).
- F7. PBKDF2 runs 600,000 iterations per derivation (`packages/wallet-crypto/src/encryption-key.ts:7`). CI's unit job (`_unit-tests.yml`) sets no `NULO_*` variable; the profile chaos e2e files skip unless `NULO_E2E_CHAOS=1`.
- F8. The open session's secret is `Fr.fromBuffer(master)` (`PS/session-manager.ts:317`, `:667`).

**Inferences:** I1. A 24-step seed costs 3-5 s (15-25 derivations), so about five seeds fit; 1.3 measures. I2. After `reset()` at a restart the dropped worker has no listener and no reachable continuation, so it cannot write. I3. The tree reads some of #1157's scenarios differently (recon.md § Scenario map): a reveal is gated by its answer, not by the session; a retired row given a live row's slots reads as a passkey row.

**Asks:** none for the owner; no surface changes ([OWNER-ASKS.md](OWNER-ASKS.md)). The seed count follows from the brief's budget (D10).

## Architecture & Implementation

**Shape.** `PC/model.ts` stays the one catalog. `Caps` gains an optional `actions`, the actions the run's driver implements (D1). `E/tests/helpers/profile-chaos-in-process.ts` (D2) boots the real graph per worker: `ProfileService`, `ContactService` and the real `ConfigStore` over one `FakeBrowserApi` instance per worker (`chrome.storage.local` pointed at it), the passkey service a `svc()` stub with production's body and a hold hook, and a deletion delegate that removes the profile's UI keys, as `PS/service.integration.test.ts:234` does for the coordinator's purge. It keeps the bindings (`Bindings` from checkers, plus secrets `S`, PRF outputs, phrase words `W`, and each profile's master and session secret at first sighting), drives each action through the service calls its page makes, in the page's order, and reads what `PC/checkers.ts` checks. `PS/profile-chaos.composition.test.ts` runs the seeds, the long mode and the break fixtures.

**The surface** (D3). In-process caps: `ceremonyOffAnchor` and `restartUnderOpenPage` true, `network` and `restoreGate` false (which already exclude the three dApp and held-restore actions), `credentialSlots` unlimited, `actions` the 22 driven: `createPassword`, `createPasskey`, `onboardingCreate`, `lock`, `unlockPassword`, `unlockPasskey`, `switchProfile`, `secondWindow`, `revealPhrase`, `importPhrase`, `changePassword`, `rename`, `deleteProfile`, `toggleStrict`, `backgroundRestart`, `raceLockDuringUnlock`, `raceDoubleUnlock`, `raceRestartDuringUnlock`, `editRowDuringUnlock`, `tamperedUnlock`, `changeUnlockMethod`, `verifyAll`. Left out: `addAccount`, `exportAccountFile`, `importAccountFile` (account derivation is bb, COMPOSITION-TESTS D6); `exportBackup`, `importBackup` (the file is the backup service's, over account slices); `abandonCeremony`, `importEarlierBackup`, `raceLockDuringReveal`, `raceLockDuringMethodChange` (their only service effect is a parameter read or a lock that `lock` already drives; arc 2 holds the service's side).

**Projections** (D4). A create or import with a session open locks first, as the lock screen is its only entry. A passkey variant the service never answers (refused, no PRF, a refused current prompt) makes the page's calls up to its prompt (`getPasskeyUnlockParams`), then none. A double click and `switchProfile` make no service call; `switchProfile` moves the model's pick, which later steps target. `raceDoubleUnlock` is two windows' concurrent `unlockProfile`. The races follow the page's schedule: the competing call lands between `getPasskeyUnlockParams` and `unlockPasskeyProfile`, and after a restart the second call goes to the new worker. `editRowDuringUnlock` edits the row there too, so the snapshot refuses, at the sources the model cites. Each driver names its call sequence and the page line it mirrors.

**Per step.** The worker's `storage.local` and `storage.session` writes are wrapped and logged in order, each with its area and its value before and after (harness fault writes bypass the wrapper). O7's needles run on each written value at once. Once the step has returned and its new ids are bound, O3 (`checkWrites`' change clause, split out as `checkChanges`) runs on every logged `storage.local` transition in order, reverted ones included; a profile the step did not bind stays unknown and fails. The session record is O1's, not O3's: `FAMILY_GROUPS` registers local keys. After the step: O5 `checkOutcome`; O1 `checkSession` (no pages; the locked probe is `contacts.getContactByAddress`, as `PC/collect.ts:181`); O2 `checkProfiles`; O3 `checkWrites`; O7 `checkLeaks` (needles: each password, PRF output, phrase and master; `prfSalt` placement; sealed-root envelopes; slot frames, after `SLOT_FRAMES` moves from `PC/collect.ts` into `PC/checkers.ts`); O4: every warn or error log of the step's workers fails unless a harness allowlist entry (pattern, action and variant, cited source, reason) names it. A step that writes config awaits one facade-locked read before its readings (F6), so `clearBearer` has landed. After `verifyAll`, O6 in process: a wrong secret refused with no write; the own secret opens; the master (`exportPlain`) and the session secret (`getProfileSecret`) equal their first-sighting bindings, the session secret is `Fr.fromBuffer(master)`, and profiles on one phrase share a master while others differ (D5). A rejection is `refused` only when it is a refusal the driver lists for that variant, from the code (D6). A red step prints `describePlan`, the step and the violations, never a bound value.

**Restart** (D7): snapshot both areas and the alarm list, `reset()`, restore them, boot the new worker on a new `FakeBrowserApi` instance. The dropped worker keeps no listener (F3), and no call of its is waiting in arc 1. Arc 2's stop between a write and its reopen parks one call forever; that is the stop. **Holds** (D9): arc 2 uses `onAnswer`, a one-shot storage wrapper on one worker's instance, and a one-shot spy on HMAC `crypto.subtle.verify`; each proves it was reached; no `src/` change.

**File map.** Arc 1: `PC/model.ts` (`Caps.actions`), `PC/checkers.ts` (`checkChanges`, `SLOT_FRAMES`), `PC/collect.ts` (imports `SLOT_FRAMES`), `E/scripts/e2e/profile-chaos-model.test.ts` (identity, surface, purity), `E/tests/helpers/profile-chaos-in-process.ts` (new), `PS/profile-chaos.composition.test.ts` (new), `E/tests/COMPOSITION-TESTS.md` (a worked-example row), `E/tests/e2e/README.md` § Chaos runs. Arc 2: `PS/profile-chaos-scenarios.composition.test.ts` (new), the harness (`StepHooks.onAnswer`, `onBoot`, `drive`, `allowed`; `plant`), `PC/model.ts` (`planFrom`), `E/scripts/e2e/profile-chaos-model.test.ts` (one planning budget, D22), both docs.

**Not taken:** a `plan()` parameter (works, but leaves the restriction out of the recorded caps and the README rule); a capability per missing feature (a dozen `params` edits); new catalog actions for in-process faults (each needs an e2e driver, D11); refactoring the three existing boots (outside the lane).

## Decision ledger

| Id | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | `Caps.actions?: readonly ActionName[]`: `drawStep` filters `CATALOG` by name when set, so absent means the same draws; `plan()` appends its closing `verifyAll` only when the surface holds it; `planFromList` refuses a listed action outside it | a `plan()` parameter (the first draft, Opus); a field per feature | Codex 4: the README rule ("stated in the model's capabilities") holds unchanged and a plan's record names the surface; optional, so old records load as before |
| D2 | Harness in `E/tests/helpers/`, test beside the service | harness under `src` | `stored-shapes.scan.test.ts:275` reads every non-test `src` file for `nulo:` keys; `E/tests/helpers/backup-import-harness.ts` is the precedent; its passkey stub is production's body (F5), so a leak would change nothing (Codex 7) |
| D3 | The surface above | more of the catalog | each action left out needs bb, a page or the network, or adds only a read or a lock |
| D4 | The page's call order and schedule, including holds between two page calls | holding inside the service in arc 1 | the model's expectations and cited sources are the page schedule's (Opus 1); the service-internal windows are arc 2's |
| D5 | O1-O5 and O7 reused; every write logged, O7 on each at once, O3 on each `storage.local` transition once the step has bound its new ids; O4 with an in-process allowlist; O6 compares masters and session secrets to first sighting | per-step snapshots only; O3 on session writes; O4 dropped; O6 by phrase groups only | Codex 2-3, Opus 5 and 12: a transient write, a swallowed failure and a replaced lone master pass otherwise. Codex round 2: `FAMILY_GROUPS` registers local keys only (the session record is O1's), and a create's writes land before its id returns |
| D6 | `refused` = a refusal the driver lists for that variant; the passkey drivers read parameters on the bound id first | any rejection | Opus 9: `Invalid profile id` names several refusals |
| D7 | Restart = snapshot, `reset()`, restore, new worker on a new instance | a stop hook in `src`; a separate process | Codex 1, Opus 10: isolation without a product change; a stop at an arbitrary instruction stays the e2e's |
| D8 | `NULO_PROFILE_CHAOS_RUNS=<n>` arms the long mode, from `NULO_PROFILE_CHAOS_SEED` (random when unset, logged) | `NULO_E2E_CHAOS*` | that arms e2e files; CI sets neither (F7); `NULO_FUZZ_*` is the unit suite's precedent |
| D9 | Test-side holds only, one-shot, each proven reached | an injected `src` seam | none is needed (recon.md § Scenario map) |
| D10 | Budget: the arc-1 file's slowest of three runs ≤ 20 s here, both arcs' files ≤ 30 s; the fixed seeds are the fewest from 8001 upward that, with short hand lists, drive every action of the surface | consecutive seeds | the brief's cap; I1; Opus 7: weight-1 actions need a coverage check |
| D11 | Arc 2's scenarios are targeted sequences on the harness | new catalog actions | an in-process fault has no e2e driver |
| D12 | Starts `empty` only | `pre-update` in process | #1313 rewrites that start; arc 2 seeds retired rows directly |
| D13 | The model test refuses a runtime import in `model.ts`, `checkers.ts`, `citations.ts`, `chaos-seed.ts` beyond each other | a comment only | the unit suite runs them; Puppeteer must not reach it |
| D14 | A product fault a sequence finds is an issue (seed and step) or a private draft advisory, never fixed here | fixing it | the brief |
| D15 | A reveal's words after a lock or a row edit are asserted as the service's contract: the answer authorizes the reveal; the wallet stays locked and nothing is written | asserting only "no write, no session" (Opus) | Codex 8c: an unpinned behaviour can change unseen; no screen shows the words, so it is no owner ask |
| D16 | Accessibility: none | | no product file changes |
| D17 | The fixed-set coverage check runs in the composition test, beside the hand lists it counts; the fixed set is {8001} | the model test (the file map's first place); more seeds | the model test imports no harness (D13); the four hand lists drive every action but `unlockPassword`, `secondWindow`, `changePassword` and `rename`, seed 8001 drives the first three and `rename` joined a hand list, so one seed is the fewest (D10), at about 6 s under load |
| D18 | The model test's identity case plans 100 seeds per caps and start, not 1,000 | 1,000 (gate 1.1's text) | at 1,000 it cost 20 s of the unit suite's 30 s budget; the property is structural (a surface naming every action filters nothing), and gate 1.1's digest proved identity over the full seed set at the base and the head |
| D19 | A scenario is a planned list: its scenario step is a span of catalog steps (the first names the action and params, the span may write what any of them may and leaves the last one's world, with patches `before` and `after` where a harness write or the schedule differs); `StepHooks.drive` replaces that step's driver; `planFrom` plans from any world; `plant` stores a row around the log and keeps O7 from reading it as the wallet's write | new catalog actions (D11); hand assertions outside the oracles | every step stays judged by O1-O7 against the model; `planFrom` only moves `planFromList`'s loop, and every e2e seed plans byte-identically (2.1's gate) |
| D20 | Arc 2 drives every item of the lane's scenario list, the three 2.1 left out included (salts swapped, a delete and a second change during a held change) | 2.1's Not taken (covered by integration tests) | the arc-2 brief lists them; each costs one sequence at about 20 ms, and the integration tests do not run O1-O7 |
| D21 | Arc 2 on `chaos-4-a2` from `dev` after arc 1's merge, the close-out as the same PR's last commits | a stack of arc 2 and a close-out PR (Delivery) | the orchestrator's arc-2 brief: one PR to land |
| D22 | The model test's four fixed-work planning cases share one 180 s budget (#1327) | fold the counter into the precondition loop; memoise `plan()`; fewer seeds | the counter case timed out once at retry 0 (5.5 s at load 104); the work is set by the seed count, not the tree, so cutting it cuts seeds; Codex chose the budget and named the citation and surface cases as the same cause |

## Phases and gates

Every gate also runs `bun run lint` and `bun run typecheck:all` (exit 0). `T` = `cd apps/extension && bun --bun vitest run --retry=0`.

**Arc 1: the harness, the fixed seeds, the surface.**

**1.1 ✓ The model.** Add `Caps.actions` (D1); split `checkChanges` out of `checkWrites`; move `SLOT_FRAMES` into `checkers.ts`. Model test: equal plans for caps without `actions` before and after, three caps, 1,000 seeds; a surface plan draws only its actions and passes `invalid` at each step; every surface plan replays through `planFromList` under the same caps, and one without `verifyAll` ends without it; `planFromList` refuses an action outside the surface; the purity check (D13).
Gate: `T scripts/e2e/profile-chaos-model.test.ts` green. A scratch script prints a digest of `plan()` for seeds 1, 1001, 3001, 7001-7030, 7101-7105 and 7201-7205 under the model test's three caps at `2914b9699` and at the head: identical.

**1.2 ✓ The harness.** Write the boot, bindings, drivers (a record keyed by action, type-checked complete over the surface), the write log, the readers, the barrier and the step loop.
Gate: `T src/wallet/services/profile/profile-chaos.composition.test.ts` green on four hand lists through `planFromList`: passkey create, unlock, change and restart; the three races; delete and import with a duplicate; strict toggled around a restart. Reader break fixtures, each red: a bearer written under strict (O1), a protected call served while locked (O1), a stray profile row and a dropped row field (O2), a write outside the step's contract then reverted (O3), an unregistered `storage.local` key (O3) beside its control (a session record written and removed passes), a needle written then removed (O7), an unlisted error log (O4).

**1.3 ✓ Seeds, long mode, break fixtures, docs.** The fixed seeds (D10) as `test.each` rows; the long mode (D8); a test checks the fixed set and hand lists drive every action of the surface (D17). Break fixtures: `snapshotForUnlock` spied to return the row before the edit turns an `editRowDuringUnlock` list red; reading-level fixtures for each O6 clause (a lone profile's master replaced, a sibling with another master, a stranger with the same one, a session secret off its master). Docs per the file map.
Gate: `T` with no filter three times, each green; the file's duration in each (≤ 20 s) and the suite's wall-clock at base and head in the PR body; `bun run test:all` once; per browser, `bun run test:e2e` once and one armed seed of `tests/e2e/profile-chaos.test.ts` (README § Chaos runs' command, seed 7001, `NULO_E2E_CHAOS_RUNS=1`), green; `bun run check:plans` after staging.

**Arc 2: the scenario list** (`PS/profile-chaos-scenarios.composition.test.ts`). Each item: its never-happens assertion, its success control, its break fixture (the guard spied away, red), O1-O3 after.

**2.1 ✓ Sequences.** (a) `prfSalt` edited inside `unlockPasskeyProfile` after the snapshot (`onAnswer`; the slots open from the snapshot, so it is the storage window up to the re-read): refused, nothing written; a reveal under the same edit returns the snapshot's words (D15). (b) A flipped `dekSealed` byte under a bearer session, then a restart: the restore closes the session. (c) A reveal held after its answer: a lock leaves the wallet locked, nothing written, the words returned (D15); a delete refuses it. (d) A retired row naming a live row's `credentialId`: the live row opens and is unchanged. A retired row given the live row's slots: the live row unchanged, and the transplant opens with no trusted imported-key DEK and no bearer (its MAC binds the id); anything else is filed (D14). (f) Strict turned on at a passkey answer: no bearer persisted. Strict turned on at a bearer restore's HMAC check: the session closes. (g) A stop after a change's row write lands and before its reopen: under strict, locked and only the new unlock opens; with strict off, restored on the new row. (h) A passkey change held at its new answer (the second `onAnswer` call): a second passkey change wins and the first is stale; a lock lets the change commit and the session stays locked.
Not taken: the degraded unlock and rekey refusals outside a restart (INT:3167, :3219, :3245; PU:295-311). Landed beyond the list above (D20): (i) two profiles on one credential with their salts swapped: neither opens; (h) a delete during the held change refuses it, and the second change's case is the stale refusal. Each item has a control where the scenario's own fault is absent.
Gate: `T src/wallet/services/profile/profile-chaos-scenarios.composition.test.ts` green; each break fixture red; recorded in lessons/phase-2.md.

**2.2 Record.** Docs; each product finding filed (D14); the #1157 comment drafted for the close-out.
Gate: as 1.3's, with both files' durations (≤ 30 s together).

## Security & Adversarial Considerations

- **Threat model:** test code only. The risk is a green that proves nothing: a fabricated reading, a harness error read as a refusal (D6), a hold that misses its window (D9), a dropped worker that still writes (D7), a transient write between readings (D5). Each has a break fixture.
- **Bundle:** the harness lives outside `src`, is imported only by `*.test.ts`, and its passkey stub is production's body (F5).
- **Secrets:** random per run; the console names symbols only. No real key, token or endpoint.
- **Stored rows are hostile input:** edited fields, flipped bytes and retired rows are the boundary the scenarios drive.
- **Findings:** an exploitable-looking fault goes to a private draft advisory and stays out of test names, plans and PR bodies until published.
- **Supply chain:** no new dependency; crypto stays `@nulo/wallet-crypto`.

## UI impact

None: no product file changes.

## Delivery

| Arc | Phases | Branch | Base | PR title (≤ 92) | Issue | code_review |
|---|---|---|---|---|---|---|
| 1 | 1.1-1.3 | `worktree-chaos-4` | `dev` | `test(profile): a seeded in-process sequence drives the profile chaos catalog` | Part of #1157 | off |
| 2 + close-out | 2.1-2.2, Outcome, archive | `chaos-4-a2` | `dev` (D21) | `test(profile): in-process sequences for the profile chaos scenario list` | #1157, #1327 | off |

Arc 1 shipped as #1324 (`worktree-chaos-4`). Arc 2 and the close-out are one PR (D21), opened without labels after the gates and the Codex loop. #1157 stays open for its browser scenarios; the close-out comments with what shipped. Serial; no lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `2914b9699`, with:
- Loop per arc, while it is the stack tip: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the arc's diff, this plan, the arc map ("arc N of 2; arc 2 adds targeted sequences on arc 1's harness"), the adversarial ask and the standard's two rules verbatim. One Opus review (`Agent`, `opus`, `general-purpose`) beside round 1. Three rounds at most. Then one fresh session over the net diff from `2914b9699`. Arc 2: three rounds at most in all, over its diff from `843d27f75`.
- `/code-review`: off.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons; the #1157 comment; known limits filed closed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans`.
- Teardown once the close-out merges: `agent-worktree done chaos-4 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; detail in lessons/phase-0.md.

- **Codex, round 1:** reject; 8 findings, all accepted. The restart left the old worker live (D7). O6 missed a lone master replaced (D5). Per-step snapshots missed transient writes, and O4 was dropped (D5). The surface belongs in `Caps` (D1). The drivers need the page's projections (D4, D6). A retired transplant needs stated assertions, and a held change needs its lock case (2.1 d, h). F6's wording and the bundle reason were corrected (D2). Arc 2 items narrowed (2.1, Not taken).
- **Opus, round 1:** conditional approve; 12 findings. Accepted: the races and the row edit follow the page's schedule (D4); a break fixture per reader (1.2); strict mode from the real `ConfigStore` (F6); a barrier after a config write; O6 at first sighting with the session secret (D5); creates and imports lock first (D4); the budget, I1 and a coverage check (D10); the caps stated (D3); refusals per variant (D6); a worker per instance and `reset()` (D7); `test:e2e` alone proves nothing for D1, so one armed seed per browser joins it (1.3); slot frames read in process (D5). Rejected: D1 as a `plan()` parameter (Codex 4's `Caps` field records the surface and keeps the README rule; the field is optional, so old records load); D15's alternative.
- **Codex, round 2 (resumed):** conditional approve; 3 conditions, all accepted: O3 judges `storage.local` transitions only (D5); O3 runs after the step binds its new ids, over the ordered write log (D5); the closing `verifyAll` follows the surface, with a replay test (D1, 1.1).
- **Codex, round 3 (resumed, the final pass):** approve; no new material defect.
- **Arc 1, Codex round 1:** reject; 4 findings and a comment, all accepted (lessons/phase-1.md § Review, round 1): O7 reads every log level, O6 reads an open session's secret after each step, wrong passwords are needles, O1 judges every session-row write. **Opus, beside it:** 7 findings, all accepted: console lines reach the logger, the edited-row refusal counts only before the slots open, a phrase as a JSON array is a needle, strays survive to a check, a fixture per O6 clause, three comments.
- **Arc 1, Codex round 2 (resumed):** conditional approve; 3 findings, all accepted: readings run before the first check, a write's strict mode is read as it lands, a comment.
- **Arc 1, Codex round 3 (resumed):** approve. **Fresh session over the net diff:** reject; 2 findings and a comment, all accepted: unlock parameters must name the profile's own credential (O2), a first sighting's words must derive its master (O6). Round 2 (resumed): approve.

## Seeds

```
/goal Every phase in implementations-plan/chaos-4/plan.md marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE printed per phase; the Codex loop converged per arc and in the cross-arc pass (a resumed pass reporting no new material finding, quoted); the stack and its close-out on GitHub, opened after the loops; `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/chaos-4 forward per its plan.md and the README's Post-implementation standard: reality check from plan.md and lessons/ (the archived path present on dev means merged: tear down and stop); next pending step; fast gates after each edit; Codex consult instead of waiting; five failures on one step: reassess with Codex; never merge.
```
