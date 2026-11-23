# Phase 1: move, compose, guard

## Consults

- **Codex plan pass** (`gpt-6.1-sol`, high, read-only), over the plan at 4d62d8c92. Verdict: revise before implementing. Four findings, each verified against the tree: the debug panel's `.details_box` would gain the shared narrow-width `column-gap` (verified in the base build's tx chunk); `a11y-css.test.ts:175` names the old path; the ban must read the `~/` and `src/` aliases and `.scss`; the proof must render the estimate-only fee row, the static From card and both navigation orders. It confirmed the content-based scoped names in the installed Vite, the six carriers and the fee-rule order, and found no other equal-specificity flip.
- **Opus Plan lens**, same plan. It added: a copy that drops its own role reds `type-role-ban` (its reviewed list is empty and it reads no cross-file chain); composer hashes cover the composer's own block, `from` path included, so the move cannot be byte-identical for composers; a rule's second `composes` needs a control. It rejected no decision.

## Attempts

- **The move alone, Chrome build.** Every one of the 128 CSS files matches base once composer names are normalised (`_<local>_<hash>_<line>` → a placeholder, keyframe names included). The shared sheet's `_cbymy_` names are unchanged, as the content hash predicts.
- **Copies composing without their role.** `type-role-ban` reported every `trimAddress(` under `TxHashRow`, `TxDebugPanel`, the tx page and the received page. Fixed by keeping `composes: type--<role> from global` first in each copy's own rule.
- **The ban test.** Green on the tree; red when `TxHashRow`'s `detail_link` composes from `../../../pages/detail-page.module.css` again (mutation reverted).
