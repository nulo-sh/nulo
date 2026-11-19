# emoji-grid-1 recon

Base `origin/dev` at `846f26379`. The planner's own trace (no explorer: the surface is one component, one role and its guards); every line checked against the tree.

## The grid today

- `apps/extension/src/components/composite/general/EmojiGrid.vue` splits `props.emojis` with `[...props.emojis]` (by code point) and draws each in `<Text>` with no variant; `.cell` sets `font-size: 24px` (48 px cells), kept by the type-role guard's carve-out "the verification emoji's size, a glyph a person compares, which no role carries" (`apps/extension/scripts/type-roles/exceptions.ts`). With no role the cell takes `body`'s stack, `"InterVariable", -apple-system, …, sans-serif` (`packages/design/src/base.css`).
- One consumer: `apps/extension/src/popup/windows/verify/index.vue` (`verify-emoji-grid`), fed by `hashToEmoji` from `@aztec-labs/wallet-sdk/crypto` 6.0.0, which joins nine alphabet entries picked by the hash's bytes.
- Its unit test (`EmojiGrid.test.ts`) has six cases, below the L3 minimum of ten; its flag case asserts `>= 6` and calls a flag a ZWJ sequence, which it is not.

## Which face draws what (holds, with a correction)

- The alphabet: 256 single code points, all `\p{Extended_Pictographic}`; two outside U+1F000–1FFFF, U+2B1B and U+2B1C, both Emoji_Presentation=Yes. No regional indicator, modifier or joiner, and `Intl.Segmenter` merges none of the 65,536 ordered pairs.
- cmap of the bundled faces (fontTools): **InterVariable carries U+2B1C and not U+2B1B**; Space Grotesk and JetBrains Mono carry neither. So ⬜ draws as Inter's outline everywhere Inter loads; ⬛ falls to whatever the rest of the stack or the system fallback picks (Noto Color Emoji on this host, in both browsers).
- **The brief's "every other symbol already draws as colour emoji" does not hold on this host.** 19 symbols are Emoji_Presentation=No (🌨 🌤 🎗 🎟 🏷 🖥 🛠 🕯 🏍 🛩 🕹 🖌 🏛 🏕 🏝 🏜 🕰 🗃 🖋). On a probe page with today's stack they draw as monochrome text glyphs in Chrome 155 and as missing-glyph hex boxes in Firefox 153 and 158 (this host has Unifont Upper and FreeSans). On a Mac they likely draw from Apple Color Emoji, the only face that carries them (unverified: no Mac here).
- Probe rows (a scratch page outside the repo): the four colour faces first in the family draw all 256 in colour in all three browsers; so does today's stack with U+FE0F after the text-capable symbols, or after all 256 (no artefact), or with `font-variant-emoji: emoji` (supported in all three).

## What reads the grid

- `apps/extension/tests/e2e/network/connect-check-window.test.ts` asserts the grid's whitespace-stripped `textContent` equals `hashToEmoji(hash)` exactly; any render-time U+FE0F makes it fail whenever the hash picks a symbol that gets one. Every other spec only waits for `verify-emoji-grid`.
- `popup/windows/verify/index.test.ts` and `index.window.test.ts` stub `EmojiGrid`.
- No spec sweeps the verify window's roles (`type-roles-windows.test.ts` covers other windows); the role reaches a real page through the smoke probe test, which places one probe per role.

## The role machinery a new role meets

- `packages/design/src/token-contract.ts`: `tokenGroups.fonts` (a family must be one of its tokens), `typeRoles`; `bun run gen:tokens` writes `src/tokens.ts` and `src/utilities.css`, byte-pinned by `tokens.drift.test.ts` and `utilities.drift.test.ts`. `tokens.parity.test.ts` needs every font token declared in `base.css`.
- `type-roles.contract.test.ts`: every role but `input` has a row on the owner's signed board; exactly six roles are site-sized.
- E2E sweep (`tests/e2e/fixtures/type-roles.ts`): `checkFontFaces` maps every font token to its first family and fails when no `@font-face` declares it; a token naming platform faces (Apple Color Emoji) has none. The font-family check compares first families of the computed and declared stacks, so a platform stack passes.
- `packages/design/README.md` § Type roles counts 24 records and keys faces G/I/M; `CLAUDE.md` § Extension component model says "the 24 type roles".

## Open work

`gh issue list --state all --search "emoji grid"` and `"connection check emoji"`: nothing owns this. Closed known limits in the area (#606, #883, #927, #1061, #1731) concern the check's lifecycle, not its drawing. The PR carries no `Closes`.
