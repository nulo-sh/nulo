# legal-dating-2: phase 1 (date the three versions)

- 2026-11-04 — step 1 at `fa6913668`: `NULO_LAUNCH_GATE=1 bun run --cwd packages/legal test src/launch.test.ts` failed on the five `«FILL` lines (Terms 3, 571; privacy 3, 471, 472). After the edits it passed (6/6).
- 2026-11-04 — G1 to G3 green at `eb8ef5477`; G2 printed `G2 fail=0`.
- 2026-11-04 — G4: `bun run test:all` run 1 red: `apps/extension/src/utils/log-payload-ban.test.ts` "no sensitive identifier is flattened into a log message", `Test timed out in 5000ms` (5240 ms) with load1 at 127. No code cause: the same test passed in `bun run test` on the same head minutes earlier, and the diff touches no extension source. One rerun under the host-saturation rule: green.
- 2026-11-04 — diff review: Codex r1 `clean`; Opus `clean` with one optional note (the archive README's no-edit rule); Codex r2 on that note `clean`, README left as is.
- 2026-11-04 — merged `origin/dev` at `040334f53`; G1 to G4 rerun on the merged head.
