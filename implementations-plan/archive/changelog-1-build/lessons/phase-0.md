# Phase 0: planning consults

- Recon: one Sonnet Explore sweep (12 capabilities). Its claim that `src/page.test.ts`'s cross-origin scan would refuse the pages' GitHub links did not hold: the scan reads `src`, `<link href>`, form actions and meta URLs, never `<a href>`.
- `WORKERS_CI_BRANCH`: confirmed in Cloudflare's Workers Builds configuration docs (default variables: `CI`, `WORKERS_CI`, `WORKERS_CI_BUILD_UUID`, `WORKERS_CI_COMMIT_SHA`, `WORKERS_CI_BRANCH`).
- Codex plan audit, round 1 (gpt-6.1-sol, high, fresh session): approve with changes, nine findings, all accepted.
  1. Recon said the release checks require a lead line and bullets; `notesProblems` does not (demonstrated by reading it). Fix: recon corrected, F10.
  2. `icon in glyphs` accepts `"constructor"` (demonstrated by running it): a blank card ships. Fix: `Object.hasOwn`, plus a test case.
  3. The Release PR's preview builds with the bumped root version, so a per-draft `noindex` leaves the new release indexable on a preview URL (demonstrated trace). Fix: every non-production page `noindex`.
  4. The CSP does not stop a smuggled module script: Vite bundles it into a same-origin asset (plausible, regression risk). Fix: a multiline module-script case and an attribute-on-allowed-tag case.
  5. A whole-block light-palette pin couples the landing to wallet tokens it never reads (demonstrated trace). Fix: keep the prototype's small override, no pin.
  6. Production could drop a draft's page but still list it in the index or pager (plausible). Fix: assert absence from paths, index and pager; numeric ordering.
  7. Captures alone prove neither no-script nor reduced-motion reading (demonstrated omission). Fix: those checks and a keyboard check in the scratch browser run; `audit:vue` added; `test:e2e` skipped with its reason.
  8. Taking the wallet's 58 % would change the signed 62 % (demonstrated). Fix: keep 62 %.
  9. A version rename moved only the notes in the runbook; both orphan checks would then block (demonstrated trace). Fix: the release skill names both files and the TOML's `version`.
- Codex round 2 (same session, verification): approve with changes. (1) Phase 2 step 2 still said "add the D5 pin" (demonstrated): removed. (2) Skipping `bun run test:e2e` had no recorded waiver (demonstrated): the smoke suite joins the Phase 2 gate.
- Round 3 found both round-2 fixes unapplied: the edit script had aborted on a stale match before writing, and the resume ran anyway. Applied, then round 4.
