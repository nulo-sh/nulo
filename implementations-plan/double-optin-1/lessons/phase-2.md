# Phase 2 — the landing

- 2026-11-05: gate green except one host gap. `apps/landing` test 172 pass, 1 skip (the launch gate); build 0 with `dist/confirm.html`; `bun run lint` 0; `bun run typecheck:all` 0; `bun run test:ci-gating` 0; `bun run lint:actions` 0.
- `bun run test:release`: 352 pass, 7 fail, all in `scripts/release/zip-read.test.ts` and `zip-reproducible.test.ts` with `Executable not found in $PATH: "zip"`. This host has `unzip` but no `zip`; the change touches no release script. CI's runner carries `zip` and runs the suite.
- TS 6's DOM lib types `hidden` as `boolean | "until-found"`, so a view interface takes `Pick<HTMLElement, "hidden">`, not `hidden: boolean`.
- Accessibility call (D9, the owner's 2026-10-19 delegation): the heading focused after a final answer takes no outline (`[data-confirm-heading]:focus`), since it is not a control; the button keeps the house focus ring.
