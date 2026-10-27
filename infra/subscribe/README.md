# @nulo/subscribe

The `nulo-subscribe` Cloudflare Worker: it adds a nulo.sh visitor's email address to the launch list on Resend (segment "Launch list", topic "Launch and product updates"). `nulo-landing` forwards `POST /api/subscribe` to it unchanged through the service binding `SUBSCRIBE`; it has no other way in.

## Threat model

- **The key's blast radius.** Creating a contact needs a Resend `full_access` key; Resend has no contacts-only scope. That key reads every contact and sends broadcasts from `news.nulo.sh`. A leak means phishing mail from our own domain to exactly the people waiting for the install link, and the list itself handed over.
- **Why its own Worker.** `nulo-landing` keeps branch previews on, and a preview version sees its Worker's secrets: any pushed branch could read a key stored there. This Worker has no route, `workers_dev: false` and `preview_urls: false`, builds from `main` only, has zero runtime dependencies (plain `fetch` to `https://api.resend.com`, so no package in the bundle can read the secret; `test/deploy.test.ts` fails when the bundle holds anything but `src/`), keeps Workers Logs off, and never logs an address.
- **What a preview build could still do.** A branch build of `nulo-landing` runs with that Worker's Workers Builds API token. If the token can edit every Worker in the account, a branch can redeploy `nulo-subscribe` with code that reads its secret. The owner checks the token (below). Separately, a preview version of the landing can call the binding with any `Origin` and any `CF-Connecting-IP`: that needs push access, so it is an insider risk, a known limit.
- **Abuse controls before double opt-in.** The Origin check (cross-site posts and preview hosts), the per-IP and global rate limits, the honeypot and the 2 KB body cap are the only controls. Signup sends no email, so the form cannot be used to mail a third party; anyone can still enter someone else's address until double opt-in exists.
- **Enumeration.** A new address, an address already on the list (in any state) and a filled honeypot get byte-identical answers. A known address also waits out one lookup's length so it is not a round trip faster than a new one.
- **The key** is created by the owner in the Resend dashboard and pasted by the owner into the Cloudflare secret `RESEND_API_KEY`. It never passes through an agent, a chat, a file, a test or CI.

## Handler contract

In order; every refusal answers `{"ok":false}` with the status alone, never Resend's text or the address.

| Step | Condition | Answer |
|---|---|---|
| Kill switch | var `SUBSCRIBE_OFF` is `"1"` | 503, before anything else is read or counted |
| Method | not `POST` | 405, `Allow: POST` |
| Origin | not exactly `https://nulo.sh` (missing, a preview host, `http:`, `www.`, anything else) | 403, before any limiter is spent |
| IP | no `CF-Connecting-IP` | 400 |
| Rate limits | over 5 per 60 s for this IP (`IP_LIMITER`), or over 60 per 60 s overall (`GLOBAL_LIMITER`, keyed on a constant) | 429 |
| Body | more than 2,048 bytes, counted while streaming (`Content-Length` is never trusted) | 413 |
| Body | not UTF-8 `application/x-www-form-urlencoded` or a JSON object of string fields | 400 |
| Honeypot | field `website` non-empty | the success answer; Resend is not called |
| Address | after trimming and lowercasing the domain: not one `@`, a local part over 64 or the whole over 254 characters, a character outside RFC 5322 atext or one a URL path reserves or escapes (slash, `?`, `#`, `%`, `^`, pipe, backtick, braces), a non-ASCII or undotted domain, or a numeric last label | 400 |
| Config | `RESEND_API_KEY`, `RESEND_SEGMENT_ID`, `RESEND_TOPIC_ID` or `CONSENT_VERSION` missing | 503 |
| Lookup | `GET /contacts/{email}` answers 2xx: the address exists in some state | the success answer, **no write** |
| Create | lookup 404: `POST /contacts` with `unsubscribed: false`, the segment, the topic with `subscription: "opt_in"`, properties `source: "landing"`, `consent_version`, `consented_at` (ISO 8601) | the success answer |
| Duplicate | the create answers any other 4xx: the address is looked up again, and if it exists now (a concurrent first submission won), the success answer | else 502 |
| Upstream | each request times out after 5 s; a 429 or 5xx is retried once after its `retry-after` (capped at 2 s) | a timeout, a network error or a second 429/5xx: 503; any other answer: 502 |

The success answer is `200 {"ok":true}` for a `fetch` caller (`Accept: application/json` or `Sec-Fetch-Mode: cors`), else a `303` to `/subscribed` (a plain form post without JavaScript). Every response carries its own headers, since nothing here passes through the landing's `_headers`: `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security` as the landing sets it, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. The only log lines are an upstream refusal's stage and status, and an unexpected error's name (never its message, which can quote the body).

## Owner checklist (Cloudflare dashboard)

