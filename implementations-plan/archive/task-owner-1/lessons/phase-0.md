# Phase 0: planning consults

## Recon

- One Sonnet explorer (reuse sweep: fence checks, call-site scans, test helpers, registry readers, the untracked-task idiom, optional-parent signatures) plus the lead's trace of every root-creation site. Persisted in `recon.md`.
- Reproducer written in `auth-registry/service.test.ts`: red at `9c913679b`, its control green.

## Round 1: Codex (gpt-6.1-sol, high) and Opus (Plan), in parallel

- Codex: conditional approve. Six points: keep the token-parse subtask's timing (medium, accepted); the subtask methods always resolve the parent, `""` included (medium, accepted); tests for a refused balance row and for `classifyOperationCatch` with a refused handle (low, accepted); read the no-fence batch owner at entry (low, accepted); task ids are drawn against the live map (low; no change in this plan); the scan states its limit (nit, accepted).
- Opus: conditional approve. Owner first in the signature, so typecheck rejects every call not yet updated (medium, accepted); a root created during start-up, before `TaskService` learns its profile, is refused while the base inserts it (medium, verified: `ExecutionService` and `AuthRegistryService` start in phase 0, `TaskService` in phase 1; fix argued in round 2); the balance queue stores a refused id nowhere (low, accepted); test-set trims and gate additions (low, accepted); two tests build a registry that never learns a profile (low, accepted); recon's transfer row named the wrong fence (low, corrected; the entry window is argued in round 2); I1 lists every subscriber (nit, accepted); the no-fence read only when no fence and no parent (nit, accepted).

## Round 2: Codex, resumed with both reviews and the lead's dispositions

- Verdict: conditional approve. Start-up: the lead proposed a synchronous profile read at insertion (S2); Codex showed `TaskService` holds no profile service before its own `init`, and that a switch before it subscribes still leaves the other profile's tasks, so making S2 whole needs constructor binding and reconciliation. It argued for declaring `TaskService` in each creating service's `dependencies` (S4); the lead checked that neither moved service's `init` awaits anything and that no earlier service awaits them during start. S4 taken (D8).
- Stale-handle ids: Codex showed a subtask label can carry a row id, and a stale handle carries its origin and can write an error's text; the lead proposes 16-character task ids (D9), which no stored shape or test depends on.
- The owner's meaning for an RPC's arguments: agreed out of scope, stated in the plan (D10).

## Final fresh Codex pass (new session)

- Verdict: conditional approve. Conditions: F9 was wrong (the incoming-transfer outbox stores a task id), so D9 says "improbable", not "never"; the balance queue's test doubles must expose `exists`; start-up needed coverage; refused tests also assert no `onTaskUpdated`.
- Its remark that a page's calls wait for Ready led the lead to trace every entry: Ready is posted only after the whole collection starts, dApp calls are wired after `services.start()`, and no `init` creates a task. So no caller reaches a creator before `TaskService` reads its profile, and the start-up reorder taken in round 2 had no path to justify it.
- Resumed with that trace: **approve**. D8 dropped; the start-up composition test and the extra network spec were withdrawn with it.
