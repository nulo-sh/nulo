# launch-prep-1: recon

Read at `origin/dev` `b6208221` on 2026-10-19 by the planner and three Sonnet explorers; every public
fetch below was made that day. Paths are repo-relative.

## Store and site evidence (BEFORE-LAUNCH.md)

| Box | Evidence | Verdict |
|---|---|---|
| § 2 Chrome: publish the staged V6 submission | `chromewebstore.google.com/detail/jlmiaokmjoicmclelpiiocdhncddkdmc` → 200, redirects to `/detail/nulo-v6/…`, title "Nulo V6", "Updated October 18, 2026", embedded manifest `0.31.0.0`. Release runs: 0.30.2 uploaded 2026-10-06 23:22Z (staged), 0.31.0 uploaded 2026-10-15 22:08Z. The store serves only a published revision; visibility (Unlisted or Public) is not on the page. | met |
| § 2 AMO: "experimental" flag | `addons.mozilla.org/api/v5/addons/addon/3077967/` → `is_experimental: true`, `status: public`, current `0.31.0.0`. (An explorer misread this as `false`; re-fetched by the planner.) | not met; the owner's P62 call removes it at 1.0.0 |
| § 3 Both listing URLs in `legal/terms.md` § 1 open the live listings | Chrome URL as above → 200; `addons.mozilla.org/firefox/addon/3077967/` → 200 | met today |
| § 4 privacy 1.1.1: `nulo.sh/privacy` has no DRAFT banner, AMO's field carries 1.1.1 | `nulo.sh/privacy` → 200, "Version 1.2.1 — effective 15 October 2026", no `legal-banner`, no `noindex`. AMO `…/3077967/eula_policy/` begins "Version 1.2.1 — effective 15 October 2026" and carries the 1.1.1 security-reporting text and history row. | met |
| § 4 privacy 1.2.1: AMO's field carries the new text | the same fetch; § 5.3 reads "Settings → Privacy" | met |
| § 4 rc.3 (a): the stale-network reset is on `dev` | #485, #486, #487 (2026-10-15), close-out #494 (18:04Z), promote #497 (19:10Z), all before the 0.31.0 store upload (22:08Z) | met |
| § 4 rc.3 (b): the owner sends from that build on the live Testnet | no record in issues, PRs or plans (`git grep -i "live testnet"` finds only `implementations-plan/archive/aztec-rc3/plan.md` D9's intent) | unknown: OA-3 |
| `nulo.sh/terms` | `noindex` meta and `data-legal-banner="draft"`; `legal/terms.md:3,578` carry `«FILL: effective date»` | not met (arc 2, then the promote) |

## Builds that reached people outside the developers

GitHub releases, each with both zips and `SHASUMS256.txt`: v0.30.2 (2026-10-06), v0.31.0 (2026-10-15),
and public nightly prereleases 26280–26282 (2026-10-07..09), 26288–26293 (2026-10-15..19). AMO
versions, all public and listed: 0.28.0 (09-23), 0.30.0 (10-02), 0.30.1 (10-06), 0.30.2 (10-06),
0.31.0 (10-15). Chrome: 0.30.2 staged (10-06), 0.31.0 (10-15). The Chrome page counts 2 users.

- `36f7aa1c` (the fee spender, #264, 2026-10-10) and `7e2688af` (one token spelling, #379,
  2026-10-13) are first in nightly 26288 and v0.31.0; every outsider build before them is 0.30.x.
- `479ba56d` (#431, 2026-10-15, in v0.31.0) moved Testnet's chain id and re-pinned the account
  artifact in place: regime `nulo-v6` → `nulo-v6.1` (`packages/aztec-runtime/src/account/address-freeze.ts:92,109,132`),
  so every account a 0.30.x build derived has a new address under 0.31.0 and later.

## What the reset and the integrity check do to 0.30.x rows

- `apps/extension/src/wallet/services/stale-network/classify.ts:25-28,37-48`: a seeded row whose
  chain id is behind the build's seed has a network cause; a chain where every derived account moved
  and one network row owns it is `moved`. Both are offered the in-place reset (Mainnet never is);
  until it runs, the chain is quarantined and its rows are never shown or used (CLAUDE.md § Account-address freeze).
- The reset purges, per profile and chain: accounts, tokens, balances (cascade), FPC rows,
  authwits, incoming transfers, journal rows, Tx rows (by account address and old chain id), dApp
  sessions, then the PXE store (`network/service.ts:1018-1030,1109-1130`, `network-reset/service.ts`).
- A full backup from 0.30.x has compat epoch 5, as today (`backup/backup-migration-registry.ts:66-80`),
  but carries no network rows: restore re-seeds the build's networks
  (`apps/extension/src/composables/full-backup-restore.ts:307-330`), refuses derived accounts and tokens on
  a chain the build does not serve (`token/service.ts:1022`, `isChainLive`) and drops their Tx and
  authwit rows, keeping an imported account there as held with its history dropped
  (`full-backup-restore.ts:402-426`, Codex r2); chain-0 rows restore and meet the classification above (Opus r1, verified).
- What survives an update: rows on a chain-0 or custom chain holding no derived account
  (imported-only or none: `classify.ts:36`), whose imported account is refused on use; Tx rows shared
  with another profile, kept and marked `ambiguous` (`transaction/service.ts:350-360`, Codex r1); a
  profile never opened, quarantined but unpurged.

## Known-limit code facts (HEAD)

- **#372.** Adds are canonical (`token/service.ts:723-724`, `parseTokenInterface`); `findToken`
  compares lower-cased (`:854-858`). Restore keeps `contract` verbatim (`:985-1036`; `spec.ts:46`
  is `z.string()`), and balance rows match a token exactly (`token-balance/balance-identity.ts:17`).
  Exact readers remain: `utils/tx-amount.ts:40` and eight others. The only `tokens.set` writers are
  add (`:482`), refresh (`:954`, keeps identity) and restore (`:1030`).
- **#385.** Keys `nulo-ci-1` and `nulo-recovery-1` (`packages/token-list/src/keys.ts:11-14`), equal
  rank, picked by `keyId` (`envelope.ts:146`); no expiry, no revocation. A higher sequence wins
  (`apps/extension/src/wallet/services/token-list/service.ts:186-189`); a stored list signed by an
  unpinned key is dropped at start (`:136-148`). The list is fetched only from
  `https://tokens.nulo.sh/v1/list.json` (`spec.ts:7`), which Workers Builds deploys from `dev`
  (CLAUDE.md § Branching). The `token-list` environment's one required reviewer is the owner.
  `SECURITY.md` § Token list signing: "Until the release, the leaked key verifies."
- **#684.** `DEFAULT_SEEDS` holds Testnet and the Local Network (chain 0) with no build gate
  (`apps/extension/src/wallet/services/network/seeds.ts:49-68`); Settings → Networks lists it
  (`popup/pages/settings/networks/index.vue:30-60`). `assertLiveChainIdentity` skips the rollup
  version on chain 0 (`packages/aztec-runtime/src/utils/chain-identity.ts:56-67`). Today's remedy
  after a sandbox restart: delete the network (`network/service.ts:562-597`, `purgeChain`), then add
  `localhost:8080` back under Developer Mode, which stores it as kind `custom`.
- **#775.** `apps/extension/src/popup/components/modules/tx/tx-detail-helpers.ts:55-64` still reads
  "Sponsored" for a UI-origin row with no fee call and no `feeSpender`; `feeSpender` stays optional
  (`transaction/spec.ts:147,206`). tx-record-1's `feeChoice` (#821, not landed) leaves such rows as today.
- **Migrations.** `BASELINE_VERSION = 1`, `realMigrations = []`
  (`apps/extension/src/wallet/storage/migrations/index.ts`); CLAUDE.md still says pre-production.
  The rule flips at the 1.0.0 promote (#865, lane migration-rule-1, P62-02 A).

## The Terms bump (arc 2)

- `legal/terms.md:3` `**Version 1.0 — effective «FILL: effective date»**`; history `:573-578`, one row.
  The only text change since 2026-10-06 is § 7.5 naming "the token list the wallet downloads"
  (`a05831f2`, 2026-10-14). `legal/archive/` holds no Terms copy yet.
- `packages/legal/src/manifest.ts:16`: `terms: [{ version: "1.0", effective: null, material: true, changes: ["First published version."] }]`.
- Tests: `packages/legal/src/manifest.test.ts:16-53` (order, material ⇒ minor, head = version line,
  history = manifest, an archive copy per superseded version whose header equals the entry);
  `apps/landing/scripts/legal-pages.test.ts:110-170`; `apps/landing/scripts/build-legal.ts:17-24`
  reads every superseded version from `legal/archive/`.
- `launch-legal` (`.github/workflows/pr-quick.yml:365-382`, PRs to `main`): `launchBlanks`
  (`packages/legal/src/launch.ts:7,16-23`) lists every `«FILL` line of `legal/terms.md` and
  `legal/privacy.md` for a stable version ≥ 1.0.0; `legal/archive/` is not scanned.
- Status: a record at 1.0 against a material 1.1 head is `stale`; `pendingTermsVersions` returns
  `[1.1]`; a fresh install records the head (`packages/legal/src/status.ts:126-160`).
  The sheet lists those `changes` under "The terms have changed"
  (`apps/extension/src/components/LegalAcceptanceSheet.vue:42-43,89-92,110`).
- Landing: `versionList` prints `entry.effective ?? "not yet effective"`
  (`apps/landing/scripts/legal-pages.ts:131-139`); a page with `«FILL` gets the draft banner "…is
  not yet in effect" (`:124-127,155-161`).
- e2e S7 seeds an acceptance at `0.9` (`apps/extension/tests/e2e/fixtures/legal.ts:9-21`) and reads
  every version's changes from the manifest; screenshots follow `shotSend`
  (`apps/extension/tests/e2e/fixtures/send-page.ts:222-248`, `NULO_E2E_SHOT_DIR`, both themes).
- `README.md:3-13` is the banner; no test or workflow reads it.
