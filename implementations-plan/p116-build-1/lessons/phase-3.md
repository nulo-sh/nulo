# Phase 3: gates, captures, review loop

- Gates: see STATUS.md (all green at retry 0, both browsers).
- Captures: `sheet-receive`, `holdings-header` (a fitted $123,456,789,012,345.68 beside "1 token"), `flagged-holdings` (the unpriced-only "$0.00", "1 token"), light and dark, Chrome.
- Codex fix loop round 1 (gpt-6.1-sol, high, fresh session): changes-required, one finding. A lost answer after a stored rename skipped the restore, since the rename sat before the `try` (demonstrated by fault injection); fixed by moving it inside. Four comment trims taken.
- Opus review (general-purpose), alongside round 1: changes-required, three test-only findings, all taken. (1) `#my-qr-code` broke the e2e selector rule; the canvas takes `data-testid="receive-qr"`. (2) `receiveFit` had no success control; the lengthened-sheet test now reads `scrolls: true`. (3) No case refit on a count-only change; one unit case was added, and it fails with `summaryMeta` dropped from the fit's watch.
