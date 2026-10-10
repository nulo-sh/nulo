# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [backup-import-export](backup-import-export/plan.md) — arc 1 merged, arc 1b in review (arcs 2 and 3 wait on page 1) — one key-unseal wipe order, strict hex, migration watchdog, the restore Enter guard; heal a half-registered PXE account; a slimmer account-state slice; deleted tokens, restore outcomes, protected account files
- [account-session-life](account-session-life/plan.md) — arc 1 in delivery (arc 2 waits on R4; arc 3 waits on page 7, hold H2 and backup-import-export arc 3; arc 4 on OWNER-ASKS OA-4) — one lock per account address, an identity-checked profile activation, the passkey retry confirms, account RPC params, a deletion fence that keeps every dead generation, the unlock toast and the split reveal, the popup port's Ready handshake
- [ci-release-supply](ci-release-supply/plan.md) — arc 1 in review (arcs 2 to 4 next; arc 5 waits on page 5) — Storybook in quality-status, live e2e labels and per-head queues, folded-shard probe, hoist off, launch FILL gate, store-copy check, plans ignore shapes, nightly prune (gated)
- [incoming-transfers](incoming-transfers/plan.md) — arc 1 in review (arcs 2 and 3 wait on page 4) — receive path: trust-write fences, all-or-nothing Allow, one dedupe order; block-driven scans and receipt links after page 4
