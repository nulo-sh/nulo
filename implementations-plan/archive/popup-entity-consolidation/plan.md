# Popup entity consolidation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a self-cleaning `usePopupEntity` in `apps/extension/src/composables/usePopupEntity.ts`, with four hand-rolled popup Enter-listener lifecycles migrated onto it and the composables rule in `CLAUDE.md` updated.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make `usePopupEntity` the one canonical owner of the standard popup Enter-listener lifecycle and migrate the four remaining hand-rolled watch blocks onto it, with zero behavior change.

- The listener is removed on scope disposal, so a plain unmount cleans it up.
- Show and hide handlers may return promises, and the watcher awaits them so rejections reach Vue's watcher error channel exactly as the hand-rolled async watchers did.
- An opt-in `submitWaitsForShow` makes submit inert while the show handler's promise is pending, and a rejected population keeps the gate closed until a fresh show.
- Named exceptions stay as they were: the new-token popup's phase-machine teardown and the authwit pair's deliberate any-Enter.
- The composables rule gained a carve-out: scope-tied cleanup of non-service resources (DOM listeners, timers) via scope disposal is allowed, while service clients stay parent-disposed.

## Why

The plan audit rejected the first draft on one point. The re-entrancy latches already in the submit handlers prevent double submission, not a premature first one, so a naive migration would have opened a window during population. In the fee-payer popups a submit then would run with an incomplete duplicate list, and the contact popup's import mode could submit before its contact was set. Only the popups that installed their listener after their awaits take the gate; the one that already installed before its await does not. The cleanup rule allows scope disposal because the listener takes part in no order-sensitive teardown sequence, whereas Vue runs unmount hooks before scope cleanup, so the "no ordering coupling" claim is direction-dependent.

## What shipped

- The composable changes above with pins for scope-stop removal, the gate (including rejection keeping it closed and a fresh show reopening it), and routing of rejections through a real app error handler.
- The four popups migrated with bodies verbatim, and pins-first tests for the two fee-payer popups that had none, including Enter during the pending population.
- Test cleanup that cannot be forgotten: affected suites unmount tracked wrappers in `afterEach`, the six hand-rolled dispose helpers shrink, and one component-level canary proves shown, unmount, Enter inert. A plain unmount does not run the hide handler, so tests needing service disconnects still hide first.
