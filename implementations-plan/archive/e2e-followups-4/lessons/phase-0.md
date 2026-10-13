# e2e-followups-4 — phase 0 (planning) log

Every consult of the planning run, with its verdict, including failed ones.

## Recon

- Explore (sonnet), reuse sweep: the nightly build recipe, the PR-lane versus artifact differences, helper contracts, soak tooling, other FPC seeds. Key finding: `global-setup-smoke.ts:72` leaves artifact runs unguarded, so they reach the live Testnet node.
- Explore (sonnet), FPC discovery and picker: the `getFpcs` callers, the discovery path, the picker's row order and keyboard focus. It concluded discovery cannot succeed in smoke because it assumed every launch holds the stand-in; the driver checked `fixtures/extension.ts:101` and `:141-151`: only a guarded launch does. Its other findings hold.

## Panel round 1

- **Codex** (gpt-6.1-sol, high, read-only; session `01a12d57`): `reject (with blocking findings: unsound classification rules, ambiguous validation gates, secret-bearing diagnostics)`. Ten findings. The driver verified the cited lines: `FeeSettingsCard.vue:598-602` (every Send mount forces a read), `fpc/service.ts:284-293` (`addFpc` stores a row at any address, so a hand-added protocol address also yields two Nulo sponsors), `chrome-rpc-intercept.ts:63-68` (the debug log and the failure strings carry the request path, which for Testnet holds the dRPC key). Dispositions in plan.md § Audit verdicts.
- **Opus** (Plan lens, opus): `conditional approve (with conditions: fix the fallback's "I1 refuted" branch; check the never-happens assertion at the end as well as at P2 and prove it can fail; run Phase 1 the way the skill reproduces CI)`. Nine findings; the driver checked `chain-runtime.ts:267` (`createPXE` for non-proverless builds), `seeder.ts:28` (retries at 15 s and 60 s) and `SKILL.md` § Reproduce like CI (`taskset -c 0,1`).
- Driver check after round 1: `-t "the fee method picker"` would also match the file's fifth test ("…nor the fee method picker, whose first press…"); v2 uses `-t "the fee method picker: a Tab stop"`.

## Panel round 2

- **Codex** (resumed `01a12d57`): `reject (with blocking findings: overlapping classification branches, incomplete build isolation, contradictory gate criteria)`; accepted D6 and D4. Six findings, five accepted, one in part: its explicit-empty build flags were rejected after the driver read `network/service.ts:95` (`?? "http://localhost:8080"` keeps an empty string). The driver checked: no `.env*` in `apps/extension` or the root, no `envDir` in the Vite configs.
- **Opus** (resumed): `conditional approve (with conditions: pin the negative control …)`; three findings, all accepted.

## Panel round 3

- **Codex** (resumed `01a12d57`): `conditional approve (with conditions: make UNARMED executable and remove rule 4's unsupported causal conclusion)`; three findings, all accepted (v4).

## Panel rounds 4 and 5

- **Codex** (resumed): `approve` on v4. **Opus** (resumed): `approve`, one low finding (a slot-0 red in another test would stop Phase 1), accepted. **Codex** (resumed) on that edit: `approve`.
- Codex session `01a12d57-4449-77d0-9910-d7885162b6e0`, five turns in all, every one on gpt-6.1-sol at high, read-only; no consult failed.
