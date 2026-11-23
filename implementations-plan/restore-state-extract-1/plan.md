---
plan: restore-state-extract-1
tier: light
status: implementing
issues: "#1933"
driver: claude-code
claude_model: opus
codex_model: sol (gpt-6.1-sol, as the lane brief names)
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex pass over the plan and the diff; one Opus diff review
base: origin/dev at 65182f8d1
trunk: dev
post_implementation_hardening: not scheduled
---

# restore-state-extract-1: the restore workflow's pending state moves into its own class

`ProfileService` keeps two `ExpiringStash`es for restores committed and not yet finalized (the
DEK rewrap contexts and the admissions), their TTL and finalize's identity compare, and five
sites edit them inline. This plan moves them, unchanged, into `PendingRestoreState`
(`apps/extension/src/wallet/services/profile/pending-restore-state.ts`). Paths below are under
`apps/extension/src/wallet/services/profile/` unless they name another root. UI impact: none.
Nothing stored changes. Consults: [lessons/phase-1.md](lessons/phase-1.md).

## The issue, checked (#1933)

A structural finding (Large Class) with no failure path. Its claims hold at the base, found by
name (its lines are from `8ae2c06a4`): every site lives in `service.ts`, `consumeDekRewrapContext`
has one production caller (`account/service.ts:1245`), two test files reach the privates. The
`restorePending` marker stays in the facade, where #1439 drew the boundary.

## Outcome & Quality Bar

- **For whom:** the next maintainer who changes restore admission or the temporary-key lifetime.
- **Excellent:** that change is read and tested in one 100-line module; the facade's five sites
  each read as one named call; no behaviour, log line or stored shape moves.
- **Good enough:** the facade keeps the lock, the durable marker and the orchestration.

## Assumptions

**Facts** (verified at the base)
1. Every stash access runs inside a `runExclusive` callback: consume (`:226-237`), lock
   (`:897-905`), delete phase 1 (`:1662-1688`), commit (`commitRestoredProfileHoldingLock`, called
   only through `runExclusive`), finalize (`finalizeRestoreHoldingLock`, same).
2. `ExpiringStash` methods are synchronous; the rewrap wipe zeroizes source then destination; the
   admission wipe is a no-op (`expiring-stash.ts`).
3. The `Lock` has a 5-minute hold watchdog (`packages/wallet-core/src/utils/lock.ts:5`), which is
   why finalize compares the entries it read first by identity.
4. No log line names either stash or its contents (`git grep`).
5. Tests that reach the privates: `service.integration.test.ts` (5 places) and
   `service.passkey-unlock.test.ts` (2 places); `account/*.test.ts` fake `consumeDekRewrapContext`.

**Inferences**
- I1. A `private` (not `#`) field lets those tests keep reaching the maps with only a path change.

**Asks** — none open. Product: no visible surface.

## Architecture & Implementation

`PendingRestoreState` owns both stashes (`private readonly rewraps`, `admissions`) and the
exported `PENDING_RESTORE_TTL_MS` (30 min). Its nine synchronous methods (`sweep`, `stash`,
`take`, `forget`, `forgetAll`, `beginFinalize`, `admits`, `spendAdmission`, `endFinalize`) each run
the inline code of the site below, in order, with the same `Date.now()` reads; `sweep` spares only
`exceptId`'s rewrap context, `forgetAll` sweeps at `+∞`, and the opaque `FinalizeTicket` carries
the two entries `beginFinalize` read for the `===` compares. The facade holds one
`private readonly pendingRestore`; `consumeDekRewrapContext` keeps its signature text;
`ExpiringStash` is reused as is. Alternative not taken: methods taking `now` (pure, like
`ExpiringStash`) would merge the commit's three clock reads into one.

### Site table (each call sits exactly where its inline code ran)

| Site | Before | After | Awaits around it |
|---|---|---|---|
| consume | sweep(now, id); take(id, now) | `take(id)` | callback body, no await |
| lock | sweep(+∞) both stashes | `forgetAll()` | after the handle check, before `sessionManager.close()` |
| delete entry | sweep(`Date.now()`) | `sweep()` | first statement of phase 1 |
| delete drop | drop rewrap; drop admission | `forget(id)` | after `closeProfile(id)`, before `integrityBlocked.clear` |
| commit | sweep(t, id); set rewrap; `storedContext = true`; set admission | `stash(...)`; `storedContext = true` | after `emit("onProfileAdded")`, no await to the return |
| finalize begin | get rewrap; get admission | `beginFinalize(id)` | before the first await |
| finalize sweep | sweep(`Date.now()`, id) | `sweep(id)` | first statement of the `try` |
| finalize check | `admission === undefined \|\| get !== admission` → throw | `!admits(ticket)` → throw | after `restorePending.delete`, `isActive` |
| finalize spend | drop admission if same | `spendAdmission(ticket)` | after `finalizeOpenHoldingLock` resolves |
| finalize end | drop rewrap if same | `endFinalize(ticket)` | `finally` |

**D1 — the one reorder.** `scratch.storedContext = true` now runs after the admission set rather
than before it. Nothing awaits between them, and the admission set is `Map.get`, `Map.set` and a
no-op wipe, which throws on no input. So the flag reads the same at the post-lock `finally`, its
only reader; the same holds for the third `Date.now()` read, which a test's clock stub can
make throw only by fault injection. A `stashRewrap` + `admit` pair would keep the exact order but splits one commit step
into two calls the facade must pair; rejected.

