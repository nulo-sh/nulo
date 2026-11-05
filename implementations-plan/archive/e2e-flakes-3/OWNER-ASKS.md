# e2e-flakes-3 owner asks

None. Phase 1 changes test code only. Phase 2 changes the fee cap a simulation runs under, which no screen shows; a token add or balance read that a fee move refused now succeeds (plan.md, UI impact).

Left out on purpose, not asked: bounding NewTokenPopup's wait for its first balance (plan.md, D5). It changes when a screen shows its toast, so it would be an owner decision of its own, and no trace ties it to these failures.
