# home-onboarding-2: questions for the owner

Each item ships its "what ships now" line. The arc does not wait for an answer.

## OA-1. Where keyboard focus goes when a grant removes the row (#156)

**Surface:** the onboarding Presto step and Settings → Proving on Firefox. A keyboard user presses Allow and Firefox grants the permission.

The row leaves the page, and the Allow button that holds focus leaves with it. The signed option says nothing about focus.

- A: nothing extra. Focus falls to the document, as the browser does for a removed control.
- B: focus moves to the page's title ("Speed up" on onboarding, "Proving" on Settings), as clearing History's token chip already does.

**What ships now:** A. **Recommendation:** B. **Answered 2026-10-16, page 20 (P20-07): B.** Arc 1 shipped A; arc 2 ships B. The keyboard user keeps their place on the page, and the title is there in every Presto state. The status card's button is not: it is absent while the check runs.
