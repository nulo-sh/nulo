# Phase 0: planning log

## Recon

- One explorer (sonnet), read-only, over eight capabilities: the spec's helpers and testids, the seeds and rename order, the header chip and its measures, run-to-run variation, PNG compare tooling, other capture tools, the runner, and what could leak into a frame. Findings in [recon.md](../recon.md). It flagged two things the plan did not yet hold: the approve frame's "SANDBOX" label (unchanged from the signed set) and the missing `@requires-proverless` marker (the documented command passes `NULO_E2E_PROVERLESS=1` anyway).
- Lane-brief claims checked against the tree: #945, #986 and #1334 show in no frame (plan F3); `e2e:agent` runs from the root, not `apps/extension` (F5). The header claim (#1369) holds.

## Probe run (2026-10-30, base `9fba3c295`)

- `STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts`: exit 0, test 109.5 s, run 159.8 s, longest silence 25.4 s. `revealCutActivityRow` 58 px, `clearAmountLine` 46 px.
- `bun scripts/store-art.ts`: five frames changed, the tile byte-identical to the committed file.
- Looked at all ten changed PNGs and the tile with Read. Each its intended screen (no import, reveal or phrase screen), no `https://`, no Manage networks page; TESTNET whole with its dot inside the chip; the Lock chip a padlock alone. The approve frame reads `http://localhost:29575` (#806's full origin, the run's port).

## Panel

- Codex round 1 (gpt-6.1-sol, high, read-only): conditional approve, 5 findings, all accepted after checking each against the tree (`agent.sh:105-123` for the wallet clocks; the local seed's `http://` URL in the run log). Dispositions in plan.md § Review verdicts.
- Opus Plan leg: conditional approve, 6 findings, all accepted after checking `fixtures/aztec.ts:146` (Alice from the sandbox's initial accounts) and the run log's `[resolve-ports]` line (node `:15469`, playground `:29575`).
- Gates run at planning, at base `9fba3c295`: `bun run lint` exit 0; `bun run typecheck:all` exit 0; `bun run test:all` exit 0 (extension 952 files, 16,420 tests passed); `scripts/store-listing.test.ts` and `scripts/store-icons.test.ts` at retry 0, 12 passed.
- Codex final pass (resumed session): approve, no remaining material finding.
