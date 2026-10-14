# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [backup-import-export](backup-import-export/plan.md) — arcs 1, 1b and 2 merged; arc 3 planned (restore reminder and Restore again, network names, protected account file) — one key-unseal wipe order, strict hex, migration watchdog; a slimmer account-state slice; restore outcomes and a partial restore, protected exports
- [account-session-life](account-session-life/plan.md) — arc 1 in delivery (arc 2 waits on R4; arc 3 waits on page 7, hold H2 and backup-import-export arc 3; arc 4 on OWNER-ASKS OA-4) — one lock per account address, an identity-checked profile activation, the passkey retry confirms, account RPC params, a deletion fence that keeps every dead generation, the unlock toast and the split reveal, the popup port's Ready handshake
- [e2e-harness-gaps](e2e-harness-gaps/plan.md) — arcs 1a, 1b, 2 merged; arc 3 in review — run isolation through the host port registry (G1), unproven waits and skips, the e2e type gate, NO_FROM and private-transfer coverage, ESM configs
- [forms-and-contacts](forms-and-contacts/plan.md) — arc 1 merged; arc 2 in review (#282); arc 3 waits on page 11 — logger level gate, config persist order, form popup depth, trimmed name checks, logs newline; held-read list pins and shared shells; contacts import guard, name cap, destructive red, detail pages, motion
- [incoming-transfers](incoming-transfers/plan.md) — arc 1 in review (arcs 2 and 3 wait on page 4) — receive path: trust-write fences, all-or-nothing Allow, one dedupe order; block-driven scans and receipt links after page 4
- [chain-endpoints](chain-endpoints/plan.md) — arc 1 in review (arc 2 waits on page 12) — a smoke suite that reaches no outside host; node-URL hidden characters, the extension CSP, the price hero after page 12
- [dynamic-token-list](dynamic-token-list/plan.md) — approved, arc 1 next (P1) — a signed token list at tokens.nulo.sh replaces the built-in seeds; CI signs it in a gated environment, the wallet fetches it after onboarding and daily (#79)
