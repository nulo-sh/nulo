# Recon: landing-explainer-1

Base: `origin/dev` at `2c0df3b9`. One Sonnet Explore agent (reuse sweep, nine capabilities); the parent read `apps/landing` in full, the decision records (P30-05, P33-03, P39-11 on #588), the signed drawing `p33-aztec-a`, the `explainer` and `higgsfield-video-explainer` skills, and the Aztec developer docs at `aztec-labs-eng/aztec-node` tag `v6.0.0-rc.3` (b37a586), `docs/docs-developers/docs/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A second static page in the build | `apps/landing/vite.config.ts:26-31` (`input: ["index.html", ...legalPages]`); the legal pages are the precedent (`scripts/build-legal.ts`) | adapt: add `how-aztec-works.html` to `input` |
| Routing `/how-aztec-works` to the file | Cloudflare serves `terms.html` at `/terms` (comment `vite.config.ts:28-29`; live `curl https://nulo.sh/terms` → 200, "Terms of Use \| NULO") | reuse-as-is |
| Page script (grain, install button) | `src/main.ts`: imports the three stylesheets, `mountInstall()`, `mountPage()`. Both are page-agnostic: every query is guarded (`feed-dom.ts:183-209`, `install-dom.ts:4-22`) | reuse-as-is: the new page loads `/src/main.ts` |
| Header, footer, plates, cards | `index.html:47-55` (bar), `:217-230` (footer); `page.css` `.plate` 90, `.eb` 152, `section.s` 395, `.h2` 399, `.lead` 408-415, `.three` 527, the one breakpoint `@media (max-width: 900px)` 651 (it hides every header link but the button, 692-694) | reuse; a few page rules added to `page.css` |
| Store-link drift guard | `src/install.test.ts:113-119` pins the store URLs `index.html` serves | adapt: read every landing page |
| "The page shipped" guard | `.github/workflows/pr-quick.yml:338-343` checks the legal pages in `dist/`; no check covers a non-legal page | adapt: add `how-aztec-works.html` |
| Sitemap | `public/sitemap.xml` lists `/`, `/terms`, `/privacy` | adapt: add the URL |
| Video or audio anywhere | none: `<video`, `.mp4`, `.webm`, `poster=`, `media-src` grep finds only a link-checker fixture and plan notes | build new (arc 2 only) |
| CSP for self-hosted media | `public/_headers`: `default-src 'self'` with no `media-src`, so media from the site's own origin is allowed | reuse-as-is |
| Landing page tests that parse HTML | only `install.test.ts` reads `index.html` | no new harness |
| Copy-dash guard | `apps/extension/src/utils/copy-dash-ban.test.ts` scans the extension only | none for the landing (rule applies by review) |
| Local-path guard | `scripts/check-no-local-paths.sh` greps the whole repo | applies to the new files |

## Facts that shape the plan

- **Unknown paths serve the home page, not a 404.** `wrangler.jsonc` `not_found_handling: "single-page-application"`. Live today, `/how-aztec-works` and `/forms/feedback` both answer 200 with the home page's title. A page missing from the build therefore fails silently.
- **No landing branch preview exists today.** The `cloudflare-workers-and-pages` app posts "Workers Builds: nulo-landing" on `main` commits only (`08856c26`). Commits on `dev` that touch `apps/landing` (`777066ce`, `0fa075c3`) and landing PR heads (#49, #66, #369, #477) carry no nulo-landing build. The dashboard was not inspected; no branch build was observed. Wrangler 4.129.1 builds an alias URL as `https://<alias>-nulo-landing.<account subdomain>` (`wrangler-dist/cli.js:162529`).
- **The landing has one theme.** `@nulo/design/base.css` gives an unthemed root the dark palette; the landing sets no `theme` attribute. The drawing's light and dark files are byte-identical.
- **CI on a landing-only PR:** Commitlint, Lint + Typecheck, Unit tests, Build Landing and `quality-status`; the extension e2e lanes are skipped by their path filters (`pr-quick.yml:110-118`, `pr-extension-smoke-e2e.yml:56`).
- **Root `bun run test` runs only `apps/extension`**; the landing's tests run under `bun run test:all` or `bun run --cwd apps/landing test`.
- **`apps/extension/src/manifest.test.ts:93-106`** scans `apps/landing` for the passkey host; the new files must not name it.
- **No landing issue exists** (`gh issue list --state all --search "how-aztec-works OR How Aztec works"` → #588 only). onboarding-3's plan files one at its close-out.

## Aztec facts the scripts rest on (docs at v6.0.0-rc.3)

| Claim | Source |
|---|---|
| Private state is encrypted notes only the owner can decrypt; the protocol stores note commitments (hashes), not notes | `foundational-topics/state_management.md:25,33,39` |
| Spending nullifies a note and creates new ones; observers cannot link a nullifier to its note; only payer and recipient know the transfer | `state_management.md:27,45` |
| Public state is transparent, as on other blockchains | `state_management.md:19` |
| Calling public code from private code makes its arguments public | `resources/considerations/privacy_considerations.md:48-50` |
| Private functions run and are proved on the user's device; private inputs never leave the PXE; the sequencer checks the proofs | `foundational-topics/pxe/index.md:13`; `transactions.md:34-36`; `index.md:36,40` |
| A later epoch proof is verified on Ethereum | `transactions.md:37` |
| Fees are mana × price (data availability and L2 execution); Fee Juice is the fee token, bridged from Ethereum, used only for fees, held as a public balance | `foundational-topics/fees.md:41-47,56,83` |
| The fee payer is visible; a private fee-paying contract pays without revealing who started the transaction | `fees.md:83,131`; the orchestrator's rc.3 privacy research (wallet side, summary item 2) |

Two research findings bound what the scripts may claim. Under Nulo's default (no tagging hook), a sender's first transfer to a recipient publishes a log tagged from the recipient's address (the orchestrator's rc.3 privacy research, contract side, summary item 4). And the rc.3 PXE pads no side-effect counts, although the docs say it does (same report, item 1). So no script says the record hides who was paid, or that counts are hidden.

## Wallet words reused

`apps/extension/src/utils/glossary.ts` holds the owner-signed definitions: Private balance "Only you can see it", Public balance "Anyone can see it, like a balance on Ethereum", Fee Juice "The token that pays network fees on Aztec", Public Fee Juice "Paying a fee with it shows your address", Private Fee Juice "Paying a fee with it keeps your address hidden", Sponsored "Someone else pays the network fee for you", Proving "Your device builds a proof that the transaction is valid without revealing what's in it. It's the slow step before sending." The text versions and scripts reuse them.

## Collision risks

- onboarding-3 (another lead) adds the wallet item that opens `https://nulo.sh/how-aztec-works`; it touches no landing file.
- Header and footer markup now exists in `index.html` and in the legal template (`scripts/legal-pages.ts:178-197`); the new page adds a third copy (D3).
