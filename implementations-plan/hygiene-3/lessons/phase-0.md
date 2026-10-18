# Phase 0: planning consults

## #797 measurement (driver, 2026-10-18)

- A scratch copy of `SettingsSearch.test.ts` (never committed) mounted the empty-field search 400 times back to back and sent the held Escape at once. 141 were not cancelled; for every one, the event's `_vts` stamp minus the root listener's `attached` time was 0 ms; no event at 1 ms or more was dropped. With `Date.now` mocked to a constant, the held Escape was never cancelled.
- The unmodified file passed 15 of 15 runs alone: the drop needs mount and dispatch inside one millisecond, which a warm, fast worker reaches and a cold or loaded one rarely does.

## Codex plan audit, round 1 (gpt-6.1-sol, high, session 01a150de)

Verdict: `conditional approve` (cancellation read after dispatch, deterministic screenshot timing, a stronger test-identity gate). All four findings accepted and folded into plan.md:
1. A capture-phase listener reads `defaultPrevented` before the bubbling handler cancels (Codex reproduced `false` during capture, `true` after): keep the event, read it after the synchronous dispatch, fail when none was taken.
2. The countdown label ticks between captures: pin the page clock before the reveal, run base against base first, and compare the Close root's computed transition, outline and background, since a settled capture cannot show the fade curve.
3. `vitest list` cannot see a changed body: read the suites' diff from the merge base line by line.
4. "A person's key never lands in that millisecond" overclaims: reworded to "no product code changes; no real-browser failure demonstrated".
D4 and D5 confirmed; the frozen value must be nonzero (Vue reads a 0 stamp as unset); the doubled class alone is (0,2,0).

## Opus 5.5 plan audit (Plan agent, beside Codex round 1)

Verdict: `conditional approve` (name how the real `Button` mounts in Phase 4, fix the pixel proof's inputs, list the fade curve in OA-1, freeze the clock at a nonzero value read before mount). Six findings, all accepted; two overlap Codex (the label tick, the specificity numbers). New: vitest loads no component auto-import, so the composite imports `Button` explicitly (a global registration would make the base's `<component :is="'button'">` resolve to itself); captures are clipped to the composite because the mnemonic differs per profile; `pressOn` dispatches raw too (lesson line, no code).

## Codex round 2 (resumed)

Verdict: `conditional approve (with conditions: expand the screenshot clip by the outline width plus its offset)`. Accepted: 4px clip (2px ring at 2px offset); the pixel proof's reveal is click-driven (`revealSeedPhrase`), because with the page clock pinned an Enter from the password field would need the root's later Vue listener. No other defect; the explicit import conflicts with no rule.

## Codex round 3 (resumed, verification)

Verdict: `approve`, no remaining findings.
