# Phase 2 and the Codex fix loop

- **Gate** (2026-11-01): `lint:actions`, `lint`, `typecheck:all`, `test:ci-gating` (721 pass), `test`, `test:all` exit 0. `test:release`: 345 pass, 7 fail, every failure `Executable not found in $PATH: "zip"` in `zip-read` and `zip-reproducible`, files this arc does not touch; this host has `unzip` but no `zip`, so the PR's `quality-status` is the authority for that suite.
- **Red proof**: with the base composite and `store-check.yml` restored, the token, version-source and cache-key tests fail; with the change, they pass.
- **The scan reads its own source**: `"@types/bun": "${otherBun}"` in a mutation case matched the manifest pattern once the file was tracked (`git add -N`), so the test file is excluded from its own scan, as `workflow-refs.test.ts` excludes itself.
- **Round 1** (Codex gpt-6.1-sol high, session `01a1991a-cb7e-7982-a887-885375bab317`: `findings: 2 material`; one Opus diff review: `findings: 2 material`):
  - Codex 1, demonstrated: a compute copy that writes `needs-extension-build=false` after its `true` passed, because the probe looked for any `true` line while the runner keeps the last write. Fix: exactly one boolean write per probe, plus that mutation.
  - Codex 2, demonstrated: a cache key holding `steps.bun.outputs.bun-version` as plain text passed. Fix: require the whole `${{ … }}` expression, plus that mutation.
  - Opus 1, demonstrated: "a Bun bump starts a fresh cache" is false, since the last restore key `<os>-bun-` seeds the new key from the old version's cache. Reworded in `action.yml` and SECURITY.md; behaviour unchanged.
  - Opus 2, demonstrated: "CI fails until each matches" overstated the hash check, which only compares two hand-copied x86_64 hashes. Reworded in CLAUDE.md and SECURITY.md.
  - Opus 3, plausible: the job output and the compute step's `if` were unpinned. Fix: `computeWiringFindings`, plus two mutations.
  - Nits folded: a narrating comment removed; "must check out"; the refused-shape test asserts the whole result; quoted and `env:` forms of the version; `token-list` and "extension build" in CI.md.
- **Round 2** (Codex, resumed): `clean` (202 focused tests pass; no new finding). The loop converged in two rounds.
