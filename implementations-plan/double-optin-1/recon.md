# double-optin-1 — recon

Base: `origin/dev` at `4291a8c98`. Two Explore agents (Sonnet) plus the planner's own reads of
`infra/subscribe`, `apps/landing`, `legal/website-privacy.md`, the archived
[mailing-list-1](../archive/mailing-list-1/plan.md) plan and Resend's public docs (read 2026-11-05).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| HMAC-SHA-256 sign and verify | `packages/wallet-crypto/src/entropy-mac.ts:85,98` (`crypto.subtle.sign`/`verify`, verify wrapped to return false on a throw) | adapt the pattern: the Worker may import nothing (`infra/subscribe/test/deploy.test.ts` allows only `src/[a-z-]+.ts` in the bundle, no `dependencies`), so a new `src/token.ts` |
| Constant-time compare | none outside WebCrypto's own `verify` (searched `timingSafeEqual`, `constantTime`, `timing-safe` over `infra packages apps/landing scripts`) | use `crypto.subtle.verify`; workerd's `timingSafeEqual` is absent on Bun (probe: `typeof crypto.subtle.timingSafeEqual === "undefined"` on 1.4.2) |
| base64url | `packages/token-list/src/envelope.ts:39-56` (`btoa`/`atob`, alphabet check, canonical re-encode) | adapt: a small copy in `src/token.ts`, forced by the zero-dependency rule |
| HTML escaping | `apps/landing/scripts/legal-pages.ts:63` (private, build-time) | build new: the template interpolates only fixed strings and the token (base64url and `.`, HTML- and URL-inert); a one-line escaper is still cheaper than a proof |
| Email sending | nothing sends mail in the repo; `infra/subscribe/scripts/*` write broadcast drafts | build new: `POST https://api.resend.com/emails` through the existing `call()` |
| Fake Resend and clock | `infra/subscribe/test/fakes.ts` (`fakeUpstream` with `now`/`advance`/`sleep`, `resendStore`, `makeEnv`, console spy in `worker.test.ts`) | reuse; `resendStore` gains a `POST /emails` route honouring `Idempotency-Key`, `post()` gains a path |
| Contact create, lookup, mirror read | `infra/subscribe/src/resend.ts` `addContact` | reuse; the consent version and time become arguments |
| Upstream call with retry, timeout, no redirect | `resend.ts` `call()` | reuse for `/emails`, with an optional extra header |
| Secret conventions | `RESEND_API_KEY`: optional in `Env`, checked in `configOf` (503), absent from `wrangler.jsonc` (`deploy.test.ts` asserts), README owner checklist item 2; no `secrets.required` anywhere; no minimum-length precedent | adapt for `CONFIRM_SECRET` |
| Landing fetch + live region + lock | `apps/landing/src/signup.ts` (`postSignup`, `submitSignup`, `aria-disabled` lock, `data-state`) | adapt the pattern in `src/confirm.ts` |
| Static noindex page | `apps/landing/subscribed.html`, `vite.config.ts:31`, `page.test.ts:177,207,217`, `pr-quick.yml:350` verify list | adapt for `confirm.html` |
| Notice version bump | commit `5e3036f19` (1.0→1.1): `legal/website-privacy.md`, `legal/archive/website-privacy-1.0.md`, `infra/subscribe/wrangler.jsonc` `CONSENT_VERSION`, `BEFORE-LAUNCH.md` § 4 | repeat for 1.2; `«FILL: effective date»` is allowed on `dev` (the page renders as a draft) and refused on a PR into `main` (`legal-pages.test.ts:253`, `NULO_LAUNCH_GATE`) |

## Facts the plan rests on

1. `nulo-subscribe` and `nulo-landing` deploy from `main` (README owner checklist item 1; CLAUDE.md § Branching). **The lane brief's "deployed by Workers Builds from `dev`" does not hold**: a change reaches production at the next promote.
2. The subscribe Worker ignores the request path today; the landing Worker forwards only exactly `/api/subscribe` (`apps/landing/src/worker.ts:27`) and `run_worker_first: ["/api/*"]` already covers `/api/confirm`. `worker.test.ts:134` pins one service binding and no vars.
3. The CSP (`public/_headers`) has `connect-src 'self'`, `form-action 'self'`, `script-src 'self'`: a same-origin `fetch` POST from a bundled module needs no CSP change (`scripts/headers.test.ts` pins both).
4. `scripts/ci-cd/edge-headers.test.ts` imports `SECURITY_HEADERS` from `infra/subscribe/src/respond.ts`.
5. Resend `POST /emails`: `from`, `to`, `subject`, `html`, `text`, `reply_to`; answer `{ id }`. `Idempotency-Key` (≤ 256 characters) is kept 24 h: the same key and payload return the first answer without sending; the same key with another payload is `409 invalid_idempotent_request`; one in flight is `409 concurrent_idempotent_requests` (docs: send-email, idempotency-keys, errors).
6. Resend's Free plan: 100 transactional emails per day, 3,000 per month, separate from broadcasts; `429 daily_quota_exceeded` past it. Data retention 30 days for emails and logs (pricing page).
7. Website privacy notice 1.1: § 3.1 records the submission time and version; § 3.4 "Nothing is sent when you sign up."; § 3.5 "No confirmation email"; § 6 lists Resend "(the mailing list; …)". The notice is outside `@nulo/legal` (no manifest, no re-acceptance).
8. No screenshot tooling in the landing; `apps/extension` carries Puppeteer for its e2e. The landing dev server is `vite` on port 5175 with no Worker behind `/api/*`.

## Open issues and closed limits in the area

- #1236 (this lane). Closed known limits: #1237 (per-location limiter, no global cap), #1238 (Resend timing or a full quota), #1239 (a landing preview can call the binding), #1243 (password-manager honeypot), #1235 (build-token reach).
- No open issue collides (`gh issue list --state all --search "subscribe OR mailing OR opt-in OR resend"`).
