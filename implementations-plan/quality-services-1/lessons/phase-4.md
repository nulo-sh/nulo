# Phase 4 and the arc 1 boundary

## Boundary gate (2026-11-02/03, at de637105a)

- `bun run audit:vue` first red: two re-attest pins moved with the code, not the behaviour. `scripts/type-roles/identifier-sites.expected.json` digests auth-registry's whole file, and `tests/e2e/helpers/profile-chaos/model.ts` cites five `account/service.ts` lines by number; each moved one line down with the new import. Re-read the evidence (the two `executeSendTransaction` lines, the five fragments), re-pinned, de637105a.
- Then every command exit 0, retry 0: `audit:vue` (extension 967 files / 16824 tests), `test:all`, both armed builds, smoke `sealed-storage` + `contacts` + `settings-crud` (16 passed, Chrome 56 s, Firefox 119 s), network `connect-dapp` + `tokens` + `default-token-seeding` + `incoming-transfers` (6 passed, 161 s), `check:plans`.
- `audit:dup`: 1544 clones / 21191 lines at base, 1543 / 21173 after.
- Line counts: the 16 touched production files 13373 → 13369; the two new modules (`create-fence.ts`, `seal-on-unlock.ts`) add 64, net +60. Biome wraps each `sealOnRowKeysReady(...)` enrolment over several lines; the gain is one failure boundary and one fence, not fewer lines.

## Review loop
- Round 1, Codex `gpt-6.1-sol` high (fresh session): approve, no findings. It checked fence order and emit turns, the twelve messages and both non-uniform boundaries, the purge tuple with chain 0 and old-shape rows, the `{ k, r }` text and the batch dispatch, and the options defaults.
- Round 1, Opus 5.5 diff review (`general-purpose`, beside it): approve, plus four low comment findings, all verified against the tree and all accepted:
  - the reaper's `now` doc restated its line; deleted;
  - the incoming poll gate's doc named its caller (rewritten in this diff); now one sentence;
  - the `AccountScopedRow` doc restated its type; deleted;
  - "No items, no write." restated the `if`; dropped.
  It also flagged a latent footgun: `admit` and `landed` accept an async function. It is not a bug today, and the TSDoc states the rule. No type trick, per its own call.
- Round 2, Codex resumed: approve, no new findings; the four comment fixes verified, executable code unchanged. Converged.
