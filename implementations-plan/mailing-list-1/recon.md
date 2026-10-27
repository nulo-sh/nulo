# mailing-list-1 — recon

Base: `origin/main` at `926c0fd61` (the landing and the new Worker deploy from `main`). Where `dev`
differs and it matters (the legal documents), `origin/dev` at `9e88a3c71` was read too (privacy
1.2.6, effective 27 October 2026).
One Sonnet reuse sweep, plus the planner's own reads; vendor facts from the vendors' pages, fetched
2026-10-27.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A Worker with a script, its tests, its config pins | `infra/passkey-rp/src/worker.ts` (`respond()`, the 405 with `allow`), `infra/passkey-rp/test/worker.test.ts` (calls `worker.fetch(new Request(…))`; parses `wrangler.jsonc` with `.replace(/^\s*\/\/.*$/gm, "")`), `infra/passkey-rp/tsconfig.json` (`lib: [ES2022, WebWorker]`, `types: []`) | adapt: the shape and the test style; nothing shared to import |
| Config pin for a host with no `routes` and logs off | `infra/token-list/test/host.test.ts:30-52` | reuse the pattern |
| Fakes for `env`, a rate limiter, an upstream `fetch` | none: passkey-rp's handler takes only a `Request`. Searched `infra/*/test/*.ts` for `env`, `fetch =`, `spyOn` | build new, inside the test file |
| Address validation, honeypot, body cap, Origin check, rate limiting | none. Searched `email|rate.limit|honeypot|Origin|content-length` and `emailRe|isEmail` over non-extension source; passkey-rp checks no Origin | build new (B1) |
| "Bundle imports nothing outside the workspace" / "no `console.*`" guards | none in `infra/`; the extension's `log-payload-ban.test.ts` scans extension source only | build new: a static scan of `infra/subscribe/src` |
| Legal-page generator | `apps/landing/scripts/legal-pages.ts` (`LEGAL_DOCUMENTS = ["terms","privacy"]` :11, `TITLES` :13, `rewriteLinks` regex :107, nav and footer in the template), `build-legal.ts` (rm + write per document), `legal-pages.test.ts` (:31 builds a `Record<LegalDocument,…>`; :173 `test.each(["terms","privacy"])`) | adapt: a third document |
| Version manifest and its document checks | `packages/legal/src/manifest.ts` (`LegalDocument`, `LEGAL_MANIFEST`), `manifest.test.ts:10` (`DOCS`) checks head = version line, history = manifest, archives exist | adapt: one more key; the checks then cover the notice |
| Landing CSP pin | none: `scripts/headers.test.ts` tests only the parser. The exact-policy pattern is `infra/token-list/test/host.test.ts:23-28` | build new test, copy that pattern |
| Landing page pins | `apps/landing/src/install.test.ts:113-120` (`describe.each` over both HTML pages) | adapt |
| CI for a new workspace | root `workspaces` has `infra/*`; `test:all` and `typecheck:all` run every `@nulo/*` workspace; Biome covers `infra/**`; `_unit-tests.yml` runs `test:all` on every PR. passkey-rp and token-list have no workflow and no path filter of their own | reuse as is: no new workflow |
| Landing build gate | `pr-quick.yml` `build-landing` (`bun run build` + a "Verify the pages shipped" file list) behind the `landing` filter (`apps/landing/**`, `legal/**`, `packages/legal/src/**`) | adapt: two more files, one dry-run step |

## Facts verified against the tree

- `apps/landing/wrangler.jsonc`: no `main`, `preview_urls: true`, `workers_dev: false`,
  `observability.enabled: false`, SPA `not_found_handling`; its comment cites "Privacy Policy § 5.5".
  wrangler is pinned `4.129.1` in the landing and token-list (passkey-rp `^4`).
- `apps/landing/public/_headers`: the CSP has `connect-src 'self'` and no `form-action`.
- "Both pages" are `index.html` and `how-aztec-works.html`. Hero `.cta` holds the dashed
  `.soon` "Available early November · Chrome and Firefox stores" (`index.html:83`); nav "Coming soon"
  (`index.html:57`, `how-aztec-works.html:50`); `#get` repeats the `.soon` line (`:212`); both
  footers list github · releases · privacy · terms.
- The legal pages' own header nav and footer name Terms and Privacy only (`legal-pages.ts` template).
- `legal/privacy.md` on `dev` is 1.2.6, effective 27 October 2026; `main` is behind it. § 5.5
  covers hosting for three hosts (`nulo.sh`, `passkey.nulo.sh`, `tokens.nulo.sh`), "There are no web
  forms", correspondence, retention and the uninstall page. § 5.11 says the Developer sees "what § 5.5
  describes for its hosts"; § 1 and § 2 name the website.
- `LegalDocument` reaches the extension: `apps/extension/src/utils/legal-links.ts` (`openLegalDocument`),
  `onboarding/pages/terms.vue`; nothing iterates the manifest's keys (searched `LEGAL_MANIFEST`,
  `LegalDocument` on `dev`).
