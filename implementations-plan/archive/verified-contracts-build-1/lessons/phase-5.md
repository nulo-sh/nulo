# Phase 5: e2e, captures, the full gate

- A smoke run reads each spec file when it reaches it, so editing a spec while a run is in flight changes that run: a case added mid-run met the old build and failed. Edit specs only between runs.
- `keyboard.press("Space")` throws on Firefox (Puppeteer's BiDi table lacks the name); `apps/extension/tests/e2e/FIREFOX.md` already says to press `" "`. Read FIREFOX.md's table before adding a key press.
- `e2e:agent` builds its own `dist/<browser>`, so it cannot overlap a smoke run on the same browser; a Chrome network run beside a Firefox smoke is safe.
- The base smoke ("before") ran by checking out `1593cf027` detached in the worktree between commits: no second checkout, no reinstall, since the arc changes no dependency.
- Under host load ~250, `test:all` timed out once at 5 s in an untouched file (`src/e2e/config.test.ts`, 257 ms alone); rerun once, green.
