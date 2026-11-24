# Phase 1: move, compose, guard

## Consults

- **Codex plan pass** (`gpt-6.1-sol`, high, read-only), over the plan at 4d62d8c92. Verdict: revise before implementing. Four findings, each verified against the tree: the debug panel's `.details_box` would gain the shared narrow-width `column-gap` (verified in the base build's tx chunk); `a11y-css.test.ts:175` names the old path; the ban must read the `~/` and `src/` aliases and `.scss`; the proof must render the estimate-only fee row, the static From card and both navigation orders. It confirmed the content-based scoped names in the installed Vite, the six carriers and the fee-rule order, and found no other equal-specificity flip.
- **Opus Plan lens**, same plan. It added: a copy that drops its own role reds `type-role-ban` (its reviewed list is empty and it reads no cross-file chain); composer hashes cover the composer's own block, `from` path included, so the move cannot be byte-identical for composers; a rule's second `composes` needs a control. It rejected no decision.

## Attempts

- **The move alone, Chrome build.** Every one of the 128 CSS files matches base once composer names are normalised (`_<local>_<hash>_<line>` → a placeholder, keyframe names included). The shared sheet's `_cbymy_` names are unchanged, as the content hash predicts.
- **Copies composing without their role.** `type-role-ban` reported every `trimAddress(` under `TxHashRow`, `TxDebugPanel`, the tx page and the received page. Fixed by keeping `composes: type--<role> from global` first in each copy's own rule.
- **The ban test.** Green on the tree; red when `TxHashRow`'s `detail_link` composes from `../../../pages/detail-page.module.css` again (mutation reverted).
- **Codex diff pass** (`gpt-6.1-sol`, high, read-only), over the plan and `4d62d8c92..HEAD`. Verdict: no visual regression found. Two findings, both accepted: a root-relative `from "/src/popup/pages/…"` resolves in Vite yet passed the ban (demonstrated by compiling one); the comment on `compositions` narrated its code. Fixed in one commit; the new case reds with the old alias list and greens with the fix.

# Phase 2: the identity proof

- The proof is a scratch smoke spec outside the repo, run on the armed production builds of base and head. It matches elements by DOM path, never by class, since every composer's scoped names change.
- **Chrome enumerates custom properties in parse order.** Two builds whose sheets differ only in duplicated rules list an element's `--*` properties in a different order, so a raw `getComputedStyle` string differs with no property changed. Compare sorted declarations.
- **Firefox refuses a BiDi screenshot of an extension page** (`FIREFOX.md` § Picturing the toolbar panel). The proof draws the tab from the privileged scope with `drawSnapshot` instead.
- **Glyph fringes are not deterministic in Chrome.** Six of 72 frames differed in four pixels, a blue-channel step of 3 on the left fringe of one glyph; the same pixels also flip between two captures of one head build in different navigation orders.
- **Smoke `type-roles.test.ts`, Chrome, at 3f94bce25: red.** The role sweep read `meta meta` on the tx detail's copies: a rule composing `type--meta` and a shared rule that composes it too renders the token twice, and the sweep wants exactly one. The static scan, for its part, needs the role in the element's own rule wherever a `trimAddress(` renders. Fixed in 1d0f330ff: a copy hosting an identifier stays as at base, a copy hosting none composes the shared rule alone. The computed-style proof could not see it: a doubled class token styles nothing.
- **Codex targeted verification** (same session): both fixes verified, no findings; it compiled every changed class export and found one role token each.
- **Network e2e at 1d0f330ff, retry 0:** proverless `failed-send-check` and `incoming-arrival` 9/9, prover-on `fee-sponsor-funding`, `incoming-transfers`, `snack-placement`, `token-add-auto-trust` and `type-roles-windows` 19/19, on Chrome and on Firefox.