- `main` takes merge commits only; release-please opened a patch Release PR (#1166) from the two
  `chore(landing)` merges; #1159 put `BEGIN_COMMIT_OVERRIDE` in its body. Every lane commit lands on
  `main` as authored.
- `behavior-gating.test.ts` maps a non-app `@nulo/*` dependency to `packages/<name>`: the landing
  must not depend on the new workspace (a service binding is by name and needs no edge).
- `scripts/ci-cd/audit-acks.json` names the workspaces that depend on wrangler 4.129.1 in one reason.
- `packages/legal/src/launch.ts` `LAUNCH_DOCUMENTS` is pinned to the manifest's keys
  (`launch.test.ts:38`) and read by `scripts/release/auto-unstick-run.ts:120` (its test pins the read
  list at :220); `pr-quick.yml` `launch-legal` refuses a `«FILL»` in them on every PR into `main`.
  `status.test.ts:11` types a `Record<LegalDocument,…>`. (Missed by the sweep; found by the panel.)

## Vendor facts (fetched 2026-10-27)

- Resend Create Contact: `POST https://api.resend.com/contacts`; body `email` (required),
  `unsubscribed`, `properties` (string values), `segments: [{ id }]`, `topics: [{ id, subscription:
  "opt_in" | "opt_out" }]`; `audience_id` deprecated. Response `{ object, id }`; the OpenAPI spec
  declares only `201`, the introduction lists `200`.
  https://resend.com/docs/api-reference/contacts/create-contact ,
  https://raw.githubusercontent.com/resend/resend-openapi/refs/heads/main/resend.yaml
- A duplicate create is **not documented** (docs, OpenAPI, `resend-node`, `resend-mcp`); one user's
  April 2025 report (resend/resend-node#494) says "a normal success response", before the November
  2025 contacts change.
- `Authorization: Bearer …`; a request without `User-Agent` gets 403. 10 requests per second per
  team; `retry-after` in seconds. Errors by status: 401 `restricted_api_key`, 403 `email_above_quota`,
  409 `resource_locked`, 422 `invalid_parameter`/`missing_required_field`, 429 `rate_limit_exceeded`
  and quota names, 500, 503. No idempotency key for contacts.
  https://resend.com/docs/api-reference/introduction , …/rate-limit , …/errors ,
  https://resend.com/docs/dashboard/emails/idempotency-keys
- Keys: `full_access` or `sending_access` ("Can only send emails"). Account data stays in the US;
  the region sets only where mail is sent from. DPA: EU SCCs, UK Addendum, EU–US DPF.
  https://resend.com/docs/api-reference/api-keys/create-api-key ,
  https://resend.com/docs/dashboard/domains/regions , https://resend.com/legal/dpa ,
  https://resend.com/legal/subprocessors
- Rate Limiting binding: `ratelimits: [{ name, namespace_id, simple: { limit, period } }]`, period
  10 or 60, wrangler ≥ 4.36.0, approximate and per location, `env.X.limit({ key })` → `{ success }`;
  Cloudflare does **not recommend** keying on IP. Free-plan availability not documented.
  https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Service bindings: `services: [{ binding, service }]`; the target needs no route and must be
  deployed before the caller. Whether `CF-Connecting-IP` survives the hop is not documented.
  https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- `assets.run_worker_first: ["/api/*"]`: other paths never reach the Worker and keep the SPA
  fallback; `_headers` does **not** apply to responses the Worker generates.
  https://developers.cloudflare.com/workers/static-assets/routing/worker-script/ ,
  https://developers.cloudflare.com/workers/static-assets/headers/
- `workers_dev: false` does not disable version URLs; set `preview_urls: false` too. A version URL
  runs with that version's configuration and resources, bindings included.
  https://developers.cloudflare.com/workers/configuration/routing/workers-dev/ ,
  https://developers.cloudflare.com/workers/configuration/previews/
- Deploy keeps dashboard secrets and overwrites dashboard vars; `secrets.required` fails a deploy
  while the secret is missing. Workers Builds: Settings → Build → Branch control (production branch,
  "Enable Preview Builds"). https://developers.cloudflare.com/workers/wrangler/configuration/ ,
  https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/

- Workers Builds' default token: account-level "Workers Scripts (edit)", which applies "to every
  current and future Worker in the account"; a token may hold `Editor` on one Worker, and a Worker
  may use a token you choose (Settings → Build). Whether Builds accepts a one-Worker token is not
  stated. https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ ,
  https://developers.cloudflare.com/workers/authorization/workers/
- Resend's processor entity is Plus Five Five, Inc. (DPA Exhibit B); its logs keep "the full JSON
  payload sent to the API" for 30 days on every self-serve plan. https://resend.com/legal/dpa ,
  https://resend.com/docs/dashboard/logs/introduction , https://resend.com/pricing
- release-please: "This feature will not work with plain merges" (the commit override); releasable
  units are `feat`, `fix`, `deps`. https://github.com/googleapis/release-please#how-can-i-fix-release-notes

## Collisions

- No open or closed issue on a mailing list, double opt-in, Resend or a global limiter (searched
  "double opt-in", "mailing list", "newsletter", "Resend", "subscribe", "Durable Object").
- `legal/privacy.md` is edited on `dev` by other lanes; a version number chosen on `main` can collide
  in the `main → dev` sync.
