---
plan: double-optin-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
trunk: dev
base: 4291a8c98
---

# double-optin-1 — the mailing list confirms each signup by email before it counts

The nulo.sh form adds any syntactically valid address to the Resend launch list today, so anyone can
enter someone else's address (#1236). After this plan, a submission sends one confirmation email
with a signed link that works for 24 hours, and the contact is created only when the person opens
the link in a browser, whose page posts the token as it loads (the owner's pick, D13). No pending rows are stored anywhere of ours. The owner deferred double
opt-in on 2026-10-27 with the trigger "before any campaign after the launch email"; the launch email
went out on 2026-11-04, so the trigger holds. Scope: new submissions. Contacts already on the list
are OA7. Over the mid target (about 440 lines): the audit tables carry every finding's disposition,
and the owner's sign-offs are quoted where the rules require them.

## Outcome & Quality Bar

- **For whom**: a visitor who wants Nulo updates, reading the confirmation email on a phone or a
  desktop; the owner, whose next campaign must reach only people who asked; a stranger whose address
  someone else typed.
- **Excellent**: (1) the contact appears only when the page the link opens posts its token, by
  script as it loads or by a press when that post fails, never on a bare GET, so a scanner that
  fetches links without running their scripts subscribes nobody; (2) a typed-in stranger
  is never added unless a scanner that runs the page opens their link (D13), and gets at most one
  email per exact address per 24 hours; (3) no request to
  nulo.sh carries the address in its URL, and no log line carries it, the token or a secret; (4) an
  expired, forged or malformed link gets one answer, with no hint of which.
- **Good enough**: confirming needs JavaScript (the token rides in the URL fragment); a flood can
  spend Resend's daily send quota and raise bounces (OA6, a known limit); no landing e2e suite (both
  Workers and both modules are unit-tested, one scripted browser check runs before the PR, and the
  chain gets a production check after the deploy).

## Assumptions

**Facts** (sources in [recon.md](recon.md)):
1. Both Workers deploy from `main`, each by its own Workers Build from the same push: the landing
   always did; `nulo-subscribe`'s Build was set to `dev` until the owner moved it (D16). Production
   changes at the next promote.
2. Resend's `Idempotency-Key` on `POST /emails` lasts 24 h per method and endpoint; a reused key with
   another payload is `409 invalid_idempotent_request`, one in flight `409
   concurrent_idempotent_requests`; `409 resource_locked` also exists.
3. Resend Free: 100 transactional emails per day (reset at 00:00 UTC; inbound mail counts), separate
   from broadcasts; `429 daily_quota_exceeded` past it; emails and logs kept 30 days.
4. The landing CSP allows a same-origin `fetch` from a bundled module; `run_worker_first: ["/api/*"]`
   already reaches `/api/confirm`; the landing Worker forwards only `/api/subscribe` today.
5. The bundle test admits only `infra/subscribe/src/[a-z-]+.ts` and no dependency.
6. `crypto.subtle.verify("HMAC", …)` runs on workerd and on Bun 1.4.2; Bun has no
   `crypto.subtle.timingSafeEqual`.

**Inferences** (unverified; the BEFORE-LAUNCH check records each):
- (a) Click and open tracking are off on `news.nulo.sh` (the notice says so; nobody here can read the
  dashboard), so Resend sends the link unrewritten.
- (b) Mail clients and link wrappers keep the fragment (a wrapper carries it inside its own query).
- (c) Resend may keep a key from a refused send; a retry inside 24 h would then be a 409 that sent
  nothing.
- (d) Resend's contact lookup ignores the local part's case. If not, a case variant of a withdrawn
  address gets a confirmation email, and its press may rewrite the withdrawn contact if Resend's
  create upserts case-insensitively. The BEFORE-LAUNCH check looks the variant up before creating
  it, and stops the rollout (kill switch) if the variant reads as absent.
- (e) A create retried after a committed 5xx re-sends `unsubscribed: false`. If Resend's duplicate
  create upserts, a withdrawal applied in the ≤ 2 s before that retry (by the owner, on a written
  request) is undone. The README's "no withdrawal can be lost" becomes this conditional known
  limit; the duplicate check at BEFORE-LAUNCH records whether creates upsert.

**Asks** (all in [OWNER-ASKS.md](OWNER-ASKS.md), answered on decision page 114, signed 2026-11-06
14:27 UTC, and page 116, signed 17:04 UTC): OA1 the email; OA2 the form's reply, a repeat inside
24 h included; OA3 `/subscribed`; OA4 `/confirm`, answered by D13; OA5 notice 1.2; OA6 flood, quota
and bounces; OA7 contacts that joined before double opt-in; OA8 the branch `nulo-subscribe`
deploys from. Open: OA9, the one notice sentence D13 made inaccurate.

