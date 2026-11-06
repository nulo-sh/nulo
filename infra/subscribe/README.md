# @nulo/subscribe

The `nulo-subscribe` Cloudflare Worker: it adds a nulo.sh visitor's email address to the launch list on Resend (segment "Launch list", topic "Launch and product updates") once the visitor confirms it. A signup (`POST /api/subscribe`) sends one confirmation email with a signed link to `https://nulo.sh/confirm#<token>`; the page there posts the token back (`POST /api/confirm`) as it opens, by script, and only then is the contact created; its Confirm button is the way to try again when that post does not go through. Nothing is stored between the two: the token is the whole pending signup. `nulo-landing` forwards both paths to it unchanged through the service binding `SUBSCRIBE`; it has no other way in.

## Threat model

- **The key's blast radius.** Creating a contact needs a Resend `full_access` key; Resend has no contacts-only scope. That key reads every contact and sends broadcasts from `news.nulo.sh`. A leak means phishing mail from our own domain to exactly the people waiting for the install link, and the list itself handed over.
- **Why its own Worker.** `nulo-landing` keeps branch previews on, and a preview version sees its Worker's secrets: any pushed branch could read a key stored there. This Worker has no route, `workers_dev: false` and `preview_urls: false`, builds from `main` only, has zero runtime dependencies (plain `fetch` to `https://api.resend.com`, so no package in the bundle can read the secret; `test/deploy.test.ts` fails when the bundle holds anything but `src/`), keeps Workers Logs off, and never logs an address.
- **What a preview build could still do.** A branch build of `nulo-landing` runs with that Worker's Workers Builds API token. If the token can edit every Worker in the account, a branch can redeploy `nulo-subscribe` with code that reads its secret. The owner checks the token (below). Separately, a preview version of the landing can call the binding with any `Origin` and any `CF-Connecting-IP`: that needs push access, so it is an insider risk, a known limit.
- **Double opt-in.** Someone else's address can be entered, but it joins only when `/confirm`'s script posts its token, which only the mailbox received. A GET never confirms, so a mail scanner that opens links without running their scripts subscribes nobody; one that runs the page can (a known limit below). The confirmation email goes only to an address Resend does not hold, and at most once per exact address per 24 h: its `Idempotency-Key` is an HMAC of the address, Resend keeps it 24 h, and a repeat carries a new body, which Resend refuses with a 409. Spelling variants one mailbox receives (case, `+tag`, Gmail's dots) get their own keys; the per-IP limit and the daily send quota bound those.
- **The confirmation secret.** `CONFIRM_SECRET` signs the tokens (HMAC-SHA-256 through WebCrypto, verified in constant time before the payload is read) and the send keys, under separate labels. Its holder can mint tokens, which means adding any address: the power the form had before double opt-in. It cannot read the list or send mail. Missing or under 32 characters, every request that needs it answers 503; nothing falls back to direct creation.
- **The token** names the address and the submission time, unencrypted: whoever reads a link (its owner, their mail provider, a link wrapper) already sees the address. It rides in the URL fragment, which a browser keeps out of its requests, so no nulo.sh request line, `Referer` or Cloudflare request sample holds it. Expired, forged and malformed tokens get one answer.
- **Abuse.** The Origin check (cross-site posts and preview hosts; a script supplies it), the per-IP and global rate limits, the honeypot and the 2 KB body cap. A signup now sends mail at once, before any review, so a flood spends the daily send quota and raises bounces (Known limits).
- **Enumeration.** A new address, an address already on the list (in any state) and a filled honeypot get byte-identical answers. A known address makes a second read where a new one makes its send, so it is not a round trip faster, and an attacker who saturates Resend's shared rate limit gets the same 503 for both. A refusal of sends alone breaks this (Known limits).
- **The key** is created by the owner in the Resend dashboard and pasted by the owner into the Cloudflare secret `RESEND_API_KEY`. It never passes through an agent, a chat, a file, a test or CI.

## Handler contract

Both paths, in order; every refusal answers `{"ok":false}` with the status alone, never Resend's text or the address.

| Step | Condition | Answer |
|---|---|---|
| Kill switch | var `SUBSCRIBE_OFF` is `"1"` | 503, before anything else is read or counted |
| Path | not exactly `/api/subscribe` or `/api/confirm` | 404 |
| Method | not `POST` | 405, `Allow: POST` |
| Origin | not exactly `https://nulo.sh` (missing, a preview host, `http:`, `www.`, anything else) | 403, before any limiter is spent |
| IP | no `CF-Connecting-IP` | 400 |
| Rate limits | over 5 per 60 s for this IP (`IP_LIMITER`), or over 60 per 60 s overall (`GLOBAL_LIMITER`, keyed on a constant); both paths count | 429 |
| Body | more than 2,048 bytes, counted while streaming (`Content-Length` is never trusted) | 413 |
| Body | not UTF-8 `application/x-www-form-urlencoded` or a JSON object of string fields | 400 |

`/api/subscribe`, then:

| Step | Condition | Answer |
|---|---|---|
| Honeypot | field `website` non-empty | the success answer; Resend is not called |
| Address | after trimming and lowercasing the domain: not one `@`, a local part over 64 or the whole over 254 characters, a character outside RFC 5322 atext or one a URL path reserves or escapes (slash, `?`, `#`, `%`, `^`, pipe, backtick, braces), a non-ASCII or undotted domain, or a numeric last label | 400 |
| Config | `RESEND_API_KEY`, `RESEND_SEGMENT_ID`, `RESEND_TOPIC_ID` or `CONSENT_VERSION` missing, or `CONFIRM_SECRET` missing or under 32 characters | 503 |
| Lookup | `GET /contacts/{email}` answers 2xx: the address exists in some state | a second read of it, which must answer 2xx too, then the success answer; **no email, no write** |
| Send | lookup 404: `POST /emails` from `Nulo <hello@news.nulo.sh>`, reply-to `hello@nulo.sh`, with `Idempotency-Key: confirm/<HMAC of the address>` | a 2xx, `409 invalid_idempotent_request` or `409 concurrent_idempotent_requests`: the success answer; any other answer: 502 |

`/api/confirm`, then:

| Step | Condition | Answer |
|---|---|---|
| Config | as above | 503 |
| Token | field `token` missing, over 1,024 characters, not two base64url parts, a MAC that does not verify, a payload that is not `{"e": address, "t": ms}`, an address `normalizeEmail` would change, dated over 5 minutes ahead, or over 24 h old | 400, the same for every case |
| Lookup | the address exists in some state | a second read, then the success answer; **no write** |
| Create | lookup 404: `POST /contacts` with `unsubscribed: false`, the segment, the topic with `subscription: "opt_in"`, properties `source: "landing"`, `consent_version` (the notice in effect now) and `consented_at` (now, ISO 8601) | the success answer |
| Duplicate | the create answers any other 4xx: the address is looked up again, and if it exists now (a concurrent first confirmation won), the success answer | else 502 |

Upstream, on both paths: each request times out after 5 s, never follows a redirect (Workers would forward `Authorization` to the new host), and a 429 or 5xx is retried once, with the same headers and body, after its `retry-after` (capped at 2 s). A timeout, a network error or a second 429/5xx: 503; any other answer, a 3xx included: 502.

The success answer of `/api/subscribe` is `200 {"ok":true}` for a `fetch` caller (`Accept: application/json` or `Sec-Fetch-Mode: cors`), else a `303` to `/subscribed` (a plain form post without JavaScript). `/api/confirm` answers `200 {"ok":true}` only: its one caller is the confirmation page's script. Every response carries its own headers, since nothing here passes through the landing's `_headers`: `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy` as the landing sets it, `Referrer-Policy: no-referrer`, `Strict-Transport-Security` as the landing sets it, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. The only log lines are an upstream refusal's stage and status, and an unexpected error's name (never its message, which can quote the body).

## Owner checklist (Cloudflare dashboard)

1. **Workers Builds**, Worker `nulo-subscribe`: repository `nulo-sh/nulo`, root directory `infra/subscribe`, production branch `main`, build watch paths `infra/subscribe/**`, build variable `BUN_VERSION=1.4.2`, no build command, deploy command `bun run deploy`. **Non-production branch builds off.**
2. **Secret** `RESEND_API_KEY` on `nulo-subscribe` (Settings → Variables and Secrets, type Secret), pasted from a Resend key named `nulo-subscribe`, full access, created after the Worker exists.
3. **Secret** `CONFIRM_SECRET` on `nulo-subscribe`, set before the deploy that brings double opt-in: 32 random bytes from a generator on your own machine (for example `openssl rand -base64 32` in a local terminal), pasted once into Settings → Variables and Secrets (type Secret) and kept nowhere else. Until it is set, every signup answers 503.
4. **Build token.** Done 2026-11-05: `nulo-landing`, `nulo-tokens`, `nulo-subscribe` and `nulo-rpc-proxy` build with one user token, `nulo builds`, holding `Workers Scripts Write` and `Account Settings Read` only. A token confined to one Worker is refused by the API today (#1235); `nulo-tokens`, `nulo-subscribe` and `nulo-rpc-proxy` build from their production branch only, and `nulo-landing` also builds non-production branches for PR previews, the owner's choice (#1235).
5. **Service binding** on `nulo-landing`: `SUBSCRIBE` → `nulo-subscribe` (the landing's change declares it in its `wrangler.jsonc`; add it in the dashboard if that deploy cannot).
6. **No challenge** in front of `nulo.sh/api/*`: a challenge page answers in place of the Worker and breaks the form.
7. **Acceptance, once the key is set and before the form is visible** (a fake cannot establish these, and no test holds the key):
   - Resend's duplicate semantics, on a disposable address, through the Resend dashboard's own tools or the OAuth-connected Resend MCP (never a copy of the key): create the contact; create it again; create it again with a different case in the local part; look it up with that case variant. Record each answer here, then delete the contact.
   - Through the form: submit one address twice and see one contact and the same answer both times; submit six times from one browser within a minute and see the sixth refused, which shows `CF-Connecting-IP` reaches this Worker through the binding.
   - Double opt-in, with a fresh address you control that Resend does not hold: one email arrives, its link unrewritten (open and click tracking off on `news.nulo.sh`); a second submission inside 24 h sends nothing; opening the link creates the contact; opening it again writes nothing. On a disposable contact you withdraw first, look up a case variant of it before creating anything: if the variant reads as absent, turn the kill switch on and stop, since a variant could then be confirmed over the withdrawal.

## Operations

- **Kill switch.** Set `SUBSCRIBE_OFF` to `1` on `nulo-subscribe` (Settings → Variables and Secrets) and deploy: every submission answers 503 and nothing reaches Resend. A deploy from `main` resets vars to `wrangler.jsonc`, so a lasting shutdown also lands `"SUBSCRIBE_OFF": "1"` there.
- **Daily count check.** Until a persistent counter exists, once a day: read the "Launch list" segment's size in the Resend dashboard, look for a jump or junk (role accounts, random strings, one domain repeated), read the day's transactional send count against the plan's daily quota (100 on Free, reset at 00:00 UTC), and read the account's bounce and complaint rates. Resend's acceptable-use policy wants complaints below 0.08% and bounces below 4%, and says an account may be shut down without warning; one complaint per 1,000 sends is already 0.1%. Before each send, review the list for junk and check that the broadcast's reply-to is hello@nulo.sh (website privacy notice §§ 3.4, 3.5).
- **Admission cap.** The free plan holds 1,000 marketing contacts. When the segment nears 900, turn the kill switch on and decide (a paid plan, a cleanup) before turning it off. The global limiter (60 per minute, counted per Cloudflare location) bounds a burst, not a total.
- **Key rotation.** In Resend, create a new full-access key; paste it into the `RESEND_API_KEY` secret; submit one test address and see it in the segment; then delete the old key in Resend. If a key is ever exposed, delete it first: the endpoint answers 502 until the new one is set.
- **Confirmation secret rotation.** Paste a new `CONFIRM_SECRET` as in checklist item 3. Links already sent stop working (each lives at most 24 h), and every address's 24 h send window starts over.

## Resend references (read 2026-10-27)

- Create contact: https://resend.com/docs/api-reference/contacts/create-contact (body `email`, `unsubscribed`, `properties` as a key-value map, `segments: [{ id }]`, `topics: [{ id, subscription }]`; 201 `{ object, id }`). The OpenAPI document, `resend.yaml` in https://github.com/resend/resend-openapi, gives the same shapes. Neither says what a duplicate create returns, so the handler treats any 4xx from the create as possibly a duplicate and decides by a second lookup.
- Send email: https://resend.com/docs/api-reference/emails/send-email (`from`, `to`, `subject`, `html`, `text`, `reply_to`; 200 `{ id }`). Idempotency keys (read 2026-11-05): https://resend.com/docs/dashboard/emails/idempotency-keys (kept 24 h per method and endpoint; the same key and body return the first answer without sending; another body is `409 invalid_idempotent_request`; one in flight is `409 concurrent_idempotent_requests`). The Free plan's 100 transactional emails a day, separate from broadcasts: https://resend.com/pricing.
- Retrieve contact by id or email: https://resend.com/docs/api-reference/contacts/get-contact (`GET /contacts/{email}`). A missing contact is `404 {"name":"not_found"}` (Resend's Node SDK recordings, https://github.com/resend/resend-node). The SDK puts the raw address in the path, as this Worker does.
- Authentication, the required `User-Agent`, status codes: https://resend.com/docs/api-reference/introduction. Rate limits and `retry-after`: https://resend.com/docs/api-reference/rate-limit (10 requests per second per team). Error names: https://resend.com/docs/api-reference/errors.
- Suppressions are a team-wide list separate from contacts and block every send to a listed address: https://resend.com/docs/dashboard/emails/email-suppressions.

## Known limits

- **Honeypot timing.** A filled honeypot answers without calling Resend, so it is faster than a real submission, and it succeeds while the endpoint is failing; a bot that compares the two learns which field is the decoy. It learns nothing about any address.
- **Residual timing.** A known address's second read and a new address's send (on `/api/subscribe`) or create (on `/api/confirm`) are different calls; if Resend's send or create is much slower than its read, a known address still answers measurably faster.
- **Resend's duplicate semantics are undocumented.** If a duplicate create upserts, a create retried after a 5xx that had in fact committed, or the losing create of two concurrent first confirmations, rewrites the contact this same confirmation created a moment earlier, with the same values; a withdrawal you apply by hand (on a written request) inside those 2 s would be undone. If Resend's lookup were case-sensitive while its create upserted case-insensitively, a case variant of a withdrawn address could be confirmed over the withdrawal: the acceptance step above checks that.
- **A preview build of the landing** can call the binding with any `Origin` and `CF-Connecting-IP`. That needs push access to the repository: an insider risk.
- **Suppressed addresses without a contact.** An address on the suppression list but not among the contacts is created as a new contact; the suppression still blocks every send to it.
- **The rate limits are per Cloudflare location and approximate**, so a distributed burst can exceed the global 60 per minute; the daily count check and the kill switch are the backstop.
- **Floods now send mail.** A script on one IP, within 5 a minute, spends the 100-a-day send quota in about 20 minutes. Until 00:00 UTC honest signups then answer 503, a new address answers 503 where a listed one still gets the success answer (a membership oracle), and junk addresses bounce, which Resend's policy caps at 4 % and may answer by suspending the account. The kill switch and the daily check are the backstop; a strict daily counter is persistent state, the owner's call.
- **Confirming needs JavaScript**, since the token rides in the fragment, and a mail scanner that runs the page's script confirms the address it opens. The owner accepted that for one tap in every browser; a scanner with no script engine adds nobody.
- **A send in flight can still fail.** A repeat that meets `409 concurrent_idempotent_requests` answers success; if the first send then fails, no email exists until the window ends. Whether Resend keeps the key of a refused send is undocumented: if it does, a repeat inside 24 h answers success and sends nothing.
- **Replay after deletion.** A confirmed address that is deleted outright on request can be re-created by its token until the token is 24 h old; the website privacy notice already says a later sign-up can add a deleted address again.

## Tests

`bun run test` (`bun test`) fakes Resend (contacts, sends and their idempotency keys) through the injected `fetch` and the clock, and pins every row above by status and body on both paths: the exact lookup, send and create requests, no email or write for a known address in any state, a repeat sending the same key with a new body, a concurrent duplicate pair leaving one contact, every refused token class answering alike, the retry, timeout and streaming-cap paths, the headers on every response, a console spy over every test, `test/token.test.ts` against an HMAC computed independently, and (`test/deploy.test.ts`) the `wrangler.jsonc` pins and a `wrangler deploy --dry-run` bundle whose only inputs are `src/`. `bun run deploy:dry` bundles without credentials.

## Operator scripts

`scripts/broadcast-topic.ts <broadcast id> <name> <html file> <text file>` writes a broadcast draft whole over the API, name, both bodies and the launch topic in one request, and prints the broadcast back without its bodies plus whether each stored body equals its file. It runs as a keyed run from `ops.env.example` (the `my-stack` skill, Keyed runs). It is the one writer of a draft: a partial update from any client resets the fields it leaves out (the name, the text, the topic), so a client without the topic field never updates the draft. `bun test` covers it.

`scripts/unsubscribe-test.ts send <draft id> <launch segment id>` proves the unsubscribe path on one real contact: it copies the draft's envelope and bodies into a broadcast scoped to the launch topic and to a one-contact "Launch test" segment holding the launch segment's earliest contact, verifies the copy, and sends it. After the click, `check <test segment id>` reads that contact's global flag and topic subscriptions, and `restore <test segment id>` puts it back. No address is ever on a command line; the log shows a masked one. Keyed runs, like the script above.
