# locked-discovery-1: owner asks

## OA-1: a pin reminder after onboarding (the report's second half)

- **Surface**: the toolbar, after onboarding; today the onboarding done page shows a pin tip once (`apps/extension/src/onboarding/pages/done.vue`, `isOnToolbar`) and nothing later.
- **Why it is asked**: the reporter's "if Nulo is not pinned in the extensions, the user is stuck with the loading screen". The unlock window answers the locked case without the toolbar; a person with Nulo unpinned still has no visible badge.
- **Options**:
  - (a) Nothing more (ships now).
  - (b) Show the existing pin tip again in the toolbar popup until Nulo is pinned (copy as on the done page; a "don't show again" control is new copy).
  - (c) A one-time notice the first time a dApp's discovery arrives while Nulo is unpinned (new copy; needs `chrome.action.getUserSettings`, Chrome only).
- **Recommendation**: (a). With the unlock window, the badge stops being the only signal, so the case the reporter hit is answered; revisit on a user report.
- **What ships now**: (a). This arc touches no onboarding or toolbar surface.
