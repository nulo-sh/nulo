# privacy-cache-line-1: recon

Base: `origin/dev` at `f55b7b4e6` (PR #969 merged). One Sonnet explorer (fetch call sites, test pins, version mirrors); the planner read `legal/`, `packages/legal` and the About row. `S/` = `apps/extension/src/wallet/services`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Ship a privacy patch version | `packages/legal/README.md` § Shipping a new version; `legal/archive/README.md` (copy before editing); precedent #496 (1.2.1) | reuse-as-is |
| Prove document and manifest agree | `packages/legal/src/manifest.test.ts` (head = version line, placeholder included; history = manifest; every superseded version archived with a matching header) | reuse-as-is |
| A date that cannot be read out of the repo | `«FILL: effective date»` (`legal/README.md` § Placeholders: "A patch of either document: the day it is published"); `launchBlanks` refuses a blank at a stable release from 1.0.0 (`packages/legal/src/launch.ts`) | reuse-as-is (D2) |
| Tell a user the policy moved | `apps/extension/src/utils/legal-about.ts:13-29` (`isOlder` is exact, patch included); `about.vue:127` shows "Privacy Policy updated" | reuse-as-is, no change |
| Prove the About row follows the manifest | `apps/extension/tests/e2e/legal-acceptance.test.ts:332` (S9 reads `Privacy Policy v${CURRENT_PRIVACY}` from the manifest) | reuse-as-is |
| Pin the request properties the sentences name | the three tests below | reuse-as-is; no new test (D4) |

## The properties and their pins

- List: `download()` is the only list fetch (`S/token-list/service.ts:209-218`): `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `redirect: "error"`, `cache: "no-store"`, no headers. Pinned by `S/token-list/service.composition.test.ts:120` (title at `:106`), and in a real browser by `apps/extension/tests/e2e/token-list.test.ts:134-137` (no `cookie`, `referer` or `if-none-match` on any list request, after the host set a cookie at `:102`; fields read in `tests/e2e/fixtures/token-list.ts:90,124`).
- Price: `PriceService.doRefresh()` is the only CoinGecko fetch (`S/price/service.ts:373-380`): `cache: "no-store"`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, and an optional API-key header, no validator or cookie header. Pinned by `S/price/service.test.ts:123-131` (RequestInit only; no e2e reaches the price host, whose egress the e2e guard refuses).
- No other price or list request exists: searched `fetch(`, `new Request`, `XMLHttpRequest`, `sendBeacon` over `apps/extension/src` and `packages/*/src`; the other `fetch(` hits are a local wasm asset, the Aztec node and the extension's own manifest. `apps/landing` names neither host.
- The ids priced are `Object.keys(PRICE_IDS)` (`S/price/price-map.ts:71-73`), bundled: § 5.2's "the token-ID list bundled with that extension version" still holds.
- `ARCHITECTURE.md:99-100` already names both requests' properties.

## Version mirrors

- To change: `legal/privacy.md:3` (version line), `:449` (history row), `packages/legal/src/manifest.ts` (privacy list), a new `legal/archive/privacy-1.2.1.md`.
- Not to change: `privacyVersionShown: "1.2.1"` in `apps/extension/src/wallet/storage/stored-shapes/{snapshot,goldens}.json` and `tests/e2e/fixtures/update/v0.31.0.storage.json` are stored records (what a 0.31.0 user was shown), read by no assertion about the current version. `BEFORE-LAUNCH.md:125-134` is a dated, ticked record of 1.2.1. `apps/landing/scripts/legal-pages.test.ts` uses synthetic manifests. `apps/extension/scripts/store-listing.test.ts:47-48` reads privacy § 6 only.
- `apps/extension/store/remote-code.md:110` cites `legal/privacy.md:391-392` (§ 13, "loads no remote code"); both insertions sit above it, so the range moves. `apps/extension/scripts/store-listing.test.ts:137-145` checks only that a cited range exists (found by the Opus audit).
- `apps/extension/store/listing.md:55-56` paraphrases §§ 5.2 and 5.11 without a version; it stays true (it says less).

## Collisions

- PR #893 (launch-prep-1 A2, draft) adds Terms 1.1 to the same `LEGAL_MANIFEST` (`terms:` key, lines 16-24) with `effective: null`. This arc appends to the `privacy:` list (after line 45): separate hunks.
- No open issue covers this work (`gh issue list --state all --search "privacy policy cache"`, `"no-store price referrer"`: none). Closed known limits searched with `privacy`: none on this surface. #78 (§ 5.10, `blocked:external`) is another section.
