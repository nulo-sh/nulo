# double-optin-1 — owner asks

The lane's visible budget, from the orchestrator's brief: "New copy on three surfaces: the
confirmation email (subject and body), the form's reply after submit ("check your inbox" instead of
"you're in"), and the confirmation page the link opens (success, expired, invalid). The privacy
notice's "No confirmation email" section and its recipients line change too." Every item below
needs your words before the PR leaves draft. **Answered**: OA1–OA8 on decision page 114 (signed
2026-11-06, 14:27 UTC) and OA4's follow-up on page 116 (signed 17:04 UTC), quoted under each ask.
**Open**: OA9, which the answer to OA4 opened.

Pictures: `~/.cache/nulo-backlog/double-optin-1/shots/`, named under each ask. The pages are the
built site served with its CSP; "before" is `dev` at the plan's base. The email is drawn by Chrome; a
mail client may draw it a little differently.

## OA1. The confirmation email (new)

Sent once when someone submits an address that is not on the list. Sender and reply-to are the
launch email's: `Nulo <hello@news.nulo.sh>`, replies to hello@nulo.sh. No image or web font loads,
so opening it tells no server anything.

| Part | Proposed |
|---|---|
| Subject | Confirm your email for Nulo updates |
| Preview line | Press the button to join the list. The link works for 24 hours. |
| Eyebrow | NULO · CONFIRM YOUR EMAIL |
| Heading | One more step. |
| Body | Someone asked for Nulo updates at this address. If it was you, confirm below. The link works for 24 hours. |
| Button | Confirm my email |
| Under the button | If the button doesn't work, open this link: (the link) |
| Footer | If you didn't ask, ignore this email. Your address is not added. · Website privacy notice |

The eyebrow, the heading and the footer are set in capitals by style, as pictured; the preview line
is hidden in the body and shows only in the inbox list. Before: no email. Pictures: `email-600.png`, `email-390.png`, `email.html`, `email.txt`.
Recommendation: sign as written.

**Answered (P114-01): approved as written**, with `p114-email-600` and `p114-email-390` on the page,
the two renders above (the same files). Your note on OA4 asked for them: "what's the email design
like? I want to see that / approve myself too". The email's source has not changed since they were
drawn, so the built email is the one you approved.

## OA2. The form's reply after submit (changed)

| Where | Before | Proposed |
|---|---|---|
| Status line under the field | On the list. | Check your inbox to confirm. |
| Button after success | On the list | Check your inbox |

Two cases get this reply and no email, so the form does not say who is on the list:
- an address already on the list, or one that left it (as today it gets no write);
- the same address submitted again within 24 hours of its first email (the first link still works).
  If Resend kept the key of a first send it refused, this repeat also sends nothing although no
  email ever arrived (unverified; the person can try again after 24 hours).

Option (b), worded for both cases and shown to everyone alike: "If you're not on the list yet, check
your inbox to confirm." with the button "Sent". Recommendation: (a), the table above; nearly every
visitor is new and submits once. As today, the status line is read out by a screen reader but not
shown after a success: what you see change is the button. Pictures: `form-before.png`, `form-after.png`.

**Answered (P114-02): A**, the table above.

## OA3. `/subscribed`, the answer without JavaScript (changed)

| Part | Before | Proposed |
|---|---|---|
| Tab title | You're on the list \| NULO | Check your inbox \| NULO |
| Heading | You're on the list. | Check your inbox. |
| Line | We'll send occasional updates. | We sent you a link to confirm your address. It works for 24 hours. |
| Link | Back to nulo.sh | Back to nulo.sh |

Pictures: `subscribed-before.png`, `subscribed-after.png`. Recommendation: sign.

**Answered (P114-03): approved as written.**

## OA4. `/confirm`, the page the link opens (new)

**Behaviour first.** (a) The page shows a Confirm button and the address joins on the press.
(b) The address joins as soon as the link opens. Security tools at many companies open every link
in an email before the person does, so with (b) an address someone else typed could be confirmed by
a machine. Recommendation: (a). Confirming needs JavaScript either way: the link carries the
address in a part the browser keeps to itself, so no server log of ours ever holds it.

