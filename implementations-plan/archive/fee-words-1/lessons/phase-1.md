# fee-words-1: phases 1 and 2 (the arc)

- 2026-11-13, red/green: T1's three cases and T2's three (the failed row, the two emptied names) fail on the base source and pass on the change.
- 2026-11-13, gates at `8cb861ed0`: lint, typecheck:all, test, test:components green; `e2e:agent fee-sponsor-funding.test.ts` on Chrome green (4/4, 295 s wall).
- 2026-11-13, captures: #1809's capture-only kit reused, its History flag dropped (the strip now ships). Smoke fixture for the failed row (17 s), the renamed playground over the sandbox for History (193 s). The aztec CLI's anvil bind error at boot is the documented expected one. Tree restored after each.
- 2026-11-13, Codex pass over the plan and the net diff (gpt-6.1-sol, high, read-only): approve, no findings.
