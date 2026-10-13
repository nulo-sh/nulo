# Phase 0: planning log

## Recon (2026-10-09)

- Two Explore agents on sonnet: a batched reuse sweep (nine capabilities) and a session-lifecycle mapper. Both returned; findings are in `../recon.md`.
- The driver re-read every cited line. Claims that moved or did not hold are in recon.md § Claims.
- Probe: `schemas.AztecAddress` accepts a Buffer-shaped object with an own `toString` key, and `String()` of it throws (#89 item 9). Run with `bun` against the workspace's `@aztec-labs/stdlib`; the trailing `real-require` worker error is pino's, unrelated.
- Upstream check: `@aztec-labs/wallet-sdk` 6.0.0-rc.1 has no discovery rejection message; `rejectDiscovery` replies nothing. This decides #125 and the shape of #199.
- `deleteExpired` sees only the active profile's rows (MAC key derivation is active-profile only), so #228's real cross-profile paths are a profile purge and a refusal for another profile's row.

## Consults

Each consult is logged below with its verdict.

### 2026-10-09, dual audit, leg 1: Codex (gpt-6.1-sol, high, read-only)

- Verdict: **reject**, with blocking findings: revocation can race restamping; strict decoding bypasses establishment cleanup; arc and approval gates contradict the charter. 12 findings (4 High, 8 Medium).
- Driver verification, each against the tree: 1 (decode before `try`, `session-established.ts:74`) holds; 2 (Connected Apps renders `g.capability.type` raw) holds; 3 (`getValues` verifies across awaits) holds; 4 (`patchOrVerifyEntry` keeps a loose entry) holds, scope npm consumers only; 5 (throwing `terminateSession` leaves the session live: upstream posts before it deletes) holds; 6 (`failQueuedIfUnclaimed` drops the transition outcome) holds; 7 (`closing` has no timer; `closeStandby` serves three causes) holds; 8 (XOR fold aliases valid pairs) holds; 9 partly (the lane brief authorizes #88 and #228 in arc 1; the plan now states the behaviour change plainly); 10 holds; 11 partly (H5's issue list excludes #128, SR7 settles it; the C11 mapping was missing); 12 holds.
- Fixes applied to plan.md, OWNER-ASKS.md (items 3, 4 qualified; item 7 added); dispositions in plan.md § Panel.

### 2026-10-09, dual audit, leg 2: Opus (Plan agent, opus)

- Verdict: **conditional approve**, 7 conditions (retitle in the failing write; expiry-only overlay with an immediate tombstone; u32 bounds and decode inside the `try`; "Off always succeeds"; unquoted visible effects to OWNER-ASKS; arc 1 deliverable alone; e2e success controls for #89 and #84). 12 findings plus fact corrections.
- Driver verification: all hold against the tree. Two dispositions differ from the condition as written: the `version` u32 bound exceeds P3-03's signed bounds, so it became an option on OWNER-ASKS item 4; the background wiring test for #228 is rejected (a wrong map can only fail closed).
- Overlap with Codex: C1/O3 (decode outside the `try`), C6/O1 (retitle race), C7/O2 (expiry vs other causes), C12/O6 (delivery order). Opus alone found the authwit binding, "Off always succeeds", the missing `session_ended` detail label, the marker tombstone delay and the per-grant #84 rule; Codex alone found the throwing-termination restamp, the loose schema entry and the C11 mapping gap.

### 2026-10-09, final fresh pass: Codex (gpt-6.1-sol, high, new session)

- Verdict: **reject**, with blocking findings: marker ownership remains ambiguous under id reuse; refusal-title plumbing and provenance are incomplete; the expiry E2E exercises cancellation. 8 findings (3 High, 5 Medium) plus 2 Low notes.
- Driver verification: all hold. `schemas.Fr.parse` is synchronous (probe from the scratch dir: `0x100000000` and `0x20000000000001` parse, `abc` and `-1` throw), which retired the plan's hand-written field check. F6 reverses round 1's O9 rejection: a typed parameter cannot prove the same map instance.
- Run note: the wrapper printed `sandbox=approve-for-me` and the `alejo-icloud` account home although `read-only` was passed and no `CODEX_ACCOUNT` was set. `git status` showed no change outside the staged plan files after the run.
- Fixes applied; the same session resumed for confirmation (result below).
- Resume 1: **reject** (1 High: on an id mismatch the old callback's cleanup still settles and terminates by id; 1 Medium: no browser proof for #124's navigation; 1 Low: two leftover "no malformed row" claims). All accepted and fixed.
- Resume 2: **approve**, no new material findings. The final pass converged in three rounds.