1. **Workers Builds**, Worker `nulo-subscribe`: repository `nulo-sh/nulo`, root directory `infra/subscribe`, production branch `main`, build watch paths `infra/subscribe/**`, build variable `BUN_VERSION=1.4.2`, no build command, deploy command `bun run deploy`. **Non-production branch builds off.**
2. **Secret** `RESEND_API_KEY` on `nulo-subscribe` (Settings → Variables and Secrets, type Secret), pasted from a Resend key named `nulo-subscribe`, full access, created after the Worker exists.
3. **Build tokens.** Inspect the Workers Builds API token of `nulo-landing` and of `nulo-subscribe` and narrow each to its own Worker. If Workers Builds cannot run on a narrowed token, turn off non-production builds on `nulo-landing`, or move `nulo-subscribe` to its own account.
4. **Service binding** on `nulo-landing`: `SUBSCRIBE` → `nulo-subscribe` (the landing's change declares it in its `wrangler.jsonc`; add it in the dashboard if that deploy cannot).
5. **No challenge** in front of `nulo.sh/api/*`: a challenge page answers in place of the Worker and breaks the form.

## Operations

- **Kill switch.** Set `SUBSCRIBE_OFF` to `1` on `nulo-subscribe` (Settings → Variables and Secrets) and deploy: every submission answers 503 and nothing reaches Resend. A deploy from `main` resets vars to `wrangler.jsonc`, so a lasting shutdown also lands `"SUBSCRIBE_OFF": "1"` there.
- **Daily count check.** Until a persistent counter exists, once a day: read the "Launch list" segment's size in the Resend dashboard, look for a jump or junk (role accounts, random strings, one domain repeated), and read the account's bounce and complaint rates. Resend's acceptable-use policy wants complaints below 0.08% and bounces below 4%, and says an account may be shut down without warning; one complaint per 1,000 sends is already 0.1%. Review the list for junk before the launch send.
- **Admission cap.** The free plan holds 1,000 marketing contacts. When the segment nears 900, turn the kill switch on and decide (a paid plan, a cleanup) before turning it off. The global limiter (60 per minute, counted per Cloudflare location) bounds a burst, not a total.
- **Key rotation.** In Resend, create a new full-access key; paste it into the `RESEND_API_KEY` secret; submit one test address and see it in the segment; then delete the old key in Resend. If a key is ever exposed, delete it first: the endpoint answers 502 until the new one is set.

## Resend references (read 2026-10-27)

- Create contact: https://resend.com/docs/api-reference/contacts/create-contact (body `email`, `unsubscribed`, `properties` as a key-value map, `segments: [{ id }]`, `topics: [{ id, subscription }]`; 201 `{ object, id }`). The OpenAPI document, `resend.yaml` in https://github.com/resend/resend-openapi, gives the same shapes. Neither says what a duplicate create returns, so the handler treats any 4xx from the create as possibly a duplicate and decides by a second lookup.
- Retrieve contact by id or email: https://resend.com/docs/api-reference/contacts/get-contact (`GET /contacts/{email}`). A missing contact is `404 {"name":"not_found"}` (Resend's Node SDK recordings, https://github.com/resend/resend-node). The SDK puts the raw address in the path, as this Worker does.
- Authentication, the required `User-Agent`, status codes: https://resend.com/docs/api-reference/introduction. Rate limits and `retry-after`: https://resend.com/docs/api-reference/rate-limit (10 requests per second per team). Error names: https://resend.com/docs/api-reference/errors.
- Suppressions are a team-wide list separate from contacts and block every send to a listed address: https://resend.com/docs/dashboard/emails/email-suppressions.

## Known limits

- **Honeypot timing.** A filled honeypot answers without calling Resend, so it is faster than a real submission; a bot that times both learns which field is the decoy.
- **A preview build of the landing** can call the binding with any `Origin` and `CF-Connecting-IP`. That needs push access to the repository: an insider risk.
- **Suppressed addresses without a contact.** An address on the suppression list but not among the contacts is created as a new contact; the suppression still blocks every send to it.
- **The rate limits are per Cloudflare location and approximate**, so a distributed burst can exceed the global 60 per minute; the daily count check and the kill switch are the backstop.
- **No double opt-in.** Anyone can enter someone else's address; the launch email says why the reader got it and unsubscribes in one click.

## Tests

`bun run test` (`bun test`) fakes Resend through the injected `fetch` and pins every row above by status and body, the exact lookup and create requests, no write to a known address in any state, a concurrent duplicate pair leaving one contact, the retry, timeout and streaming-cap paths, the headers on every response, a console spy over every test, and (`test/deploy.test.ts`) the `wrangler.jsonc` pins and a `wrangler deploy --dry-run` bundle whose only inputs are `src/`. `bun run deploy:dry` bundles without credentials.
