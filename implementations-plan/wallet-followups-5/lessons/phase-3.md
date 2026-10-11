# Phase 3: final validation, the review loop

## Firefox head run (D12)

The same single run as the base (N = 1, K = 29), on the head at 46c4dd4: exit 0, 12 passed and 1 skipped. `grep -cE "Invalid window ID|No window with id"` over its log: 0, against 4 at base. Codex round 1's #312 fix (the remove called inside the callback) changes no close step and no rejection path the e2e reaches; the final head gets the Chrome run.

## `test:all` on 46c4dd4

Exit 0 (every workspace green; `@nulo/extension` 742 files, 11,324 tests).

## Codex, implementation round 1

gpt-6.1-sol, high, read-only, session `01a12d3f`. Verdict: reject (with blocking findings: column-cut privacy regression; retained-string delimiter privacy regression). The Opus 5.5 diff review ran beside it: approve, with three Low findings and nits.

- (Codex 1, High; Opus 1, Low) The column cut exposes a regex/division misreading on the opener's own line, where the base's whole-line window still caught the payload: ``console.warn(`${(() => { if (ok) /[))]/.test(x); return password })()}`, password)`` (a regex after an `if (…)` head read as division) and ``console.warn(x.in / 2, y.replace(/\)/, ""), password)`` (the property `.in` read as the keyword). Verified red on the head. Fixed at the cause in `startsRegex`: a keyword after `.` is a property name, and a `)` closing an `if`/`while`/`for`/`with` head may precede a regex (`endsControlHead`). `stripNoise` untouched in shape; `baseline:rescore` still exact at 41.
- (Codex 2, High) Blanking only parens in a kept nested string left its braces counted, so ``console.warn(`${row["{{{)"]}`, password, "done")`` read `password` as an object key. Verified red on the head. Fixed: every delimiter `()[]{}` in a kept nested string is blanked.
- One self-test pins all three shapes (red on the head before the fixes, green after).
- (Codex 3, Medium; Opus 3, Low) A synchronous throw from `chrome.windows.remove` became an unhandled rejection. Fixed: `remove` runs inside the `getCurrent` callback and its promise goes to `quietIfGone`. New test: a synchronous throw still escapes the callback, nothing collected; it passes on base and fails on 46c4dd4.
- (Opus 2, Low) A logger reached by computed access (`log["warn"](`) or destructured (`warn(`) after another call on the line was caught by the base's line-end window by accident. Accepted as a named blind spot: the scanner's header now lists both (the plan's "good enough": spellings it cannot read are named, not guarded; neither shape exists on the tree).
- (Opus 5, Info) Case 2 now asserts the window is gone right after `closeCurrentWindow()` returns, so the file pins the synchronous remove itself.
- Comment nits from both legs applied: the collector's doc in two sentences, "as it does in both browsers", `LOG_CALL`'s first line, `callWindow`'s stale count dropped and its cut stated as trusting `stripNoise`.
- (Opus 6, Info) `auth-guard.test.ts`'s abandoned-request test cannot fail on `request.catch(() => {})` (`auth-guard.ts:86`), because `Promise.race` already attaches a handler to the request. Not a defect: the test pins the contract (no unhandled rejection), which holds either way; the redundant line is pre-existing and outside this lane. Disposition in the Outcome, no issue.

Gates after the fixes: the two unit files 65/65, the page windows and the scanner 540/540, `baseline:rescore` exact (23), `bun run lint` exit 0 (after `biome format` on the touched files), `bun run typecheck:all` exit 0.

## Chrome run on 454716e

The six files on Chrome at retry 0: exit 0, 13 passed (the reduced-motion test runs on Chrome).

## Codex, implementation round 2

Same session. Verdict: reject (with blocking findings: property calls misread as control heads; incomplete regex classification across multiline and for-await heads). Shapes, each reported by base and lost by 454716e: `console.warn(obj.if() / 2, password, x / 2)` (also `.while()`, `.for()`, `.with()`, `$if()`); a control head split across lines (`startsRegex` sees one line); `obj.` / `in / 2` across lines; `for await (…) /re/`; and, after another call on the line, `(console.warn)(password)`, `console.warn!(password)`, `logger.log<string>(password)`. The Opus re-probe (60,000 generated calls) found 823 such losses, all from `endsControlHead`.

Reassessment rather than a third patch: the column cut is the cause. It makes the lexer's regex/division guess load-bearing on the opener's line and drops the base's same-line coverage, and each heuristic added to compensate opens new holes. Its only benefit is one false positive that no line on the tree hits.

## Codex round 3 and Opus, the design question

Asked both legs: X (drop the cut, keep every-opener, the widened openers and the delimiter mask), Y (keep patching), Y2 (cut only when no `/` precedes it on the line). Both chose X.

- Opus: on a scratch X, the 553-call injection, the opener diff and both fuzzes show nothing the base reports lost; Y does not converge, Y2 gates a heuristic on a heuristic and still loses the call spellings.
- Codex: conditional approve (with conditions: choose X; restore whole-line depth checking; use a non-whitespace delimiter mask; explicitly adjudicate the removed false-positive artifacts). A space mask turned `${row["password(.length)"]}` into an arity read; `"\0"` fixes it.

Applied verbatim (D13): `callWindow` is the base's; the mask is `"\0"`; `endsControlHead` and the `.in` lookbehind reverted; D8(b) and D8(d) dropped; three tests pin every review shape. Spliced onto the base scanner, the three pins pass and only the three intended improvements fail; spliced onto 454716e, the three pins fail. Gates: scanner and window tests 65/65, `baseline:rescore` exact (23), `bun run lint` exit 0, `bun run typecheck:all` exit 0, the tree reports no offender.
