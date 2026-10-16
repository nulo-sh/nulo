# Phase 0: planning consults

## Recon

- Two Sonnet Explore agents: a reuse sweep over eight capabilities, and an e2e/theme/accessibility map. Both returned; findings in [recon.md](../recon.md).
- The second found that no smoke e2e opens the execute window and no component test mounts a theme; both lane-brief expectations were rewritten in the plan's "Claims that did not hold".

## Panel round 1 (2026-10-15)

- **Codex** `gpt-6.1-sol` at `high`, fresh session, the full audit packet over plan.md, OWNER-ASKS.md and recon.md. The host ran it in approve-for-me mode on the `alejo-icloud` roster account (the script's `best` pick). Verdict: `conditional approve` (correct R1's risk disclosures, preserve sender and unit semantics, repair the validation plan). Nine findings, all checked against the tree and accepted:
  1. C1 hides decoded amounts, burns and commitment transfers on added tokens included (demonstrated: `OperationCard.wire.test.ts` keeps those decoded).
  2. A, D and E broke the at-rest notice rule; E was misdescribed as repeating items.
  3. The line dropped "base units" (`amountLabel` without symbol) and "Caller: none" (NO_FROM, two-argument transfer); Fact 3 overstated the `hideMsgSender` fall-through.
  4. Sanitising is not semantic trust: an app name can still read "Transfer (private)"; state the limit.
  5. A `defaultOpen` read once at mount keeps a pending→raw row closed (plausible; rows mount pending).
  6. `type-roles-windows.test.ts` `openExecute` would stall on a collapsed decoded value; the identifier inventory must follow moved expressions.
  7. No browser run renders a wallet-read line.
  8. The facts test's whole-DOM search cannot see a lost caller; no depth measured.
  9. "Today" showed "this account (Main)" where an explicit `from` renders "Main".
- **Opus 5.5** `Plan` agent, the same packet. Verdict: `conditional approve`. Eight findings, all accepted; beyond Codex's: the wallet's transfer label lands on any contract by name (`tx-enrichment.ts`), so C would title a closed, unread row in the wallet's voice (→ R1 part 2); `tx-transfer-row.test.ts` reads transfer rows at rest; `surfaces.expected.json` needs any new `.vue`; B was unfairly drawn without the authorization lines; helpers belong in `call-surface.ts` and the rows can stay inline (no `PayloadRow.vue`); authorization rows keyed by index could show a stale address after a re-estimate (plausible, fixed locally by keying on the message hash); the shared files with send-fees-ux.
- Dispositions: the plan's ledger D1–D10.

## Panel round 2 (verification)

- Codex resumed in the same session with the fix summary. Verdict: `conditional approve`, four new findings, all accepted (plan ledger D11–D14): part 2 through `callName` would have reached the `createAuthWit` card and dropped "Claim Fee Juice"; A and E put an undecoded authorization's raw values three presses deep; the line helpers had no token metadata for units; no browser run showed a discovered-authorization line.

## Panel round 3 (verification)

- Codex resumed again over D11–D14. Verdict: `approve`, no new material findings.
