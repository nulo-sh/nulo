# Phase 6 — Disclosure and docs

## Deviations from plan.md (each with the reason)

- **Terms § 7.5 is amended inside 1.0, not shipped as a 1.0.1 patch.** Terms 1.0 has no effective date: it is a draft behind the DRAFT banner (`BEFORE-LAUNCH.md` § 3). A patch would archive a never-effective 1.0 at a permanent `nulo.sh/terms/v1.0/` permalink and move the launch checklist onto 1.0.1. The owner signs the text off in the arc 2 PR either way; the patch route stays open if the owner prefers it.
- **Privacy 1.2 is effective 13 October 2026, the drafting day.** A `«FILL»` would bring back the DRAFT banner on `/privacy`, which the stores read. The owner moves the date to the day the landing publishes it, if later, in the same PR.
- **The `Origin` is disclosed as possible.** P5 measured none on loopback for both browsers, which does not cover the HTTPS host, so § 5.11 says a browser may add one and that Firefox's names the installation (A4).
- **Stale citations repaired on the way.** `store/listing.md`'s `alarms` paragraph and `store/remote-code.md`'s two `legal/privacy.md` lines already pointed at the wrong lines on the base; they now name the live ones.
- **AMO's 3,000-character cap.** The reviewer notes were at 2,981; the token-list sentence fits by dropping the CSP string the notes repeated from the manifest (it stays in `remote-code.md`).

## Gate (2026-10-13)

- `bun run --cwd packages/legal test`: 59 passed. `bun run --cwd apps/extension test -- store-listing`: 8 passed. `apps/landing` tests: 60 passed.
- `bun run test:all`: every workspace exits 0 but `@nulo/token-list-host`, whose one red test is `tree.test.ts > has no finding`, listing only the two placeholder keys (red by design until the key ceremony). Re-run after the keys land.
- The Chrome legal smoke specs (`legal-acceptance`, `settings-routes`, 19 tests) and the full Firefox smoke ran on a build carrying privacy 1.2: green.
- `bun run lint`, `bun run typecheck:all`, `bun run check:plans`: exit 0.
- After the key ceremony and the rebase onto `dev` `1823144f`: `bun run test:all` exits 0 (extension 11,750 passed; the tree test passes on the real keys), `test:ci-gating` 544 pass, `lint`, `lint:actions`, `typecheck:all` and `check:plans` exit 0; smoke `token-list`, `rows`, `send-keyboard` and `own-window` pass on both browsers (15 tests each).

## Arc 2 implementation review (Codex `gpt-6.1-sol`, high)

Round 1: **reject**, one blocking finding. All seven accepted and fixed; each fix has a test that goes red when the fix is reverted.

1. Blocking: a list change during the commit's marker read still let `persist()` start with the old pins. The epoch check now follows that read (and `updateMarker`'s), the last await before `persist()`. Test: a re-pin while the commit reads its marker.
2. A cold alarm wake could fetch twice: boot's refresh finished, then the shim's tick fetched again, advancing failures by two. `onAlarmTick` now honours the stored deadline, as boot does. Test: a tick after boot's refresh. The e2e's `requestListRefresh` now moves the stored deadline before it fires the alarm.
3. `verifiedSeeds` could return the old pins when a re-pin landed during its marker read. It now returns nothing if the epoch moved. Test: a re-pin while the connect window reads the marker.
4. Composition gaps: an alarm tick and a `refresh()` before acceptance, acceptance alone triggering the fetch, a stalled download abandoned at 10 s, a same-key stored list whose payload was swapped, and the kept envelope unchanged after refusals.
5. The store description's "No Nulo server" contradicted § 5.11: now "No account, no telemetry." An owner copy decision, listed for sign-off in the PR.
6. Two `remote-code.md` citations to `dapp-interaction/service.ts` were stale: repointed.
7. Comments: `SUSPECT`'s comment named only verifying lists, the cap comments said "extension version", and one type comment narrated its type.

Round 2 (resumed): **approve**, "No new material findings. Confidence: high." It confirmed that an early alarm re-arms, a due or absent deadline refreshes, a discarded envelope refetches, and that `updateMarker`'s moved check keeps the purge guarantee.

## Final cross-arc review (fresh Codex session, `gpt-6.1-sol`, high)

Round 1: **conditional approve**, no blocking finding. All four accepted and fixed:

