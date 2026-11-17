# scroll-cue-right-1: recon

Read directly at `35c580901`; no Explore agents (one rule and one e2e case, both read whole).

- **The rule.** `popup/windows/execute/index.vue`: `useMoreBelow(computed(() => scrollRef.value?.wrapper ?? null))` takes `shown` and `press` only; `.more_below` is `position: absolute; bottom: 12px; left: 16px; z-index: 1` inside `.frame` (`position: relative; flex: 1`), which wraps the scroll area only. The request-log row and `DappApprovalFooter` follow `.frame`.
- **The reference.** `components/LegalAcceptanceSheet.vue` takes `gutter` too and binds `right: 16 + gutter`; its `.more_below` sets `bottom` and `z-index` only. `useScrollRemaining` measures the gutter as `offsetWidth - clientWidth`; the execute scroll area has `scrollbar-gutter: stable` (`window-shell.module.css`).
- **The e2e.** `execute-steps.test.ts`: `underMoreBelow` returns `{ controls, text }` (controls include every `svg`); the case asserts no control and only "Leaves your account" under the button with the steps shut, nothing with them open, a text success control (the parse warning levelled under the button), nothing after press 1, the warning in view after press 2 and the button hidden. No other spec reads `execute-scroll-more`.
- **Geometry already known.** scroll-cue-4 drew the right corner (`sc4-args-cue`): the button at x 348–384, y 679–715 on `batch` at 400 × 800 (gutter 0 in the harness), over step 3's From and To with the steps open.
- **Closed limits nearby.** None about the execute window's button (`gh issue list --state closed --label known-limit --search "scroll button"`).
