# wrap-2: phase 1 (arc 1)

- The scan case was red on the base `index.vue` (`boundAttr` read no class) and green after the rule.
- `test:all` went red once: `profile-chaos-model.test.ts` checks that each line the chaos model cites (`tests/e2e/helpers/profile-chaos/model.ts`, `cite(ACCOUNT_PAGE, <line>, <fragment>)`) still holds its fragment, and the new comment's third line moved four of them down by one. The citations moved with them; the fragments did not change. The plan's change map had missed the file.
- Gate 2 (`cap-chain-mismatch`, retry 0): green on Chrome and Firefox.
- Gate 3 (the after capture): the worst banner part ends 0.2 px inside the banner in Chrome and 0.1 px inside in Firefox, for both long names, both states, at 400, 360 and 240 px. The seed rows keep each browser's base heights and line counts. The identity line still runs past its box (D5).

## Codex loop

- **Round 1, Codex, gpt-6.1-sol, high, read-only (session 01a18e78): findings.** The account.vue comment tied the watcher to the bootstrap alone. Codex reproduced, with the production coordination functions in memory, a reset completed in another window writing the re-keyed row before this window's takeover renders. Accepted: the comment now names the chain id changing or clearing. The Opus leg judged that race unsupported; the reworded comment is exact either way.
- **Round 1, Opus 5.5 (general-purpose): findings, both accepted.** `.chain_banner`'s comment said "wider than the window" (the name overflows at 360 px while narrower than the window); the account.vue reason "given for the previous network" did not fit an in-place reopen, which keeps the network and is the case this watcher exists for (the chaos model's passkey-to-passkey method change). The comment stays three lines, so the chaos model's citations hold.
- **Round 2, Codex, resumed: clean.** It verified the fixes and found no regression.
