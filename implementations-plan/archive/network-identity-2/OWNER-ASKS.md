# network-identity-2: owner asks

Neither ask blocks arc 1, and neither changes a screen. Each ships its "what ships now" form. With the arc in place, the wallet's token-list and price requests bypass the browser's HTTP cache (`cache: "no-store"`), whatever the host's caching headers say. The wallet still keeps the verified list and the usable prices in its own storage, as today.

## OA-1: the token-list host's `Cache-Control`

- **Surface**: `infra/token-list/public/_headers` (`/*`, served by the `nulo-tokens` Worker), pinned by `infra/token-list/test/policy.ts:10`. The smoke e2e host mirrors the file.
- **What ships now**: `Cache-Control: public, max-age=300`, unchanged. The header still reaches wallets; their requests bypass the browser's HTTP cache, so it decides nothing there.
- **Options**:
  - A. Keep `public, max-age=300` (what ships now).
  - B. `Cache-Control: no-store`, with the policy test changed to match. Compliant caches, the browser of anyone who opens the URL included, must then not store the file. It does not erase a copy stored before, and it may change how Cloudflare's edge caches the file, which the live host serves from its cache today (`cf-cache-status: HIT`). The smoke e2e host mirrors the file, so under B its request loop would need its own cacheable `Cache-Control` to keep proving that no list request carries a validator.
- **Recommendation**: A. The host's `ETag` is a hash of the file, the same for every wallet, and B's cost at the edge is unmeasured.

## OA-2: a privacy-policy line

- **Surface**: `legal/privacy.md` § 5.11 (`tokens.nulo.sh`) and § 5.2 (price data). A change is a patch bump of the document and its `@nulo/legal` entry: it asks no one to accept again, and Settings → About shows its existing non-blocking update notice.
- **What ships now**: no change. Today's text stays true: § 5.11 says every wallet requests the same file with no cookies and no referrer; § 5.2 says CoinGecko receives ordinary request metadata.
- **Options**:
  - A. No change (what ships now).
  - B. § 5.11 adds: "The request bypasses the browser's HTTP cache, so it carries no cached copy's validator."
  - C. B, and § 5.2 adds: "The request carries no cookies and no referrer, and bypasses the browser's HTTP cache."
- **Recommendation**: C at the next privacy-policy revision, since each sentence names a property a test pins. Not worth a revision on its own.
