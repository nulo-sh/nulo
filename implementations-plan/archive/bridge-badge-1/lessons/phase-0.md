# bridge-badge-1: phase 0 (planning)

Consults and verdicts, in order. Transcripts stay local; each accepted or rejected finding is recorded in `plan.md`.

- 2026-11-19, measurement: Shield's `icon.svg` is 13,238 characters as a list picture; integer-rounded coordinates still leave 5,434. The raven cut from Raven House's wordmark is 2,442 characters (2,578 on a white disc); both pass the picture rule's element and token checks.
- 2026-11-19, verification: Shield's contracts page names "Clean WETH (cWETH)" at the list's cWETH address; read from the page source, not only a summary.
- 2026-11-19, Codex round 1 (`gpt-6.1-sol`, high): conditional approve; five findings (threading misses `ContractChip.vue:79`, `TransactionCardLayout.vue:131`, `ActivityRowCard.vue:43`; digest-binding test; removal test; two-browser look at the outline; withdrawal wording). All verified and accepted. It also caught two wrong recon line citations.
- 2026-11-19, Opus round 1 (Plan): conditional approve; argued the per-entry picture beats the `bridges` table, the outline is a visible decision for the owner (halo on chips and hovered rows), required lookup fields so `tsc` finds every builder, and an e2e override instead of a shared fixture change.
- 2026-11-19, Codex follow-up (same session) on the D1 dispute: changed its recommendation to the per-entry `bridgeIcon`; agreed the outline is an owner ask; accepted the rest with one test added (chip through `readContract`).
- 2026-11-19, final fresh Codex pass (new session, `gpt-6.1-sol`, high): conditional approve on one condition (`bun run audit:vue` in the Phase 2 gate) plus three fact fixes (F2, F9, F10's citation) and identical signing inputs for the compatibility proof. Applied; the resumed session answered `approve`.
