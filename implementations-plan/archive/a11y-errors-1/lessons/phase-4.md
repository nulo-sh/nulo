# Phase 4: pictures and contrast in the browser

- The scratch spec lived under `~/.cache/nulo-backlog/a11y-errors-1/` and was copied into `apps/extension/tests/e2e/` for each run only. Armed Chrome builds of the arc base (the 14 sources checked out at `2f591ddd`, then restored from `HEAD`) and of the head.
- Reading: the element's computed `color`, its ancestors' `background-color` blended until opaque, WCAG ratio; an ancestor `background-image` or `opacity` under 1 would mark it unmeasured (none did).
- Two misses on the account import: the shared `previewImport` helper waits on the submit, which stays disabled for a body that does not start with `{` (the page treats it as a protected file and asks for its password). A JSON body that is no account reaches the error.
- Full backup import: a JSON file that is no backup shows the error on pick, no submit needed ("Unrecognized Backup File").
- Base: 3.56:1 light, 5.13:1 dark on the page for every pictured error. Head: 6.00:1 light, 6.24:1 dark for every row read in Chrome. The hero "Delete" stays `--red`, 3.56:1 light, as large text.
- Not reachable in smoke, read through the token gate: rows 5 (an unknown seed import failure), 7 (a protected file's second step), 8 (an unexpected change-password failure), 11's torn import, 13 (only a passkey profile types a backup password), 14-19 (a failed load, refresh or seed, a developer panel's transaction error, a note that fails to render), 10 (the verify window needs a dApp).
