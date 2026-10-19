# Phase 2: the rows as native toggle buttons

- 2026-10-19: "Select All" and each row are `Flex tag="button" type="button"` with `aria-pressed`, `refuseRepeatEnter` and their testids; `filter_toggle` carries `font: inherit`, `text-align: inherit` and the inset ring. LogsToolbar 8/8.
- 2026-10-19: red proof against `1531e5f9`'s `LogsToolbar.vue`: the three new cases fail. The click case cannot be a base control: the base rows carry no testid. The fresh-Enter assertion is the refusal's control.
- 2026-10-19: gate: `bun run lint` 0, `bun run typecheck:all` 0.
