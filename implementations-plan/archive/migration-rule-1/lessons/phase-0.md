# migration-rule-1: phase 0 (planning) consults

## Round 1 (2026-10-19)

- **Codex** (`gpt-6.1-sol`, high, read-only; session `01a15594-7e1e-7b72-a5fa-7b1acd1e0a5e`): **reject**. Blocking: (1) a profile codec hides a row that today opens derived-only (`profile/service.integration.test.ts:4150`); (2) `frozen` in the generated file can switch R2/R4 off; (3) the input-mode emitter misses output transforms (`token-balance/spec.ts:66`; zod `json-schema-processors.ts:526`); (4) R3 "twice" is restart stability, not idempotency (`registry.test.ts:35` rewinds the marker); (5) D3 contradicts A3's "every key registered" (`nulo:schema:version` is written on every boot); (6) OA-2's premise is false (`migrator.ts:244` → `runtime.ts:409` → terminal copy, no migration needed); (7) hand-guard twins change decode semantics (legal history, seeder tombstones, clocks, pin normalisation, restore-outcome deletion); (8) Firefox storage prefs are not update evidence; (9) "nightly" had no wiring; (10) same-origin checksums authenticate nothing; (11) a missing MAC does not prove "before 1.0".
- **Opus** (Plan agent): **conditional approve**. Same core (hand guards and the profile stay read paths; decoded-output goldens; `frozen` from the pins; OA-1, OA-2 facts), plus: the backup path in neither R3 nor the snapshot; A4's post-bump re-run cannot populate a 0.31.0 (rc.3) build against a 6.0.0 sandbox, so capture once and replay; the flip can race a PR that re-stamped before it; record the zod version; goldens keyed by stamp.
- **Lead's disposition**: every finding accepted except the Firefox fallback wording, taken in Codex's stricter form (no prefs; stop and report), and the nightly wiring, dropped rather than built (the pre-promote run by hand is the durable step; the claim is removed). Revisions in plan.md's decision ledger.

## Final fresh pass, round 1 (2026-10-19)

- **Codex** (`gpt-6.1-sol`, high; session `01a155a8-662b-7e10-8ce2-38cb1f31468d`): **reject**. Blocking: (1) a key-set test lets a described schema drift from its writer (types, optionality, nesting); (2) R3 skipped every shape a migration wrote, so a migration could drop an optional field unseen; (3) "the schema is the read code" ignores key identity (applied after parse) and `DappSessionMacStorage`'s MAC (verified over every field but `mac`; a mismatch deletes the row). Also: the replay's Testnet reset purges no populated sandbox rows (an evidence gap, to be stated); gate commands lacked `NULO_E2E_RETRY=0`, the candidate build and a real idempotency check; the Firefox mechanism belongs before A1's PR.
- **Lead's disposition**: all accepted (D19). Verified: `entity_storage.ts` applies key identity after `parse`; `mac-storage.ts:32-38` signs and verifies the row without `mac`; `vitest.e2e.network.config.ts:24-28` retries twice unless `NULO_E2E_RETRY` says otherwise. Testnet history needs a Testnet node no e2e has; stated as the gap.

## Final fresh pass, round 2 (resumed)

- **Codex**: **conditional approve**: (1) a healthy imported account is resealed and re-created by the reset, not dropped (`S/account/service.ts:460-500`: only an unreadable key returns `null`); (2) the snapshot must carry the read metadata (`read`, key-identity options, `authenticated`, `engine`) and refuse downgrades; (3) a shared candidate cache can mix worktrees; (4) `stale-network-reset.test.ts` does not cover notes, tokens or sessions. All accepted (D20); verified (1) in the tree and (4) against `S/network-reset/service.composition.test.ts:328,381`.

## Final fresh pass, round 3 (resumed)

- **Codex**: **approve**, no remaining material finding; verified the reseal expectation, the snapshot's read metadata and downgrade rule, the run-owned candidate path, and the composition coverage (real MAC-wrapped sessions).
