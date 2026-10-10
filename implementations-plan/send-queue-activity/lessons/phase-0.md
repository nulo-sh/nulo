# Phase 0 — planning consults

Every consult of the planning run, failed ones included.


## Recon (2026-10-10)

- Three Explore agents (sonnet), read-only, plus the driver's own read of the ordering code and the sixteen issues. Findings in [recon.md](../recon.md).

## Round 1: dual audit of plan v1 (2026-10-10)

- **Codex** (gpt-6.1-sol, high, read-only, default `~/.codex` login; session `01a1238d-12f6-7f81-89e6-688c19af6a2e`). The wrapper reported its sandbox as `approve-for-me` (host config), although read-only was passed; no file outside the plan changed. Verdict: **reject**, 13 findings, every one accepted. Dispositions are in plan.md § Audit verdicts.
- **Opus** (Plan agent, model opus). Verdict: **conditional approve**, 14 findings. Thirteen were accepted. The shared take-turn helper was rejected (D14).
- **What changed in v2:**
  - the opaque `*` key became a waiter that blocks nothing;
  - plain re-queue became park with a kept reservation, in per-origin order;
  - the stored-row floor became in-memory observations held 60 s;
  - tip reads moved out of the slot and the chain guard;
  - foreign journal events no longer cause side effects;
  - #218 moved to arc 1b behind OA-3;
  - OA-4 was added for the router hold;
  - arc 3a gained wallet-core contracts and receipt-first evidence.
- **Lesson:** a sequencer that only delays still changes what a person and a dApp see (longer Queued, later answers, per-origin order). Check every new wait against the owner's recorded rule before calling it decision-free.

## Round 2: final fresh Codex pass on plan v2 (2026-10-10)

- **Codex** (gpt-6.1-sol, high, read-only, default login; fresh session `01a123aa-a95f-7931-b905-9d1b907820c7`). Verdict: **reject**, 8 findings, all accepted after checking the source. Dispositions are in plan.md § Audit verdicts.
- **Lesson:** the Aztec JSON-RPC client synthesizes error objects for transport failures (`safe_json_rpc_client.ts:183-204`). An error's shape never proves that the server refused. Read the evidence at the HTTP layer.
- **Lesson:** a send-check that reads the receipt before chain time can call an included tx expired. Read chain time first.

## Round 3: resumed final pass on plan v3 (2026-10-10)

- **Codex**, same session `01a123aa-…`. Verdict: **reject**. Six of round 2's eight findings were resolved. The four remaining findings were all accepted: a leftover "receipt-first" line, a reverted receipt treated as terminal before finality, FPC validation dropped by the pin, and a stale OA-1 line.
- **Lesson:** pinning a resolved dependency must pin its validated form, here `getFpcImpl`'s decorated and guarded `Fpc`, never the raw id, type and address. Otherwise the pin silently drops the guards the lookup enforced.

## Round 4: resumed final pass on plan v4 (2026-10-10)

- **Codex**, same session `01a123aa-…`. Verdict: **approve**. All four round-3 findings resolved; no new material finding.
