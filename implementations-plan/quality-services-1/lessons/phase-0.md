# quality-services-1: phase 0 (planning)

## Recon

- Two Sonnet explorers: one over the sealing shells, fenced creates, purge matchers and sealed storage; one over the `managers` registry and the four constructors. The planner re-read each site. Findings in [../recon.md](../recon.md).
- `bun run audit:dup` at the base: 1544 clones, 21191 duplicated lines.

## Consults
- **Codex, gpt-6.1-sol, high, read-only (session 01a19e82), plan round 1: conditional approve.** (1) D3 named `landed` for dapp-session only, but `addNetwork` and contact also emit right after the re-check; an emit after the helper resolves lets a deletion queued at the check run first (its reproducer printed `check, deletion, emit`): all three emits move into `landed`, and the test queues the deletion as a microtask. (2) The cited storage tests pin the outer envelope keys, not the opened `{ k, r }` text: D8 adds exact-text pins for the three keyed writes and keyed and batch synchronous-dispatch pins, before the move. (3) The generic helper test cannot see ui-preference's per-store isolation or auth-registry's shared boundary: D8 adds one test each. (4) The network e2e lacked `--retry=0` (its config retries twice) and two gates had unclear directories or an elided command: fixed. (5) Only 35 of the 45 constructions pass an optional argument; the other 10 stay. (6) It preferred keeping `commitSealedTogether`'s `set({})` for an empty batch: kept the plan's choice and traced the reachable case (`forgetFpc` with nothing to forget); the difference is whether a no-op write's rejection surfaces. Put to the resumed round.

## Panel, Opus 5.5 Plan leg (2026-11-02)

Verdict: conditional approve. Its D3 emit finding matched Codex round 1, already folded; its count and gate-directory findings too. New, each checked against the tree and accepted:
- `new-profile-helpers.ts:64-69` reads `managers.account` again after an await; a captured `ensureAccountClient()` result would keep calling a client the bootstrap replaced and disconnected meanwhile. The ensure sites call it for its effect and read the slot when they use it.
- `src/utils/` is an auto-import directory (`vite.config.ts:113`), so arc 2's new exports rewrite the tracked `src/types/`, and `_build-extension.yml:114-120` fails a PR whose build changes it: phase 5 builds and commits it.
- Phase 5's grep matched test files that move only in phase 6: it now excludes tests. Its vitest run adds `src/onboarding`, `src/components` and `src/stores`.
- D4: the task runs in the event's turn (transaction captures its epoch first), and `warn` is `(...data) => this.logWarn(...data)`; the test asserts the task started when `invoke` returns.
- D2: a two-argument `keyedRowText(naturalId, text)` replaces the four-string `keyedEnvelope`, which was easy to call with swapped arguments.
- Phase 6 adds `security-reset.test.ts`, which completes a popup profile creation; the Firefox build is named as armed.
- Its Ask: #1437's step 2 claimed injection restores the C1 rule. The plan declines the injection, so the Decision comment says the composable still reaches the app-scope registry directly. No owner ask.

## Panel, Codex resumed (round 2)

- **Codex (session 01a19e82), resumed: conditional approve.** The five folds checked. One condition: my round-1 rebuttal traced an empty batch through `forgetFpc`, but `withoutFpcInApp` and `withoutFpcInSend` always return a map, so `saveFeePick` always prepares two writes. Checked (`utils/fee-picks.ts:107-124`) and corrected: no caller builds an empty batch; Codex withdrew its request to keep `set({})`.
- **Codex (session 01a19e82), resumed (round 3): approve.** D2 and I1 match the trace; one table separator fixed.
