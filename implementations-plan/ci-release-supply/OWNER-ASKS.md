# Owner asks: ci-release-supply

Two asks, one for information. OA-1 changes what a person could see, if you choose it. Nothing waits on either answer: arcs 1 to 4 ship in full with the form marked "what ships now".

## OA-1: the onboarding title when the browser blocks Presto (#82)

`@alejoamiras/presto-banners` 1.2.0 renames one state's title. Nulo shows that title on the onboarding Presto step when the browser blocks local network access (Chrome's "Local network" permission set to Block).

- **Today (1.1.0):** "Your browser blocked local access"
- **1.2.0's title:** "Your browser blocked this site from reaching Presto"

The detail line ("Allow local network access for Nulo, then retry.") and the three numbered steps under it are Nulo's own and stay the same either way. The Settings page already uses its own title ("Browser blocked local access") and does not change.

- **Option A, adopt 1.2.0's title.** The onboarding card would read "Your browser blocked this site from reaching Presto". It is Presto's canonical wording, shared with every app that uses the banner. In an extension, "this site" is the wallet's own page, which a user may not read as a site.
- **Option B, keep today's title (what ships now).** Nulo keeps "Your browser blocked local access" as its own string, as Settings already does. Nothing on screen changes.
- **Recommendation:** B. The current title is accurate inside an extension, and it matches the detail line under it.
- **What ships now:** arc 2 bumps to 1.2.0 with option B. If you choose A, it is a one-line change and one test line.

## OA-2, for information: nightly tags under immutable releases (#178, page 5 record P5-02)

Arc 5 builds P5-02 as proposed: you exclude `refs/tags/v*-nightly.*` from the `release tags` ruleset; a daily job keeps the 14 newest nightly tags and releases and deletes older ones; stable and rc tags stay fully protected.

One point to know before you turn on immutable releases: GitHub's documentation versions disagree on whether a tag can be deleted once its immutable release is deleted. The job deletes the release first, then the tag, which is the only order that can work. The first prune after you enable immutability is watched; if GitHub refuses the tag deletion, the job reports it and stops, and you decide whether nightlies should stay GitHub releases.

- **What ships now:** nothing of arc 5. It waits on your page 5 answer and your ruleset change.

## OA-3: which pull requests the «FILL» check binds after launch (#183)

The issue asks to refuse a stable publish while a legal document holds «FILL». `legal/terms.md` holds it today and will until launch, so a check on every stable release would block the next 0.x release, and a check after the tag exists would burn the version.

What ships: a check in `quality-status` that refuses a stable 1.0.0 or later while `legal/terms.md` or `legal/privacy.md` holds a «FILL». It runs only on pull requests into `main`. So the `chore(main): release 1.0.0` PR cannot merge while a blank remains, and no tag is created. Nothing changes for 0.x releases or release candidates. If a Release PR gets past the check (retargeted from `dev`, or merged with `--admin`), the release job refuses to create the tag, and the manual procedure runs the same check. Only a tag pushed by hand skips both; the tag-creation ruleset in #21 closes that.

The question is what happens after launch, when `dev` also carries a version ≥ 1.0.0 between each stable release and the next rc.

- **Option A, PRs into `main` only (what ships now).** Every promote and Release PR is checked. A legal update drafted on `dev` with a «FILL» in it can merge there and is refused only when it is promoted.
- **Option B, also every PR into `dev`.** A blank is refused the moment it lands anywhere, but a legal draft cannot be merged to `dev` until it is complete, and the check would switch on and off as `dev`'s version moves between a stable and an rc.
- **Recommendation:** A. The release is the moment a blank matters, and drafts on `dev` stay possible.
- If you want a different line (for example, any release after a date), say so; it is a one-line change.
