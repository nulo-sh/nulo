# Phase 1: the band and its pin

- **No pin to update.** The brief named a `.pick` geometry pin in `rows.test.ts`; #1898 had only measured it live. The new pin rides `token-list.test.ts`'s flagged scenario, the one smoke scenario with a row in the sheet.
- **A button stretches into its margins.** With `width: auto`, a `.pick` button in the column flex `.list` spans 0 to 360 px under `.link`'s negative margins, on Chrome (capture-page probe) and on Firefox (the amended pin, green).
- **Red/green.** With the base CSS and the new pin, the sheet's row stopped 12 px short of the left edge (Chrome). With the change, `token-list.test.ts`, `rows.test.ts` and `send-picker-add.test.ts` green on Chrome (13 of 13, at `e497c1e23`) and Firefox (13 of 13, with the comment fix); the later commits change a CSS comment only.
- **Capture page.** `storybook build` refuses the scratch story (a chunk cycle between the story and `PopupCard`), so frames come from `storybook dev`. Its dev server kept serving the old `popup-shared.module.css` after an edit to that `composes` source (the sheet's `--page-gutter` was empty); a restart picked it up. Restart the dev server after editing a composed CSS module.
- **Codex consult** (`gpt-6.1-sol`, high, one pass over the plan and the diff): no demonstrated regression; R1–R3 accepted (plan, § Review verdicts).
