---
plan: quality-profile-1
tier: mid (the lane brief names it; competing outline, Codex + Opus dual audit, a fresh Codex final pass)
status: completed 2026-11-03; arc 1 as #1589, arc 2 with the close-out as one PR
issues: "#1439 (arc 2, Closes); #1446 (closed before building as a known limit: the class declined; arc 2 ships its log router)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; a fresh Codex final pass
base: origin/dev at 846030f16
trunk: dev
post_implementation_hardening: not scheduled
standard: implementations-plan/README.md § Post-implementation standard, read at 846030f16
---

## Outcome

- **Date**: 2026-11-03
- **Status**: completed: arc 1 as #1589; arc 2 with this close-out as one PR (D14).
- **Shipped**: arc 1 moved the slot codec out of `ProfileService` unchanged as `ProfileSecretCodec`, made one words-to-master predicate, and pinned the slot wipe on nine paths whose body throws. Arc 2 closes #1439: `withOpenedSlots` at ten sites, wiping the slots once the body settles while each site keeps its fence, checks, order and lock placement; one `verifyCredential` behind both verify RPCs; one `liveRowHoldingLock` for six gates; `INVALID_PROFILE_ID`; two named refusal factories (D15); and `PxeService`'s `logPublicEvent`. `profile/service.ts` went from 2,663 to 2,365 lines and its internal duplication from 4 / 46 to 2 / 20. No screen, copy, stored row, wire message, error or log line changed.
- **Known limits**: #1446 (the `ProfileIncarnations` class, D9).
- **Dispositions**: not done, `sameUnlockFields` (D7) and the restore cluster (outside the finding); `openForReveal` replaced by `withOpenedSlots` (D2). Superseded: the planned three-PR stack, by D14.
- **Lessons**: none promoted (`lessons.md` is at its 8 KiB budget). The one cross-task gotcha, a closing keyword in a PR body's prose that closes its issue at merge, is in [lessons/phase-2.md](lessons/phase-2.md).
- **Open items**: none.
- **Seeds retired**: the `/goal` and `/loop` seeds below are not to be run.

# quality-profile-1: ProfileService's slot codec and reveal frame, PxeService's log router

Two arcs and a docs-only close-out, one PR each, in a stack rooted at `dev`: arc 1 targets `dev`, arc 2 targets arc 1's branch, the close-out targets arc 2's, and `gh stack` retargets each as the one below merges. Arc 1 pins the slot wipe on a throwing body, then moves the slot codec out of `ProfileService` unchanged. Arc 2 gives the reveal paths one opener frame and one credential check, folds the small copies the issue's comment lists, and routes `PxeService`'s public-event logs through one function. #1446's class is declined (D9). Every change is a refactor: no screen, copy, stored shape, wire message, error, log line, lock placement or check order changes. `UI impact: none` on every arc. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In.** #1439's three steps; from its comment, the frame as `withOpenedSlots`, the refusal constant, the live-row helper and the shared pairing predicate. #1446's log-level lambda.
**Out, with reasons.** `sameUnlockFields` (D7). The `ProfileIncarnations` class (D9). The restore cluster (`restorePending`, `pendingDekRewraps`; the issue excludes it). The timer race in `awaitDeletionDelegate` (quality-sdk-1 arc 2 owns it). `createProfile`'s entropy mint (a derivation, not a pairing check).

## Outcome & Quality Bar

- **For whom:** the next contributor who changes how a profile's secrets are opened, checked or sealed; and the reviewer who must see that a refactor of the wallet's key-handling code changes nothing.
- **Excellent:** (1) A reveal path states only what is its own (its fence, its refusal, its checks and their order); opening, refusing and wiping the slots are written once, and no path can forget the wipe. (2) The slot crypto lives in one class with no lock, session or deletion state, with a test of its own for the frame. (3) Every existing pin stays green unedited, except the five reach-ins whose seam moved, each changed in the commit that moves it, and none of them able to pass silently. (4) `audit:dup` falls and `profile/service.ts` shrinks by about 250 lines.
- **Good enough:** the variations the issue lists stay where they are, written out, rather than parameterised.

## Assumptions

