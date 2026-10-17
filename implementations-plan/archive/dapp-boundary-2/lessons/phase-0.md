# Phase 0: planning consults

Every panel consult, its verdict, and what changed.

## 2026-10-17 recon

One Sonnet explorer over five capabilities (typed refusal channel, key derivation, chain check, discovery rollback, collisions). The planner re-read every load-bearing claim. Added by the planner: a waiting duplicate of the same pair rides the row after a not-landed approval today (`approveAfterPopup`), so the rollback refuses it, as the expired exit already does (A2).

## 2026-10-17 Codex round 1 (gpt-6.1-sol, high, read-only)

Verdict: `conditional approve`. Five points, each checked against the tree:
1. Medium, demonstrated: a second tab's discovery that arrives after the row is written but before its approval lands finds the row and is auto-approved as a returning app (`background.ts:944-969`), ahead of the dedupe guard (`:989-995`); a rollback then deletes the row and the teardown ends that tab's channel. True today for the expired and abandoned exits too. Accepted: the dedupe guard is read before the returning-app branch (D4).
2. Medium, demonstrated: a tab waiting on the pair's window inherits the row today when the first approval does not land; deleting the row refuses it. A behaviour a person notices, so not the panel's call. Accepted by design: D3 keeps the row while a discovery waits on the window, so that behaviour does not change and no owner ask is needed. Narrowed: the Connected apps row the arc stops writing is the lane brief's recorded change (UI impact: none), quoted under UI impact.
3. Low, demonstrated: "every method answers 4901" overstates D2, which keeps capability, parse and scope first. Accepted (wording); the refusal table gains the empty manifest and the empty batch, and one test shows a later batch leg is checked again.
4. Low, plausible: if `setCapabilityGrants` throws after the row write, nothing deletes the row. Accepted: a local best-effort rollback with one injected-failure test (same invariant, same function).
5. Low, demonstrated: protocol addresses 0-6 return before any check and register nothing. Accepted (wording).

## 2026-10-17 Opus Plan leg (opus, read-only)

Verdict: `conditional approve`. Eight points, each checked against the tree:
1. Medium, demonstrated: the shared `stubNetwork` (`dispatcher.test.ts:77`) returns no network and backs every route D2 newly refuses, so about 40 tests would fail. Accepted: those sites get a serving reader; their assertions stay.
2. Medium, demonstrated: `NuloAccount.new` crashes under jsdom (`apps/extension/vitest.config.ts:53-75`). Accepted: node environment, `.real.test.ts`; `CompleteAddress` from the mocked module and `equals` on the derived address so the class-id harness needs only its mock edit.
3. Medium, demonstrated: same as Codex 1. Accepted (D4), with the Terms check kept ahead of the wait and no yield between the lookup and the read of the pending window.
4. Medium, demonstrated: the commonest not-landed case is a reload of the tab while the window is open; the reloaded page waits on the window and connects on the Allow today. Accepted: D3 keeps a waited-on row. The waiter's own failure is a known limit.
5. Low, demonstrated: D1 is complete for a named address; two residuals of the same cost class remain under grants a person can give. Reported to the orchestrator; kept out of committed text.
6. Low: UI impact must list the two surfaces with before and after. Accepted.
7. Low: the marker-order assertion is unobservable (dropped); name `tokenRegistryReader` and `applyCapabilityDecision`; note that a batch is checked before its legs. Accepted.
8. Low, pre-existing: `queued-journal.ts:145` reads the raw network. Disposition: no change; Activity shows only the active network, and a quarantined active network shows the takeover.

## 2026-10-17 Codex final pass (fresh session, gpt-6.1-sol, high, read-only)

Verdict: `conditional approve`, then `approve` on the resume. Points, checked against the tree:
1. Medium, demonstrated: the notice registers in the same pending map, and a remembered row outlives a notice (`background.unserved-chain.test.ts:204`); D4 as written would hold its reconnect until the notice closes and skip the reconnect budget. Accepted: each entry carries its kind and D4 applies to a pending `connect` only; test (e).
2. Low, demonstrated: the waiter count does not prove a page is still there. Accepted: the known limit covers a dropped waiter; liveness tracking rejected (a lifecycle).
3. Low: keep the notice behaviour, so no new ask. Agreed.
4. Low: D5 must keep the grant error when its cleanup fails. Accepted.
5. Low: keep the tag on the existing map; no registry or timer. Agreed.
Resume verdict: `approve`, no new material point.
