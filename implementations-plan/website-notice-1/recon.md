# Recon: website-notice-1

Base: `origin/dev` at `040334f53`. One reuse sweep (Explore, sonnet) plus the planner's own reads.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Archive a superseded notice | Manual copy, by procedure: `legal/README.md` § Changing these documents, `legal/archive/README.md`. No script writes `legal/` (searched `scripts/`, `apps/landing/scripts`, `packages/legal/src` for `archive`, `website-privacy`, `parseVersionHistory`). | reuse-as-is (`cp`) |
| Publish the notice and its permalinks | `apps/landing/scripts/build-legal.ts:17-29`: versions = the notice's history rows; each superseded row reads `legal/archive/website-privacy-<v>.md`, a missing file throws in `prebuild`. `legal-pages.ts:50-56` dates each version by that file's own header. | reuse-as-is |
| Pin the head's version and date | `apps/landing/scripts/legal-pages.test.ts:226-231`: last history row = header version, its date cell = header date. Head only. | reuse-as-is |
| Pin an archived notice's header to its row | None. `packages/legal/src/manifest.test.ts:53-60` does it for terms and privacy only; nothing for the notice (searched `packages/legal/src`, `apps/landing` for `website`, `archive`). A wrong archived header renders that wrong date on the page, unchecked. | adapt: one test beside `:226-231` (D2) |
| Pin `CONSENT_VERSION` to the notice | `infra/subscribe/test/deploy.test.ts:26-30` (var = header version); `worker.test.ts:264` reads the var. | reuse-as-is; the bump makes it green |
| CI over the change | `pr-quick.yml:110-116` (`legal/**` in the landing filter), `build-landing` (`:333-356`, checks `website-privacy/v1.0/index.html` among others), `launch-legal` (`NULO_LAUNCH_GATE`, PRs to `main`). | reuse-as-is |
| "Nothing is sent when you sign up" | `infra/subscribe/src/resend.ts:42-104`: `call` is GET/POST and its only paths are `/contacts/{email}` and `/contacts`; no `/emails` or `/broadcasts` in `src/`. `worker.test.ts:241-265`: a new address makes exactly two requests (lookup, create). `README.md:10`: "Signup sends no email". | demonstrated |
| "Replies reach hello@nulo.sh" | No file pins it. `scripts/unsubscribe-test.ts:108` copies `reply_to` from the Resend draft; `unsubscribe-test.test.ts:41,96` fixtures hold `["hello@nulo.sh"]`. The draft lives in Resend; `broadcast-topic.ts` never writes `reply_to` (searched `reply[_-]?to|replyTo` repo-wide). | holds only in Resend's state |

## Text outside the approved sentences (report, do not change)

- `legal/website-privacy.md:65` (§ 3.2, purpose): "To tell you when Nulo is available and to send occasional product updates." Same document, outside the three approved sentences; the reuse sweep missed it. OA-1.
- `infra/subscribe/README.md:51` ("Review the list for junk before the launch send.") and `:70` ("the launch email says why the reader got it"): operator runbook, not user-facing. D3.
- `apps/landing/index.html:258`, `subscribed.html:30`: already "Occasional updates" since #1540; no launch promise.
- `legal/privacy.md:56, 186-187` (§§ 2, 5.5): only point at the notice. `BEFORE-LAUNCH.md`, `apps/extension/store/listing.md`: nothing on the list.
- Search: case-insensitive `one email|launch email|launch send|first email|Nothing is sent|repl|not received|review the list|on the stores|when Nulo is available|tell you when` over the tree, `node_modules`, `dist` and both archives excluded.

## Open work and collisions

- #1541 (this lane). #1236 (open enhancement, double opt-in "before any campaign after the launch email"): no collision; 1.1's "Before each send I review the list" matches its stated mitigation.
- Closed known limits #1237-#1239 (rate limit, preview binding, timing): untouched.
- The window between the `nulo-landing` and `nulo-subscribe` deploys of one `main` push, where a signup can record the other version, is settled: the record is "the version in effect", not proof of what was shown ([mailing-list-1](../archive/mailing-list-1/plan.md), its Codex row on `CONSENT_VERSION`).