**Facts** (citations in recon.md):
1. `verifyUnlockCredential` and `verifyExportCredential` differ only in one locked line, the trusted-DEK check (`service.ts:1361`); pins at `service.passkey-unlock.test.ts:634-655` and `:700-714` hold the asymmetry.
2. Twelve `openSlots` calls: eleven framed sites today (ten once the verify pair merges) open, refuse on `null` with a refusal expressible as `notOpened(key, passwordRefusal)`, run a body and wipe in a `finally` covering it; `assertReplacementOpens` treats `null` as a result. Where a site also holds a DEK, a passhash or a resealed pair, its `finally` wipes the slots first.
3. The codec methods read no instance state but `secretBox`; `PasswordSecretBox` holds no state; `createProfile`, `changeProfilePassword` (both `seal`) and `unsealResealedVerifiedHoldingLock` also call the box.
4. The literal `"Invalid profile id"` is thrown at 24 sites and returned at 2 (`movedRowRefusal`), and matched by string in `client.ts:18`.
5. The live-row gate (row read, then refused as `Invalid profile id` when missing or reserved) is written at six sites; `getProfileOrThrowHoldingLock` is its first half.
6. `assertEntropyMasterPair` and `decodeRestoreMaterial` compute the same predicate and differ in message and wipes; neither wipes the inputs when the derivation itself throws.
7. Five test seams name a codec member: `service.passkey-unlock.test.ts:480-488` and `:526`, `service.integration.test.ts:4740-4744`, `profile-chaos-scenarios.composition.test.ts:626` (`replace`, which throws on a missing method), and `tests/helpers/profile-chaos-in-process.ts:757-774` (`countOpens`, which would go silent: its count stays 0 and `editRowDuringUnlock`'s `opens.count === 0` passes vacuously).
8. `eraseProfile` needs the profile barrier, the registry, the chain guards, the barrier map and the OPFS removal; only `assertGenerationCurrent` and provision's check-and-install need the two maps alone.
9. Neither file is in the complexity manifest or carries a `biome-ignore`.

**Inferences:**
- I1. Spies on `secretBox` keep intercepting if the facade and the codec share one box instance (D4).

**Asks:** none. D9 was the open question; both reviewers settled it as (b).

## Claims that did not hold

- #1439: the class now runs 162-2663 (2,502 lines); the drift is not material.
- #1439 step 2: `openForReveal(id, key, refusal)` cannot serve `exportPlain`. It runs `captureRowFence`, which must stay outside the flattening `try` (else a retired row's `RetiredProfileError` becomes a plain `Error` logged at error level), and taking `key` first would reorder refusals (an unknown id with no password would answer `Password is required`). D2 takes the comment's `withOpenedSlots`.
- Comment: the live-row gate has six copies, not five (`deleteProfile` 1817-1820). The literal has 26 uses, two of them returns.
- Comment: `sameUnlockFields` cannot be derived from the picks alone; the passkey check also compares `pxeGeneration` (D7).
- #1446: "needs only its two state maps and a `NetworkInfo`" holds for the generation check and provision's install, not for the erase (Fact 8). The "barrier loops" are one loop, `sweepOrphanStores`. "About 200 lines" would move: about 60 can, and `assertGenerationCurrent` already has one home.

## Architecture & Implementation

### Arc 1: the slot codec (#1439 step 3)

- **New** `apps/extension/src/wallet/services/profile/profile-secret-codec.ts`:
  - types `SlotKey`, `RowSeal`, `SealedUnder`, `OpenedSlots` and the function `unlocksWith` (exported, moved verbatim);
  - `entropyDerivesMaster(master, entropy): Promise<boolean>` (exported; wipes its rederived scratch only, as both callers do today);
  - `class ProfileSecretCodec { constructor(private readonly secretBox: PasswordSecretBox) }` with, moved verbatim: `openSlots`, `openUnderPasshash`, `sealUnder`, `sealSlotsUnder`, `sealDekWithPasshash`, `assertEntropyMasterPair`, `envelopeMacValid` (public); `openPasswordSlots`, `openPasskeyRowSlots`, `unsealDekWithPasshash` (private).
- **`service.ts`:** the constructor builds the box once, then `this.codec = new ProfileSecretCodec(this.secretBox)` (D4); every call site reads `this.codec.<method>`. `slotKey`, `newRowSeal`, `notOpened` stay (`notOpened` moves in arc 2).
- **`restore-material.ts`:** `if (!(await entropyDerivesMaster(master, entropy)))`, same message, same wipes (D8); `assertEntropyMasterPair` calls the same function.
- **Seams** (Fact 7, D11): the four loud ones read `internals.codec`; `countOpens` wraps `profiles.codec.openSlots` and throws when the method it wraps is missing.

### Arc 2: the reveal frame (#1439 steps 1-2, the comment's items) and the PXE log router

- **`ProfileSecretCodec.withOpenedSlots<T>(row, key, passwordRefusal, body): Promise<T>`** (D2). TSDoc contract: opens `row`'s slots under `key`; when they do not open, throws `notOpened(key, passwordRefusal)` and runs nothing; else awaits `body(opened)` inside its `try` and wipes the slots on every path, a rejecting body included. Takes no lock: the caller places it. `notOpened` moves into the codec as a private method.
- **Adopted at** `unlockProfile`, `unlockPasskeyProfile`, `changeProfilePassword`, the merged verify, `changeUnlockMethod`, `exportPlain`, `openBackupTransfer`, `exportImportedKeysDek`, `exportMnemonic`, `finalizeOpenHoldingLock`. Each keeps its fence call, key derivation, checks and their order, and its lock placement. Anything else a site allocates (a DEK, a passhash, the resealed pair, `openBackupTransfer`'s source DEK and `handedOver`) is declared outside the frame and wiped in an outer `finally` around it, so the slots wipe first, as today. A body that pushes its method over a complexity budget becomes a named private method, never a suppression.
- **`verifyCredential(id, credential, requireTrustedDek: boolean)`**, private, behind both public RPC names (D3). The DEK check stays inside the same locked callback, after `rowUnchangedHoldingLock`.
- **`liveRowHoldingLock(id): Promise<Profile>`**, private, built on `getProfileOrThrowHoldingLock` plus the reservation refusal (D6). Replaces the six gates; each site keeps what follows (retired check, type checks with their texts, torn guard).
- **`INVALID_PROFILE_ID`** in `spec.ts` (D5), after the helper (which absorbs eight literals): the remaining sites use `new Error(INVALID_PROFILE_ID)`; `isInvalidProfileIdError` compares against it. The text stays byte-identical.
- **PXE** (`packages/aztec-runtime/src/pxe/service.ts`): `private readonly logPublicEvent: PublicEventLogger = (level, msg, ...rest) => …` (the type is `public-events.ts:40`), passed at both call sites; an arrow field, so `this` stays bound (D9).

### Trade-offs

- **Pin, move, then reshape** (D1): arc 1's pin guards both the move (about twelve call sites rewritten) and the frame; the move is checked with `git diff --color-moved`; `withOpenedSlots` is born in its final home.
- **A loan helper, not a template** (D2): the body is the caller's, so every documented variation stays visible at its site.
- **Departure from `profile-service-dedup`**: that plan kept helpers private because they "reach into the repository, the deletion state and the session manager"; the codec reaches none of those. It left "where each secret is zeroized" per site; the frame centralises only the slot wipe, and each site's other wipes stay at the site, in today's order.

## Phases

Fast gate (every phase): `bun run lint`, `bun run typecheck:all`, `cd apps/extension && bun run test -- src/wallet/services/profile` (exit 0; no test skipped that ran at the base).

**Smoke set** (arcs 1 and 2): `security`, `passkey-paths`, `auth-flows`, `security-backup`, `backup-roundtrip`, `account-import-export` (unlock both kinds, password and unlock-method change, phrase, account and full-backup export, restore and finalize). Per browser `B` in `chrome`, `firefox`: build the armed bundle (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:B`), then `cd apps/extension && NULO_E2E_BROWSER=B NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<file>.test.ts --retry=0`. Pass: every test green; wall-clock recorded.

### Phase 1 (arc 1): pin the slot wipe on a throwing body ✓

1. In `service.open-slots.test.ts` § the opener's buffers, add one table-driven test. Rows: each `PAIRED_PATHS` entry, both verify RPCs with `{ password }`, with a sibling's entropy planted; `finalizeRestore` on a restored row with a sibling's entropy (the fixture at `:174-192`); `exportImportedKeysDek` on a row whose `dekSealed` does not open. In each, the slots open and the body throws. Assert every passhash (spied as at `:208-212`), master and entropy the opener produced is zero after the refusal. Success control: the row's own entropy opens on one path and its buffers are zero after.
**Gate:** fast gate; the new test green at the base.

### Phase 2 (arc 1): the codec class ✓

1. Create `profile-secret-codec.ts`; move the bodies byte for byte, comments included.
2. Repoint `service.ts`; delete the moved members; keep `secretBox` for its three own calls.
3. Repoint the five seams in the same commit, saying so in its body; `countOpens` throws on a missing method.
**Gate:** fast gate; `git diff --color-moved=dimmed-zebra 846030f16 -- apps/extension/src/wallet/services/profile` shows every moved body as moved; `profile-chaos.composition.test.ts` green, with `countOpens` wrapping the codec.

### Phase 3 (arc 1): one pairing predicate ✓

1. Add `entropyDerivesMaster(master, entropy)`; call it from `assertEntropyMasterPair` and `decodeRestoreMaterial`.
**Gate:** fast gate; `restore-material.test.ts` and `service.open-slots.test.ts` green unedited; `bun run test:all`; `bun run audit:vue`; the smoke set on both browsers.

### Phase 4 (arc 2): the frame and the credential check ✓

1. Add `withOpenedSlots`, move `notOpened` into the codec, and add `profile-secret-codec.test.ts` (one test): on a password row sealed by the codec, with a deferred body, the master and entropy stay intact while the body is pending; once it rejects, the master, entropy and passhash are zero and the rejection propagates; success control: a resolving body's value returns and the buffers are zero after.
2. Adopt it at the ten sites, one commit per group (unlocks; password and unlock-method changes; exports; finalize).
3. Merge the verify pair into `verifyCredential`.
**Gate:** fast gate; Phase 1's test and every pin in `service.open-slots.test.ts`, `service.passkey-unlock.test.ts`, `service.integration.test.ts`, `unlock-method.composition.test.ts` and both `profile-chaos*.composition.test.ts` green unedited.

### Phase 5 (arc 2): the small copies ✓

1. `liveRowHoldingLock` at the six gates.
2. `INVALID_PROFILE_ID` in `spec.ts`, the remaining sites and `client.ts`.
**Gate:** fast gate; `client.test.ts` green; from the repo root, `rg -n -F --glob '*.ts' --glob '!*.test.ts' '"Invalid profile id"' apps/extension/src` prints exactly one line, the constant in `profile/spec.ts`.

### Phase 6 (arc 2): the PXE log router ✓

1. `logPublicEvent` in `PxeService`, at both call sites.
**Gate:** `bun run lint`, `bun run typecheck:all`, `cd packages/aztec-runtime && bun run test`; then the arc's full gate: `bun run test:all`, `bun run audit:vue`, `bun run audit:dup` below the base (production 183 / 8,841; `profile/service.ts` internal 4 / 46), the smoke set on both browsers, and `NULO_E2E_BROWSER=chrome NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-public-transfers.test.ts --retry=0` (every scenario green, none skipped).

## Security & Adversarial Considerations

- **Threat model.** This code holds the master secret, the recovery entropy and the imported-keys DEK in memory between an unseal and a wipe. A writer of `chrome.storage.local` plants rows (a sibling's slots, a transplanted DEK slot, a moved entropy slot); a racer of the facade lock deletes, restores or reseals a profile during a slow unseal. Neither gains anything new from a refactor unless it reorders a check, drops a wipe or widens what a call returns.
- **What could go wrong, and the guard.** (1) A frame that wipes before the body has used what it returns: `withOpenedSlots` awaits `body` inside its `try`, and the codec test proves it with a deferred body. No body returns a view of the slots: they return strings, a DEK from `openDek`, or `ProfileInfo` after the session copied what it needs. (2) A check moved across the lock (`exportMnemonic`'s fence is locked, the other exports' are not): each body keeps its placement; no helper takes the lock. (3) A refusal that changes type or text (a passkey refusal read as a wrong password): `notOpened` moves unchanged; `service.open-slots.test.ts` asserts each path's refusal. (4) `openBackupTransfer` wiping a DEK it handed out, or keeping one it did not: `handedOver` and its wipe stay at the site. (5) `exportPlain`'s flattening: the capture stays outside its `try`. (6) A test seam that stops observing after the move: `countOpens` throws on a missing method.
- **Crypto.** No primitive, parameter or library changes; the codec calls the same `@nulo/wallet-crypto` exports. **Input validation:** `classifyProfileRow` still runs before any sealed field is read. **Least privilege / supply chain:** no dependency, permission or workflow change. **Logging:** no log line moves or changes; the PXE router keeps each line's level, message and arguments.

## Decision ledger

| # | Decision | Alternatives and why not |
|---|---|---|
| D1 | Arc 1: pin, then move the codec; arc 2 reshapes on it | Frame first: `withOpenedSlots` written on the facade, moved a PR later (Opus r1 moved the pin to arc 1) |
| D2 | `withOpenedSlots(row, key, passwordRefusal, body)` on the codec, owning the slot wipe only | `openForReveal` (issue step 2): fails `exportPlain`; a caller-owned wipe keeps eleven `finally` blocks |
| D3 | `verifyCredential(id, credential, requireTrustedDek)` | A callback for the locked step: generality for one caller |
| D4 | The facade builds one `PasswordSecretBox` and hands it to the codec | Codec-owned box: wrappers for `seal` (two callers) and `unsealWithPasshash` (one), and the spy seam at `:488` moves for nothing |
| D5 | `INVALID_PROFILE_ID` in `spec.ts` | A typed error: the refusal crosses the port as a plain `Error`; `isInvalidProfileIdError` is the contract |
| D6 | `liveRowHoldingLock` on `getProfileOrThrowHoldingLock` | Folding the retired or type checks in: each site's next check differs |
| D7 | Not done: the two staleness chains stay | `sameUnlockFields` from the picks: the passkey chain also compares `pxeGeneration`, retired and unreadable rows need invented semantics (Codex r1, Opus r1), and `profile-service-dedup` kept them apart on purpose. `sameStoredRow`: compares every key, so a renamed profile would refuse an unlock |
| D8 | `entropyDerivesMaster(master, entropy)` in the codec module | Leave both copies: the predicate is the security-relevant line; one copy is safer. `(entropy, master)`: reversed from `assertEntropyMasterPair`, and both take a plain `Uint8Array` |
| D9 | #1446: decline `ProfileIncarnations`; ship the log router only | (a) the class: eleven synchronous methods, the clear's atomicity (mark `deleting`, `stopRetries`, start the erase, publish the join, before any await) becomes a cross-class obligation, the erase's order lives in `PxeService` anyway, and `incarnation-fence.test.ts:302-310` writes a state no public transition reaches, so the class would need test-only mutators. (c) the erase behind a callback: a coordination contract for one caller. Both reviewers: (b), high confidence |
| D10 | Phase 1's pin covers nine paths in one table-driven test | Only the paired paths: misses the verify merge, finalize and the DEK export (Opus r1); a test per path: the same scenario multiplied (Codex r1) |
| D11 | Tests change only where a seam moved, in the moving commit; a seam that could pass vacuously is made to throw | — |
| D12 | The PXE router rides in arc 2 as its own commit | A third PR: a full CI run for a three-line change |
| D13 | Commit subjects and PR titles put identifiers in backticks (found at arc 1's first commit: `subject-case` is `lower-case`) | — |
| D14 | Arc 2 and the close-out ship as one PR on `quality-profile-1-a2` off `dev` (the orchestrator's call once arc 1 had squash-merged) | The planned stack: nothing left to stack on |
| D15 | Two module-level refusal factories, `invalidPassword` and `invalidOldPassword`, passed to the frame | Inline arrows: the formatter will not hug a trailing callback after an arrow argument, so each site splits into four argument lines; and the two "Invalid profile old password" literals the code kept "in lockstep" become one |
| D16 | A passkey-only key passes `invalidPassword` too: the frame maps any passkey key to `PasskeyNotOpenedError` | A `PasskeyNotOpenedError` factory at that one site: a refusal the frame never calls |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high): conditional approve. Accepted: the site count; slot-first wipe order kept by outer `finally` blocks (it dropped an inference that order was unobservable); D7 declined; armed smoke builds per browser; the passhash and a deferred-body codec test in the pins; D9 settled. Rejected: none.
- **Opus r1** (Plan lens): conditional approve. Accepted: the silent `countOpens` seam (verified at `profile-chaos-in-process.ts:757-774`); Phase 1 widened to nine paths with passhashes and moved to arc 1; `account-import-export` in the smoke set; `incoming-public-transfers` for the router; `(master, entropy)` order and no new wipe in `entropyDerivesMaster`; the literal count (24 throws, 2 returns) and `seal`'s two callers; the helper before the constant; the departure from `profile-service-dedup` stated. Moot after D7: its `sameUnlockFields` domain and type-check findings. Rejected: none.
- **Codex r2** (resumed): conditional approve. Accepted: an executable literal-count command; the network gate at retry 0 on a named browser. No other material finding; the nine pin rows, the seam list (no sixth seam found) and D12 verified.
- **Codex final** (fresh session): conditional approve. Accepted: #1446 is not closed by a PR that leaves its main finding undone; it closes as a known limit with its reopening condition; the stack's PR bases stated. Verified the facts, I1, D2, D4, D9 and the gates.
- **Codex final r2** (resumed): approve, no new material findings.
- **Arc 1, Codex r1** (gpt-6.1-sol, high, over the arc's diff): no material findings; one comment trimmed. **r2** (resumed): no new material findings, converged.
- **Arc 1, Opus** (general-purpose, over the arc's diff): no material findings. Two codec doc trims deferred to arc 2, which edits the codec (`lessons/phase-1.md`).
- **Arc 2, Codex r1** (gpt-6.1-sol, high, over the arc's diff): approve. Accepted: the codec test's wrong-key arm matches a sentinel refusal by identity; the frame's TSDoc says its slots are lent; three restating comments cut. **Opus** (beside r1): no behaviour drift at any of the ten sites; four comment trims accepted. **r2** (resumed): approve, every fix verified. **Net pass** (fresh session over both arcs): approve; one comment nit accepted. Detail: `lessons/phase-2.md`.

## Delivery

- **Before building:** a `## Decision` comment on #1439; on #1446 a `## Decision` comment with the reopening condition (an incarnation state that has to touch the op paths, the provision and the erase together), the `known-limit` label, and closed as not planned. The Outcome lists it as `Known limits: #1446`; arc 2's body cites it under "Not done, and why" and says its log router is the part that holds.
- **Arc 2, as built (D14):** one PR, arc 2's commits then the close-out's, on `quality-profile-1-a2` off `dev`; `Closes #1439` in its body. Arc 1's squash body closed #1439 early, through the prose "closes #1439"; reopened with a comment.
- **Stack** (arc 1 only) via `gh stack init --adopt worktree-quality-profile-1 --base dev`: arc 1 on `worktree-quality-profile-1` (Phases 1-3), arc 2 `gh stack add quality-profile-1-frame` (Phases 4-6), close-out `gh stack add quality-profile-1-close-out` (docs only). Each arc boundary runs the review loop before the next arc opens; no pipelined boundary. `code_review: off`.
- **PR titles** (≤ 92 characters): arc 1 ``refactor(profile): move the slot codec out of `ProfileService` `` (62); arc 2 ``refactor: one reveal frame and credential check in `ProfileService`, one pxe log router`` (87; `Closes #1439`). Commitlint's `subject-case` is lower-case, so identifiers sit in backticks (D13); close-out `docs(plans): close quality-profile-1` (36).
- **Each PR body:** what changed and why, each seam edit, the gates with outcomes, `audit:dup` and the touched files' line counts before and after, "Not done, and why" (D7, D9's class), and each browser's smoke wall-clock (no e2e scenario added or changed).
- **Parallelism:** arcs share `service.ts` and stay serial; no lanes.
- **Neighbour:** quality-sdk-1 arc 2 edits `awaitDeletionDelegate` in `service.ts`; the regions do not overlap. Each arc merges `origin/dev` before its PR and reruns its gate.

## Post-implementation

The standard at `846030f16`, with these values:

- **Review loop:** Codex `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; per arc over `git diff <arc base>...HEAD`, at the arc boundary; then one fresh session over the net diff from `846030f16` for cross-arc issues. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) alongside each arc's first round. Hard stop at three rounds, then surface. Each prompt carries the standard's two verbatim rules, the arc map ("arc N of 2; arc 2 builds the frame on arc 1's codec") and the adversarial ask.
- **Failure policy:** three failures on one step stop the arc (`ARC_FAILED`).
- **Delivery:** as above; `gh pr checks <n> --watch` once per PR.
- **Close-out:** the standard's step 4 as the stack's docs-only top layer, after merging `dev` into it; `STATUS.md` deleted.
- **Teardown:** after the close-out merges, `agent-worktree done quality-profile-1 --merged`, per the standard's step 5. The orchestrator's session notices the merge.

## Seeds

```
/goal Every phase of implementations-plan/quality-profile-1/plan.md marked ✓ with its gate's output in the transcript; LESSONS_FILE printed per phase; the Codex loop converged per arc and once over the net diff (each a resumed pass with no new material finding, quoted); the stack's PRs exist on GitHub, opened after the loops, with the close-out archiving the plan; `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/quality-profile-1 forward per its plan.md: reality check (plan, lessons, `gh stack view`), the next unticked phase, its gate, the arc's review loop at each boundary, then Delivery and the close-out; never merge; surface after three failures on one step.
```
