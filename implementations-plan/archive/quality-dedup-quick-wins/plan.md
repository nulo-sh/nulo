# Quality dedup quick wins

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Five behavior-preserving dedup changes, one per pull request: `packages/wallet-core/src/utils/error-json.ts`, the CAIP helpers owned by `packages/wallet-bridge/src/caip.ts`, `apps/extension/vite.shared.ts`, `apps/extension/src/utils/restore-error.ts`, and the removal of dead exports.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The one-day dedup findings from a whole-codebase quality audit were taken as five independent arcs, one pull request each, in order of risk: dead symbols, the error-to-JSON projection, the CAIP helpers, the Vite and Vitest config fork, the restore-error helper. Two audited items left the batch: one was already fixed by an earlier change, and a sweep that replaces about 90 active-profile reads with a throwing accessor became its own plan, because roughly 37 of them are deliberate non-throwers and a mechanical sweep could silently weaken a lock gate or change an error a dApp sees.

## Why

- The audit snapshot was a week old, so the first step of every arc was to re-verify the arc against the current tree. That re-scoping caught three arcs planned against stale code and corrected line references and a nonexistent header the plan told us to fix.
- Validation depth was selective. The network suite gated only the arcs that touch the RPC path or the e2e configs themselves, smoke gated the restore path, and unit tests gated the rest. The network and smoke aggregators report green when their jobs are skipped, so a merge required proof that the heavy jobs actually ran.
- Where two copies looked alike, the arc shared only the genuinely common part and left the deliberate divergences alone.

## What shipped

- **Dead surface removed**: two unused modules in the messaging package, three unused storage methods with their tests, an unused queue method, an unused random helper, an unused dependency, and a dead index re-export. A canary tripwire test and the live exports were left alone.
- **Error projection**: `baseErrorJson` owns only the shared name, message and stack shape. The wire format that mirrors the JSON-RPC library stays frozen, and the job-error serializer keeps its own discriminant, bigint suffix, truncation and never-throw fallback. Pins for those were added before the refactor, including the exact fallback envelope.
- **CAIP helpers**: the bridge package is the single owner of the four runtime functions and the extension re-exports them, keeping its own chain parser. A parity test checks reference identity plus a fixed vector. Ownership moves downward only.
- **Config fork**: `vite.shared.ts` holds the path resolver, defines and aliases. The two browser configs build a fresh config with `mergeConfig` instead of mutating a shared one. The all-e2e config had silently drifted from the network config and lost its native-module aliases, fork pool and retry; that is fixed.
- **Restore errors**: only the error-to-string derivation was extracted as `toRestoreError`, because the accumulation, locking and id allocation legitimately differ per service. The contact restore stored a raw error object and now stores the message, a ratified behavior change. A hard-coded deprecation message and a nested sender and contract shape are untouched carve-outs.
