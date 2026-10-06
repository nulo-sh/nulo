# Vue design system and component library

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A layered Vue component model with a composite library (`apps/extension/src/components/composite/`), service-hook composables (`apps/extension/src/composables/useFormState.ts`, `useEntityCrud.ts`, `useFeeEstimation.ts`), component tests, a Storybook sandbox (`apps/extension/.storybook/`), import-layer rules in `biome.json`, and the one-shot gate `audit:vue` in `package.json`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix the root cause, not the two big popups. This replaced the narrower plan of decomposing two large popups (see [popup-window-decomposition](../popup-window-decomposition/plan.md)), which treated a symptom. Build the toolbox first (tests, sandbox, unified primitives, composites, composables, layer rules), then decompose the oversized Vue files with it.

- **One Button.** The `type` prop became `variant` (primary, secondary, outline, ghost, cta), with `outline` and `destructive` as orthogonal modifiers instead of a variant matrix, so the raw `cta`-styled buttons could move onto the primitive.
- **One Input.** The legacy default variant was dropped and the boxed style became the only one. The hero amount field stayed native, since a drop-in would have shrunk it and needed its purge handler rewritten.
- **Pure PopupCard.** Its config read moved into a composable, so the primitive keeps no service import.
- **Secret reveal.** A shared card covers the key and seed export pages only; the full backup page is a different pipeline.
- **Visual regression.** An automated visual diff was deferred and then formally skipped: the lint rules and unit tests caught unintended cross-layer change before a pixel diff would have.

## Why

The decomposition work was blocked by the shape of the layer underneath it. Raw call-to-action buttons bypassed the primitive, two Input variants coexisted, six pairs of New and Edit popups repeated about 250 lines each with no shared form abstraction, and the Vue layer had no component tests and no visual sandbox. Manual smoke was the only fidelity gate, with hundreds of end-to-end selectors depending on `data-testid` values that a decomposition must not move.

## What shipped

- **Test and sandbox infrastructure.** Component tests on `@vue/test-utils` and `@pinia/testing`, and Storybook as the sandbox after the first choice failed against the repo's Vite version.
- **Primitives, composites, composables.** Unified primitives with stories and tests; composites such as `FormPopup`, `EntityForm` and `SecretRevealCard`; service hooks that receive a connected client and expose `dispose()` for the parent to call.
- **Decomposition.** The oversized Vue files and the large pages were split with the new toolbox, testids preserved verbatim. Two popups that fit no shared form pattern were left for later.
- **Layers.** Six presentational modules were promoted from feature modules to composites, and `noRestrictedImports` overrides enforce that a layer imports only from layers below it. [CLAUDE.md](../../../CLAUDE.md) states the model.
- **Gate.** `audit:vue` runs typecheck, tests and lint in parallel, then the build.
- **Later.** The framework-agnostic primitives were externalized into a shared package; see [design-system-externalization](../design-system-externalization/plan.md).