1. Priced smoke specs took the held list's first priced entry but seeded only a `usd-coin` quote, so a list without USDC broke them. A priced spec now quotes its own token's price id (`seedUsdQuoteAndReload(page, scope.token.priceId)`).
2. Smoke required the list to price a token, hold two tokens and list a Testnet entry, none of which the format requires, so a valid publish could red a PR or a release. A source run now holds a fixed two-token list (`E2E_LIST_TOKENS`); specs that price nothing name fixture tokens; the five priced tests skip through `skipUnlessListPrices` when the held list prices nothing (checked by unpricing the fixture: 5 skipped, 6 passed); the live leg accepts zero Testnet entries.
3. `infra/token-list/FORMAT.md` said the listed name is checked against the chain; only class, symbol and decimals are. Fixed on arc 1.
4. Two comments that restated their identifiers: removed (one on each arc).

Round 2 (resumed): **conditional approve**, two residual findings, both fixed:

1. `skipUnlessListPrices` would also skip in a source run, so an unpriced fixture could pass the suite without its priced assertions. A source run now throws instead (checked: unpricing the fixture fails the five priced tests with "E2E_LIST_TOKENS must price a Testnet token").
2. Nit: the History sideways test priced its row from the held list though it asserts no fiat. It now takes fixture metadata (`openHomeWithRow(ctx, { priced: false })`). The other non-pricing rows tests keep the shared listed launch: a release build seeded its defaults in that launch before this change too, and a second file-scope launch costs more than it proves.

Round 3 (resumed): **approve**, "No new material findings. Confidence: high."

## The rebase onto dev

Seven `dev` commits landed during review. Conflicts: the index line, the nightly advisory set (now the union with `network-e2e-canary-wasm`), the `WORKFLOWS.md` rows, `CLAUDE.md` § In CI (dev's slimmer text kept) and the `rows` e2e error-array assertions, moved onto the listed fixtures. Dev's new moved-quote notice test read the removed seed list; it now prices from the list fixture. The cross-arc session, resumed on the range-diff, read #379 and #347 against the seeder and the first fetch: **approve**, "No new material findings. Confidence: high."

## Owner change after delivery: a held token gets the check (2026-10-14)

The owner asked whether the connect window needs wording for a listed token the wallet held before the list named it, and chose the code fix instead ("Yes, make the change to #389"). A "you added this" label was rejected: its name would come from the token store, which dApps write through `registerToken`.

- The seeder's already-present branch, and any seeded default whose current pins were never checked, now run the same pin and metadata preview and persist nothing. A pass writes `verifiedPins`; a refusal holds until the version changes; an error retries on the next pass. Status stays `seeded`, so no screen changes but the name. D12 is amended.
- Gate: token service tests 164 passed; `lint` and `typecheck:all` exit 0. Disabling the recheck reds three tests; removing both the guard and the epoch fence reds the list-change test (either alone suffices for its timing).
- Codex (arc 2 session, resumed): **approve**, "No new material findings. Confidence: high." One comment nit (three comments still described the seed-only path), fixed.

## The second rebase onto dev (2026-10-14)

Twelve `dev` commits landed during review, among them the send queue (#402), fees and sponsors (#409) and the type-roles series. The conflicts were all textual: the index lines, `privileged()` (dev's new `contents: write` rule kept beside `readsCustomSecret`), the `release-integrity` job lists, the nightly rows in `CI.md` and `WORKFLOWS.md`, and the imports in `TokenCard.test.ts` and `send-keyboard.test.ts`. Two dev tests broke on the list-era price API without conflicting:

- `RecentActivityView.test.ts` mocked the price client without `getQuotes` and with bare quotes from `refreshIfStale`, so all 63 of its tests threw at mount. The mock now returns `{ quotes, pricedTokens }`.
- The type-roles sweep's seeded Home priced a token no list names, so its balance drew `$0.00` and the hero never fit. It now holds the e2e list, quotes the token that list prices, and scales the balance by the token's decimals. The unfixed copy times out on the same build.

Smoke runs against `dist/<browser>`, which nothing rebuilds: after a rebase, rebuild the armed build first. A stale build gave seven unrelated type-role failures, and a repro on it would have proved nothing.

Gates: `test:all` exits 0 (extension 12,118 passed); full smoke passes on Chrome (53 files, 229 tests) and Firefox (55 files, 228 tests). The cross-arc session, resumed on the range-diff: round 5, **reject**, on the type-roles hero; round 6, after both fixes, **approve**, "No new material findings. Confidence: high."

