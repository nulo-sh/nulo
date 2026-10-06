# Dedup: design-system duplication

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the shared CTA typography rule in `packages/design/src/ui/Button.vue`, and a single cross-axis computation for tooltip placement, which now lives in `packages/design/src/ui/tooltip-placement.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Remove two duplications flagged by the duplication audit, with zero visual or geometric change.

- **Button**: the three CTA variants (`cta`, `cta_outline`, `cta_destructive`) each declared the same seven typography and sizing properties. One comma-joined rule now carries them, and each variant keeps only its colours, fill, border and hover or active states.
- **Tooltip**: the center, start and end cross-axis switch was identical for top and bottom, and for left and right. A small cross-axis helper computed it once, called from each side's main-axis branch. Tooltip placement has since moved into `tooltip-placement.ts`, which keeps that one `crossAxis` helper.

## Why

The CTA typography lived in three places that could drift apart, and the tooltip switch in four. Both are mechanical, locally verifiable and sit outside any trust boundary.

A shared selector was chosen over a new CSS class so that no template, consumer or public class name changes. `border` was deliberately left out of the shared rule because it differs between the variants.

## What shipped

The refactors above, under the existing design tests and the Storybook build, which cover the visual surface. No end-to-end run was needed because no extension behavior changed. The work was reviewed as plan plus complete diff in one pass instead of two, since both changes were fully specified and algebraically identical to the code they replaced.
