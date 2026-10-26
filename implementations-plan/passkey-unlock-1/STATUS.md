# passkey-unlock-1 status

- 2026-10-25 · recon done (3 explorers): `recon.md`.
- 2026-10-25 · key-hierarchy consult with Codex: approve with refinements (`lessons/phase-0.md`).
- 2026-10-25 · plan drafted; dual review started.
- 2026-10-25 · review round 1: Codex reject, Opus conditional approve; every point dispositioned in `plan.md` § Review verdicts; plan, asks and flows revised.
- 2026-10-25 · final fresh Codex pass: conditional approve; conditions applied; resumed round: four wording corrections, applied. Plan ready for the orchestrator's approval.
- 2026-10-25 · A1 started: owner "Start A1 now"; page 86 signed (P86-01 to P86-23) and recorded in OWNER-ASKS.md; merged origin/dev 67cae683b.
- 2026-10-25 · A1.1 gate pass: lint 0, typecheck:all 0, test 0 (925 files), test:all 0, the password-secret-box test and public.ts diff empty.
- 2026-10-25 · A1.2 gate pass: lint 0, typecheck:all 0, test 0 (928 files), test:all 0, baseline:storage unchanged, the integration test unedited. Deviation D19/D20 after a red first attempt (lessons/phase-A1.md).
- 2026-10-25 · A1 mutation pass: 59 mutations; round 1 caught 51, 7 survived, 1 equivalent; tests added (b0f9166dd), survivors re-run: 58/58 caught (`lessons/phase-A1.md`).
- 2026-10-25 · A1 flake check, 30 consecutive runs at retry 0 each, on `bun --bun vitest run`: wallet-crypto `passkey-unlock-key`, `passkey-secret-box`, `profile-slots` 30/30; extension `profile-row`, `restore-material`, `service.open-slots`, `stored-shapes.scan`, `stored-shapes.writers` 30/30.
- 2026-10-25 · A1 review loop: Codex rounds 1–3 approve (converged), Opus round 1 approve; every accepted point applied (`plan.md` § Review verdicts).
- 2026-10-25 · A1 final mutation pass on `1476a4d84`: 71 mutations, 70 caught, 1 equivalent. Flake re-run after the review's test edits, 30 consecutive runs at retry 0 each: the three wallet-crypto files 30/30, the five extension files 30/30.
- 2026-10-25 · A1 final gates on `bdb60874f`: lint 0, typecheck:all 0, test 0 (929 files passed, 3 skipped), test:all 0 (every workspace), baseline:storage unchanged, check:plans 0; the integration test, the password-secret-box test and `public.ts` unedited since the base. PR opened.
- 2026-10-25 · A2 started: branch `passkey-unlock-1-a2` off `origin/dev` 0634a7954; re-cut step 1 done (base captured, `baseline:storage` unchanged there).
- 2026-10-25 · A2.1 gate pass at retry 0: the seven named extension files (419 tests), the `extension-messaging` errors test (194), `wallet-crypto` (153). Committed aa9af0450.
- 2026-10-25 · A2.2 gate pass at retry 0: lint 0, typecheck:all 0, `bun run test` 922 files passed with only the stored-shape guard red (`baseline.test.ts`, `snapshot.test.ts` R1 and R5), which A2.3's re-cut moves.
- 2026-10-26 · A2.3 re-cut: stamp 0 regenerated (one stamp), the base's last stamp and goldens equal to the new ones but for the profile row and the new `profiles.passkeyPhrase` golden; `baseline:storage` unchanged after; the passkey backup recorded and pinned. `test:all` 0 (extension 924 files, 15176 tests), `audit:vue` 0. Committed 371cb27bc, 23366389a, 18137308c.
- 2026-10-26 · A2 screenshots, Chrome, light and dark: 16 frames. 15 match their signed picture but for data (address, words, file name), animation phase or anti-aliasing; 8 byte-identical. DIFF p86-export-menu-A: no Account row, which the plan keeps hidden for passkey profiles until A3.
