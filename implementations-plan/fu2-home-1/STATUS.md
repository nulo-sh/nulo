# fu2-home-1 status

- 2026-11-02: recon done (2 Sonnet explorers); base `1e6c5bc1f`. Filed #1523 (P93-02), #1524 (P93-25), #1525 (P93-44), #1526 (P93-62), #1527 (P93-41): no issue existed for any item.
- 2026-11-02: measured the header, Home's hero and onboarding at 360, 320 and 240 px on the armed Chrome build (scratch spec, deleted): the 360 row is 11.3 px short for Local Network; onboarding stays 320 px wide at 240.
- 2026-11-02: plan drafted (tier light, two arcs); two owner asks on arc 2's surfaces (OA-1 the red dot's word, OA-2 room at 360 px); panel next.
- 2026-11-02: panel round 1: Codex reject (D1 record order and stale toast, D4's residual, I2 false, keyboard copy, icon clearance, long names); all folded. Opus leg pending.
- 2026-11-02: panel: Opus Plan leg conditional approve; five new findings folded; final Codex pass next
- 2026-11-02: final fresh Codex pass: conditional approve, folded, approve on resume. Plan approved; arc 1 next.
- 2026-11-02: arc 1 gate: lint, typecheck:all, vitest list, test:all, armed builds, smoke e2e Chrome (one red fixed: snackbar still-pointer premise) and Firefox, all green at retry 0.
- 2026-11-02: arc 1 Codex loop: r1 reject, r2 reject, r3 approve; Opus diff review folded.
- 2026-11-02: arc 1 final gates on the converged head: lint, typecheck:all, test:all, both armed builds, smoke e2e Chrome 274 s and Firefox 403 s, all green at retry 0.
- 2026-11-02: arc 2 begun off dev (b21fcdac8). OA-1 B and OA-2 A recorded; P96-02 F, P96-03 D and P99-02 G added as D11-D13; filed #1563, #1564, #1565.
- 2026-11-02: arc 2 red at the base (21 cases on their assertions), then green; lint, typecheck:all and the vitest list (167 files) green at retry 0. Base smoke e2e Chrome 437 s (11 files, green).
- 2026-11-02: base smoke e2e Firefox 591 s (11 files, green; rerun with the base e2e files after the first read 665 s with two new scenarios in it).
- 2026-11-02: arc 2 gate green at retry 0: lint, typecheck:all, test:all, both armed builds, smoke e2e Chrome 413 s (base 437 s) and Firefox 590 s in two batches (base 591 s), network type-role sweep 245 s. Captures in screenshots/ (a2-*). Codex loop next.
