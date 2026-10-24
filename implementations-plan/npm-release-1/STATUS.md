# npm-release-1 status

- 2026-10-24 adopted the lane worktree at `dda72e321`; recon done (1 Sonnet explorer, a scratch 0.3.0 staging diffed against the published 0.2.0).
- 2026-10-24 plan drafted (tier light, one arc); Codex audit and the Opus leg next.
- 2026-10-24 round 1: Codex conditional approve (3 accepted), Opus conditional approve (5 accepted, 1 in part); round 2: Codex conditional approve (1 accepted); round 3: Codex approve. Plan committed; auto-continue into arc 1.
- 2026-10-24 P1 gate green: `bun run lint` 0; `bun run test:release` 0 (341 pass, 11 skip: the env-gated probes, 0 fail); `rg` lists only the two 0.2.0 entries.
- 2026-10-24 P2 gate green at `M` = `dda72e321`: pass 2 `check-digests.ts 0.3.0` 0 and `cmp` identical; the control 1 with three sha256 failures; the consumer diff only `package.json` and `README.md`; lint 0; `test:release` 0. Review loop next.
