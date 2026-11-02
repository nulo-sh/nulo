# Phase 0: planning consults

## Codex audit, round 1

- GPT-6.1 Sol at `high`, read-only, fresh session, full audit packet (adversarial, assumption attack, implementation critique, proportion).
- Verdict: `conditional approve (with conditions: specify ARIA cleanup, page-specific fallback targets, complete browser gates, and owner approval for hero layout changes)`.
- Findings, each verified against the tree:
  - URL test must inspect every install-marked anchor with exact counts, not only store-domain matches (low, plausible): adopted in Phase 2.
  - F1 cited `main.ts:67` and `install-dom.ts:42-55` (offsets from a concatenated read) and overstated the removal commit (low, demonstrated): corrected to `main.ts:11`, `install-dom.ts:8-21`, selective restore.
  - I1/I2 lacked pass criteria (medium, plausible): Phase 3 now measures the plate against the hero and both labels, also in the form's error state.
  - Hero order and any height change were not owner asks (medium, demonstrated): OA-7 added.
  - Fallback nav target must be page-specific (medium, plausible): `#get` on home, `/#get` on How Aztec works, written out and asserted; the landing position under the sticky bar is checked (`.final` has 72 px top padding over the 64 px bar).
  - Removing the availability lines leaves `aria-describedby` dangling unless edited (medium, plausible): Phase 2 asserts every token resolves.
  - Phase 3 was not a reproducible gate and spoofed Firefox only (medium, demonstrated): the command is named, and a real Firefox pass is added (corrected to the suite's pin by the final pass).

## Opus Plan leg

- Opus 5.5, `Plan` subagent, the same packet. Verdict: `conditional approve (with conditions: narrow Outcome (2) and add a website-privacy Ask; add a merge-timing Ask; make the Phase 3 script check the Tab order it is said to check; rerun Phase 3 after the last change to markup or CSS)`.
- Verified and adopted: `legal/website-privacy.md:12, 80` still promise the launch email (F7, OA-8); `BEFORE-LAUNCH.md:109-112` keeps Chrome unlisted and AMO experimental (F8, OA-9); the Tab order was logged, not compared; Phase 3 reruns after the loop; the Terms pin passes at base; `README.md:15`; the AMO id check; "to mozilla" in OA-1. Rejected: trimming `typecheck:all` and `test:all` (the common brief mandates them).

## Final fresh Codex pass

- GPT-6.1 Sol at `high`, new session, plan plus ledger plus `capture.ts`. Verdict: `conditional approve (with conditions: correct the Firefox pin and reconcile Phase 3's coverage claims with its assertions)`.
- Verified: `apps/extension/tests/e2e/fixtures/browser/firefox-revision.ts` pins `stable_158.0`, not 153.0.4. Adopted: the script reads that constant; the Firefox command is written out; the no-script desktop Tab order, the fallback nav landing on both pages, console errors on How Aztec works and `/subscribed`, and an `og.png` read-back (signature, size, chunks) are now asserted; the plan's claims match what runs (Tab order on desktop states and the 390 px Chrome state; real Firefox covers the detected desktop state).
