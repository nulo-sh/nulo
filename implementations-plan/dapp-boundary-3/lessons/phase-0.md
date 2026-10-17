# Phase 0: planning consults

Every consult of the planning panel, with its verdict. Transcripts stay local.

## Round 1: dual review of the first draft (2026-10-17)

- **Codex** (gpt-6.1-sol, high, read-only; session kept locally): `reject`, two blocking points. (1) An intent route that does not name the registry: left out of this arc (it changes the inner-hash contract the owner set) and reported to the orchestrator for private tracking. (2) An inner refusal raised during the window's fee estimate shows the estimate failure and settles as a rejection: accepted, Outcome restated, OA-4. Also: the address-wide rule in `sendTx` and `simulateTx` goes beyond "grant functions" (no utility reads the switch): accepted, refuse by grant selector in `sendTx` only.
- **Opus Plan leg**: `conditional approve`. Same estimate-path point; drop the simulation leg; record the relay use as a consequence; put the decode text in the closed union; three test gaps; the connect window still offers a registry scope (OA-5); four fact corrections. All accepted.
- **Decision:** Outline A's three routes, with D1 narrowed to the grant selectors in `sendTx` and D7 leaving simulation unchanged. Outline B rejected by both legs.

## Round 2: final fresh Codex pass on the consolidated plan (2026-10-17)

- **New session** (gpt-6.1-sol, high, read-only): `conditional approve`. Four corrections, all accepted: a simulation signs its own entrypoint payload, so the guarantees name discovered witnesses only; a NO_FROM preview does not gate Confirm, and its Confirm ends in the typed refusal; the refusal tests cover every grant selector and a real effect through the real decoder; the relay disposition covers direct and discovered relays only.
- **Resume 1:** `conditional approve`: four leftover wordings and a gate that asked success controls to fail. Corrected.
- **Resume 2:** `approve`.
