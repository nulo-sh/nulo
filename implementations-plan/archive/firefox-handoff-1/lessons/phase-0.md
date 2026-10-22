# Phase 0: planning consults

## Recon

- One Explore sweep (sonnet), eight capabilities; its corrections: no `isOwnWindow` exists; the background already reopens the panel after a window (`armPopupReturn`, `focusReturns`); session keys register in `stored-shapes.scan.test.ts`, not `stored-shapes.ts`.

## Audit round 1, Codex

- `gpt-6.1-sol`, high, read-only (the host's approve-for-me mode), session `01a15f73-5d10-7791-a114-fb7768ec204f`. Verdict: `reject (with blocking findings: premature record consumption, unreliable outcome capture, and incomplete browser-level validation)`.
- Checked against the tree before acting: the preload is real (`firefox-action-popup.ts:14` and FIREFOX.md:40: Firefox lists the popup document about 0.2 s before the panel shows); the Firefox `pickFile` fixture injects the file into the pending input because an evaluated click opens no chooser (`fixtures/browser/firefox.ts:613`); Restore again's `end()` reaches `leave()` with no snack on three exits (`useRestoreAgain.ts:108,135`, Continue). Dispositions in plan.md § Audit verdicts.

## Audit round 1, Opus 5.5 (Plan agent)

- Verdict: `conditional approve (with conditions: Cancel and back hand back through closeOwnWindow; the landing route cleared on first arrival; the e2e picker claim dropped and the Mac check widened; the RETURN_TO_PANEL answer and remove-failure behaviour written down)`. Two asks added to OA-1 and OA-3.
- Where the legs split: Opus judged the hover preload harmless and the snack on screen acceptable; Codex showed the mousedown preload runs the document and that Restore again ends with no snack on several exits. Codex's fixes were taken (D2, D6); Opus's no-lock view held (D4).

## Audit rounds 2 and 3, Codex (resumed)

- Round 2: `conditional approve (with conditions: specify removal failure after acknowledgement and compare consumption against the original stored snapshot)`; both applied.
- Round 3: `approve`, no finding.
