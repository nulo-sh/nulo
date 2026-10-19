# Phase 4: the arc gate and the review loop

The host is shared, and its load swung between 150 and 800 through the afternoon; each run starts with load1 under 150.

## Gates

| Head | Gate | Outcome |
|---|---|---|
| `6c41b0ab` | `bun run audit:vue`, `bun run test:all`, `bun run check:plans` | Exit 0. |
| `3a1e4e39` | `bun run lint`, `bun run typecheck:all`, `bun run check:plans` | Exit 0. |
| `3a1e4e39` | Full smoke on Chrome, retry 0 (40 min) | 264 passed, 2 failed. Both failures were load timeouts in specs the arc does not touch: `legal-acceptance` S6, where the launch settle passed 30 s, and `migration`'s mid-migration crash, which hit the 60 s test timeout. |
| `3a1e4e39` | Full smoke on Firefox, retry 0 (59 min) | 265 passed, 3 failed: `registration` timed out at 60 s, and two `viewers-csp` log-follow checks failed. Both sidebar scenarios passed inside the suite. |
| `364ef898` (`origin/dev` merged) | Smoke reruns, retry 0 | Chrome: `legal-acceptance` and `migration`, 18 of 18 pass. Firefox: `registration`, `viewers-csp` and `firefox-sidebar`, 11 of 11 pass. |
| `364ef898` | `lint`, `typecheck:all`, `check:plans` | Exit 0. |
| `364ef898` | `test:all` at load ~800 | 106 of 13754 failed: 78 were 5 s test timeouts, the rest timing-sensitive component tests. |
| `364ef898` | `test:all` again, load under 150 | Exit 0. |
| `364ef898` | Full Firefox network suite, proverless (`NULO_E2E_PROVERLESS=1`, as CI's pool runs it) | Attempt 1 was refused by `agent.sh`, which requires the flag for proverless-gated files. Attempt 2 passed 50 of 129 files (166 tests, 0 failures) in 2 h before the harness stopped the background job at its time limit, leaving no process behind. Attempt 3 ran the other 79 files by name, detached from the harness: 78 passed, 1 skipped, exit 0 (59 min). All 129 files are green at `364ef898`. |

## Consults

- **Codex, on stopping the local network run.** At 11 of 129 files after about 45 minutes, the run projected about 8 hours, and CI's required Firefox network lane runs the same suite. Codex's verdict was **finish locally**: CLAUDE.md puts the run before the PR, Phase 4 requires it, and only the owner could amend that. The run continues.
