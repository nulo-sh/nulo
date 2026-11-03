# Phase 0: planning consults and probes

## dRPC batch probe, 2026-11-03 18:51 UTC

A Bun script posted JSON-RPC batches of 25, 26 and 100 entries, each `aztec_getNodeInfo` and then `aztec_getBlockNumber`, to `https://aztec-mainnet.drpc.org` and `https://aztec-testnet.drpc.org`. Every request answered HTTP 200 with every entry answered and no error entry (12 of 12). The free plan enforces no limit at 25, 26 or 100 today; 25 is dRPC's stated limit (the owner, 2026-11-03), so the cap follows the statement, not the edge.

## Codex plan audit r1, 2026-11-03 (gpt-6.1-sol, high, session 01a1a2c7)

Verdict: changes required, four findings, all verified against the tree and accepted. (1) The read-path deletion must re-check profile, chain, type and canonical address under the lock and commit only while the reading session is live: an address edit or a lock between the snapshot and the lock would otherwise lose a hand-added payer or write after the session. (2) A saved Sponsored pick keeps previewing its saved label on Send (`previewForPick`) and pre-fills the app windows: demonstrated. Codex offered an owner ask or a narrowed outcome; the plan instead forgets the deleted row's picks through the same `forgetFpc` update Settings' delete uses, leaving a one-time preview on the first card after the update. (3) Backups carry no FPC rows (an `fpc` slice is refused): the backup claims were wrong and are dropped. (4) The README standard wants one fresh foreign pass over the final combined change: added. Picks: D1 new light module (no Biome ban), D2 allow-list (no ask), D4 a boolean computed by the card with an explicit `undefined` guard, D5 returned ids, D6 sound, D7 agreed.

## Codex plan audit r2, 2026-11-03 (resumed)

Verdict: changes required. (1) The forget is not guaranteed: a lock between the delete and `saveFeePick`, or a storage failure, leaves the picks, and no later read retries; the plan now calls it best effort, adds a refused-forget test, and rejects a durable retry. (2) A mounted Send card keeps the picks it read, so an identity switch can preview the label again: recorded as Fact 9. (3) Accepting the remaining preview is the owner's call, not the panel's: filed as OA-1 with A as what ships now. (4) The `FpcService` → `UiPreferenceService` dependency is proportionate (no new state, lifecycle or contract); call it after the FPC lock is released. Because OA-1 concerns arc 2's surface, the cap became arc 1 so it can run now.

## Codex plan audit r3, 2026-11-03 (resumed)

Verdict: changes required, four findings, all accepted: arc 2 must wait for an explicit OA-1 answer rather than default to A; OA-1's A overstated "at most the first load" and C "every card"; B must name both preview paths and the live identity's read list; the `/goal` seed must allow arc 1 to be merged before arc 2 closes.

## Codex plan audit r4, 2026-11-03 (resumed)

Verdict: approve; no remaining material finding. Arc 1 may proceed; arc 2 stays gated on OA-1.

## OA-1 answered B; Codex plan r5 and r6, 2026-11-03 (gpt-6.1-sol, high, session 01a1a306)

The owner picked B on decision page 106. The page's signed wording ("shows no saved label until the fee list has confirmed that method is available") is stricter than OA-1's B text on an unread or failed list; the plan builds the signed wording (D9). r5, changes required, three findings, all verified and accepted: an app selection carried over an identity switch bypassed a pre-fill-only hold, so the app windows now gate what their rule book exposes while pending (D8 revised, simpler: no preview map); the hold covers pending selections only, so a list retained after a failed refresh still pays (a rejected-read test plus the existing control); two comments the hold makes false. r6, resumed: approve, no new findings.
