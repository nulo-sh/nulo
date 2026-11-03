# popup-followups-1 owner asks

Both picks are signed (page 103, P103-01 = B; page 104, P104-01 = A; 2026-11-03). One ask arose while building P103-01; it blocks nothing.

## OA-1: Create profile, what moves while "Creating..." shows (not blocking)

Tracked: #1620.

- **Surface:** onboarding, Create profile, the password method, the moment after a person presses Create profile.
- **Today:** the plain hint under the second field hides while the create runs, so the button moves up by the hint's height (about 30 px) as it turns to "Creating...". Picture: [before](screenshots/create-before-creating.png).
- **As built (ships now):** the hint, now under the first field, hides by the same rule, so the "Confirm password" heading, its field and the button move up by the hint row's height (about 24 px). Picture: [after](screenshots/create-after-creating.png). The hint must not stay: the create empties both fields before the profile boots, and the hint would then read "At least 8 characters".
- **Option B:** the hint row keeps its space while it hides, so nothing on the form moves when Create profile is pressed.
- **Recommendation:** B, since nothing then jumps under the pointer as the button changes. It is a visible change, so it waits for your word; the PR ships the as-built behaviour.
