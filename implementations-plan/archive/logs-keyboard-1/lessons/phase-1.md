# Phase 1: `Popover`'s keyboard rules

- 2026-10-19: arc base moved to `1531e5f9` (#855, send fees; no file in common with this arc); the plan commit cherry-picked onto `logs-keyboard-1-a1`.
- 2026-10-19: `Popover.vue` gains `tabbables`, `focusIn`, `onTab`, `onFocusin` and an `inert` leave hook. Popover 22/22. Red proof against `1531e5f9`'s `Popover.vue`: the seven behaviour cases fail, the four controls pass. The "Tab between controls" control first relied on the new focus-in and failed on base; it now focuses its control itself.
- 2026-10-19: jsdom has no `inert` property, so the leave hook sets the attribute, which is what browsers read; the real-`Transition` case sees the leaving card connected and inert right after the close.
- 2026-10-19: gate: `bun run lint` 0, `bun run typecheck:all` 0.
