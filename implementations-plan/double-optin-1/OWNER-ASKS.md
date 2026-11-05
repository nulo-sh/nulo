# double-optin-1 — owner asks

The lane's visible budget, from the orchestrator's brief: "New copy on three surfaces: the
confirmation email (subject and body), the form's reply after submit ("check your inbox" instead of
"you're in"), and the confirmation page the link opens (success, expired, invalid). The privacy
notice's "No confirmation email" section and its recipients line change too." Every item below
needs your words before the PR leaves draft. **What ships now**: the arc builds each recommendation
as written, so the draft PR shows exactly what you would approve; a different pick is a copy edit.

Pictures: `~/.cache/nulo-backlog/double-optin-1/shots/` (filled in Phase 4; names below).

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

Before: no email. Pictures: `email-600.png`, `email-390.png`, `email.html`, `email.txt`.
Recommendation: sign as written.

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
visitor is new and submits once. Pictures: `form-before.png`, `form-after.png`.

## OA3. `/subscribed`, the answer without JavaScript (changed)

| Part | Before | Proposed |
|---|---|---|
| Tab title | You're on the list \| NULO | Check your inbox \| NULO |
| Heading | You're on the list. | Check your inbox. |
| Line | We'll send occasional updates. | We sent you a link to confirm your address. It works for 24 hours. |
| Link | Back to nulo.sh | Back to nulo.sh |

Pictures: `subscribed-before.png`, `subscribed-after.png`. Recommendation: sign.

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
`confirm-noscript.png`. Recommendation: sign.

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

## OA7. Contacts who joined before double opt-in

The list already holds the addresses that signed up before this change, none of them confirmed by
email. This plan confirms new signups only. Options: (a) keep them as they are (they joined under
notice 1.0 or 1.1, which said no confirmation email is sent, and the launch email told each why they
got it); (b) before the next campaign, send them one email asking them to confirm and keep only
those who do: new work, a separate plan. Recommendation: (a).
