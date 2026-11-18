# authwits-2, phase 6: arc gate and the Codex pass

- `bun run test`: 1 failure, `scripts/type-roles/inventory.test.ts`: the page's new `chipOf(aw)` identifier site had no entry. Added with role `none` (the chip renders the address at its own site); rerun green.
- Smoke `type-roles`, armed build, retry 0: Chrome 14 passed, 1 skipped, 109.8 s; Firefox 15 passed, 163.6 s. An unarmed `dist` fails the suite's fixtures: build with the `VITE_NULO_E2E_*` flags the e2e README lists first.
- Network, proverless, retry 0, `authwit-lifecycle`, `authwit-variants`, `authwit-consume-smoke`: Chrome 6 passed, run 291.1 s; Firefox 6 passed, run 302.5 s.
- Codex pass (gpt-6.1-sol, high, read-only, bounded form): conditional approve, four findings; 1, 2 and 4 fixed, 3's fix rejected (§ Audit verdicts, D13). Targeted verification: lint, `typecheck:all`, the touched tests, and the network authwit specs on both browsers, since Revoke's gating changed.
- The row-key fix edits `auth-registry/service.ts`, whose digest the `action_operations` producer pins in `identifier-sites.expected.json`: re-attested (the task content gained the keys; no operation builder changed) and re-pinned. Fix-round tests: 15 files, 345 passed, 1 skipped.
