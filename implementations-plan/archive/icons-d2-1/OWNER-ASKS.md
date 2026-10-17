# icons-d2-1: owner asks

Each ask names what ships now. Every "now" form stays inside the signed records (P30-08 B: every icon moves to Direction 2, Settings rows lose theirs; #602 B: no third-party glyph), so arc 1 builds it and does not wait. Decision page 33 (P30-09, P30-10) is the orchestrator's and is not repeated here; arc 2 starts on its relay.

## OA-1: rows of the Settings kind outside the Settings tab

- **Surface**: `SettingItem` rows in popups and import forms that lead with a decorative glyph: the Accounts popup's Manage and Add rows, Forgot password's two rows, Edit profile, the Edit FPC and Edit network header rows, Select token's manage row, the import form's full-backup row.
- **Options**: A, keep a Direction 2 glyph on these rows. B, drop it, as on the Settings pages.
- **What each looks like**: A, the rows read as today with the new glyphs (`settings`, `add`, `remove`, `help`, `user`, `fee`, `network-edit`, `package`). B, title and description only, like the Settings list in the Direction 2 mockup.
- **Ships now**: A. "Settings rows lose their icons" is read as the Settings tab only.
- **Recommendation**: A. Most of these rows are actions in a sheet (add, manage, remove), where the glyph tells the action apart; the Settings list is a list of places, where the title carries it. B removes three glyphs from the set (`fee`, `network-edit`, `package`).
- **Resolved**: decision page 34, A, as shipped.

## OA-2: the long-tail glyphs

- **Surface**: every glyph the sheet did not draw, 38 of the 58 in `plan.md`'s catalogue. The sheet's estimate was about 35 glyphs in all; the wallet shows about 58 distinct pictures once every site keeps the picture it shows today.
- **Options**: A, keep every picture, as drawn. B, merge near pictures to shrink the set: `signature` into the pencil (the connection window's "Act for you in transactions you approve"), `contacts` into the user ("See your address book"), `mail-lock` into the padlock ("See private events"), `faucet` into the plus (the mint operation), `network-edit` into the pencil, `undo` into the back arrow. B leaves about 52.
- **What each looks like**: A, each row and card keeps a distinct picture. B, the connection window shows the pencil, the user and the padlock on three permission rows that today have three distinct pictures.
- **Ships now**: A. The PR carries the glyph sheet story at 24, 12, 10 and 9 px, light and dark.
- **Recommendation**: A. On the connection window the pictures help tell permissions apart; a redraw or a merge later changes one entry in one file.
- **Resolved**: decision page 34, A, as shipped.

## OA-3: the reveal toggles' eye

- **Surface**: the show/hide buttons on password and secret fields, the recipient card's reveal, and the connection window's "See the addresses" permission row. Today Material `visibility` / `visibility_off` and icons.json `eye` / `eye-off`.
- **Ships now**: an outlined diamond with a square pupil, and the same with a 45° slash for the hidden state, because Material retires in arc 1. This is the drawing page 33 currently shows as Direction 2's public-balance mark.
- **Why it is here**: P30-10 is still iterating on the private and public marks, and the owner does not love the current drawings. If page 33 redraws the eye, arc 2 redraws `eye` and `eye-off`, and these toggles change with it. If page 33 picks the eye for the balance marks, the toggles and the marks share one drawing.
- **Recommendation**: none needed now; listed so page 33 knows the eye also serves the reveal toggles.
- **Resolved**: P33-05 B picked pair c, the squares, so the eye serves the reveal toggles alone and arc 2 leaves `eye` and `eye-off` as drawn.

## OA-5: two side effects of the signed records

- **Surface**: Settings → Networks → a network's Chain group, and History's token-filter chip.
- **What changed**: the Chain group's state row keeps its selection mark while its rename and info rows, losing their leading glyph under P30-08 B, now sit flush; the rename row has no chevron, so the pencil was its only sign that it edits. The chip's × is now drawn as an svg, so it darkens to primary on hover like every other row action; as a Material glyph it never changed.
- **Options**: A, ship as built. B, give the rename row a trailing `edit` glyph, and keep the × at secondary on hover.
- **Ships now**: A.
- **Recommendation**: A for the ×. For the rename row, a look at the network page decides; it is not among the eight capture pairs, so the PR attaches it.
- **Resolved**: P35-06 B, the rename row takes a trailing `edit` glyph, 18 px in the secondary colour, where a chevron would sit; P35-07 A, the × ships as built.

## OA-6: the glossary's private and public definitions

- **Surface**: Settings → Glossary, and the dotted Private and Public terms whose tooltips read the same entries (`apps/extension/src/utils/glossary.ts`).
- **What changed**: the definitions named the old marks: "Marked with a padlock." and "Marked with a globe." Under P33-05 B both sentences became false.
- **Ships now**: the same sentences naming the new marks: "Only you can see it. Marked with a solid square." and "Anyone can see it, like a balance on Ethereum. Marked with a dotted square."
- **Options**: A, as shipped. B, other wording, or no mark named at all.
- **Recommendation**: A. A definition that names the mark teaches it where the wallet shows it without a word, on the token rows and Home's split.
