# home-onboarding-chrome: questions for the owner

Each ask names a surface, the options, what each looks like, a recommendation, and what ships now. The arc builds the "what ships now" line and waits for nothing else; an answer later changes only that part.

## OA-1. History's token chip: its details and states (#130, P13-01 A)

**Surface:** History opened from a token page (`popup/pages/activity.vue`).

P13-01 A gives the chip ("USDC ×", under the title, clearing shows all activity). It leaves these open.

- **The clear control's spoken name.** A screen reader needs a name for the "×".
  - A: "Show all activity" (the record's own words for what clearing does).
  - B: "Remove the USDC filter".
- **Place.** A: centred under the title's bar, inside the hero. B: left-aligned at the top of the list.
- **Focus after clearing** (keyboard users; the chip disappears with the focused control).
  - A: focus moves to the History title, with no visible ring.
  - B: the browser default (focus returns to the page; the next Tab starts from the top).
- **The symbol.** The chip shows the token's symbol cleaned the way the token page already cleans it (invisible and direction-changing characters removed, at most 32 characters, an ellipsis when it does not fit).
- **While History loads the token list** (a fraction of a second on opening): A: the area under the chip stays blank until the list is known. B: all activity shows first, then narrows.
- **The token is not found** (it was removed, the link names another network's token, or the token list could not be read when History opened): A: History shows all activity with no chip, as if opened from the tab. B: an empty list with the chip. If the list was read once and a later refresh fails, the filter stays.
- **The token has no activity yet** (the token page shows its header with nothing in it, or only an in-flight card): A: the chip, then History's existing "No transactions yet". B: a token-specific line (new copy).

**Recommendation:** A for each.

**What ships now:** A for each. The PR attaches the filtered, cleared and empty filtered states in both themes on both browsers.

## OA-2. The token page's header follows Home's (#132, P13-02)

**Surface:** the token page's activity header and its empty-state header (`RecentActivityView.vue` `.section_header`, the same rule as Home's).

- A: both lose the 8 px padding and the rule (one shared rule).
- B: only Home changes; the token page keeps them (a second class).

**Recommendation:** A. Home's other section (`TokensView`) already has neither, so A makes the popup consistent.

**What ships now:** A. The PR shows Home and the token page, before and after, at the popup's real size.

## OA-3. The Firefox permission row: form, place, manifest pin (#156, P13-04)

**Surface:** the onboarding Presto page and Settings → Proving, on Firefox only.

- **Form and place.** While the permission is missing, the Presto status card cannot reach Presto; it would show "Open Presto, then check again" or the Get Presto pitch, which contradict the permission line.
  - A: the permission row (a warning banner with the line, and an "Allow" button with the usual focus ring) stands **in place of** the Presto content while the permission is missing, so one instruction shows at a time. On the onboarding step, the Get Presto pitch, its section labels and the "Presto will ask you" note are hidden, Continue is unavailable and Skip shows. On Settings → Proving, "Get Presto" and the detail rows are hidden; the closing note stays. Once allowed (here or in Firefox's add-on settings), the page is exactly today's and checks Presto at once.
  - B: the row sits **above** the status card and the rest of the page, which keep showing their own state below it.
  - C: the status card itself shows the permission line, and its button reads "Allow" instead of "Retry".
- **The manifest pin.** P13-04 says the pin "gains the optional host permission". The issue said to add one only "if the step needs one". Firefox's documentation says a missing host permission can be requested back without one; arc 2 proves it first on Firefox 153.
  - A: if the probe proves it, no optional permission is added (nothing new on the AMO listing), and the pin asserts the Firefox build declares the same loopback permissions as Chrome and nothing optional.
  - B: add the optional permission on Firefox anyway.

**Recommendation:** form A, pin A.

**What ships now:** form A; pin A if the probe proves the request works without an optional permission, otherwise the Firefox-only optional permission (your P13-04 text). The PR attaches both surfaces in both themes.

## OA-4. A Mac check: does the toolbar panel survive the permission prompt? (#156)

**Surface:** Settings → Proving inside Firefox's toolbar panel, on macOS.

Firefox's toolbar panel closes when a passkey prompt takes focus (Mozilla bug 2026687), and Chrome's popup once closed under a permission prompt. The permission prompt may close Firefox's panel too, and if it does, the prompt may be cancelled with it. No headless run can show it.

**Check (two minutes, with #160's):** Firefox on a Mac, revoke Nulo's "127.0.0.1" permission (and "Access your data for all websites") in about:addons, open the toolbar panel → Settings → Proving → Allow. Note whether the panel stays open, whether the prompt stays, and whether the row is gone the next time the panel opens.

**What ships now:** nothing extra. If the panel closes and cancels the prompt, the row is still there next time and the same step works from the onboarding tab or about:addons; making the row open its own window first would be a new ask.

## OA-5. The re-staged store Send frame's composition (#170, P13-05)

**Surface:** the store capture of Send (`tests/e2e/network/store-captures.test.ts`), used at the next store-art refresh.

The frame scrolls so the amount line clears the footer. That needs about 35 px; the old rule allowed only 18 px, to keep the From/To labels below the header.

- A: the least scroll that clears the amount line; the From/To labels pass partly under the header.
- B: scroll further, so the From/To row is fully hidden and the frame starts at the recipient.

**Recommendation:** A, the smaller change to the composition you approved.

**What ships now:** A, only if #170 ships under OA-6's condition. The PR shows the committed capture beside the re-staged one. Nothing is uploaded and no store file changes.

## OA-6. If the sandbox truthfully cannot vouch for the fee payer (#170)

**Surface:** the privacy strip in the same Send frame ("YOU" cell).

The capture expects "HIDDEN"; on the sandbox the strip reads "—". Arc 2 finds the cause first. A harness mistake is fixed in the harness; a wallet fault goes to the fee lane as an issue. This ask applies only if the wallet is right to show "—" there.

- A: the store frame uses a fee method the wallet can vouch for, so it reads "HIDDEN".
- B: the store frame shows "—".

**Recommendation:** A.

**What ships now:** nothing moves the expectation; #170 ships nothing and stays open with a comment naming this ask.

## OA-7. Keyboard and screen-reader gaps on Send (#242)

**Surface:** Send's fee card links, the destination suggestions, `Checkbox`, the two scope chips, and `CollapsingHeroLayout`'s compact title.

This is already decision record P9-05 on page 9 (lane send-queue-activity), unsigned. Its proposal: (1) the two fee links become buttons with the accent ring, Tab stops where they sit; (2) the suggestions become a listbox (Up and Down from the field, Enter picks, Escape closes, no new Tab stops); (3) Space works with Enter on the three controls; (4) the degraded-fee notice becomes a polite live region; (5) the compact title is hidden from screen readers. The open choices are where the two new Tab stops sit and the listbox shape.

**Recommendation:** approve P9-05 as written.

**What ships now:** nothing in this lane. None of these surfaces is in this lane's files.

## OA-8. Onboarding follows a theme change made while it is open (#133, P13-03)

**Surface:** the onboarding tab, while the popup is used to change Settings → Display → Theme.

P13-03 says onboarding reads the stored theme before applying one, as the popup does. The popup also repaints when the theme changes elsewhere; the record does not say whether onboarding does.

- A: onboarding repaints at once, as the popup does.
- B: onboarding keeps the theme it opened with until it is reloaded.

**Recommendation:** A. It is the popup's behaviour, and the person never sees two themes at once.

**What ships now:** B. Following later changes goes beyond P13-03, so the arc ships without it. With A, the Presto step's banner would follow too.
