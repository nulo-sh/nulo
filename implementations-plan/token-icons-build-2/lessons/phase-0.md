# Phase 0: planning

- Recon (two Explore passes on sonnet, then a direct read): `recon.md`. Every surface's file is as token-icons-build-1's records describe at `52e2099ad`; the two claims that did not hold are in `plan.md` (C1, C2).
- The rows' mark that arc 2 of token-icons-build-1 built and took out (`df103d395`, `f18f7f96c`, reverted by `2bffd89f9`) is the starting point for phase 2.
- Zsh does not split an unquoted `$VAR`: `env $FLAGS bun run build` set one variable and the build was not armed. The lane's builds and runs go through a bash script; a spec list in zsh needs `${=SPECS}`.
- `pkill -f "<the wrapper's own words>"` killed the calling shell (exit 144). Signal by an anchored pattern or a pgid.
- The chevron probe (throwaway, the armed base build, `registeredExtension`, every fixture at 400 and 240 px, steps at rest): on base the chevron sits alone in `one` and `batch` at 400 px on Chrome and on Firefox, top 297 and 365 under a last text fragment ending at 357 of a 371 px line. With the trailing U+00A0 and the `<svg>` moved into a `white-space: nowrap` span, no fixture shows a lone chevron at either width, with the fixture's sender or one four characters longer. Chrome 157 s, Firefox 240 s.
- Codex plan audit (session `01a1cb58`, gpt-6.1-sol, high): conditional approve; its findings and the calls on them are in `plan.md` § Decision ledger and § Audit verdicts.
- Final fresh Codex pass (session `01a1cb65`): approve, no material findings.
