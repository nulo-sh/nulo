# Phase 1: popup fixes (#339, #465, #466), arc 1

- 2026-10-15: merged `origin/dev` (#506, #509) into the plan branch; no dependency or arc-file change. Arc 1 branch `worktree-wallet-followups-8-popup` cut from `origin/dev` at `2dcdad48` in the lane worktree (D-arc1-1).
- 2026-10-15: three commits, one per issue. T5, T6 and T7 fail on the base copies of the three `.vue` files (`d59459ab`, unchanged at `2dcdad48`), exactly the three new assertions, and pass on head; the PXE store control stays green on both.
- 2026-10-15: T6 needs the real `Input` (`@nulo/design`), since the page test's stub never renders the attribute on a native input; `mountImport({ realInput: true })` registers it and drops the stub.
- 2026-10-15: `bun run lint` first failed on a format-only line in `holdings.test.ts` (the new literal pushed it past the width); `biome format --write` fixed it. The 27 warnings it prints are on dev already.
- 2026-10-15: review round 1. Codex (gpt-6.1-sol, high, session 01a141dd, `~/.codex` login): approve, two comment findings, both accepted. Opus 5.5: approve, one test gap accepted (a typed non-contract refusal as control; a mutation to `err?.code` fails exactly that row). Fixes in `0a039883`. Round 2 (resumed): approve, no new finding.
