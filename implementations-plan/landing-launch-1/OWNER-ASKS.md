# Owner asks: landing-launch-1

The owner's words of 2026-11-02 sign the change itself (store buttons back as the primary action, the signup kept for updates). The exact copy and the layout choices below are the owner's to sign on the draft PR, whose body carries them as a table (block, today, proposed). None holds the arc: it builds the "ships now" form, and an edit on the PR is a copy change plus a recapture.

## OA-1. The detected button's label on Edge, Brave and Opera

- **Ships now**: "Add to Edge", "Add to Brave", "Add to Opera", as #49 shipped it on the owner's 2026-10-08 pick "Name the browser". Fallback labels "Chrome Web Store" and "Firefox Add-ons"; nav fallback "Get Nulo".
- **Option**: "Add to Chrome" on every Chromium browser (the lane brief's wording). One line in `install-dom.ts`.
- Your words were "to mozilla"; the button says "Add to Firefox", the browser's name, as #49 did.
- **Recommendation**: ship now; it names what the person sees in their own browser.

## OA-2. The signup's label and button

- **Ships now**: "Get updates by email" and "Subscribe"; "On the list" and "Try again" stay.
- **Option**: the owner's own words.

## OA-3. The availability line ("Available early November · Chrome and Firefox stores")

- **Ships now**: removed from both forms; the store buttons above them say it.
- **Option**: "Now in the Chrome and Firefox stores", in the same place and style.
- **Recommendation**: remove; it repeats the buttons.

## OA-4. Where the store buttons sit in the closing section (`#get`)

- **Ships now**: in the existing closing row under the form plate, before "Source on GitHub" (the brief: "the bottom `cta` block gets the same buttons").
- **Option**: the row above the form plate, so the closing section leads with the store, as the hero does.
- **Recommendation**: the option; the primary action comes first in both places. Shipped literal because the order is a layout call.

## OA-5. Footer store links

- **Ships now**: not restored (the brief: no other change).
- **Option**: #49's "chrome · firefox" links back in the footer of the home page and How Aztec works.

## OA-6. The words that followed "One email at launch"

- **Ships now**: `#get` small print "Occasional updates. Unsubscribe in one click. Resend sends them for us; see the website privacy notice."; `/subscribed` "We'll send occasional updates." under "You're on the list."
- **Option**: the owner's own words.

## OA-7. The hero's order, and its height if the plate outgrows it

- **Ships now**: the store buttons, then "See what the chain sees", then the small line, then the signup form (the brief: the signup "moves under the store buttons as the secondary action"). Today the form comes first. If the taller plate would touch the REC or CAM labels at 1280 px, the hero grows just enough, as #1242 grew it from 720 to 820 px; the PR says which.
- **Option**: the form directly under the store buttons, with "See what the chain sees" and the small line after it.
- On a 390 px phone, which cannot install, the form likely sits below the fold under this order; the captures show it.

## OA-8. The website privacy notice still promises "one email when Nulo is on the stores"

- `legal/website-privacy.md` lines 12 and 80 say it, and the `#get` small print links that notice. The lane changes no legal page.
- **Ships now**: the notice unchanged.
- **Option**: a new version of the notice that drops the launch email (a legal edit, its own PR).

## OA-9. When this may merge

- The landing deploys from `main`, so any promote after this merges publishes the store buttons. `BEFORE-LAUNCH.md` § 3 still has the Chrome listing unlisted until the release announcement and AMO's "experimental" flag on.
- **Ships now**: a draft PR; nothing merges before your word.
- **Recommendation**: merge it with or after the 1.0.0 promote, once the Chrome listing is Public.
