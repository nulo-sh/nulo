---
plan: emoji-grid-1
tier: light (thinned: no plan audit round, no Opus leg; one Codex design consult, one Codex pass over plan and diff)
status: completed
issues: none
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at f336e0f22 (planned at 846f26379; nothing this plan touches differs between them)
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-19.
- **Status:** completed. Ships in the PR titled `fix(verify): the connection check draws every symbol as colour emoji`, which carries this close-out. It lands on the owner's approval of its before and after captures.
- **Shipped:**
  - the `emoji` type role (`--font-emoji`, the four colour faces first; 24 px), which draws the grid's cells;
  - `emojiCells`, which splits by grapheme and adds U+FE0F, at render time, to the 21 symbols a text face can claim;
  - the e2e face check limited to the bundled faces, and the network check's exact compare through `emojiCells`.
- **Gates (retry 0):**
  - static gates green at `0389a6078`, and lint plus the touched unit tests again after the trunk merge;
  - smoke `type-roles.test.ts`: Chrome 14 pass and 1 skip (134 s, a build whose runtime equals `0389a6078`), Firefox 15/15 (165 s);
  - network, three specs: Chrome 10/10 (331 s), Firefox 10/10 (454 s);
  - no e2e scenario added.
- **Deviations:**
  - the selector covers 21 symbols, not the brief's two (D2; Codex consult);
  - the brief's "every other symbol already draws as colour emoji" did not hold on this host (F2);
  - the role carries the 24 px size, so the cell's carve-out went (D1);
  - `base.css.test.ts`'s hash was re-pinned for the new font token.
- **Lessons:** none promoted. `lessons.md` is at its 8 KiB budget, and the tooling gotcha in `lessons/phase-1.md` (a tool call's JSON turns `\u` escapes into literal characters) applies to one harness.
- **Known limits:** none.
- **Open items:** none. The upstream wallet-sdk note sits in the PR body, for the owner to file or not.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# emoji-grid-1: the connection check draws every symbol as colour emoji

A user reported, through the owner on 2026-11-19 with a screenshot, that an app draws the connection check's ⬜ as Apple's colour square while Nulo draws an outline, so a real match reads as a mismatch. The owner was told the fix ships in 1.3.0, with before and after captures for approval before it lands. One arc, one PR against `dev`. No issue owns it, so no `Closes`. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none).

## Findings

