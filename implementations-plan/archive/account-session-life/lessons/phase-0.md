# Phase 0: planning consults

## Recon

- Three read-only Sonnet explorers: a batched reuse sweep (eight capabilities), a map of the port transport and the deletion paths, a map of account create/import, profile activation and passkey create.
- The reuse sweep reported that account create and import "are already serialized". The planner's own reading showed they lock different keys (`account/service.ts:366,522`); recon.md records the correction.
- The transport mapper's claim that a cold-wake port meets no listener is an inference from MV3 dispatch rules; plan.md keeps it as I3, checked on the base build in phase 4.1.

## Dual audit, round 1

- Codex (`gpt-6.1-sol`, high, read-only; session `01a1236f-07d3-74d1-bb7f-cd5a7b24fc95`). The run went to the `alejo-icloud` roster account: the managed `CODEX_ACCOUNT=best` picked it, although the brief expected the default `~/.codex` login. No retry was needed.
- Verdict: `reject (with blocking findings: unsafe imported-key cleanup, unfenced activation tail, Ready-to-send race, unsupported session-isolation claim, overlapping erasures)`. Ten findings; dispositions in plan.md § Audit verdicts.

- Opus 5.5 Plan agent (one consult). Verdict: `conditional approve (with conditions: resolve #1 before arc 2a is built; fix #2–#8 in plan.md before their phases run)`. Twelve findings; dispositions in plan.md § Audit verdicts. Its finding 1 (the Ready handshake changes the start-up loader and the "unreachable" banner's timing) was checked in `utils/core.ts:62-73`, `components/GlobalLoader.vue:14`, `popup/app.vue:420-436` and `popup/auth-guard.ts:60-80`, and holds.
- Planner checks of the audits' claims: the operation-journal `invoke` override exists (`operation-journal/service.ts:117-127`); the orphan sweep reads `profileLifecycles.has` (`pxe/service.ts:286`); `agent.sh` refuses `@requires-proverless` files without `NULO_E2E_PROVERLESS=1`, and eleven network files carry the marker, three of them in this plan's gates.

## Revision after round 1

- #99 moved from a per-(profile, chain) lock to a check and write under the existing per-address row lock (Codex 1, 8).
- #100's deadline became 120 s, with identity re-checks after each await (Codex 2, Opus 5).
- #157 split: arc 2 keeps the invisible half (lastError, refused ports, the delegate wait, dead generations with joined clears); the Ready handshake became arc 4, gated on the new OWNER-ASKS OA-4 (Codex 7, Opus 1). Arc 4 carries the send-boundary hook, the disconnect epoch and the corrected queued-call argument (Codex 3, 4; Opus 8, 9).
- Rejected: making R4's "#91 first" unconditional (it is the orchestrator's reservation text), and binding every queued call to a session (a queued call gains no authority a fresh call would not have).

## Final fresh pass

- Codex (`gpt-6.1-sol`, high, read-only; new session `01a12384-7e4b-79b2-b091-a6c6b2d86c42`, on the default `alejo-gmail` login this time). Verdict: `reject (with blocking findings: stale account undo and reconciliation can delete a successful replacement; activation remains incompletely fenced; OA-4 promises failure behavior the handshake does not implement)`. Seven findings, each verified in the tree before it was accepted; dispositions in plan.md § Audit verdicts.
- Verification notes: `unwrite` deletes whatever row sits at the address (`account/service.ts:350-352`); `reconcileImportedAccounts` re-checks only key absence under the row lock (`:949-953`); the helper's third await is `storageLocalSet` (`new-profile-helpers.ts:40-42`); the bootstrap sets `appStore.profile` at entry and flips `isLogined` last (`useProfileBootstrap.ts:148-175`); the create page is reached only while locked (`SelectProfilePopup.vue:73`, `register.vue:46`); the session manager replaces a session without emitting a lock first (`session-manager.ts:333-339`).
- Planner's own catches during the pass: `contains(id)` replaces `getKeys()` for the occupancy read; eleven network files, not two, carry `@requires-proverless`; `agent.sh` lives under `apps/extension/scripts/e2e/`.
- Round 2 (same session, resumed): `reject (with blocking findings: reconciliation still allows a stale dependent purge after a successful replacement)`. Six of seven resolved. The remaining High needs a create during the restore's reconcile; the import reconciles before it opens the restored profile's session (`useFullBackupImport.ts:388-399`) and create/import refuse without one (`session-manager.ts:248-252`), so the planner rejected it on that evidence. The mislabelled reconcile test was relabelled a guard and a real new proof added. Panel closed after round 2.
