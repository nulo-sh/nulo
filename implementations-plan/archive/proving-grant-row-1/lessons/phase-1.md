# Phase 1: the e2e pin and the docs

All runs on headless Firefox 153.0.4, with the armed build, at retry 0. Host load was about 210.

- **Gate**:
  - `bun run lint` exit 0. Its 4 infos are older and not in the touched files.
  - `bun run typecheck:all` exit 0.
  - `bun run test` exit 0: 883 files passed, 3 skipped.
- **The spec, twice**: green both times. The test took 14.3 s, then 15.4 s; the file took 15.6 s, then 17.5 s. The base at f73ce69d6 took 15.8 s (test). Load noise hides the one added evaluate.
- **Red/green**: a scratch edit made the composable read `getAll()` and require every loopback entry, in place of `contains`.
  - On that build the new spec went red at `presto-host-permission.test.ts:68`. That is the idle-card wait after the loopback-only withhold: the row showed instead, and the wait timed out at 10 s.
  - On the same build the base spec from f73ce69d6 stayed green (14.9 s): the old file cannot see the regression.
  - The edit was reverted and the build rebuilt clean.
- **Chrome**: the file is `describe.skipIf(!isFirefox)`, so it is not run there.

## Post-implementation loop

- **Codex round 1** (gpt-6.1-sol, high, session `01a15a38-ac4d-7881-89b3-00baf59be198`): CLEAN.
- **Opus review**: 2 findings, both accepted.
  - The `manifest.test.ts:208` wording now reads "only by switching off all-sites access too".
  - The spec dropped `granted` contains `*://*/*`. Firefox may list content-script matches differently. The `held` true/false pair already proves what covered loopback.
