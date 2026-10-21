# Phase 0: planning consults

## Recon

- Explore (sonnet), storage seam reuse sweep: every e2e storage pre-write happens after the worker's liveness; the closest whole-storage seams are `writeLocalStorage` and `writeRecording` (`fixtures/update/`); no seed pool exists (one fixed seed, `CANONICAL_SEED_24`); no generator renders onboarding rows in Node.
- Explore (sonnet), network fixture map: `registerProfile` always creates through the UI and closes its popup; `launchOnLocalNetwork` and `setupConnectedPlayground` reopen one; about 30 files drive their own onboarding, import, restore or reset; no per-file timing artifact exists on a green CI run.
- Planner, spans: `registerProfile` 5.9 % (Chrome) and 4.8 % (Firefox) of network file time; the reopen after it 0.9 s / 1.95 s per call; the mint 6.8 % / 3.8 %.
- Planner, CI noise: pool file-time SD 113 s / 123 s over the six runs `shard-timings.json` names.

## Panel, round 1

- Codex (gpt-6.1-sol, high, session 01a15f16; `run-codex.sh` routed it to the `alejo-icloud` roster account through the managed `CODEX_ACCOUNT=best`): `reject`. Blocking: the PBKDF2 count (`getPasshash` is a SHA-256), G1 sized for six runs per arm when P F F P P F gives three, and the ship rule changed without saying so. Also: K is an amendment to surface; a derived-only unlock reaches Home with a bad DEK; the probe's capture point; the renderer choice. Every claim checked against the code and held. All accepted except twelve dispatches per browser (twice the CI cost, a shard's saving still unresolved).
- Opus Plan leg: `conditional approve`. Same two corrections, plus: the launch's error arrays (K keeps the registration popup alive through the fixture), J's probe arm must inject what `createProfile` writes, J(b) out of the arc, static Firefox counts, the deviations as Asks, `setupConnectedPlayground` through `launchOnLocalNetwork`, the CI parser's limits (a failed file voids a job; only shard jobs read). All accepted.

## Panel, rounds 2-4 (Codex resumed)

- Round 2: `conditional approve`. Fresh profiles put random ids in their storage keys, so a raw key-set comparison fails even an unchanged cycle: normalize first, counts kept.
- Round 3: `conditional approve`. Network ids are random too (`_freshStored8`): the rule now normalizes every generated id by its row's stable identity, not by a list of kinds.
- Round 4: `approve`.
