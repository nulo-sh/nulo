# Keyboard guards

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: five pages answer Enter only from their own fields and controls, and repeat or composing Enter is refused on submit controls: `refuseRepeatEnter` and `isPopupSubmitKey` in `apps/extension/src/composables/usePopupEntity.ts`, `apps/extension/src/components/composite/DappApprovalFooter.vue`, and the real-key proof in `apps/extension/tests/e2e/keyboard-guards.test.ts`.
- **Open items**: no submit latch on Recovery phrase and Change password, two keyboard focus rings that do not show, routing retired e2e gotchas into the `e2e-testing` skill, and per-test timeouts for the soak fixture cases, all tracked in #95, #96 and #185. The soak fixture's per-test timeouts were closed by a later plan before `follow-ups.md` was retired.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Bind each page's Enter shortcut on the page's root, not on `document`. It answers only an Enter in one of that page's fields that no child handled, and each button it names refuses a repeat or composing Enter through `refuseRepeatEnter`. The pages are onboarding Create, popup Import, Change password, Recovery phrase export and Full backup export. Onboarding keeps only the browser's form submission, and its form refuses a repeat Enter. New profile's private copy of the field check folds into `isPopupSubmitKey`, and the dApp windows' shared confirm (execute, capabilities, discover) refuses a repeat or composing Enter too.

With nothing focused (after a stage change removes the focused button), Enter does nothing: the person Tabs to the button they want. That is also the rule New profile and the authwit popups already follow.

## Why

A document-level Enter ran the page's main action from any control: Enter on Back, a file picker, "View Errors", "Download Backup" or the error viewer's search field ran the action instead of, or as well as, the control's own. A held Enter on a page's own button ran its action again on every repeat, which for a popup that sends or signs breaks the keyboard rule in CLAUDE.md. Enter in a field must still submit, so each page has a preservation case green before and after.

## What shipped

- `refuseRepeatEnter` checks the key itself (a repeated arrow key is not cancelled), and sits on the submit buttons of those pages and the dApp windows, and on onboarding's form. The key check was added after review so the name and comment hold for any binding.
- `pressOn`, a button-activation test helper, and an `inputTestid` prop on the design `Input` for e2e selection.
- A red-first unit or component case per page and control, plus a real Enter on Chrome and Firefox. The page rule is written into CLAUDE.md's keyboard section.
- Nothing drawn changes. The keyboard behavior changes per the Decision, and each changed surface was pictured before it was accepted.

## Lessons

### Held keys

A held key is a second `keyboard.down` with `repeat: true`, and the e2e records the press, the repeat and every click. Enter in a field makes the browser click the form's default button, and no `submit` event fires once that button's handler disables it: Vue's render lands before the button's activation behavior, which then finds it disabled. So the onboarding case asserts one activation of Create, not one `submit`. Firefox's native button also activates on a repeat Enter. On Recovery phrase, a right password lets Firefox reveal the phrase before its driver delivers the repeat, so the case holds Enter with a wrong password first, which leaves Retrieve on the page for the repeat to land on, then types the right one.

### Soak fixtures

Five of the six fixture cases per engine in `scripts/ci-cd/test-soak/cli.test.ts` start a vitest subprocess under `bun test`'s five-second default budget, though the runner allows it sixty. On a saturated host two of them timed out in the gating suite, then passed alone and on a rerun. A per-test timeout is the fix, still open.
