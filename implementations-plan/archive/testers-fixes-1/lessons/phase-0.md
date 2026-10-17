# Phase 0: planning consults

## Recon

- One Sonnet Explore agent, six capabilities batched (selection, router scroll, toast life, the hero tap, the done-page string, test prior art). Its scroller finding (the popup window never scrolls) reshaped #582: the brief's router `scrollBehavior` would be a no-op in the popup.
- A Vue template parse listed 71 click targets with no control semantics; recon.md classifies them for phase 5.
- No e2e run at planning: load1 was 162 to 192 on a 188-core host (rule: below 150). Phase 4's base-SHA red run measures #582 instead.

## Codex audit, round 1 (gpt-6.1-sol, high; ~/.codex login)

- Verdict: conditional approve (D1 coverage, D2's async limit surfaced, stronger gates). Eight findings, each checked against the tree:
  1. vue-router is 5.2.0, and the first navigation can pass `history.state.scroll`: accepted (I1 rewritten; the map is empty then, so nothing is written).
  2. `ScopeAddress.vue:62-71` and `ScopeClassId.vue:34-44` are `role="button"` spans around an address: the global rule would turn their values off. Accepted: the value spans opt back in; the sweep covers role-bearing elements. Rejected for link rows (`SettingItem`, `TokenCard`): a drag that starts on a link drags it and a click navigates, so a link never flashes a highlight from its own use.
  3. Holdings, Home and Activity restore short while their rows load: accepted as OA-4 instead of a silent known limit.
  4. A reused page keeps its offset on a push (filtered Activity, then HISTORY in the bottom nav: same route record, unkeyed `<component :is>`): demonstrated by trace; accepted, a push that lands on the same record resets the scroller, a replace does not.
  5. I2 is not guaranteed by the spec: accepted; the probe clears the selection between drags and drags content, control, content.
  6. A selection copies DOM text past a CSS ellipsis (a stored token name): plausible but unverified, low; accepted as a sweep check, no new sanitizer.
  7. Moving waits to `toastAfter` drops the kind check: accepted; a wait is pre-armed instead (the `waitForToast` promise starts before its trigger).
  8. Every edited network file runs in both browsers; a unit case for two entries of one path: accepted.

## Opus Plan leg, round 1

- Verdict: conditional approve (OA for the list-page restore; #584 network gates and the `toastAfter` rule; drags that can fail; navigating rows settled). Eight findings, each checked:
  1. Back to Home or Holdings clamps to 0 while rows load: demonstrated by trace (`holdings.vue:206`). Accepted with Codex 3 as OA-4; `Closes #582` unless OA-4 is answered B first.
  2. Twelve network files wait on a success; `holdings.test.ts` only has a comment; `toastAfter` matches title only and returns a string; a "View" click races 2 s against slow round trips. Accepted: `fee-methods`, `snack-placement`, `incoming-arrival` in phase 1, the full network suite in phase 6, pre-armed `waitForToast` instead of `toastAfter` (Codex 7), a `hold` option that focuses the action in the in-page predicate.
  3. A drag that starts on a button or a link starts no selection, so "selects nothing" could not fail. Accepted: every drag starts and ends on text and crosses the control; the test runs red with the `body` change alone.
  4. "A row that navigates" contradicted "an amount stays selectable"; recon's list left out link and `RowTarget` rows. Accepted: a navigating row is one control, as `activity-card.module.css:7` already does. This reverses the round-1 rejection of Codex 2's link rows: a wider drag would otherwise pick up row titles, and one rule now holds for every row.
  5. A drag past the edge of an `overflow: hidden` box scrolls it for good (`popup/app.vue:587`): plausible, accepted as a sweep step, `overflow: clip` where a box shifts.
  6. vue-router 5.2.0; `saved` on a reloaded first navigation; a stop rule for an unpredicted base-SHA red; a fixed viewport for D3: accepted.
  7. The sweep must not edit other lanes' files nor add `::selection`: accepted.
  8. The token hero's tap fires on a drag that selects its figure: accepted. It moved OA-2's "ships now" to B (both heroes display only), the decision as worded.

## Codex resume, round 2

- Verdict: conditional approve. Three findings, each checked:
  1. OA-2 B removed the token page's tap with no sign-off naming that surface (CLAUDE.md § UI changes): accepted. Ships A, with a guard: the tap returns when the click ends a non-collapsed selection.
  2. `activity-card.module.css:7` sets `user-select: none` on `.title_sep` only, not the row: confirmed, citation dropped (the row rule stands on its own). The hostile-name copy moves to `TokenMetadataPopup.vue`, since `TokenCard` becomes unselectable.
  3. The `hold` option suits tests of an action's destination or content only; `preventScroll: true`; fail when focus does not land: accepted.
- The reused-page reset found no self-route push that keeps scroll on purpose (Activity clears its filter with `replace`).

## Codex resume, round 3

- Verdict: approve. The round-2 fixes verified; no new material finding.
