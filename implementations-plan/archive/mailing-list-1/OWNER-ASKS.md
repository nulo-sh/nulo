# mailing-list-1 — the owner's decision page

Thirteen asks (A1 to A13) and one relay (R1). Arc 1, the `nulo-subscribe` Worker, needs none of
them: it starts now, builds A10 and A11 as recommended, and holds only its duplicate branch for R1.
Arc 2 (the invisible landing plumbing) needs A13 and your Cloudflare steps (plan.md § Security,
"Owner's Cloudflare checklist"). Arc 3 (the privacy split) needs A1 to A3 and A12. Arc 4 (the
visible form) needs A4 to A9.

## Before the key exists

**A13. Who can deploy the Worker that holds the key.** Cloudflare's default Workers Builds token
can edit every Worker in the account, and a deploy keeps the secret, so new code can read it. A
pushed landing branch runs its own `deploy:preview` script with that token. Options: (a) give each
Worker's build its own token with `Editor` on that Worker only (Settings → Build → API token), and
paste the Resend key only once `nulo-landing` and `nulo-tokens` builds still deploy with theirs;
(b) if Workers Builds refuses a scoped token: list every build in the account whose token can
edit `nulo-subscribe`, turn Preview Builds off on each (no more branch previews of the site), keep
each one's production branch `main` or `dev`, accept that code merged to either can reach the key,
and paste it then. Recommendation: (a). The Worker is created first, with no secret, since a
one-Worker token cannot create a Worker. Ships now: arc 1 builds and deploys
with no secret; nothing holds the key until you choose.

Decided, 2026-10-27: (b) for now. The owner turned non-production builds off on `nulo-landing` ("I've checked it off, non-production builds for the landing"); `nulo-subscribe` builds `main` only; the scoped tokens of (a) are #1235, before the launch send, since the one token also serves the token-list build and narrowing it needs research the owner did not want on the critical path.

## Arc 3: the privacy split

**A1. The Website Privacy Notice text.** Surface: a new page, `nulo.sh/website-privacy`, with a
permalink per version (`/website-privacy/v1.0/`), titled "Website Privacy Notice". The full text is
`WEBSITE-PRIVACY.draft.md` in this folder: who is responsible, hosting records (moved from the
wallet policy), the mailing list (what, why, Resend, what you receive, no confirmation email,
leaving, retention), writing to me, rights, transfers, children, changes, contact. Options: sign
as written; sign with edits; another title or URL. Recommendation: sign as written. Ships now:
nothing; the notice goes live only signed.

