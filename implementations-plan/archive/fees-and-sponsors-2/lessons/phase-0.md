# Phase 0: planning consults

Every consult of the planning run, failed ones included.

## Recon (2026-10-14)

- Two Explore agents (sonnet): a reuse sweep over seven capabilities, and a map of the protocol's fee semantics and the fee figure's path into the popup. Both returned; findings in [recon.md](../recon.md).
- The decision page's records and shots (P6-07, P6-13, P6-13b, P6-19, P6-20; shot `o-188-prio-B`) were read from the orchestrator's program files to pin which row the signed sentence was drawn on: the app-paid row.
- `git fetch` over SSH failed in this sandbox; `gh api repos/nulo-sh/nulo/branches/dev` confirmed dev's head is d3dc4415, the worktree's base.

## Dual audit, round 1 (2026-10-14)

- **Codex** (`gpt-6.1-sol`, high, read-only), session `01a13aaf`, the default `~/.codex` login (CODEX_ACCOUNT unset, as the brief says). Returned in one run with no quota or auth error.
  - **VERDICT: reject.** Blocking: an unseen fee increase through Confirm before the estimate lands (C1); signed priority and glossary work withheld (C2); the additive cap left unresolved (C3).
  - Seven findings in all (C1 to C7). Each was checked against the tree; dispositions are in plan.md § Audit verdicts.
- **Opus Plan agent** (background, about 11 minutes, 62 tool calls). **VERDICT: conditional approve**, four conditions: a Confirm wait for an app-raised private fee juice charge, OA-2 not shipping the pre-decision behaviour, the embedded `fjwc` route, the e2e gate commands.
- **Where the auditors agreed**: both found the Confirm gap (#396) now carries a funds consequence, and both found OA-2's first "what ships now" withheld P6-13 B. Both taken (D2, D8).
- **Where they disagreed, the driver's decisions:**
  - **Sponsors and the app's priority.** Opus: keep zero priority on sponsor rows (a third party pays). Codex: commit it on every payer. Took Codex's: every sponsor row the wallet accepts runs `sponsor_unconditionally`, so an app gains no capability it lacks without the wallet.
  - **Reuse under a priority.** Codex: extend `reuseCapRule`. Opus: refuse the stash. Took Opus's: the stash already refuses an app cap; one condition beside it is smaller (D11).
  - **C's definition.** Codex: ship it with a scan exception. Opus and the lane brief: an owner ask. Kept the ask (D7).
- **Errors caught in the draft**: `e2e:agent` exists only at the root `package.json`; smoke loads whatever `dist` holds after a network run (both from Opus). The first draft also misread P6-13 B, which itself signs "no separate priority figure" on rows without the sentence.

## Final fresh Codex pass (2026-10-14)

- New session `01a13ac1`, `gpt-6.1-sol`, high, the default `~/.codex` login; no error.
- **VERDICT: conditional approve**, two conditions, both applied: the profile path must build with the app's priority (F1), and the e2e read-back of the submitted settings cannot be deterministic, since `getTxByHash` serves only pending transactions (F2). F3 reframed OA-2 and OA-3 as signed defaults.
- **Lesson.** Before planning a read-back of a submitted transaction, check what the node keeps after mining: the pending-transaction API loses it, and a worker network tap is browser-specific.
