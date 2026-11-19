# Phase 0: recon, plan and consults

- 2026-11-06: recon by one sonnet explorer plus the planner's reads at 0bfd2c088 ([recon.md](../recon.md)). It found a third row change at the hook (`adoptOwnerless`), the shell's own subscription, and that the migration engine logs nothing per run.
- **Codex round 1** (gpt-6.1-sol, high, new session): conditional approve. Batch-then-write changed persistence order (demonstrated by control flow); the name-closure guard was weak and brittle; Fact 4 missed the boot replay; the threat model trusted stored rows; I2 pre-decided OA-5.
- **Opus 5.5 (Plan), in parallel:** conditional approve. An AST guard with one delegation hop (the `*.scan.test.ts` precedent), D4 as a per-row prefix, `id`/`profileId` kept in the harness, `SealedStoreName`/`StoredRow` typing, a mutation that can red, failures moving from `warn` to `debug`, the v1.1.0 expiry.
- **Codex round 2** (resumed): conditional approve. Record in `finally` so a rejected commit keeps its lines; keep `debug` as the brief says (reviewer agreement does not revise a brief); qualify the gate for the v1.1.0 expiry. Applied.
- **Final fresh Codex pass** (new session): approve, no new material finding.