Decided, 2026-10-27: signed as written, notice 1.0, effective 27 October 2026 (the sign-off page's decision 1; "Everything else looks good").

**A2. The wallet Privacy Policy diff, and patch or minor.** Surface: `nulo.sh/privacy` and the
permalink the wallet opens. The diff is `WALLET-PRIVACY.diff.md`: § 5.5, retitled "`passkey.nulo.sh`
and `tokens.nulo.sh` hosting, contacting me, and the uninstall page", keeps those two hosts and
points to the notice; "There are no web forms" goes; § 2 gains one pointer sentence. It lands
directly on `main`, not through a promote, so the published policy changes before the form shows. Correction to the specification: § 5.5 cannot hand all hosting records over, because
`passkey.nulo.sh` and `tokens.nulo.sh` are the wallet's own hosts. Options: (a) patch 1.2.7, no
re-acceptance, no notice; (b) minor 1.3, a non-blocking notice in Settings → About. Recommendation:
(a), since the wallet's processing does not change.

Decided, 2026-10-27: (a), patch 1.2.7. Delivery changed: the diff lands on `dev` and reaches `main` in the second promote with the form, so the policy and the form go live together.

**A3. A "Website privacy" link on the legal pages.** Surface: the header nav and the footer of the
generated legal pages (`/terms`, `/privacy`, their permalinks), which list Terms and Privacy today.
Options: (a) add "Website privacy" after "Privacy" in both; (b) leave them, so the notice is
reached from the landing only. Recommendation: (a).

Decided, 2026-10-27: (a).

## Arc 4: the visible form

**A4. Which integration option.** Surface: the hero, the nav on both pages, `#get`, and possibly
a bar on both pages. The mockups lead shot the five options at 1440 and 390 px, light and dark
(`opt1-inline-hero`, `opt2-hero-button`, `opt3-expand-closed` and `-open`, `opt4-sticky-bar`,
`opt5-dialog`, beside `opt0-today`):
1. inline hero form, repeated in `#get`, nav "Notify me" focuses the hero field;
2. a hero button that scrolls to the one form, in `#get`;
3. a hero button that turns into the field in place;
4. a slim bar pinned to the bottom of both pages, dismissible;
5. a dialog opened from the hero and the nav.
Recommendation: option 1 (the field is visible above the fold and takes one step). A sub-choice
for any option: (i) the answer appears in place, with JavaScript (recommended; the spec's design);
(ii) every submission loads `/subscribed` or `/subscribe-error`, no script at all. The
availability line "Available early November · Chrome and Firefox stores" becomes the form's
caption; the dashed `.soon` style stays for non-controls only. Ships now: nothing visible.

Decided, 2026-10-27: option 1 with sub-choice (i); and the hero carries no small print at all ("I'd remove from the hero the privacy policy line, but I'll leave it on the bottom form", then "I wouldn't add any small hero tbh"). The bottom form keeps the full small print.

**A5. The form copy**, as the specification proposes:
- label "Get an email when Nulo is live"; placeholder "you@example.com"; button "Notify me";
- small print "One email at launch, then occasional updates. Unsubscribe in one click. Resend sends
  them for us; see the website privacy notice." ("website privacy notice" links `/website-privacy`);
- success "You're on the list. We'll write when Nulo is live.";
- errors "Enter a valid email address." and "That didn't go through. Try again in a minute."
Options: sign; edit. Recommendation: sign.

Decided, 2026-10-27: signed, with the hero exception of A4: the hero shows the label, the field, the button and the availability line only; the small print, with its notice link, is on the bottom form.

**A6. The nav button on both pages.** Today "Coming soon", which scrolls to `#get`. Proposed:
"Notify me", doing what A4's option says (focus the field, scroll, or open the dialog).
Recommendation: "Notify me".

Decided, 2026-10-27: "Notify me".

**A7. The footer on both pages.** Today: github · releases · privacy · terms. Options: (a) add
"website privacy" after "privacy"; (b) rename "privacy" to "wallet privacy" and add "website
privacy". Recommendation: (a), which changes no existing word.

Decided, 2026-10-27: (a).

**A8. The `/subscribed` page** (shown after a submission without JavaScript). Proposed: the site's
bar and footer, the heading "You're on the list.", the line "We'll write when Nulo is live.", a
link "Back to nulo.sh"; not indexed. Recommendation: sign.

Decided, 2026-10-27: signed.

**A9. A failed submission without JavaScript.** Options: (a) a static `/subscribe-error` page like
A8: heading "That didn't go through.", line "Check the address and try again in a minute.", link
"Back to the form" (to `/#get`); (b) the browser shows a bare text answer with the same sentence.
Recommendation: (a). The Worker redirects there from arc 1 on; the page itself ships in arc 4.

Decided, 2026-10-27: (b) for today; (a), the styled `/subscribe-error` page, is a follow-up PR this week.

## Behaviour you would notice

**A10. Someone enters an address that left the list.** (a) Nothing changes: the person stays off
the list, the form says "You're on the list" as it does for every address (so the form never
reveals who is on it), and the notice tells people who left to write to hello@nulo.sh to rejoin;
(b) the form re-subscribes them, so a stranger can undo your unsubscribe. Recommendation: (a).

Decided, 2026-10-27: (a), as built in #1240.

**A11. The rate limit.** 5 submissions per 60 seconds per IP address (per /64 on IPv6), counted per
Cloudflare location. People behind one office or mobile-carrier address share it: a sixth person in
the same minute reads "That didn't go through. Try again in a minute." Options: keep 5 per 60 s;
raise it (more junk gets through); lower it. Recommendation: keep.

Decided, 2026-10-27: keep 5 per 60 s (the sign-off page's decision 6).

**A12. What happens to an address after it leaves.** (a) Resend keeps it marked unsubscribed, with
the time it joined and the notice version, so a later sign-up by anyone cannot add it back; a full
deletion on request (the draft notice says this); (b) delete it within a set number of days, as the
specification proposed: a later sign-up by anyone can then add it back, and someone must delete
leavers by hand in Resend on that schedule. Either way Resend's request log keeps each sign-up's
address for 30 days, and the notice says so. Recommendation: (a).

Decided, 2026-10-27: (a), as the notice says.

## Relay to the Part A session (not an ask)

**R1. Resend's answer to a duplicate.** Resend documents no duplicate behaviour. The Part A session,
which holds the Resend connection, runs this once with two addresses the owner controls, then
deletes both contacts. Each create uses the plan's body (segment, topic `opt_in`, the three
properties, no `unsubscribed` field); record every status, error name and read-back:
1. create address X: is it subscribed, in the segment, topic opted in, all three properties stored?
2. create X again with a different `consented_at`: what answer, and did any property change?
3. unsubscribe X globally; create X again: is it still unsubscribed?
4. create address Y, opt Y out of the topic only; create Y again: is the topic still opted out?
The arc-1 implementer codes the duplicate branch from that record (plan.md, "Duplicates"); any
re-subscribe or rewritten property stops the arc for a plan change.

Outcome, 2026-10-27: not run before arc 1. The Worker decides by a lookup before the create and a mirror read after it, never by the error's text, so no duplicate semantics are assumed; the acceptance step after the deploy exercises a duplicate create on the owner's address (#1240).
