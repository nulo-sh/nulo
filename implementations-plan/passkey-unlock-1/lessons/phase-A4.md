# Phase A4: the words

## Deviations from the plan (the tree wins)

- **Effective dates.** The signed drafts give none. Terms 1.2 and Privacy 1.2.6 carry `«FILL: effective date»` (`effective: null`), as privacy 1.2.2 to 1.2.5 did until their promote; `BEFORE-LAUNCH.md` § 4 schedules them (D25). The sheet shows no date, the landing renders the version as not yet effective, and `launch-legal` refuses a promote or Release PR into `main` while one remains.
- **Beyond the signed text** (D26, OWNER-ASKS.md § A4 asks): privacy § 9 and § 3's session row, the README banner bullet, the history rows. The data row's destination "none" is written as the table's empty value, "—". The Firefox release notes went into a new § Release notes of the listing; Chrome has no such field.
- **Worktree.** `agent-worktree register` refused the branch name `passkey-unlock-1-a4` (it expects `worktree-<slug>`); the arc ran unregistered.

## 2026-10-26 · Review

Codex round 1 conditional approve, round 2 no new finding (converged); Opus round 1 found the mechanics sound. Dispositions in `plan.md` § Review verdicts.

## 2026-10-26 · Screens

Chrome, light and dark: the re-acceptance sheet for an install that accepted 1.1 (popup 360×600@2x) matches its signed picture but for the account address; the onboarding Terms gate (720×900@2x) matches but for the stepper's fourth step, "Phrase", which A2 added under P86-01 after the picture was made.

## 2026-10-26 · Flake checks

At `33d1f152d`, retry 0: the `@nulo/legal` test files 30/30; `scripts/store-listing.test.ts` with `src/utils/legal-about.test.ts` 30/30; smoke `legal-acceptance` 5/5 on Chrome (126–141 s a run) and 5/5 on Firefox (193–210 s), 14 tests each. The patch-only Privacy notice in Settings → About is proven by `legal-about.test.ts`; no smoke scenario reaches it, and none was added.

## 2026-10-26 · Close-out

- **The `dev` merge.** A3 landed while A4 was open, so `plan.md` and `STATUS.md` conflicted where both arcs appended. Both sides were kept. A3 had taken D22 to D24, so A4's two ledger ids became D25 and D26, with their references.
- **The final review.** Codex ran fresh over the net diff from `face80099`, with the cross-arc ask; Opus ran beside it with the same brief. Round 2, resumed, verified the fixes and found nothing new. The rounds and calls are in `plan.md` § Review verdicts.
- **The fix.** Full Backup's page reset on a profile id only. A3's unlock change keeps the id, so the page now resets on the id or the unlock type. Its test failed with the fix reverted. The rename control failed with the watcher widened to the whole profile object.
- **Gates.** Lint, typecheck:all, test:all (extension 931 files, 15,379 tests), the local-path guard and check:plans all passed. Smoke at retry 0: Chrome `passkey-backup`, `backup-roundtrip`, `own-window` 6/6 in 52 s; Firefox the same files and `toolbar-panel`, 11/11 in 177 s.
- **Lessons budget.** `lessons.md` holds 8,191 of its 8,192 bytes after the move. The 6.0.0 oracle-major entry retired, since the `aztec-update` skill owns it.
