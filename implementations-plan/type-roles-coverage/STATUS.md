# STATUS: type-roles-coverage

- 2026-10-16 recon done (3 Sonnet explorers); counts at 8459699c: 90 live, 21 observed, 49 smoke + 20 network unobserved.
- 2026-10-16 plan drafted (light, two arcs, no stack); panel next.
- 2026-10-16 panel round 1: Codex conditional approve (7), Opus conditional approve (8); plan revised (51 smoke / 18 network); Codex verification resume running.
- 2026-10-16 Codex resume: conditional approve (2 conditions), both met as specified; plan final for approval.
- 2026-10-16 arc 1 started (orchestrator approval, A1 and A2 accepted); merged origin/dev at 4aa06020.
- 2026-10-16 phase 1.1 static gate pass: `bun run lint`, `bun run typecheck:all`, `bun run test` (797 files) exit 0; e2e legs wait on load1 < 150.
- 2026-10-16 base timing (d738b790, local, retry 0): `type-roles.test.ts` Chrome 65.7 s, Firefox 84.8 s.
- 2026-10-16 phase 1.1 smoke gate pass: `type-roles.test.ts --retry=0` green on Chrome (43.0 s) and Firefox (84.7 s), 14 sites asserted; network legs running.
- 2026-10-16 phase 1.1 network gate pass: `e2e:agent tests/e2e/network/type-roles-windows.test.ts` (retry 0) 4/4 on Chrome (142 s) and Firefox (245 s). Phase 1.1 done.
- 2026-10-16 phase 1.2 static gate pass: lint, typecheck:all, test exit 0.
- 2026-10-16 phase 1.2 smoke gate pass: `type-roles.test.ts --retry=0` green on Chrome (64 s wall, seeded test 21.4 s) and Firefox (115 s wall, seeded test 31.5 s); `rows`, `send-outcome-rows`, `navigation`, `home-links` 16/16 on Chrome. Phase 1.2 done.
- 2026-10-16 phase 1.3 gate pass: lint, typecheck:all, test exit 0; `type-roles.test.ts --retry=0` green on Chrome (73 s wall, new test 17.1 s) and Firefox (182 s wall at load1 ~200, new test 32.3 s); `send-keyboard` 5/5 on Chrome. Phase 1.3 done.
- 2026-10-16 arc 1 review: Codex round 1 `findings` (2 major taken, 1 minor rejected), Opus `clean` (all minors taken), Codex round 2 `clean` (1 minor taken). Loop converged.
- 2026-10-16 phase 1.4 gate pass: never-happens proof named the dropped site (live 58); `type-roles.test.ts --retry=0` green 3/3 on Chrome (106, 104, 119 s) and 3/3 on Firefox (186, 183, 196 s); the seven smoke importers of the seed helpers 24/24 on Chrome; D9 timings in lessons. Phase 1.4 done.
- 2026-10-16 merged origin/dev (66d9b52a); D1 gains a `component` owner for #594's two sites; the network windows spec waits for every state's sites before reading (Codex round 3, the cap: 1 major taken). Merged tree: smoke `type-roles.test.ts` green on Chrome (80 s) and Firefox (167 s); network windows spec 4/4 on Chrome (344 s) and Firefox (301 s).
- 2026-10-16 merged origin/dev again (c9e31b69); fixture twins hidden by attribute for #609's CSP. Smoke `type-roles.test.ts` green on Chrome (94 s) and Firefox (155 s); network windows spec 4/4 on Chrome (402 s) and Firefox (420 s). Arc 1 ready for its PR.