| State | Heading | Line | Control |
|---|---|---|---|
| Link opened | Confirm your email. | Press Confirm to join the Nulo mailing list. You'll get occasional updates and can leave in one click. | Confirm |
| Confirmed | You're on the list. | We'll send occasional updates. | Back to nulo.sh |
| Expired or not valid (one state) | This link doesn't work. | It may have expired. Links work for 24 hours. Sign up again on nulo.sh. | Back to nulo.sh |
| Network or server error | (unchanged) | That didn't go through. Try again in a minute. | Confirm, again |
| JavaScript off | Confirm your email. | Confirming needs JavaScript. Turn it on and open the link again. | none |

After Confirmed or the invalid state, the button goes away and the keyboard focus moves to the
heading, so a screen reader reads the new state (an accessibility call under your 2026-10-19
delegation, shown here so you see it). One edge: someone who left the list and opens their link
again within 24 hours sees "You're on the list." while staying off it. Pictures:
`confirm-ready.png`, `confirm-done.png`, `confirm-invalid.png`, `confirm-retry.png`,
`confirm-noscript.png`, and `confirm-ready-390.png` on a phone. Recommendation: sign.

**Answered (P114-04, then P116-23): C.** Your note on page 114: "Shouldn't we auto-confirm once the
user lands on the link? It'd be extremely weird that they have to: 1. Sign-up 2. Get the email,
click "Confirm" 3. Get directed to a page click "Confirm" again 4. And only then they are
confirmed." Your pick on page 116: "Join on open in a browser: the page submits itself by
JavaScript as it loads, with A's button as the no-JavaScript fallback. A scanner with no script
engine adds nobody; one that runs pages (some sandboxes) still could." Built: the page posts the
token as it opens and shows "You're on the list." with no second tap; opening the link again shows
it again and adds nothing. For the moment the post takes, the page shows the "Link opened" row with
its button inactive, the state A showed after a press. If the post does not go through, the
"Network or server error" row shows, and Confirm sends it again. The expired or invalid state and
every line of copy are A's, as approved. Pictures of C: `c-confirm-opening.png` (the post in flight), `c-confirm-done.png`,
`c-confirm-retry.png`, `c-confirm-invalid.png`, `c-confirm-noscript.png`, `c-form-after.png` and
`c-subscribed-noscript.png` (the form without JavaScript). What "the no-JavaScript
fallback" can be is in OA9.

## OA5. Website privacy notice 1.2 (changed)

Effective date: the day of the promote that publishes it (left as a blank on `dev`, which the
`main` gate refuses). Before → after:

- **Summary box.** "If you join the mailing list, I keep your email address, the time you joined
  and the version of this notice then in effect." → "If you join the mailing list and confirm your
  address from the email I send, I keep your email address, the time you confirmed and the version
  of this notice then in effect." (The rest of the box unchanged.)
- **§ 3.1, first paragraph.** Adds, before it: "When you submit the sign-up form, I send one email
  to the address asking you to confirm it (§ 3.5)." "When you submit the sign-up form, I keep your
  **email address**, the **time** you submitted it, the **version of this notice** in effect at
  that time" → "When you confirm, I keep your **email address**, the **time** you confirmed, the
  **version of this notice** in effect at that time"; adds at the end: "If you do not confirm, your
  address is not added to the list; Resend's records of the request and the email expire after 30
  days (§ 3.3)."
- **§ 3.1, second paragraph.** "Your address travels in the body of the request, so it does not
  appear in the request records of § 2." → "Your address travels in the body of each request, and
  the confirmation link carries it in a part of the link your browser does not send to the website,
  so it does not appear in the request records of § 2." "counts sign-ups" → "counts sign-ups and
  confirmations".
- **§ 3.3.** "Resend also keeps a log of each request the sign-up service sends it, including your
  address, for 30 days." → "Resend also keeps a log of each request the sign-up service sends it,
  including your address, and a copy of the confirmation email, for 30 days."
- **§ 3.4.** "Nothing is sent when you sign up." → "When you sign up, you receive one email from the
  same address asking you to confirm."
- **§ 3.5, "No confirmation email" → "Confirming your address".** Whole section: "When you sign up,
  I send one email to the address you entered, with a link that works for 24 hours. Your address
  joins the list only when you open the link and press Confirm. If you did not ask, ignore the
  email: your address is not added. The form sends at most one confirmation email to the same
  address in 24 hours, and none to an address already on the list or one that left it (§ 3.6).
  Before each product update I review the list and remove entries that are plainly not real."
