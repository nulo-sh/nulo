# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [backup-import-export](backup-import-export/plan.md) — arc 1 merged, arc 1b in review (arcs 2 and 3 wait on page 1) — one key-unseal wipe order, strict hex, migration watchdog, the restore Enter guard; heal a half-registered PXE account; a slimmer account-state slice; deleted tokens, restore outcomes, protected account files
- [incoming-transfers](incoming-transfers/plan.md) — arc 1 in review (arcs 2 and 3 wait on page 4) — receive path: trust-write fences, all-or-nothing Allow, one dedupe order; block-driven scans and receipt links after page 4
- [send-queue-activity](send-queue-activity/plan.md) — planned, awaiting orchestrator approval (arc 1 decision-free; arcs 2-5 wait on pages 9 and 10) — dApp sends ordered behind earlier sends, fee spender kept across restarts, chain-tip gate; send outcome states, feed surfaces, Send keyboard reach
