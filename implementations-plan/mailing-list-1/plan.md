---
plan: mailing-list-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
trunk: dev
---

# mailing-list-1 — a launch mailing list on nulo.sh, through Resend

Visitors to nulo.sh leave an email address and get one email when Nulo is on the stores, then
occasional updates. The Resend key lives in a new Worker, `nulo-subscribe`, reachable only through a
service binding from `nulo-landing`. A website privacy notice covers the list. The specification is
the GTM session's mailing-list task of 2026-10-27; its owner decisions bind (marketing only,
`news.nulo.sh`, eu-west-1, double opt-in deferred). Over the light target (150 lines): four arcs on
two vendors, and the audit record; nothing below restates the specification.

## Outcome & Quality Bar

- **For whom**: a visitor on a phone or a desktop who wants to know when Nulo is installable; later,
  the owner, who sends the launch email to a clean list.
- **Excellent**: one field and one press, with or without JavaScript; every answer says what to do
  next; the form's own answers never tell whether an address is on the list; no address reaches a
  log, URL or dashboard of ours (Resend's own records are disclosed); only code merged to `main`
  can reach the key (merged to `main` or `dev` under A13's fallback).
- **Good enough**: no double opt-in, a per-location limit, residual enumeration inside Resend (all
  filed); no landing e2e suite (the Workers are unit-tested; the chain gets a production smoke).

## Assumptions

**Facts** (sources in `recon.md`):
1. `apps/landing/wrangler.jsonc` has `preview_urls: true` and no `main`; a version URL runs with the
   version's bindings, and branch builds run the branch's `deploy:preview` script.
2. `_headers` does not apply to responses a Worker generates.
3. Resend's Create Contact takes `segments: [{id}]`, `topics: [{id, subscription}]`, `properties`
   (the three exist, made by Part A, with tracking off on `news.nulo.sh`); requires `User-Agent`;
   logs every request body for 30 days; documents no duplicate answer. Its processor entity is
   Plus Five Five, Inc.
4. The Rate Limiting binding is approximate and per location; Cloudflare advises against IP keys.
5. Adding a `LegalDocument` reaches `launch.ts` (`LAUNCH_DOCUMENTS`, pinned to the manifest's keys
   by `launch.test.ts:38`), `scripts/release/auto-unstick-run.test.ts:220` (exact read list) and
   `status.test.ts:11`; `launch-legal` refuses a `«FILL»` in those documents on every PR into `main`.
6. Privacy § 5.5 covers three hosts; `passkey.nulo.sh` and `tokens.nulo.sh` serve wallet functions
   and § 5.11 points back at § 5.5. **The spec's "move the hosting records" holds for `nulo.sh` only.**
7. `main` takes merge commits only; release-please and git-cliff read every branch commit, and
   `BEGIN_COMMIT_OVERRIDE` does not work with plain merges (release-please README).
8. The default Workers Builds token holds account-wide Workers Scripts edit; a token can instead be
   scoped to one Worker; deploys keep secrets.
9. This repo has no per-package workflows: `test:all` and `typecheck:all` run every `@nulo/*`
   workspace. **The brief's "per-package workflow convention" is not this repo's**; the workspace
   joins CI with no workflow, as passkey-rp did.

**Inferences**: (a) `CF-Connecting-IP` and `Origin` survive the binding hop unchanged (the smoke
proves the visitor's IP reaches the key; a missing IP fails closed); (b) Workers Builds accepts a
token scoped to one Worker (undocumented; the owner verifies, A13 has the fallback); (c) browsers
send `Origin: https://nulo.sh` on the form POST under the page's referrer policy; a tool forcing
`no-referrer` sends `null`, refused (a known limit, not a fix).

**Asks** (`OWNER-ASKS.md`): A1–A3 the legal texts, A4–A9 the visible form, A10–A12 behaviour,
A13 the build tokens; relay R1 (Resend's duplicate answer, probed by Part A).

## Architecture & Implementation

**Shape.** `apps/landing` (static, plus a Worker script for `/api/*`) → service binding `SUBSCRIBE`
→ `infra/subscribe` (`@nulo/subscribe`, Worker `nulo-subscribe`: no route, no workers.dev, no
version URLs, logs off, no runtime dependency) → `POST https://api.resend.com/contacts`. The
landing takes no workspace dependency on it (`behavior-gating.test.ts` maps one to `packages/`).

**B1 contract** (`src/worker.ts`; checks in this order):

| Check | Refusal | JSON | Form post |
|---|---|---|---|
| POST | else | 405 `allow: POST` | 405 |
| `Origin` is exactly `https://nulo.sh` | missing, `null`, a version URL, cross-site | 403 | 403 |
| content type JSON or urlencoded | else | 415 | 415 |
| `CF-Connecting-IP` present | missing (fail closed) | 403 | 303 error |
| `RATE.limit({ key })`, key = IPv4, or the IPv6 /64 of the parsed address | over | 429 | 303 error |
| body read through a stream, at most 2048 bytes, any declared length | over | 413 | 303 error |
| honeypot filled | answers success, calls nothing | 200 | 303 ok |
| address: trim, lowercase the domain, ≤ 254, one `@`, per-part checks, ASCII, no free-group regex | invalid | 400 | 303 error |
| `RESEND_API_KEY` set | missing | 503 | 303 error |
| create contact | 429/5xx: one retry after `retry-after` (1 s if absent) only when it is ≤ 2 s; then 503. A thrown fetch or the 5 s timeout: 503. Anything else: 502 | 200 | 303 ok / error |

`303 ok` → `/subscribed`; `303 error` → `/subscribe-error` (A9). JSON bodies are `{"ok":true}` or
`{"ok":false}`; no body carries Resend's text. One responder builds every answer, the top-level
`catch` included, with `cache-control: no-store`, `x-content-type-options: nosniff`, no CORS header.
Create body: `{ email, segments: [{ id: RESEND_SEGMENT_ID }], topics: [{ id: RESEND_TOPIC_ID,
subscription: "opt_in" }], properties: { source: "landing", consent_version: CONSENT_VERSION,
consented_at } }` with no `unsubscribed` field, which could re-subscribe if Resend upserts.

**Duplicates (R1, A10).** One create call whatever the address. R1's record decides: a stable
refusal for a duplicate maps, exactly, to the success answer (never a generic 409 `resource_locked`);
a 2xx that leaves an existing contact's subscription and properties alone needs nothing; any
re-subscribe or rewrite **stops the arc** for a plan change (a lookup first races an unsubscribe and
leaks timing). The rest of B1 does not wait for R1.

**Config (B1)**: `name`, `main`, `compatibility_date: "2026-09-01"`, `workers_dev: false`,
`preview_urls: false`, no `routes`, `observability.enabled: false`, `ratelimits: [{ name: "RATE",
namespace_id: "7301", simple: { limit: 5, period: 60 } }]`, `vars` `RESEND_SEGMENT_ID`
(`6f48382e-5d4c-4b81-8631-231b0b18e206`), `RESEND_TOPIC_ID` (`bd2fd224-25d7-4707-9742-1e3ffc39f9d7`),
`CONSENT_VERSION` (`"1.0"`); no `secrets.required` (the first deploy precedes the secret). wrangler
`4.129.1`. `.gitignore`: `.wrangler/`, `.dev.vars*`.

**Landing (B2a)**: `worker/index.ts`: `/api/subscribe` → `env.SUBSCRIBE.fetch(request)` unchanged,
a throw → `303 /subscribe-error`; other `/api/*` → 404; anything else → `env.ASSETS.fetch(request)`
(keeps the SPA fallback whichever way Cloudflare routes a non-navigation miss). Config adds `main`,
`assets.binding: "ASSETS"`, `assets.run_worker_first: ["/api/*"]`, `services: [{ binding:
"SUBSCRIBE", service: "nulo-subscribe" }]`. CSP gains `form-action 'self'`. Local binding
interfaces, no `@cloudflare/workers-types`.

**Notice (B3)**: `legal/website-privacy.md` is a third `LegalDocument`: the manifest checks, the
renderer, `launch-legal` and the release tag's blank check all cover it. The wallet bundles its
version strings and never opens it. A test in `infra/subscribe` pins `CONSENT_VERSION` to the
notice's version line (it reads the file; no dependency).

**Form (B2b)**: a real `<form method="post" action="/api/subscribe">` where A4 puts it;
`src/subscribe.ts` maps a response to a message (success only for a 200 `{"ok":true}`, so a followed
redirect reads as failure); `src/subscribe-dom.ts` posts JSON, writes `textContent` to an
`aria-live="polite"` region, ignores a second press in flight; `subscribed.html`,
`subscribe-error.html` (noindex) as Vite inputs.

**File map.** Add: `infra/subscribe/{package.json,tsconfig.json,wrangler.jsonc,.gitignore,README.md,src/worker.ts,test/worker.test.ts,test/source.test.ts}`,
`apps/landing/worker/{index.ts,index.test.ts}`, `apps/landing/scripts/site-headers.test.ts`,
`legal/website-privacy.md`, `legal/archive/privacy-1.2.6.md`, `apps/landing/{subscribed.html,subscribe-error.html}`,
`apps/landing/src/{subscribe.ts,subscribe-dom.ts,subscribe.test.ts}`. Modify: `packages/legal/src/{manifest.ts,manifest.test.ts,launch.ts,status.test.ts}`,
`packages/legal/README.md`, `scripts/release/auto-unstick-run.test.ts`, `legal/{privacy.md,README.md}`,
`apps/landing/scripts/{legal-pages.ts,legal-pages.test.ts}`, `apps/landing/{wrangler.jsonc,index.html,how-aztec-works.html,vite.config.ts,tsconfig.json,.gitignore,README.md}`,
`apps/landing/public/{_headers,sitemap.xml}`, `apps/landing/src/{main.ts,install.test.ts,styles/page.css}`,
`.github/workflows/pr-quick.yml` (verify list, `deploy:dry`), `CI.md`, `scripts/ci-cd/audit-acks.json`, `bun.lock`.

**Not taken**: the key in `nulo-landing`; a second Cloudflare account (bindings do not cross
accounts: a public route and a shared secret instead); a landing-local manifest; a CI workflow for
the workspace; `waitUntil` before Resend (hides every failure); Turnstile (third-party origin); a
lookup before create (races, leaks timing); ids as code constants (the brief puts them in `vars`;
the config pin is the source of truth, a dashboard edit is overwritten by the next deploy).

## Security & Adversarial Considerations

- **The key.** `full_access` reads every contact, sends from `news.nulo.sh` to people waiting for
  an install link (a fake link is a wallet-draining phish), deletes data, may mint keys. The
  boundary is **whoever can deploy `nulo-subscribe`**: deploys keep the secret, and new code reads
  `env`. With the default account-wide build token, a pushed landing branch (its own
  `deploy:preview`) or a dependency in any account build could redeploy it. So the secret is pasted
  only after A13 holds. Under (a) no other build's token can edit `nulo-subscribe` and its own
  builds `main` only: the residual is code merged to `main`. Under (b) every build whose token can
  edit it has Preview Builds off and a production branch of `main` or `dev`: the residual is code
  merged to either. Review `infra/subscribe/**` as a key file. Rotation: revoke in Resend, revoke
  any key you did not create, paste the new one.
- **The binding.** The Origin check stops browsers (a hostile page cannot turn visitors into
  submitters); it does not authenticate the caller. Branch code in a landing version holds the
  binding and can forge `Origin` and `CF-Connecting-IP`: it can create contacts, not read the key.
  Pushers are trusted with that (known limit #1239).
- **Abuse before double opt-in.** Honeypot (a name autofill is unlikely to fill) and 5 per 60 s per
  IP per location, IPv6 per /64. A NAT or CGNAT shares one key: a sixth honest person in a minute
  reads "try again in a minute", and one abuser can spend it. A many-IP script fills the list and
  can reach Resend's 10 per second and the 1,000-contact quota, after which honest submissions
  fail. Mitigations: no email at signup, the launch email says why, the list is reviewed first;
  #1236, #1237.
- **Enumeration.** Same status, body and headers for a duplicate; syntax-only validation; refusals
  before any lookup; one call each way. Residual (#1238): Resend's own timing, and a full quota
  that refuses new contacts but not duplicates.
- **No address in anything of ours.** POST only (a GET would put it in a URL, the request sample, a
  `Referer`); no `console` in `src`; logs off on both Workers; fixed `Location`s and bodies;
  fixtures use RFC 2606 `example.com` only, never in a test name. Resend's 30-day request log holds
  it: the notice says so.
- **Page and supply chain.** `form-action 'self'`, `connect-src 'self'`, no third-party origin
  (pinned); zero runtime dependencies (`source.test.ts`); exact wrangler pin; frozen lockfile.

**Owner's Cloudflare checklist** (paste as is):
- [ ] After arc 1 merges: Workers & Pages → Create → Import a repository → this repo; Worker
      `nulo-subscribe`, root directory `infra/subscribe`, build command empty, deploy command
      `bun run deploy`, build variable `BUN_VERSION` as on `nulo-landing`, watch paths left at the
      default (every push builds). Check the first build log: install from the root `bun.lock`,
      frozen, wrangler 4.129.1. The first deploy creates the Worker, with no secret.
- [ ] `nulo-subscribe` → Settings → Build → Branch control: production `main`; Preview Builds off.
- [ ] `nulo-subscribe` → Domains & Routes: workers.dev and Preview URLs off (wrangler sets both).
- [ ] A13 (a): now that the Worker exists, give each Workers Build (`nulo-landing`, `nulo-tokens`,
      `nulo-subscribe`, and any other in the account) its own API token with `Editor` on that
      Worker only (Settings → Build → API token); push a no-op to each production branch and
      confirm it still deploys. If one refuses, A13 (b): list every build whose token can edit
      `nulo-subscribe`, turn Preview Builds off on each, and keep each production branch `main` or
      `dev`.
- [ ] Only then: Resend → API keys → create `nulo-subscribe`, full access → `nulo-subscribe` →
      Settings → Variables and Secrets → Add → Secret `RESEND_API_KEY`.
- [ ] After arc 2 merges: `nulo-landing` → Bindings lists `SUBSCRIBE` and `ASSETS`; Workers Logs
      off on both Workers.

## Phases

**Phase 1 (B1, arc `subscribe`) — no owner precondition (it builds A10 and A11 as recommended); R1 before the duplicate branch.**
Build the workspace. Tests (`bun test`, the passkey-rp style): one per refusal class above, paired
with one success fixture; the exact Resend request (URL, header names, body) through a fake
`fetch`; retry (429 then 201; 503 twice → 503; `retry-after: 5` → no retry; a throw → 503); 422 →
502 with a fixed body; a chunked body at 2048 and 2049 bytes; malformed JSON and a wrong JSON shape
→ 400, Resend never called; a thrown error inside → the form's error `Location`; compressed and
expanded IPv6 share a key, another /64 does not; the duplicate per R1; `source.test.ts` (relative
imports only, no `console`, no `dependencies`); the config pin. README: threat model, key handling,
rotation, the checklist.
*Gate*: `bun run lint && bun run typecheck:all && bun run --cwd infra/subscribe test && bun run
--cwd infra/subscribe deploy:dry && bun run test:all`. Pass: exit 0; the dry run lists `RATE` and
the three vars. Layers: lint, types, unit.

**Phase 2 (B2a, arc `landing-plumbing`) — precondition: the Worker deployed, A13 held, the secret set.**
Add the landing Worker, config, CSP directive, a `deploy:dry` step in `build-landing`, `worker/` in
`tsconfig.json`. Tests: the forward keeps method, URL, headers and body; a throwing binding →
303 error; other `/api/*` → 404; a non-API path reaches `ASSETS`; the config pin; the full site CSP
through `scripts/headers.ts`'s `siteHeaders`.
*Gate*: `bun run lint && bun run typecheck:all && bun run test:all && bun run test:ci-gating &&
bun run test:release && bun run lint:actions`, `bun run --cwd apps/landing build`, `bun run --cwd
apps/landing deploy:dry`. Then, after merge, the **smoke** (the orchestrator; an address the owner
controls; never committed): JSON POST with `Origin: https://nulo.sh` → 200, again → identical; the
same urlencoded → 303 `/subscribed`; a version-URL `Origin` → 403; GET → 405; six honeypot posts
from one egress → the sixth 429; then a second egress (IPv6, or another network) → 200; `curl https://nulo.sh/forms/uninstall` → 200 HTML; the
contact in `Launch list` with the topic opted in and the three properties. The limit lines run
after a quiet minute, are approximate (Fact 4), forge a different `CF-Connecting-IP` on each post,
and count only when both egresses report the same Cloudflare location (the `cf-ray` suffix).

**Phase 3 (B3, arc `notice`) — precondition: A1, A2, A3, A12 signed; `main` carries privacy 1.2.6.**
Add `legal/website-privacy.md` from the draft (its `../../legal/` links become bare names; the
date is the planned merge day, moved if it slips, since `launch-legal` refuses a `«FILL»`). Archive
1.2.6, apply `WALLET-PRIVACY.diff.md`, bump per A2. Extend `LegalDocument`, the manifest, `DOCS`,
`LAUNCH_DOCUMENTS`, `status.test.ts`, the auto-unstick read list, `LEGAL_DOCUMENTS`, `TITLES`,
`rewriteLinks`, the legal-page nav (A3), the landing `.gitignore`, `sitemap.xml`, the verify list,
the `wrangler.jsonc` logging comment; add the `CONSENT_VERSION` pin.
*Gate*: Phase 2's commands; `cd apps/extension && bun run test:e2e -- tests/e2e/legal-acceptance.test.ts
--retry=0`. Pass: exit 0. Layers: lint, types, unit, smoke.

**Phase 4 (B2b, arc `landing-form`) — precondition: A4–A9 signed, the smoke green, arc 3 merged.**
Build the picked option on both pages, the two static pages, the module, the styles (type roles,
tokens, `.soon` for non-controls only); README. Tests: each page's form method, action, honeypot
and notice link; no third-party `src`, `action` or stylesheet; both static pages built and noindex;
the mapper per answer. Accessibility (the owner's 2026-10-19 delegation): a visible `<label>`, a
native button, the 2 px ring on `:focus-visible`, honeypot `tabindex="-1"` in an `aria-hidden`
wrapper, `aria-live="polite"`.
*Gate*: Phase 2's commands. Screenshots (1440 and 390, light and dark; idle, success, error, the
two static pages) with `/api/subscribe` answered by the capture tool's request interception, never
a production bypass; `og.png` recaptured if the hero changed. After merge: one real-browser
submission on nulo.sh with and without JavaScript (the smoke address, so a duplicate).

## Audit verdicts

Round 1, 2026-10-27. **Codex** (Sol, high): conditional approve. **Opus** (Plan): conditional
approve. Both raised the build-token reach (S1) independently.

| Finding | From | Disposition |
|---|---|---|
| Account-wide build token: any branch build can redeploy `nulo-subscribe` and read the key | both, high | accepted: A13, the secret waits for it; Quality Bar and residual rewritten |
| The binding lets branch code forge `Origin` and the IP | both | accepted as known limit #1239 |
| R1 misses topic opt-out and property rewrites; `unsubscribed: false` could re-subscribe | both | accepted: four-case R1, field dropped |
| The enumeration promise exceeds the evidence (timing, quota) | Codex | accepted: qualified, #1238 |
| `launch.ts`, auto-unstick test, `status.test.ts` ripple missed | both | accepted: Fact 5, file map |
| Resend's entity is Plus Five Five, Inc.; its log keeps bodies 30 days; "nothing else" false | both | accepted in the draft and A12 |
| Caught errors broke the form contract; landing Worker had no catch | both | accepted: one responder; 303 error |
| Localhost cannot pass the Origin check | Codex | accepted: interception for screenshots, production smoke |
| Smoke proves an IP, not the right one | Codex | accepted: honeypot burst, forged header, second egress |
| `CONSENT_VERSION` is not proof of what was shown | Codex | accepted: notice wording says "in effect" |
| `BEGIN_COMMIT_OVERRIDE` does nothing on merges | Codex | accepted: no override; commit types below |
| Arc order: the Worker needs no owner sign-off | Opus | accepted: B1 first, the pin moved to arc 3 |
| SPA routing of non-navigation misses is ambiguous | Opus | accepted: `ASSETS` fallthrough plus a smoke line |
| Watch paths, `.dev.vars`, `siteHeaders` reuse, drop the `«FILL»` and one-fetch tests | Opus | accepted |
| Arc 3 puts the wallet policy on `main` directly | Opus | accepted: stated in A2 (it must be live before the form) |
| Cut the retry | Opus | rejected: the lane brief requires one retry; its wait is at most 2 s (Codex agrees) |
| Ids as code constants | Opus | rejected: the brief puts them in `vars`; the config pin holds them (Codex agrees) |
| Sync only after arcs 3 and 4 | Opus | accepted as the minimum; the orchestrator may sync more |
| Offer a form-only (no JSON) variant | Opus | accepted as an A4 sub-choice |

Round 2, 2026-10-27 (Codex, resumed): conditional approve. Every round-1 fix verified in the text;
the wallet diff's hunks match `9e88a3c71`. Accepted, all local: A13's fallback covers every build
that can edit the Worker, and the Worker is created before its token is scoped; the IP smoke needs
one Cloudflare location and a varied forged header; watch paths stay at the default (a filter on
`infra/subscribe/**` skips a root lockfile change); explicit build commands, since the workspace
has no build script.

Round 3, 2026-10-27 (Codex, resumed): **approve**. The four round-2 conditions are met; no
regression. Issues filed: #1236 (double opt-in, open); known limits #1237, #1238, #1239.

## Delivery

Changed 2026-10-27 by the orchestrator, with the owner's go (the Twitter thread and the Aztec
Foundation CTA made the list part of the release day): the arcs land on `dev` as ordinary
squash-merged PRs, and a second `release: promote dev → main` carries them after 1.1.0's own
promote, Release PR and `main → dev` sync. Nothing goes to `main` directly, and no `gh stack`.

- PRs to `dev`, each merged by the orchestrator after the five required checks and its gate scan:
  #1240 `feat(subscribe): a key-holding worker that adds a visitor to the launch list` (arc
  `subscribe`); #1242 `feat(landing): the launch email signup as the page's primary action` (arcs
  `landing-plumbing` and `landing-form`, one PR: the Worker script, the `SUBSCRIBE` binding, the
  CSP directive, the form on both pages, `/subscribed`, `og.png`); the `notice` arc as its own
  `docs(legal)` PR (the website privacy notice 1.0, the wallet policy 1.2.7, the legal-page link);
  this plan folder as a `docs(plans)` PR. No PR closes an issue.
- The promote is a merge commit, so release-please reads the squash subjects: the two `feat`
  commits make the next Release PR a minor (1.2.0), which the owner merges when the next release is
  due, not as part of this work.
- What the pre-merge preconditions became: arc 2's "the Worker deployed, A13 held, the secret set"
  moved from the merge to the deploy. The landing's `SUBSCRIBE` binding names a Worker that exists
  only once the owner's first dashboard step has run, so after the promote merges the landing's
  own Workers Build fails until `nulo-subscribe` is created and deployed, and is retried from the
  dashboard then. A13 is held by the owner's interim choice (b): non-production builds off on
  `nulo-landing` (done 2026-10-27), `nulo-subscribe` builds `main` only, per-Worker tokens tracked
  as #1235 before the launch send.
- The smoke in Phase 2 and the real-browser submission in Phase 4 run after the deploy, by the
  orchestrator, on an address the owner controls; neither is committed.
- Before the notice arc chose the privacy version, the open `dev` PRs touching `legal/privacy.md`
  were listed: none.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at
`926c0fd61`. Values: `code_review: off`; reviewer `~/.claude/skills/codex/scripts/run-codex.sh
<prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one loop per arc
(three rounds, then stop), then one fresh cross-arc pass; the arc map in every prompt; rounds in
`lessons/phase-N.md`. Close-out: merge `origin/dev`, read `index.md` and `lessons.md`, Outcome
with `Known limits: #1237, #1238, #1239` and `Open items: #1236`, delete `STATUS.md`, archive, as a
`docs(plans)` PR to `dev` once the deploy and the smoke are done. Teardown once
`git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/mailing-list-1/plan.md`
succeeds: `agent-worktree done mailing-list-1 --merged`. The orchestrator notices the merge.

## Seeds

```
/goal Every phase in implementations-plan/mailing-list-1/plan.md is marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/mailing-list-1/lessons/phase-N.md printed per phase; the codex loop converged per arc and once across arcs (a resumed pass with no new material finding quoted); each arc's PR to `dev` is open or merged, opened only after the loops, and the close-out's archive move is its own commit (`git show --stat`); `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/mailing-list-1 on trunk dev. Each firing: read plan.md and lessons/ (the top stack layer's copy); if the plan is archived on origin/dev, run the teardown and stop; otherwise take the next phase whose precondition holds (an unmet owner precondition means: report and wait, never build around it), run its gate, mark ✓, run the arc loop at each boundary, then Delivery and close-out. Never merge, never push to main or dev, never touch the Resend key.
```
