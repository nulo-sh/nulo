# Before launch — what is still blank, and when each blank is due

The Terms and the Privacy Policy ship with `«FILL: …»` placeholders: facts that cannot be read out
of this repository. While any survives, `nulo.sh/terms` and `/privacy` carry a **DRAFT banner and
`noindex`**, so nothing here blocks a merge. It blocks **v1.0.0**.

Find every one: `git grep -n "«FILL" -- legal/terms.md legal/privacy.md`. What each one needs
is described in [`legal/README.md` § Placeholders](./legal/README.md#placeholders). This file is
the schedule. Accepted code work that blocks launch is not listed here: it is the
[`v1.0.0` milestone](https://github.com/nulo-sh/nulo/milestone/1).

## 1. Any time before v1.0.0 — look these up, do not guess

**Done** for the privacy policy, every row below but the last; the Terms carry the same security
URL and Presto links. Each filled fact reads in place in `legal/privacy.md` and `legal/terms.md`.

| Fill | Where | How to find it |
|---|---|---|
| Email provider's legal name + privacy link | `legal/privacy.md` § 5.5 | The provider behind `hello@nulo.sh` |
| Cloudflare contracting entity + privacy link | `legal/privacy.md` § 5.5 | Cloudflare's customer agreement names the entity for your country |
| What the dRPC account exposes to you | `legal/privacy.md` § 5.1 | Open the dashboard and list the categories you can actually see, or confirm you see none |
| What the Cloudflare dashboard exposes to you | `legal/privacy.md` § 5.5 | Same: open it, list it |
| Retention ×3 (website/security records, correspondence, provider schedules) | `legal/privacy.md` § 5.5 | State the real period or the real criterion |
| Transfer safeguards (provider → destination → adequacy decision or SCCs, UK included) | `legal/privacy.md` § 12 | From each provider's DPA |
| EU/UK Article 27 representative | `legal/privacy.md` § 10 | Only if required. **Delete the line** if not; never leave it blank |
| Security-reporting URL | `legal/terms.md` § 24, `legal/privacy.md` § 13 | A URL that resolves for a reader outside the repo (`SECURITY.md` is a repo path) |
| Presto's own licence + privacy links | `legal/terms.md` § 7, `legal/privacy.md` § 5.8 | Published by the Presto native app |
| Re-read what the Cloudflare dashboard exposes, now with `tokens.nulo.sh` | `legal/privacy.md` §§ 5.5, 5.11 | Once the `nulo-tokens` Worker serves that domain: open the zone's request sample filtered to the hostname and confirm § 5.5's list still holds. Workers Logs stays off (`infra/token-list/wrangler.jsonc`) |

## 2. When the store listings exist

| Fill | Where |
|---|---|
| ~~Chrome Web Store listing URL~~ | `legal/terms.md` § 1 — done |
| ~~Firefox Add-ons listing URL~~ | `legal/terms.md` § 1 — done |

The store launch left two owner steps in the dashboards
([record](./implementations-plan/archive/nulo-v6/plan.md#store-upload)):

- [x] Chrome: publish the staged V6 submission from the dashboard once Google approves it, before
      the approval lapses (30 days). On 2026-10-19 the listing serves "Nulo V6" 0.31.0, updated
      18 October 2026; the store page shows only a published revision, not its visibility.
- AMO: the listing still carries the "This add-on is experimental" flag (`is_experimental` is
  `true` in AMO's API on 2026-10-19); removing it is a § 3 step. Mozilla may review the live
  version later, the modified-library rule being the open risk.

The owner decided both listings' launch state (2026-10-19, decision page 62, #864): Chrome goes
Public at 1.0.0, "once the security work in flight has landed", and AMO drops the experimental flag
at 1.0.0 (§ 3).

Also at this point, not a placeholder but the same deadline: the **Chrome trader disclosure**
([`legal/README.md`](./legal/README.md), blocker 5) is declared non-trader; it must be re-declared
before any funding, revenue or entity. If the trader path applies, Chrome displays a verified address
and phone number publicly, and no clause can waive that.

The store dashboards are filled from `apps/extension/store/listing.md` (one source for both stores;
`apps/extension/scripts/store-listing.test.ts` holds it to the manifests and to the privacy
policy). Before the first submission the privacy page must have lost its DRAFT banner, which takes
two things: every `«FILL»` in § 1 above is filled (a reviewer who opens `nulo.sh/privacy` reads
them), **and the privacy policy's effective date is set to the planned submission day** — the
banner stays while any placeholder survives, and the date is one. Set it in three places, two in
`legal/privacy.md` (tests hold the version line to the manifest, not the history row's date):

- [x] `legal/privacy.md` — the version line at the top (1.0's now lives in
      `legal/archive/privacy-1.0.md`), and the 1.0 row of the history table
- [x] `packages/legal/src/manifest.ts` — `effective` for `privacy` 1.0

The Terms' listing URLs were filled once both first submissions existed. Their
effective date waits for § 3, the 1.0 ship day, so `/terms` stays draft a little longer, which the
stores do not mind — they require a reachable privacy policy, not terms. Nulo V6 reuses both store
items, renamed. Both URLs in `legal/terms.md` § 1 name the item by its ID (Chrome's item id, AMO's
add-on id `3077967`), which each store redirects to the current listing, so no rename touches them.

Also before submission, one wording item in the privacy policy that is not a placeholder: § 2
attributes "loads no remote code" to the content security policy, which only forbids remote
*scripts* — WASM bytes are kept local by the bundled loaders, not the policy
(`apps/extension/store/remote-code.md` § What this bears on). **Done:** § 2 reads "forbids
loading remote scripts".

## 3. The day v1.0.0 ships — in the `release: promote dev → main` PR that carries it

Before the promote:

- [ ] The owner sends from the 1.0.0 candidate on the new Testnet, which no e2e suite reaches
      (they run against a local sandbox). Owner's call, 2026-10-19, decision page 68

The Terms' **effective date** is the date the 1.0.0 listing goes live (privacy 1.0's is already
set, § 2). Terms 1.0 never takes effect: it was a draft, replaced by 1.1, which carries the date.
It appears in three places, two in `legal/terms.md` (tests hold the version line to the manifest,
not the history row's date), so change them together:

- [x] `legal/terms.md` — the version line at the top, and the 1.1 row of the history table
- [x] `packages/legal/src/manifest.ts` — `effective` for `terms` 1.1 (26 October 2026; 1.0 stays
      `null`)
- [x] `legal/privacy.md` + its manifest entries — 1.0 and 1.1 already dated, confirm unchanged;
      1.1.1 per § 4

Then:

- [x] `git grep -n "«FILL" -- legal/terms.md legal/privacy.md` prints nothing (`legal/README.md`
      names the placeholder in prose). The `launch-legal` check refuses the 1.0.0 Release PR until it does
- [x] Both listing URLs in `legal/terms.md` § 1 open the live listings (a store serves an item's
      public page only once it has published it). Both did on 2026-10-19 and on 2026-10-24 (AMO's
      page answers a script with a challenge; its API reads the add-on public)
- [x] `bun run --cwd packages/legal test` and `bun run --cwd apps/landing test` are green
- [ ] After the deploy and before the Release PR merges, `nulo.sh/terms` shows **no DRAFT banner**
      and no `noindex` meta, and the current version's permalink (`nulo.sh/terms/v<version>/`)
      shows no DRAFT banner. A permalink always carries `noindex`: it duplicates the canonical page
- [ ] Chrome (owner): set the listing to Public before the 1.0.0 store dispatch; an approved staged
      submission locks every dashboard field ([`release` skill](./.claude/skills/release/SKILL.md),
      troubleshooting)
- [ ] AMO (owner): remove the "This add-on is experimental" flag
- [x] The README's "DEMO / PREVIEW BUILD — NOT A PRODUCTION WALLET" banner is rewritten to the
      owner's picks (2026-10-19, decision page 68)

## 4. Every later `release: promote dev → main`

Nothing to fill unless `legal/terms.md` or `legal/privacy.md` changed since the last release. If one
did, it needs a new version before it reaches users — procedure in
[`packages/legal/README.md` § Shipping a new version](./packages/legal/README.md#shipping-a-new-version):
archive the old text, bump the version line, add the history row **with its effective date**, append
the manifest entry, and mark it `material: true` with hand-written `changes` if people must
re-accept. `git diff <last release tag> -- legal/` answers whether any of this applies.

**Due at the first release:** privacy 1.1.1 (the address for reporting security vulnerabilities) is
archived, versioned and effective 6 October 2026:

- [x] `legal/privacy.md` — the version line and the 1.1.1 history row
- [x] `packages/legal/src/manifest.ts` — `effective` for `privacy` 1.1.1
- [x] After the deploy, `nulo.sh/privacy` shows no DRAFT banner, and AMO's Privacy policy field
  carries the 1.1.1 text (`apps/extension/store/listing.md` § Privacy policy text). On 2026-10-19
  both carry 1.2.1, which keeps 1.1.1's address for reporting security vulnerabilities

**Due at the release that carries the Privacy page:** privacy § 5.3 says the explorer "can be
disabled in Settings → Advanced". That control now lives in Settings → Privacy. Ship a new privacy
version before that release reaches users (procedure above):

- [x] `legal/privacy.md` — § 5.3 reads "Settings → Privacy"; the version line and a new history
      row, effective the day it is published (1.2.1, 15 October 2026)
- [x] `packages/legal/src/manifest.ts` — the new `privacy` entry, `material: false`, same date
- [x] After the deploy, AMO's Privacy policy field carries the new text
      (`apps/extension/store/listing.md` § Privacy policy text). On 2026-10-19 it begins "Version
      1.2.1 — effective 15 October 2026", and its § 5.3 reads "Settings → Privacy"

**Due at the release that publishes privacy 1.2.2:** §§ 5.2 and 5.11 say what the price and
token-list requests carry. The version is archived and in place; its effective date is the day the
promote publishes it, so until then it reads `«FILL: effective date»`:

- [x] `legal/privacy.md` — the version line and the 1.2.2 history row, dated the day it is published
- [x] `packages/legal/src/manifest.ts` — `effective` for `privacy` 1.2.2 (25 October 2026), same date
- [ ] After the deploy, `nulo.sh/privacy` and `nulo.sh/privacy/v1.2.2/` show no DRAFT banner, and
      AMO's Privacy policy field carries the 1.2.2 text (`apps/extension/store/listing.md` § Privacy
      policy text)

**Due at the release that publishes privacy 1.2.3:** § 3 says which data is stored encrypted. The
version is archived and in place, and its effective date, like 1.2.2's, is the day the promote
publishes it. A promote that publishes both dates both, and the archived
`legal/archive/privacy-1.2.2.md` with them, since it was archived before its date was known:

- [x] `legal/privacy.md` — the version line and the 1.2.3 history row, dated the day it is published
- [x] `packages/legal/src/manifest.ts` — `effective` for `privacy` 1.2.3 (25 October 2026), same date
- [ ] After the deploy, `nulo.sh/privacy` and `nulo.sh/privacy/v1.2.3/` show no DRAFT banner, and
      AMO's Privacy policy field carries the 1.2.3 text (`apps/extension/store/listing.md` § Privacy
      policy text)
- [ ] The Chrome Web Store's `storage` justification is re-pasted from `apps/extension/store/listing.md`
      § Permissions, which now says the data is encrypted

**Due at the release that publishes privacy 1.2.4:** § 3 drops pinned tokens, fee-payer choices
and the last-selected account from its exceptions. Its effective date, like 1.2.3's, is the day the
promote publishes it. A promote that publishes both dates both, and the archived
`legal/archive/privacy-1.2.3.md` with them:

- [x] `legal/privacy.md` — the version line and the 1.2.4 history row, dated the day it is published
- [x] `packages/legal/src/manifest.ts` — `effective` for `privacy` 1.2.4 (25 October 2026), same date
- [ ] After the deploy, `nulo.sh/privacy` and `nulo.sh/privacy/v1.2.4/` show no DRAFT banner, and
      AMO's Privacy policy field carries the 1.2.4 text (`apps/extension/store/listing.md` § Privacy
      policy text)

**Due at the release that publishes privacy 1.2.5:** § 5.1 names the Testnet endpoint as the one on
the Developer's provider account. Its effective date, like 1.2.4's, is the day the promote publishes
it. A promote that publishes both dates both, and the archived `legal/archive/privacy-1.2.4.md` with
them:

- [x] `legal/privacy.md` — the version line and the 1.2.5 history row, dated the day it is published
- [x] `packages/legal/src/manifest.ts` — `effective` for `privacy` 1.2.5 (25 October 2026), same date
- [ ] After the deploy, `nulo.sh/privacy` and `nulo.sh/privacy/v1.2.5/` show no DRAFT banner, and
      AMO's Privacy policy field carries the 1.2.5 text (`apps/extension/store/listing.md` § Privacy
      policy text)

**Due at the release that publishes Terms 1.2 and privacy 1.2.6:** both say that a passkey profile
has a recovery phrase. Terms 1.2 is material, so every install that accepted 1.1 meets the
re-acceptance sheet. Both effective dates are the day the promote publishes them:

- [x] `legal/terms.md` and `legal/privacy.md` — the version lines and the 1.2 and 1.2.6 history
      rows, dated the day they are published (27 October 2026)
- [x] `packages/legal/src/manifest.ts` — `effective` for `terms` 1.2 and `privacy` 1.2.6, same date
- [ ] After the deploy, `nulo.sh/terms`, `nulo.sh/terms/v1.2/`, `nulo.sh/privacy` and
      `nulo.sh/privacy/v1.2.6/` show no DRAFT banner, and AMO's Privacy policy field carries the
      1.2.6 text (`apps/extension/store/listing.md` § Privacy policy text)

**Due at the release that publishes Terms 1.2.1:** the summary box names the default network as
Nulo shows it, Alpha. A patch, so nobody is asked to accept again. The version is archived and in
place; its effective date is the day the promote publishes it, so until then it reads
`«FILL: effective date»`:

- [ ] `legal/terms.md` — the version line and the 1.2.1 history row, dated the day it is published
- [ ] `packages/legal/src/manifest.ts` — `effective` for `terms` 1.2.1 (now `null`), same date
- [ ] After the deploy, `nulo.sh/terms` and `nulo.sh/terms/v1.2.1/` show no DRAFT banner

**Due at the release that first uploads an Aztec 6.0.0 build to a store** (owner's call,
2026-10-14, for the rc.3 line, carried to 6.0.0 on 2026-10-24; [aztec-rc3](./implementations-plan/archive/aztec-rc3/plan.md) OA-1, D9):

- [x] The wallet's in-place reset of a stale network (planned as `stale-network-reset`) is on `dev`:
      until it is, an rc.3 update shows a store-installed V6 account the integrity barrier. #485,
      #486 and #487 merged on 2026-10-15, and #497 promoted them before 0.31.0 went to the stores
      that day

The owner's live-Testnet send moved to § 3: from the 1.0.0 candidate, before the promote (owner's
call, 2026-10-19, decision page 68).

## Not legal text, same deadline

- Firefox `data_collection_permissions` (`financialAndPaymentInfo`) and the Firefox 153 minimum
  are settled and pinned by `apps/extension/src/manifest.test.ts`; the reasoning is in
  `apps/extension/store/listing.md` § Data collection declaration.
- **Open security issues.** Before the `release: promote dev → main` PR that carries v1.0.0, every
  [open issue labelled `security`](https://github.com/nulo-sh/nulo/issues?q=is%3Aopen+label%3Asecurity)
  is closed, or carries a written disposition in which the owner accepts the remaining risk by
  name. Draft security advisories follow
  [`SECURITY.md` § How findings are tracked](./SECURITY.md#how-findings-are-tracked) and are not
  listed here.
  Owner's call, 2026-10-11, decision page 0 (C7 note).
- **A stable Aztec line.** v1.0.0 ships on a stable `6.0.0` of the Aztec packages, never a release
  candidate. The bump follows the [`aztec-update` skill](./.claude/skills/aztec-update/SKILL.md),
  and the version is read from the pinned `@aztec-labs/*` line in `apps/extension/package.json` at
  promote time.
  Owner's call, 2026-10-11, decision page 0 (C7 note).
