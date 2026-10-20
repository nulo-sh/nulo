# Phase 0: planning consults

- 2026-10-19 recon: one Sonnet Explore (reuse sweep); no spec makes a later profile and reads Home's card; no Chrome spec makes a later passkey profile (the toolbar-panel ones are Firefox-only).
- 2026-10-19 Codex round 1 (gpt-6.1-sol, high, read-only, session `01a153c3`): `conditional approve` — activation order, the signed lifecycle, D3/F5 wording, the later-passkey e2e step, the lock watchdog. All taken except a composable change-event case (redundant with the `KEYS` pin).
- 2026-10-19 Opus 5.5 Plan: `conditional approve` — shared e2e fixture, import-then-create named, later-passkey step dropped for a Firefox own-window assertion, one create helper, test trims. All taken except a flag-name map in the service.
- 2026-10-19 Codex round 2 (resumed): `conditional approve` — prove the deleted profile's key goes (purging delegate); capture spec copied into tests/e2e for one run. Round 3: `approve`.