**Key-material lifetime.** Same wipe, same stash class, same TTL, same triggers (replace on set,
sweep, expired take, drop). The class keeps each buffer only in its `rewraps` entry; `stash`
copies the two references out of the caller's literal. `take` removes the entry before returning.
The ticket holds the entry reference typed `unknown`, a local of finalize's frame as `seenRewrap`
was. Checked by reading both versions side by side, by the unit test's per-buffer wipe count
(`fill` spy) on the replace, TTL sweep, take-at-TTL, forget, forgetAll and finalize paths, each
followed by a later cleanup that must wipe nothing more, and by the unchanged integration pins.
No test can prove the absence of an unused reference; that rests on the code reading.

**Lock discipline.** The instance is a private field; its only callers are the ten sites above,
each inside the callback it was in. No method awaits, so none can interleave another. The lock's
hold watchdog can admit a successor (a lock's `forgetAll`, a same-id commit) while a finalize
awaits, as at the base; the ticket's identity compares are what tolerate it.

## Security & Adversarial Considerations

- Threat surface unchanged: a memory-only stash of two DEKs per pending restore, reachable only
  inside the facade. Attacker-controlled input (a backup body) is decoded before the stash, as before.
- Review asks: an order change around an await; a wipe later or missing on lock, delete, TTL or a
  failed finalize; a key reference kept or returned; identity turned into equality; a call newly
  reachable outside the lock. Crypto, supply chain, permissions: untouched.

## Phase 1 — extract (single arc)

1. Add `pending-restore-state.ts` and `pending-restore-state.test.ts`.
2. Replace the ten sites in `service.ts`; drop `ExpiringStash`'s import there.
3. Change only the reach-in paths of the existing tests (list below). Add the module path to
   ARCHITECTURE.md's late-activation paragraph.

**Test edits** (expectations unchanged): integration "an explicit lock wipes…", "deleteProfile
drops…", the SECRET-LIFETIME pin and the "the restore stash" block read `pendingRestore.rewraps`
/ `.admissions` and the exported TTL; passkey-unlock's `admissions` accessor and TTL likewise.
The chaos model's 26 `cite(SERVICE, <line>, …)` entries (`tests/e2e/helpers/profile-chaos/model.ts`)
move to the lines their unchanged fragments now sit on, mapped through the diff, not by search.

**Validation gate** (one at a time, retry 0): `bun run lint`, `bun run typecheck:all`,
`bun run test:all`, `bun run audit:vue`, `bun run test:ci-gating`, `bun run check:plans`.
E2E, Chrome then Firefox:
- Smoke (`cd apps/extension && bun run test:e2e -- <files> --retry=0`):
  `backup-imported-account` (rewrap consume), `passkey-backup` (passkey restore + finalize),
  `import-paths` (full backup, phrase import), `restore-outcome` (restore again).
- Network, one `e2e:agent` run per browser, proverless: `backup-restore-sw-restart` (Chrome only:
  pre-finalize crash, rollback delete) and `profile-chaos` armed with a hand list
  (`NULO_E2E_CHAOS=1`, `NULO_E2E_CHAOS_ACTIONS=<file>`): a restore held at `service-restore` that a
  lock meets (the profile kept, locked), then one held at `account-state` that a delete meets.
  This proves interruption and convergence in a real browser, not the refusal itself: the driver
  locks after the release, so a finalize that wrongly opened would still end locked. The refusal
  is pinned by `service.passkey-unlock.test.ts` ("a lock after a … restore's commit refuses
  finalize"). The `account-state` hold runs after finalize.
  The list (8 steps) is validated offline with `planFromList` on both browsers' caps.
No scenario is added.

## Delivery

One branch, one PR against `dev`, opened ready after the reviews converge: `refactor(profile):
the restore workflow's pending state moves into its own class`, `Closes #1933`. Close-out (Outcome,
lessons, `git mv` to `archive/`, index line) as the PR's final commits, after merging `origin/dev`.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard)
at `65182f8d1`, bounded work: one Codex pass (`gpt-6.1-sol`, `high`, read-only) over this plan
and the completed diff, then one Opus 5.5 diff review, then targeted verification of material
fixes. The lane brief folds the light tier's plan audit into that one Codex pass.

## Audit verdicts

**Codex (`gpt-6.1-sol`, high), plan + diff at `7eaf9c1dd`:** no material behaviour or key-lifetime
regression; Facts 1, 2, 4, 5 confirmed; D1 accepted. Three minor findings, all accepted:
- C1 (plan): the chaos run does not prove "finalize refused". Fixed: the gate says what it proves
  and cites the unit-level pin.
- C2 (comment): "no sweep zeroizes an entry another op holds a live reference to" is false under
  the lock's watchdog (true at the base too). Fixed: the class doc states the watchdog and why the
  ticket compares by identity.
- C3 (tests): the wipe-once claim exceeded the asserts on the TTL and forget paths, and "keeps no
  reference" is not provable by a test. Fixed: a later cleanup follows each path; the test title
  and this plan's lifetime paragraph say what the test proves.

**Gate finding:** `test:all` failed at `7eaf9c1dd` on the chaos model's citation test (25 moved
lines of `service.ts`). Fixed by the remap above.

## Seeds

```
/goal implementations-plan/restore-state-extract-1/plan.md Phase 1 ✓ with its gate passing in the transcript; one Codex pass and one Opus review converged; the PR exists ready with the close-out commits; bun run lint and bun run test:all exit 0.
```

```
/loop 15m Drive implementations-plan/restore-state-extract-1 per its plan.md; never merge.
```
