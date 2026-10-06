# Onboarding width unification

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: One shared page layout for the onboarding flow, `apps/extension/src/onboarding/components/OnboardingPage.vue`, used by the onboarding pages under `apps/extension/src/onboarding/pages/`, with its test in `apps/extension/src/onboarding/components/OnboardingPage.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Give every onboarding page, welcome included, one width of 640px through a single `OnboardingPage` layout component, instead of fixing each page's own `max-width`. The component owns the width, the top margin and the flex column that fills the shell, and takes two optional inputs: an alignment (start or center) and a gap in pixels, so the pages that want a looser or tighter rhythm keep it. It is a `div`, not a `main`, because the shell already provides the page's main landmark. The learn page's three-card grid stacks by a container query on the component, not by a viewport query.

## Why

The flow's pages had drifted to widths of 440, 480, 560 and 880px, so the width visibly jumped from step to step, step one alone had two widths, and the step indicator shrank whenever its parent was narrower than its own cap. The narrow centred cards read like the wallet popup, then the learn page blew out to nearly twice the width and read like a different surface. 640px clears the indicator's natural 560px cap and is the widest at which the create and done heroes do not sit marooned in whitespace. It is narrower than the learn grid had, so a viewport media query would have kept the grid single-column inside the container; the container query responds to the real container width and sidesteps the shell's horizontal padding. A shared component is the single source of truth, so a seventh page cannot reintroduce a width of its own.

## What shipped

- The layout component with its universal `flex: 1`, which welcome's pinned legal footer depends on, and a gap input that checks for undefined rather than truthiness, so a gap of zero is honoured.
- A container-query anchor on the component, which the explainer's card grid (`apps/extension/src/onboarding/components/OnboardingExplainer.vue`) uses to stack.
- Import keeps its tighter gap so its submit button stays above the fold, and done adds its own top padding to keep its breathing room.
- The step indicator no longer changes width across steps.
- Component tests pin the root tag as a `div`, the gap-of-zero behaviour and the default render.
