# Phase 0: planning consults

## Round 1, Codex (gpt-6.1-sol, high, session `01a153c0`)

Verdict: `conditional approve (with conditions: repair Escape focus handling, strengthen browser proofs, build both browser bundles before smoke, and correct Holdings test assumptions)`. Six findings, all checked against the tree and accepted:
1. Demonstrated: Enter on Source opens its panel, its `Input` autofocuses (`packages/design/src/ui/Input.vue:168-170`), and Escape closes it unhandled with focus falling to the page (`Popover.vue:56-58`), against CLAUDE.md § Keyboard. → D2 reversed: the Escape handler marks the key handled and refocuses the control kept at open when focus is in the panel; a pointer close is untouched.
2. The e2e could pass without proving the return: the menu's trap sets no initial focus, so focus never left the trigger; Source got only Enter, Level only Space; the item press was a DOM click. → both keys on every trigger, ArrowDown into the menu before Escape, Clear logs pressed by `pointerClick`, `waitForFocus` before the ring read.
3. Smoke builds nothing (`FIREFOX.md:5`): a gate on a stale `dist` proves nothing. → both armed builds before every smoke gate, CI's flags.
4. F5 said `summaryMeta` never reads the state (it reads `isLoading`), and rows listed during the failure are stored, not rendered. → wording fixed; the test holds the price answer, adds a priced row, then settles it.
5. I1 rests on more than `font: inherit`. → the strict capture stays; a differing pair is resolved by the property shown to differ, never by relaxing it.
6. Fiat-off height is not provable in jsdom. → Holdings' summary height recorded on both builds, fiat on and off, required equal.
D3-D6: approved as drafted.

## Round 1, Opus 5.5 (Plan agent)

Verdict: `conditional approve (with conditions: findings 1, 2 and 3 change the plan's proof steps before Phase 2 and Phase 5 run; nothing in the design changes)`. Accepted: the pointer check passed whatever focus did (DOM click, `focusRing` reads unfocused elements) → `pointerClick` + `waitForFocus` + `/^none /`; the menu's return was never exercised → ArrowDown first; full-frame sha256 fails on log lines between the triggers, and Chromium's UA `text-rendering: auto` may differ → per-trigger clips; Clear logs' row 4 px shorter (inside the pick) → named; a key after a mouse focus shows the ring → named; the live-add row priced; Level settled before the shot; F2, F3, F5 and the describe name corrected. Rejected: D2 "leave Popover unchanged": Codex's demonstrated path wins, restricted to Escape as Opus itself required.

## Round 2, Codex (resumed)

Verdict: `conditional approve (with conditions: compare trigger positions and dimensions independently of their cropped-image hashes)`. Accepted: Phase 5 compares each trigger's viewport box on both builds beside its clip's hash. Verified by Codex: the Popover capture runs in the pre-flush watcher before the search field's `onMounted` focus; refocus before `onClose()`; focus-trap swallows a key-made click on the open menu's trigger.

## Round 3, Codex (resumed)

Verdict: `approve`, no new finding.