## Architecture & Implementation

**Shape.** No new Worker, binding, var or store. `nulo-landing` forwards `POST /api/confirm` over
the existing `SUBSCRIBE` binding. `nulo-subscribe` gains a path dispatch, a token module, a
template module and one Resend call; its one new input is the secret `CONFIRM_SECRET`.

**Flow.**
1. `POST /api/subscribe`: kill switch → path → method, Origin, IP, both limiters → body cap and
   parse → honeypot (the success answer, no call) → address → config → `requestConfirmation`.
2. `requestConfirmation`: `GET /contacts/{email}`. Known in any state: the mirror read, no email,
   no write (mailing-list-1's A10 stands). `404`: `POST /emails` with `Idempotency-Key`; a 2xx,
   `409 invalid_idempotent_request` or `409 concurrent_idempotent_requests` is the success answer
   (the request is accepted; a send in flight can still fail, Inference (c) applies); any other
   409 fails as today (502).
3. The email links to `https://nulo.sh/confirm#<token>`. The static `/confirm` page reads the
   fragment, which a browser does not send in its request, and posts it at once (D13).
4. The post (on load, or a press on the retry): `fetch POST /api/confirm`, JSON `{"token": …}` → the same admission → config →
   `readToken` (`null` → 400 `{"ok":false}`, one answer for every bad token) → `addContact`,
   unchanged (lookup, mirror read, create, recheck; `consent_version` and `consented_at` are the
   confirmation's, as today they are the submission's) → 200 `{"ok":true}`. A second open, or a
   press after a lost answer, finds the contact and writes nothing.

**Token** (`src/token.ts`). `<payload>.<mac>`, unpadded base64url. Payload: the JSON
`{"e": email, "t": submittedAtMs}`. MAC: HMAC-SHA-256 under the UTF-8 bytes of `CONFIRM_SECRET`
over `"token\n" + payload` (the encoded string, so any re-encoding fails the MAC).
`readToken(secret, token, now)` returns `null` for: more than 1,024 characters; not two parts; a
part that does not decode; a MAC that `crypto.subtle.verify` rejects (checked before the payload is
parsed); a payload that is not an object with a string `e` and a safe-integer `t`; an `e` that
`normalizeEmail` does not return unchanged; `t` more than 5 minutes ahead of `now`; `now - t` over
24 h. `sendKey(secret, email)` is `"confirm/" + base64url(HMAC(secret, "send\n" + email))`; the
labels keep the two MACs apart, and the key never shows the address.

**Per-address limit.** The send key depends only on the exact normalized address and the secret;
each submission's payload carries its own time. So within 24 h of the first accepted send, a
further submission of that exact address is a 409 and sends nothing (two in the same millisecond
are one identical request). Spelling variants that one mailbox receives (`Victim@`, `victim+1@`,
Gmail's dots) get their own keys: no normalization covers every provider, so the claim stays "the
same address", and the per-IP limit and the daily quota bound the rest (OA6). Rotating the secret
resets the window.

**Interfaces.**
- `resend.ts`: `call()` takes optional extra headers and, for a 409 only, returns Resend's error
  `name` when it is one of the two idempotency names (read from a JSON body, never logged); `Stage`
  gains `"send"`; new `requestConfirmation(up, config, email, message, key): Promise<Outcome>`,
  sharing the lookup and mirror read with `addContact`, which keeps its signature.
- `confirmation.ts`: `confirmationEmail(token): Message` (`from: "Nulo <hello@news.nulo.sh>"`, the
  launch broadcast's sender; `reply_to: "hello@nulo.sh"`; `subject`, `html`, `text`). The HTML
  loads no remote image or font; every interpolation passes one escaper.
- `body.ts`: `Fields` gains `token: string | null`.
- `worker.ts`: `Env.CONFIRM_SECRET?`; `configOf` requires it, at least 32 characters (a length
  floor, not an entropy check; the README asks for 32 random bytes); `SUBSCRIBE_PATH`,
  `CONFIRM_PATH`; any other path 404 after the kill switch. `/api/confirm` answers JSON only: its
  one caller is the page's script.
- Landing `src/confirm.ts`: `tokenFrom(hash)` (shape and 1,024-character cap, else none),
  `postConfirm(token, fetch)` → `"confirmed" | "invalid" | "retry"` (only `200 {"ok":true}`
  confirms, `400` is invalid), `submitConfirm(view, fetch)` over a `ConfirmView` like `SignupView`,
  `startConfirm(view, hash, fetch)`, which posts at once and returns `{ press, opened }` (D13),
  `mountConfirm()` from `main.ts`, a no-op on other pages. The token is read once at mount, set
  only through `textContent`/attributes, never `innerHTML`.

**File map.** Add `infra/subscribe/src/{token,confirmation}.ts`, `infra/subscribe/test/{token,
confirmation}.test.ts`, `apps/landing/confirm.html`, `apps/landing/src/{confirm,confirm.test}.ts`,
`legal/archive/website-privacy-1.1.md`. Modify `infra/subscribe/{src/{worker,resend,body}.ts,
test/{worker.test,fakes,deploy.test}.ts,wrangler.jsonc,README.md}`, `apps/landing/{src/{worker,
worker.test,main,signup,signup.test,page.test}.ts,index.html,subscribed.html,vite.config.ts,
README.md,src/styles/page.css}`, `legal/website-privacy.md`, `BEFORE-LAUNCH.md`,
`.github/workflows/pr-quick.yml` (verify list), `CI.md`. Nothing under `apps/extension/**`.

**Not taken** (arguments in the ledger and Audit verdicts): a GET that confirms (outline B); a page
the key-holding Worker renders with a POST form; a pending contact in Resend (outline C); a KV or
Durable Object record per address; a Rate Limiting key on the address; a lowercased or de-tagged
send key; a format prefix and a canonical-encoding check in the token; deriving the HMAC key from
`RESEND_API_KEY`; direct creation while the secret is missing.

**UI impact.** The orchestrator's no-ask record is the whole visible budget: "New copy on three
surfaces: the confirmation email (subject and body), the form's reply after submit ("check your
inbox" instead of "you're in"), and the confirmation page the link opens (success, expired,
invalid). The privacy notice's "No confirmation email" section and its recipients line change
too." The owner signed each surface on decision page 114 (2026-11-06, 14:27 UTC) and page 116
(17:04 UTC); the words are in `OWNER-ASKS.md`, the pictures under each ask. The extension shows
nothing new.
- *UI impact: the confirmation email* (new): OA1, P114-01 "approved as written", with its 600 and
  390 px renders on the page; the built email is the one rendered (same source since the capture).
- *UI impact: the hero and footer forms' reply after submit* (status line and button label): OA2,
  P114-02 "A".
- *UI impact: `/subscribed`*, the no-JavaScript answer (title, heading, line): OA3, P114-03
  "approved as written".
- *UI impact: `/confirm`* (new page; confirmed, invalid, retry, no-JavaScript): OA4, P114-04's note
  ("Shouldn't we auto-confirm once the user lands on the link?") answered by P116-23 "C": "Join on
  open in a browser: the page submits itself by JavaScript as it loads, with A's button as the
  no-JavaScript fallback. A scanner with no script engine adds nobody; one that runs pages (some
  sandboxes) still could." The copy is A's as approved; D14 and D15 say how C's states use it.
- *UI impact: the website privacy notice 1.2* (summary, § 3.1, § 3.3–3.6, § 6, history): OA5,
  P114-05 "approved as written"; its § 3.5 sentence on the press is OA9, open.

## Security & Adversarial Considerations

- **Third-party mailing.** Anyone can still make the form send one email to an address not on the
  list: at most one per exact address per 24 h, five submissions per minute per IP per location,
  60 per minute overall per location. The email adds nothing; the address joins only when the link
  is opened in a browser that runs the page.
- **Flood (OA6; filed at close-out as a known limit, linking #1237).** A script supplies `Origin`
  and leaves the honeypot empty, so one IP at 5 a minute spends the 100-a-day quota in about 20
  minutes. Then honest visitors read "try again" until 00:00 UTC, and while it lasts a new address
  answers 503 where a listed one still answers 200 (a membership oracle #1238 did not cover). Junk
  sends also bounce; Resend's policy caps bounces at 4 % and may suspend the account, which holds
  the list. Backstops: the limiters, the kill switch, the daily check (now with the send count and
  bounces). A strict daily counter is persistent state and a challenge is a third-party flow: both
  the owner's call. No hidden failure, padding or retry is added to mask the oracle.
- **The new secret.** `CONFIRM_SECRET` lets its holder mint tokens: adding any address, the power
  the form had before this plan. It cannot read the list or send mail. Separate from
  `RESEND_API_KEY`. Set by the owner in the dashboard from a local random generator (README
  checklist); never in the repo, CI, a `.env`, a test or a chat; tests use a fixed fake. Missing or
  short: every admitted request that needs it answers 503 (the honeypot still answers first, as
  today); no fallback to the old flow. Rotation voids links in flight and resets the window.
- **Crypto.** HMAC-SHA-256 through WebCrypto, `crypto.subtle.verify` for the constant-time check,
  the MAC verified before any parse, domain-separated inputs. No home-made primitive, no JWT
  library, no encryption: whoever reads a token (its owner, their mail provider, a link wrapper)
  already sees the address, and encryption would not stop a bearer from using it.
- **Hostile tokens.** A length cap before decoding, a strict shape, the address re-validated, both
  time bounds. Expired, forged and malformed tokens get the same status, headers and body. A token
  over 1,024 characters inside the 2,048-byte body is a 400; a larger body stays a 413.
- **Replay.** A valid token replayed after confirmation writes nothing (the contact exists, in any
  state). After a full deletion on request, a token under 24 h old can re-create the contact; the
  notice already says a later sign-up can re-add a deleted address (README known limit).
- **Link scanners, the accepted trade (D13).** A GET only loads a static page; the contact needs
  the page's script to read the fragment and POST it with `Origin: https://nulo.sh`. A scanner that
  fetches links without running their scripts adds nobody. One that runs the page (some sandboxes
  detonate links in a browser) confirms the address it opens, so a stranger whose address someone
  typed, behind such a scanner, can be added without a tap. The owner accepted that on page 116
  for one tap in every browser: "A scanner with no script engine adds nobody; one that runs pages
  (some sandboxes) still could." Bounds: every product update's one-click unsubscribe, the
  per-address and per-IP limits on the emails that start it. README known limit.
- **Privacy.** The address travels in the email, in Resend's logs (disclosed) and in POST bodies;
  the fragment keeps it out of every nulo.sh request line, `Referer` and Cloudflare's request
  sample, though a recipient's link wrapper sees the whole link. The send key is an HMAC. The
  console spy gains the token, its payload segment and the secret as markers.
- **Enumeration.** In normal operation the answer is identical for a new address, a listed one and
  the decoy, with the same round trips as today (`GET` + send vs `GET` + mirror `GET`). Send-only
  failures (quota, an unverified domain) break that, as above.
- **Rollout.** The two Builds deploy independently. Landing first: the new copy over direct
  creation, for minutes, or until a failed subscribe build is fixed. Subscribe first: links reach
  `/confirm` before the page exists, and a failed landing build prolongs it (the token lasts 24 h).
  Either build failing: the person running the promote turns the kill switch on until both are
  green. A subscribe deploy resets the switch from `wrangler.jsonc`, so after each one while the
  landing is still failing, that person checks the switch and turns it on again.
- **Supply chain.** No dependency added to either Worker; the bundle test keeps the subscribe
  bundle to `src/`.

## Decision ledger

| # | Decision | Codex | Opus | Why it stands |
|---|---|---|---|---|
| D1 | Stateless HMAC token, no stored pending rows | for | for | C stores unconfirmed addresses, spends the contact quota, adds a re-subscribe path |
| D2 | Token in the fragment of a static landing page | for | for | B and the interstitial put the address in a nulo.sh request line; the cost (JavaScript) is OA4 |
| D3 | A press confirms; a GET never does | for | for | superseded by D13 (the owner's pick); a GET still never confirms |
| D4 | Per-address limit by Resend's `Idempotency-Key`, on the exact address | for, no normalization | for, with lowercase and tag strip | rejected the strip: Gmail's dots defeat any partial rule, so it bounds nothing for the commonest provider; the claim is narrowed instead |
| D5 | A listed address gets no email | for | for, once (d) is recorded | no mail to listed people; no write |
| D6 | `consented_at` and `consent_version` at confirmation | confirmation time | either | consent is opening the emailed link (D13); `addContact` stays unchanged and `v` leaves the token |
| D7 | `/api/confirm` shares both limiters | for | for | no new binding |
| D8 | Separate secret, 32-character floor, fail closed | for | for | key separation |
| D9 | Accessibility (owner's 2026-10-19 delegation): native `<button type="button">`, the `aria-disabled` lock signup uses, a `role="status"` region; on a final state the button is hidden and focus moves to the heading (`tabindex="-1"`) | for, show it in OA4 | for | focus never lands on a removed control |
| D10 | Named 409s only | proposed | — | an unknown 409 proves nothing; reading the name is local to `call()` |
| D11 | Token without a format prefix or canonical check | for the prefix | against both | tie on the prefix, so the simpler form: rotation already voids 24 h of links |
| D12 | Notice 1.2 keeps `«FILL: effective date»`; `legal-pages.test.ts` reads its history row as `parseDocumentHeader` reads the header (a placeholder is no date yet) | (Codex loop) | — | deviation found in Phase 3: the test compared a parsed header (`null`) with a raw row; a blank is refused on a PR into `main` by the launch gate (proved red with `NULO_LAUNCH_GATE=1`), a placeholder date would not be |
| D13 | `/confirm` posts its token as it loads; A's button stays as the retry | — | — | the owner's pick, P116-23 C (quoted under UI impact); no Worker change, since `/api/confirm` was already idempotent |
| D14 | With JavaScript off, A's approved no-script line and no button | — | — | deviation from C's wording: no button can confirm without script, since only the page's script reads the fragment and a server-readable token would put the address in the request records notice § 3.1 excludes; the fallback that can work is the retry. Told to the owner in OA9 |
| D15 | While the opening post is in flight, A's ready state with the button locked | — | — | only approved states show (A's state between a press and its answer); hiding the button would leave "Press Confirm" with nothing to press. Accessibility (2026-10-19 delegation): focus moves to the heading on a final answer, as before |
| D16 | `nulo-subscribe` deploys from `main` | — | — | P114-08 "A", the owner: "I've confirmed: I've already changed the settings for the `main` branch. Safe to merge." A dashboard setting; nothing in the repo changes |

## Phases

**Phase 1 — the Worker** (`infra/subscribe`). ✓
1. Add `src/token.ts` (`signToken`, `readToken`, `sendKey`, base64url) and `src/confirmation.ts`.
2. Change `resend.ts`, `body.ts`, `worker.ts` as Interfaces says.
3. Rewrite the README: purpose, threat model, the contract table for both paths, a checklist item
   for `CONFIRM_SECRET` (32 random bytes from a local generator, pasted once), rotation (voids
   links, resets the window), the daily check (send count, bounces), Resend references, known
   limits (drop "No double opt-in"; add JavaScript, script-running scanners, replay after deletion,
   send-only failures; Inference (e) replaces "no withdrawal can be lost").
4. Tests (`bun test`; fakes: `resendStore` routes `POST /emails`, keeps each key from the moment it
   accepts it, answers a same-key same-payload repeat with the first `id`, another payload with
   `409 invalid_idempotent_request`, an overlap with `409 concurrent_idempotent_requests`; `post()`
   takes a path; `makeEnv` sets a fake secret; spy markers add the token, its payload segment and
   the secret):
   - `token.test.ts`: a round trip; one changed character in each part → `null`; the wrong secret
     → `null`; `now - t` exactly 24 h valid, one ms more `null`; 5 min ahead valid, one ms more
     `null`; each malformed class (parts, decoding, length, JSON shape, an address `normalizeEmail`
     changes) under a MAC the test computes itself → `null`; `sendKey` deterministic, different per
     address and per secret, without the address.
   - `confirmation.test.ts`: the link in both parts is `https://nulo.sh/confirm#<token>`; every
     `href` is on `https://nulo.sh/`; no `<img`, `<link` or `{{`; the escaper on a hostile string.
   - `worker.test.ts`: one table runs the existing refusals (method, Origin, missing IP, both
     limiters, body cap, headers on every answer, the kill switch) on both paths. A new address →
     `GET`, then `POST /emails` with the exact sender, recipient, reply-to, key, and a token that
     `readToken` maps to the address and the clock; no contact write. Each listed state → `GET`,
     `GET`, no send, the new address's answer. A repeat → the same key with another body, the
     409, one email in the store, identical answers; after the key expires → a second email. A 5xx
     retry repeats key and body. Each named 409 → success; `resource_locked` and a 409 without a
     body → 502; a 422 → 502; a send-only 429 → 503 (pins the OA6 oracle as built). `/api/confirm`:
     a valid token → the contact, with the version and time of the confirmation; twice → one contact,
     two 200s; expired, forged, malformed, missing and over-long → byte-identical 400s, no Resend
     call; a listed unsubscribed address → no write. A missing or short secret → 503 on both paths.
     Any other path → 404.
- *Gate*: `cd infra/subscribe && BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test` exits 0 at retry 0
  with the bundle test green; `bun run lint` and `bun run typecheck:all` exit 0. Layers: lint,
  types, unit.

**Phase 2 — the landing** (`apps/landing`). ✓
1. `src/worker.ts`: forward `/api/subscribe` and `/api/confirm`, nothing else, the request unchanged.
2. Add `confirm.html` (bar, a `main` with heading, lead, button, status region, a `<noscript>`
   line, footer; noindex; not in the sitemap) and `src/confirm.ts`; call `mountConfirm()` from
   `main.ts`.
3. Apply OA2 and OA3's recommended copy: `SIGNUP_MESSAGES` (outcome `subscribed` renamed
   `requested`), both forms' `data-label-ok`, `subscribed.html`.
4. Add `confirm.html` to `vite.config.ts`, the `pr-quick.yml` verify list, `CI.md`, the README.
5. Tests: `confirm.test.ts` (each outcome; the lock; JSON `{token}` with `Accept:
   application/json` to `/api/confirm`; a missing, malformed or over-long fragment shows the invalid
   state and posts nothing, beside a well-formed control that posts on a press and never before,
   superseded by Phase 5's post on open);
   `worker.test.ts` (both paths forwarded unchanged; `/api/confirm/` and `/api/Confirm` 404;
   non-POST 405 on both); `page.test.ts` (confirm built, noindex, footer, same-origin references
   only; `/subscribed`'s new text); `signup.test.ts` (the new message).
- *Gate*: `bun run --cwd apps/landing test` and `bun run --cwd apps/landing build` exit 0;
  `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating`, `bun run test:release`,
  `bun run lint:actions` exit 0. Layers: lint, types, unit, build.

**Phase 3 — the notice.** ✓
1. Copy `legal/website-privacy.md` byte for byte to `legal/archive/website-privacy-1.1.md`.
2. Write 1.2 with OA5's recommended text; `Version 1.2 — effective «FILL: effective date»` (a draft
   on `dev`; `NULO_LAUNCH_GATE` refuses it on a PR into `main`).
3. Set `CONSENT_VERSION` to `"1.2"`. Add a `BEFORE-LAUNCH.md` § 4 box "Due at the release that
   publishes website notice 1.2": OA1–OA7 answered; the date; `CONFIRM_SECRET` set before the
   promote merges; both Builds green after it (either failing: the kill switch on until both are,
   rechecked after every subscribe deploy, which resets it);
   then, with a fresh owner-controlled address absent from the contacts: the email arrives,
   unrewritten, its HTML and text links intact (also once through a wrapping client); a repeat
   inside 24 h sends nothing; the press creates the contact with `consent_version` 1.2; a second
   press writes nothing. On a disposable contact, withdrawn first: look up a case variant before
   creating it (absent → kill switch on, stop); submit the variant (no email, no write); create the
   contact twice and record whether the second create upserts. Record Inferences (a), (d), (e);
   (c) stays unverified unless a refused send is exercised. `/website-privacy/v1.1/` shows 1.1.
- *Gate*: Phase 1's `bun test`; `bun run --cwd apps/landing test`; `bun run test:all`;
  `scripts/check-no-local-paths.sh`; `bun run check:plans` after staging. Layers: lint, types, unit.

**Phase 4 — the browser check and the owner's pictures** ✓ (scratch under
`~/.cache/nulo-backlog/double-optin-1/`, nothing committed but `OWNER-ASKS.md`).
1. Start the landing's dev server on a port claimed through `~/.agents/ports.md`; drive it with
   the Puppeteer `apps/extension` already installs (this repo's runner; adding Playwright for one
   scratch check is a new dependency), `/api/*` answered by request interception.
2. Check on `/confirm#<token>` (under A; Phase 5 reruns it for D13): no POST before the press;
   one POST with the token after it; a second press in flight sends nothing; the final state moves
   focus to the heading. Record the result in `lessons/phase-4.md` and the PR body.
3. Capture: the email HTML at 600 and 390 px; the hero form after submit; `/subscribed`; `/confirm`
   in each state and without script; the notice's changed sections, before and after. Name each
   picture beside its copy in `OWNER-ASKS.md`.
- *Gate*: the check passes; every picture exists and is named; `bun run check:plans` exits 0.

**Phase 5 — the owner's answers** ✓ (after decision pages 114 and 116).
1. `src/confirm.ts`: `startConfirm` posts at once (D13); module doc, both READMEs, the email
   template's comment and the `BEFORE-LAUNCH.md` acceptance step say the link confirms on open.
2. `confirm.test.ts`: the post fires as the page opens (locked, one request, the confirmed state,
   focus on the heading); a second open posts the same token and shows the confirmed state again
   (the Worker's side, one contact and two 200s, is `worker.test.ts`); each answer class on the
   opening post; after a failed opening post the button confirms on a press; a press while it is in
   flight sends nothing. Mutation check: an `opened` that posts nothing reds eight tests.
3. Quote the sign-offs in the ledger, the `UI impact` lines, `OWNER-ASKS.md` and the PR body.
4. The browser check again with the site's CSP, scripts on and off; captures of `/confirm`'s
   states and the form's reply.
- *Gate*: `cd infra/subscribe && BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test`, `bun run --cwd
  apps/landing test` and `build`, `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun
  run check:plans`, all at retry 0; one Codex round over the diff since the converged head.

## Delivery

One arc, one PR against `dev` (D-orch-1: no stack), branch `double-optin-1-a1` off `origin/dev`
carrying the plan commit. Title: `feat(subscribe): confirm each signup by email before it joins the
list` (70 characters). Body: what changed and why, the gates with outcomes, the browser check, the
accessibility call under the owner's 2026-10-19 delegation (D9), `Closes #1236`. Opened **as a
draft** after the gates and the Codex loop: the owner's answers to OA1–OA8 came back through the
orchestrator, then Phase 5, the close-out commits and "ready". No e2e lane trips.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation
standard](../README.md#post-implementation-standard) at `4291a8c98`. Values: `code_review: off`;
reviewer `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only
gpt-6.1-sol`, resumed with `resume-codex.sh`; one loop over the whole arc diff from `origin/dev`,
three rounds then stop and report; one Opus review (`Agent`, `general-purpose`, `model: "opus"`)
beside round 1; rounds in `lessons/phase-N.md` and under Audit verdicts. Final gates on the head:
`bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run
test:ci-gating`, `bun run test:release`, `bun run lint:actions`, `bun run check:plans`.
Close-out, after the owner's copy lands: merge `origin/dev`, read `index.md` and `lessons.md`;
Outcome with `Known limits:` (the flood limit of OA6, filed closed as `known-limit`, linking #1237
and #1238) and `Open items:`; delete `STATUS.md`; the `git mv` into `archive/` in its own commit;
then mark the PR ready. Teardown once `git fetch -q origin dev && git cat-file -e
FETCH_HEAD:implementations-plan/archive/double-optin-1/plan.md` succeeds: `agent-worktree done
double-optin-1 --merged`. The orchestrator notices the merge.

## Audit verdicts

**Round 1, 2026-11-05.** Codex (Sol, high): conditional approve. Opus (Plan): conditional approve.

| Finding | From | Disposition |
|---|---|---|
| A send-only failure (the daily quota, reached by one IP in ~20 min) answers 503 for a new address and 200 for a listed one | both, high | accepted as a known limit with the owner's choice (OA6); comments, README and the old test's claim narrowed; a test pins it |
| One IP floods; bounces can suspend the Resend account | both | accepted: Security rewritten, OA6 expanded, owner acceptance before the PR leaves draft |
| Case and tag variants get their own send keys | both | accepted as a narrowed claim; Opus's lowercase-and-strip key rejected (D4) |
| Any 409 read as success | Codex | accepted: named 409s only (D10) |
| Two Builds are not one rollout | both | accepted: Security "Rollout" and the BEFORE-LAUNCH order |
| Notice 1.2 draft says "I keep nothing" and "review before each send" | Codex | accepted: OA5 reworded |
| Contacts from before double opt-in reach the next campaign | Codex | accepted: scoped to new submissions, OA7 |
| `consented_at` at submission records the attacker's act | Codex | accepted: confirmation time (D6) |
| A repeat inside 24 h says "check your inbox" and sends nothing | Opus | accepted: OA2 |
| Lookup case-sensitivity unrecorded | Opus | accepted: Inference (d), recorded at BEFORE-LAUNCH |
| "No URL any server receives" too broad; "every endpoint 503" ignores the honeypot | both | accepted: narrowed |
| Replay after a full deletion; rotation resets the window | both | accepted: README known limit and rotation note |
| Leaver reopening a live link sees "You're on the list" | Opus | accepted: noted in OA4 |
| Click tracking is unverified; daily quota resets at 00:00 UTC | both | accepted: Inference (a), Fact 3 |
| Tests: admission on both paths, key retention from acceptance, named and unknown 409, 400 vs 413, payload spy marker, no POST before a press, a mounted-page check | both | accepted: Phases 1, 2, 4 |
| Drop the format prefix and canonical check | Opus | accepted (D11); Codex had called the prefix proportionate |
| Encrypt the address in the token | both | rejected by both: readers of the token already see the address |

**Final fresh pass, 2026-11-05** (Codex, Sol, high, new session): conditional approve; D4, D6, D10,
D11 upheld on the ledger's reasons. Resumed twice: conditional approve (the switch reset by a
subscribe deploy; Inference (e)'s first wording), then **`VERDICT: approve`**.

| Finding | Disposition |
|---|---|
| The case check creates the variant before looking it up, so it cannot catch a case-sensitive lookup | accepted: lookup first, a stop condition (Inference (d), Phase 3) |
| Notice § 3.6 promises an unsubscribe link in "every email" | accepted: OA5 limits it to product updates |
| A failed subscribe build leaves the new copy over direct creation | accepted: kill switch when either build fails (Rollout, Phase 3) |
| A create retried after a committed 5xx could undo a withdrawal | accepted as a conditional known limit (Inference (e), README): only if creates upsert and an owner-applied withdrawal lands in the ≤ 2 s window; resumed pass corrected an "unsupported conditions" first answer |
| Phase 4 names Puppeteer; the owner's default runner is Playwright | rejected: the default is for new projects; this repo's runner is Puppeteer, already installed, and Playwright would be a new dependency for a scratch check |
| OA2 omits Inference (c)'s consequence | accepted: OA2 |

**Fix loop, round 1** (Codex `gpt-6.1-sol` high, the arc diff from `4291a8c98`; Opus review beside
it): both **`VERDICT: approve`**, no blocker or material finding. Codex judged D12 a correct
alignment (both readers know one placeholder marker; a missing row or unequal dates still fail).

| Finding | From | Disposition |
|---|---|---|
| `lookUp`'s doc and the README's residual-timing limit still call a new address's second call a create; on `/api/subscribe` it is a send | both | accepted: both say send or create; the doc no longer claims timing is equal |
| Two comments narrate the next lines (`startConfirm`'s doc, `isKeyConflict`'s doc) | Codex | accepted: deleted |
| `TOKEN_TTL_MS` must never be shorter than Resend's 24 h key window, and nothing says so | Opus | accepted: one comment at the constant |
| `okJson`'s comment names its caller | Opus | accepted: states the invariant |
| Between the two deploys a link opens the old home page (SPA fallback) | Opus | accepted as written in Security "Rollout"; `BEFORE-LAUNCH.md` now says to run the acceptance checks once both are live |
| The plan had no `UI impact` line per surface | driver | accepted: added under Architecture, quoting the visible budget |

**Fix loop, round 2** (the same Codex session resumed on `gpt-6.1-sol` over the fix commit): no
finding, **`VERDICT: approve`**. The loop converged.

**Phase 5 round** (Codex `gpt-6.1-sol` high, read-only, a fresh session over the diff since the
converged head): **`VERDICT: approve`**, no functional finding; it confirmed the lock is set before
the click listener attaches, so no race, and that D14 matches the tree. Resumed over the fix
commit: no finding, **`VERDICT: approve`**.

| Finding | Disposition |
|---|---|
| Excellent (2) "a typed-in stranger is never added" ignores D13 | accepted: names the exception |
| Phases 2 and 4 still require no POST before a press | accepted: marked superseded by Phase 5 |
| `confirm.ts` "keeps out of every request" (the POST body carries the token) | accepted: "every request URL" |
| `startConfirm`'s doc-comment narrates its body | accepted: deleted |
| The second-open test repeats the success test | rejected: the orchestrator's brief requires it, and it proves the page keeps no state that refuses a second open |

## Seeds

```
/goal Every phase in implementations-plan/double-optin-1/plan.md is marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/double-optin-1/lessons/phase-N.md printed per phase; the Codex loop converged over the arc diff (a resumed pass with no new material finding quoted); the draft PR against dev exists, opened only after the loop (`gh pr view`); `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/double-optin-1 on trunk dev. Each firing: read plan.md and lessons/; if the plan is archived on origin/dev, run the teardown and stop; otherwise take the next unticked phase, run its gate, tick it, then the Codex loop and the draft PR. Never merge, never push to main or dev, never mark the PR ready before the owner's answers, never ask for or touch a secret.
```
