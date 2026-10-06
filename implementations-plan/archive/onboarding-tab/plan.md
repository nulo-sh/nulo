# Onboarding tab

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A full-page onboarding tab under `apps/extension/src/onboarding/` (shell in `index.html`, `index.ts` and `app.vue`, pages under `pages/`), the popup redirect in `apps/extension/src/wallet/utils/onboarding-tab.ts`, and the shared helpers `apps/extension/src/composables/waitForProfileActive.ts` and `apps/extension/src/composables/useProfileCreateFlow.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

First-time onboarding moves out of the popup into a dedicated extension tab, in the pattern other wallets use. A follow-up pass then removed the small duplications between the popup and onboarding code paths, in a deliberately reduced form.

- The tab opens on install. The popup's register and import pages redirect to it while onboarding is incomplete, and the `onboardingCompleted` flag is the redirect predicate.
- Flow: welcome, create or import, a short primer, the proving-accelerator step, done with a pin-to-toolbar tip. The profile name is required, and the accelerator step needs a detected accelerator or an explicit skip.
- No recovery education, network picker or theme picker.
- The flow has since gained a terms step and a fees step; the rest of the shape stands.
- A reset does not clear `onboardingCompleted`. Someone who has been through the primer does not need it again; reinstalling restarts it.

## Why

- The popup is too small for a first-run explainer, and a tab can hold the primer and the passkey ceremony dialog.
- The listener that opens the tab must be registered synchronously at the top level of the background script, or the install event is missed.
- Import and create logic must work in both shells, so the bootstrap code moved into shared composables that take a shell-supplied callback instead of reading popup stores.
- The extraction pass was cut from five composables to four extractions. Plain functions with explicit dependencies replaced `useX()` composables wherever no reactive state existed, anything with fewer than three consumers was dropped, and popup pages were not migrated to the new title component because their sizes and tags differ too much for one component.

## What shipped

- The onboarding shell and one page per step, with the passkey ceremony dialog living under `src/components/` so both shells can import it.
- The e2e fixtures seed `onboardingCompleted` by default, so every existing test passes unchanged, and only the onboarding suite opts in to the tab flow.
- A transition between routes was dropped because its leave state stuck under test.
- Four extractions: the brutalist title component (now in `packages/design`), the passkey profile creation with retry, the wait for the profile to become active, and the single-line redirect helper. Net code grew slightly; the gain is clarity.
- Known gaps at close: no localized copy, and the cross-context passkey unlock stays a manual smoke because a virtual authenticator does not replay across pages.
