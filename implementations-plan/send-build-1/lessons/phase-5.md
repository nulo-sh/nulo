# Phase 5: the review (arc a2)

- Read `send-build-1-answers.md` first: OA-1 answered (a), no edit control, the X returns to the form, two Tab stops.
- RS2 as one rule rather than two copies: the line's state machine moved out of `SendFeeLine.vue` into `feeLine()` in `fee-line-words.ts`, and `send.vue` hands one `feeLineState` computed to both the line and the review. A component test mounts both on each state and compares their words.
- `PayeeBlock` and `PublishStrip` must be imported in `SendReviewSheet.vue`: the component tests run without the auto-import plugin, so an unimported child renders as an unknown element and the tests read nothing.
- Two `PayeeBlock`s share their testids while the review is open (the form's and the review's); the review's sits in `#popup`, so a fixture reading the form scopes to `send-page`.
- The review's rows took four helpers with them (`FACT_SENTENCES`, `rowSentence`, `noticeBodyFor`, `stripAriaLabel`); none had another reader.
- Send now keeps focus through every state by never taking native `disabled`: `aria-disabled` and `pointer-events: none` on the base's 0.3 look; the guard in `handleSend` refuses keys and programmatic clicks.