- **§ 6, Resend's line.** "(the mailing list; the United States, with sending from Ireland)" →
  "(the mailing list and its confirmation emails; the United States, with sending from Ireland)".
- **§ 3.6.** "Every email has a link that takes you off the list in one click." → "Every product
  update has a link that takes you off the list in one click." (The confirmation email has none:
  you are not on the list yet.)
- **History row 1.2.** "Sign-ups are confirmed by email before they join the list (summary, §§ 3.1,
  3.3, 3.4, 3.5, 3.6 and 6)."

Pictures: `notice-before.png`, `notice-after.png`. Recommendation: sign.

**Answered (P114-05): approved as written.** One sentence of § 3.5 no longer matches C: OA9.

## OA6. Floods, Resend's daily send quota and bounces (answer before the PR leaves draft)

Resend's Free plan sends at most 100 transactional emails a day (reset at 00:00 UTC); broadcasts
are counted apart. Each new signup now costs one, and the email goes out at once, before you review
anything. A script on one connection, within the limit of 5 a minute, can submit 100 made-up
addresses in about 20 minutes. Then, until midnight UTC:
- honest visitors read "That didn't go through. Try again in a minute." and get no email;
- a new address gets that error while a listed one still gets "Check your inbox", so someone
  probing can tell who is on the list;
- the made-up addresses bounce. Resend's policy caps bounces at 4 % and allows it to suspend an
  account without warning; this account holds the list and sends the campaigns.

Options:
- (a) Accept it as a known limit: watch the daily send count and the bounce rate in the existing
  daily check, and turn the kill switch on during a flood. Nothing new to run.
- (b) A strict daily cap on confirmation emails, kept in a Cloudflare store: new stored state and
  its upkeep, and honest visitors still blocked once the cap is spent.
- (c) A challenge on the form (Cloudflare Turnstile): a third-party script on nulo.sh, a privacy
  notice change, and one more step for every visitor.
- (d) A paid Resend plan: more room, but also more room for a flood to bounce.

Recommendation: (a) now; revisit if the daily check shows junk. The PR implements (a).

**Answered (P114-06): A.** Filed as a closed known limit at close-out (the plan's Outcome).

## OA7. Contacts who joined before double opt-in

The list already holds the addresses that signed up before this change, none of them confirmed by
email. This plan confirms new signups only. Options: (a) keep them as they are (they joined under
notice 1.0 or 1.1, which said no confirmation email is sent, and the launch email told each why they
got it); (b) before the next campaign, send them one email asking them to confirm and keep only
those who do: new work, a separate plan. Recommendation: (a).

**Answered (P114-07): A.**

## OA8. Which branch deploys `nulo-subscribe` (a dashboard setting)

The Workers Builds API showed `nulo-subscribe` building from `dev`, while the landing builds from
`main`; merging into `dev` would have deployed the new Worker ahead of the `/confirm` page. Options:
(a) set its production branch to `main`; (b) keep `dev` and merge only in a promote window.

**Answered (P114-08): A**, with your note: "I've confirmed: I've already changed the settings for
the `main` branch. Safe to merge." Nothing in the PR changes.

## OA9. Notice 1.2 § 3.5 after your pick C (open)

**The sentence.** § 3.5, approved before you picked C, says: "Your address joins the list only
when you open the link and press Confirm." With C nobody presses in a browser that runs the page,
so it no longer holds. It ships as approved until you answer; the notice is not published before
the promote, which also fills its effective date (`BEFORE-LAUNCH.md`). Options:
- (a) "Your address joins the list only when you open the link in a browser: the page confirms it
  as it loads, and if that does not go through, you press Confirm."
- (b) "Your address joins the list only when you open the link."

Recommendation: (a); it says what happens and keeps the press the page may still ask for.

**For your information, no answer needed: the no-JavaScript fallback.** C names A's button as the
fallback without JavaScript. Under A the button needed JavaScript too: the token sits in the part
of the link only the page's script can read, which is what keeps the address out of our request
records (notice § 3.1). So with JavaScript off the page shows A's approved line, "Confirming needs
JavaScript. Turn it on and open the link again.", and no button; the button is the fallback when
the opening post does not go through. A button that works without JavaScript needs the token in a
part of the link the server receives, which puts the address in Cloudflare's request records and
contradicts § 3.1; not built. Picture: `c-confirm-noscript.png`.
