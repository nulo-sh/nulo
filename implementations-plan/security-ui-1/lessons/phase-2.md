# Phase 2: the export page (Arc 2, #34, option D)

## Phase 2.1

- **`confirm_color: "red"` never made a button red.** ConfirmPopup binds it as `:type` on the design Button, which declares no `type` prop, so it lands as an HTML attribute; only the pre-title reads it ("Irreversible"). Every destructive confirm in the wallet renders its confirm button in the accent colour. Recolouring them through that field would change eleven confirms on nine pages without sign-off, so the export page passes a new opt-in `confirm_variant` instead.
- **`cta_destructive` does not fit a half-width row at medium.** The CTA rules (`.wrapper.cta_destructive`, defined after `.wrapper.medium` at equal specificity) win on font size, tracking and padding: 14 px, 0.2 em, `padding: 20px 0`. "Download anyway" clipped to "OWNLOAD ANYWA" in the first shot. The compact CTA size (12 px, `padding: 14px 0`) fits, edge to edge. Flagged to the owner as a render note.
- **Mutation check.** Removing each guard fails exactly its test: the disabled binding (password ready-state test), the click handler's `canDownload` (the reached-before-encryption test), the writer's plain-file refusal (the in-place switch test), the confirmation itself (four passkey tests).
- **A stale untracked `apps/landing/src/generated/release.json`** (no current code reads it) failed `biome check` inside `audit:vue`. Moved out of the worktree; never committed.
- **Gate.** `audit:vue` passed on the second run (the first failed only on that artifact).
