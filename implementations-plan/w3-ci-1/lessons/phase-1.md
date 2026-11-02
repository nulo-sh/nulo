# w3-ci-1 phase 1: the derived filter check

- Red at `278d8c981`: the live case listed exactly the eight lines the plan names (two per lane); the four copy cases passed, since each asserts only the lines it adds. Green at `a2b790694` after the filter edits.
- The first draft of the walker scored cognitive complexity 16 in its step visit; the action visit and the script scan (`ciScripts`) moved into their own functions.
- A loop of per-lane `expect`s stops at the first red lane; the live case compares the whole lane map so a red shows every lane at once.
- Gate on this host: `lint`, `lint:actions`, `typecheck:all`, `test`, `test:all`, `test:ci-gating` (738 pass) exit 0. `test:release`: 7 fail, each `Executable not found in $PATH: "zip"` (this host has no `zip`; nothing under `scripts/release/` changed). In `ubuntu:24.04` with `zip` and the pinned Bun, on a `git archive` of HEAD, those 7 pass; the one red there is a test that needs `npm`, which passes on the host.
