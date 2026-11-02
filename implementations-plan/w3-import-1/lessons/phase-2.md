# w3-import-1: phases 1 and 2 (arc 1)

- **Red first:** T1, T2(a)(b)(c) and T3 failed on base, each on its stated assertion; nothing else did. T1's fault had to be armed inside liveness call 2: the duplicate check's `occupied` reads the same physical key before the writes.
- **Gate surprise:** `bun run test` failed once on `scripts/e2e/profile-chaos-model.test.ts`: the chaos model cites `account/service.ts` by line number, and D1 moved four cited lines (+3, +4). Repointed in its own commit; the second run passed.
- **Review round 1, Codex** (gpt-6.1-sol, high, session 01a19e3c): conditional approve, one finding: T2(b) replaced the pointer write wholesale, so dropping `unless` left every test green. Fixed by reading the predicate before and after the departure; a mutation run that drops `unless` now fails T2(b).
- **Review round 1, Opus 5.5** (general-purpose): approve, with the same gap; vitest 4.1.12's `clearAllMocks` keeps queued once-values (only `mockReset` empties them), so the new spy is reset per test; two comments sharpened; #1566 extended with the rejected-but-landed commit trigger.
- **Review round 2, Codex** (resumed): **approve**, no regression.