- **F1, the cause (demonstrated).** Each cell takes the page's text stack, `"InterVariable", …, sans-serif`. A text face in that stack that carries a symbol wins over the colour-emoji face. **InterVariable carries U+2B1C** (fontTools cmap), so ⬜ draws as Inter's outline in Chrome and Firefox. InterVariable lacks U+2B1B, so ⬛ comes from later faces: Noto Color Emoji on this host, and an unknown face on a Mac.
- **F2, the brief's "every other symbol already draws as colour emoji" does not hold here (demonstrated).** 19 symbols of the SDK's alphabet default to text presentation (Emoji_Presentation=No; listed in `recon.md`). With today's stack, on this host, they draw as monochrome text glyphs in Chrome 155 and in the capture page in both browsers. On a plain probe page Firefox 153 and 158 draw them as missing-glyph boxes. On a Mac they likely draw from Apple Color Emoji (unverified).
- **F3, what fixes it (demonstrated, probe page).** With the four colour faces first in the family, all 256 symbols draw in colour in Chrome 155, Firefox 158 and Firefox 153, the extension's floor. U+FE0F after the text-capable symbols does the same even with Inter first; so does `font-variant-emoji: emoji`.
- **F4.** `tests/e2e/network/connect-check-window.test.ts` asserts the grid's text equals `hashToEmoji(hash)` exactly. A render-time selector makes it fail whenever the hash picks a symbol that gets one.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | Role `emoji` = `{ family: "--font-emoji", size: 24, weight: 400, tracking: 0, uppercase: false, tabular: false }`, appended to `typeRoles`. `tokenGroups.fonts.emoji = "--font-emoji"`, declared in `base.css` as `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`. The cell's text takes it through `<Text variant="emoji">`. `.cell` drops `font-size: 24px`, and its carve-out goes. | This is the brief's item 1. Size: the role has one caller and one size, so a fixed 24 makes it carry the size, which the carve-out says no role does. Codex agrees (high). Site-sized was rejected: flexibility nobody asked for. |
| D2 | At render time, U+FE0F follows a cell that is one `\p{Extended_Pictographic}` code point without a selector, when it is not `\p{Emoji_Presentation}` or is U+2B1B / U+2B1C. That is 21 of the 256 symbols: the 19 text-default ones and the two squares. The prop, `hashToEmoji`'s string and anything stored are unchanged. | The brief named the two squares only. F2 shows 19 more symbols that a text face can claim. Unicode recommends U+FE0F exactly for text-default emoji shown as emoji (UTS #51). The selector is the backstop for a host where none of the four faces is installed. Codex consult (high confidence): use this narrowed rule. A selector on all 256 is broader than any defined variation sequence. `font-variant-emoji` in the role would add a role property for one caller and leaves Chrome versions before it unhelped. The brief's two-square list would cover 2 of the 21. |
| D3 | Cells are split by grapheme with a module-scope `Intl.Segmenter(undefined, { granularity: "grapheme" })`. The selector is appended after the split. No code-point fallback. | This is the brief's item 3. A sequence stays in one cell. For today's alphabet the split is identical: no pair of its 65,536 ordered pairs merges, which Codex confirmed independently. The selector cannot join two cells. `Intl.Segmenter` ships in Chrome 87 and Firefox 125, and the Firefox floor is 153. |
| D4 | Both rules live in one pure helper, `emojiCells(emojis: string): string[]`, in `components/composite/general/emoji-cells.ts`. `EmojiGrid.vue` slices its rows from it. | CLAUDE.md § Composables: a pure function with no reactivity is a helper colocated with its parent. The e2e uses it too (D5). |
| D5 | `connect-check-window.test.ts` compares the grid's text with `emojiCells(hashToEmoji(hash)).join("")`, still exact. | The comparison stays strict: it proves the window draws the SDK's string through the grid. The helper's own correctness is pinned separately by T1, with fixed expected outputs, so the e2e does not confirm itself. Codex raised the self-confirmation concern; T1's fixed outputs answer it. Rejected: removing U+FE0F before comparing, which would loosen the check. |
| D6 | In the e2e sweep (`tests/e2e/fixtures/type-roles.ts`), the face-load check covers the bundled faces only: every font token but `fonts.emoji`. The variable reading still reads every token. | `--font-emoji` names platform faces that no `@font-face` declares, so the current check would fail with "no @font-face declares Apple Color Emoji". The font-family check already compares first families, so the new role is judged like the others. Rejected: a "platform" flag in the contract, which would be a new concept for one token. |
| D7 | `type-roles.contract.test.ts`: `emoji` becomes the second role without a row on the signed board, beside `input`. | The board predates the role. The owner's 2026-11-19 ask is its authority. |
| D8 | No accessibility call. | No focus, Tab stop, state or ARIA wiring moves. Screen readers drop U+FE0F when naming an emoji; no assistive technology was tested here (plausible, unverified; the check's announcement is fixed copy). |

## UI impact

- **Connection check, the emoji grid** (`windows-verify`, `verify-emoji-grid`). Before: ⬜ draws as an outlined square, and on hosts whose text faces carry them, the 19 text-default symbols draw as monochrome glyphs or missing-glyph boxes. After: every symbol draws in the platform's colour-emoji face, as the app shows it. Layout, the 48 px cells, the 24 px glyphs, the words and the testids are unchanged. The sign-off budget is the lane brief's line, relaying the owner's 2026-11-19 ask: "Only the drawing of ⬜ and ⬛ in the connection check changes, to the colour emoji the app shows; the other 254 symbols, the grid's layout, size, words and testids stay. The owner approves on the before/after captures (one approve item); the PR waits for that." The 19 symbols are not a new choice. The brief's own role draws them in colour wherever they did not draw that way already (F2), which is the lane's purpose, "draws every symbol as colour emoji, like the app". The captures show two of them (🖥, 🌤), and the PR body names them.

## Security & Adversarial Considerations

- **What a person compares.** A hostile dApp or a man in the middle controls only the hash. `hashToEmoji` maps each byte to one of 256 distinct single code points, so the input to `emojiCells` is always nine alphabet symbols. Appending U+FE0F keeps every cell's base code point, so two different grids stay different strings (Codex: injective). That is not visual distinctness: on a host that lacks glyphs for two symbols, both draw as the same missing-glyph box, as before this change. The grapheme split never merges two alphabet symbols (D3). The danger runs the other way: a renderer that draws a symbol differently from the app's makes a true match look false, which teaches people to click past a mismatch. This plan removes that.
- **Trust.** The fix trusts the platform to install one of the four colour faces. Where none is installed, U+FE0F still asks for emoji presentation (F3). On a host with no colour-emoji face at all, both browsers fall back to monochrome glyphs where a face has them; what the app draws there depends on its own fonts.

## Phase 1: the role, the grid, its tests, the captures

**Change map.**
- `packages/design/src/token-contract.ts`: `fonts.emoji`, role `emoji` (D1). `packages/design/src/base.css`: `--font-emoji`. Regenerate `src/tokens.ts` and `src/utilities.css` (`bun run --cwd packages/design gen:tokens`).
- `packages/design/src/type-roles.contract.test.ts`: D7. `packages/design/README.md` § Type roles: 25 records, face key E, the `emoji` row. `CLAUDE.md` § Extension component model: "the 25 type roles".
- `apps/extension/src/components/composite/general/emoji-cells.ts` (new, D2–D4); `EmojiGrid.vue`: `emojiCells`, `<Text variant="emoji">`, no `font-size` on `.cell`; `EmojiGrid.test.ts` (T1).
- `apps/extension/scripts/type-roles/exceptions.ts`: drop the `.cell` carve-out.
- `apps/extension/tests/e2e/fixtures/type-roles.ts`: D6; `tests/e2e/type-roles.test.ts`: the face test's name says "bundled". `tests/e2e/network/connect-check-window.test.ts`: D5.

**Tests (T1, `EmojiGrid.test.ts`, ten cases; the L3 minimum).** Keep the cases for nine cells in three rows, fewer than nine, empty, and order. Add these, with fixed expected values:
- every cell's text carries `variant="emoji"`;
- a grid from `hashToEmoji` holding ⬛, ⬜ and 🖥 gives those three with U+FE0F, and the other six exactly as the SDK wrote them;
- ❤️ (U+2764 U+FE0F) stays one cell with one selector;
- a ZWJ sequence stays one cell, unchanged;
- a flag stays one cell; this replaces the `>= 6` case and its wrong comment;
- the whole alphabet (`hashToEmoji` over the bytes 00 to ff, count 256): 256 cells, each the SDK symbol plus at most a trailing U+FE0F, and exactly 21 with one.

No new e2e scenario. The smoke probe test already places one probe per role, so the new role is judged in both browsers.

**Captures.** A scratch harness outside the repo serves the verify window's check section (label, grid, instruction) through Vite from the worktree's sources, with no extension build and no sandbox. Its port is claimed in `~/.agents/ports.md`. The grid comes from `hashToEmoji` over bytes picked for ⬜ 🐷 ⬛ 🦊 🖥 🚀 🎨 🌤 🍕. Frames: `before-*` at the base (taken at `846f26379`) and `after-*` at the final head; Chrome 155 and Firefox 158; light and dark; 400 px at 2x. They go to `~/.cache/nulo-backlog/emoji-grid-1/shots/` with `captions.json`, whose captions say the host's colour face is Noto Color Emoji. One commit adds them under `pr-captures/emoji-grid-1/`, the PR body embeds them at that commit, and the next commit removes them.

**Validation gate (retry 0, in order; the next step runs only after the one before passes).**
1. `bun run lint` exits 0.
2. `bun run typecheck:all` exits 0.
3. `bun run --cwd packages/design test` exits 0. `bun run --cwd packages/design gen:tokens && git diff --exit-code packages/design/src/tokens.ts packages/design/src/utilities.css` exits 0.
4. `cd apps/extension && bun run test -- src/components/composite/general src/popup/windows/verify type-role-ban copy-dash-ban red-text-ban` exits 0.
5. `bun run check:plans` exits 0 after staging.
6. Smoke, Chrome then Firefox: the armed build that `tests/e2e/global-setup-smoke.ts` names (`… bun run --cwd apps/extension build:<browser>`), then `cd apps/extension && NULO_E2E_BROWSER=<browser> NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/type-roles.test.ts`. Green, with the counts recorded.
7. Network, from the root, Chrome then `NULO_E2E_BROWSER=firefox`: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-check-window.test.ts tests/e2e/network/connect-verify-mismatch.test.ts tests/e2e/network/type-roles-windows.test.ts`. Green, with the counts recorded.
8. The captures exist for both browsers and both themes, before and after. The after frames show no outline square and no monochrome glyph.

## Delivery

Branch `emoji-grid-1-a1`, off `origin/dev`, carrying the plan commit. One PR to `dev`, opened ready with no label. Title (68 characters): `fix(verify): the connection check draws every symbol as colour emoji`. The body has these parts:
- what changed and why (F1–F3);
- the UI impact line verbatim as the sign-off budget;
- the captures;
- the gates with their per-browser counts, and a line saying no e2e scenario was added;
- an "Upstream note for `@aztec-labs/wallet-sdk`" heading, for the owner to file or not. It says the alphabet's 21 text-capable symbols could carry U+FE0F, or the docs could say a grid must be drawn with emoji presentation. It also says that putting U+FE0F into the alphabet breaks any consumer that splits by code point, as Nulo did before this PR.

The PR waits for the owner's approval of the captures. Merging is the orchestrator's.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `846f26379`, bounded work. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 is one Codex pass after Phase 1's gates 1–5: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. It reads the plan and `origin/dev...HEAD`, with the standard's two verbatim rules and the lane's two asks: can any symbol still draw from a text face in Chrome or Firefox, and can the grapheme split or U+FE0F change what the person compares? A second round runs only on a finding. Gates 6–8 then run on the final head.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch` once.
- Step 4: the close-out goes in the same PR's final commits, after merging `origin/dev` in.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build emoji-grid-1 per `implementations-plan/emoji-grid-1/plan.md`: Phase 1 green, the Codex pass settled, captures, PR open with them; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished gate of `plan.md`, record it, stop at the open PR.

## Audit verdicts

**Codex design consult** (gpt-6.1-sol, high, read-only), 2026-11-19, on the selector's scope with the probe evidence: narrowed selector (D2), confidence high for today's alphabet and moderate across untested hosts. Accepted: the rule of D2, which replaces the draft's selector on all 256; the fixed 24 size (D1); independent expected outputs in T1 (D5); the flag comment fixed. Noted: `textContent` and copy carry U+FE0F; the SDK's string stays canonical (D2, D8).

**Codex pass over the plan and the diff** (gpt-6.1-sol, high, read-only, `origin/dev...HEAD` at `a3875a2de`), 2026-11-19: approve with changes; high confidence in the data path, moderate across untested font environments. On the lane's questions: (1) a symbol can still draw from a text face only where no colour glyph is available, or where a person picked a monochrome emoji font in Firefox; the cell's CSS sets no competing family. (2) The split and the selector change appearance and DOM text only. The confirmation sends the original hash, and no display string reaches storage or messaging. All 65,536 pairs stay apart, and the 256 outputs are distinct with exactly 21 selectors. Accepted:
- § Security: string injectivity is no visual distinctness, and the no-colour-face fallback depends on the app's own fonts (rewritten);
- `type-roles.contract.test.ts` pins the whole `typeRoles.emoji` record, which the board exemption left unpinned;
- the `emojiCells` TSDoc no longer promises colour, and the fixture's `PageTypography` doc says "font variables";
- the component test is renamed "gives every cell the emoji role", since its stub checks a prop.

The invisible U+FE0F, U+2B1B, U+2B1C and U+200D literals that the source and test files held became `\u` escapes in the same commit (`0389a6078`). Rejected:
- deleting `EmojiGrid.vue`'s `/** Utils */` header, because CLAUDE.md § Vue SFC ordering groups imports under comment headers;
- dropping the `--font-emoji` clause from `base.css.test.ts`'s comment, which enumerates the deliberate choices its hash pins.

Verify round (resumed): approve, high confidence, no new finding or regression.
