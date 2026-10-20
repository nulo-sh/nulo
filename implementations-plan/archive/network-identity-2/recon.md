# network-identity-2: recon

Read at `ad4de50d8` (origin/dev). One read-only explorer (sonnet) plus the planner's own reads. `S/` = `apps/extension/src/wallet/services`.

## The two fetches

| Fetch | Where | Init today | Context |
|---|---|---|---|
| Token list, `https://tokens.nulo.sh/v1/list.json` | `S/token-list/service.ts:207-224` (`download()`) | `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `redirect: "error"`, `cache: "no-cache"`, `signal` | background (`wallet/runtime.ts:538`, built from `wallet/index.ts:80`); default `fetchFn` calls the global `fetch` at call time (`:107`) |
| Prices, CoinGecko `simple/price` | `S/price/service.ts:373` (`doRefresh`) | `{ signal, headers }` only: the default cache mode, the default credentials mode (`same-origin`), the default referrer policy | background (`wallet/runtime.ts:531`); default `fetchFn` at `:139` |

- "Unchanged" is a sequence comparison on a verified `ok` body (`S/token-list/service.ts:201-204`). A non-`ok` status (a raw 304 included) is `http-status`, a failed attempt with backoff, logged at `debug` (`:27-29`, `:218`).
- Neither host is in `host_permissions` (`apps/extension/manifest/manifest.config.ts:24`); the list host answers `Access-Control-Allow-Origin: *` (`infra/token-list/public/_headers:2`). Firefox counts the content script's `*://*/*` match as all-sites access (`apps/extension/tests/e2e/FIREFOX.md:38`).
- Live response headers, read 2026-10-20: the list host sends `cache-control: public, max-age=300`, a content `etag` and no `last-modified` (`cf-cache-status: HIT`); CoinGecko `simple/price` sends `cache-control: max-age=30, public, must-revalidate, s-maxage=60`, a weak `etag` and no `last-modified`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| A fetch seam that takes the full `RequestInit` | `FetchLike` (`S/token-list/service.ts:48`, exported, `(url, init: RequestInit)`); price has its own narrow local `FetchLike` (`S/price/service.ts:44`, `{ signal?, headers? }`), which refuses `cache`, `credentials` and `referrerPolicy` as excess properties | adapt: widen the price type to `RequestInit` (D2) |
| A test that pins the list fetch's init | `S/token-list/service.composition.test.ts:117-123` (`objectContaining({ …, cache: "no-cache" })`, plus no headers) | adapt: pin `no-store` |
| A test seam for the price fetch | `S/price/service.test.ts:79-85` (`vi.fn(async (url) => …)`, ignores `init`) | reuse: assert with `toHaveBeenCalledWith` on the `vi.fn` |
| A browser-level check of what a list request carries | the smoke e2e `tests/e2e/token-list.test.ts:94-140` and its loopback host `tests/e2e/fixtures/token-list.ts:102-121`, which mirrors `_headers` (`Cache-Control: public, max-age=300`), records `cookie`, `referer`, `origin` per request, and serves three envelopes in one scenario; `rows.test.ts:1114` is its other caller | adapt: the host sends a content `ETag`, as the production host does, and records `if-none-match` (D3) |
| A browser-level check of the price fetch | none: the e2e egress guard refuses `api.coingecko.com` (`tests/e2e/README.md:92`), and specs that intercept it (`fixtures/fee-quote.ts:23`) answer above the wire | none; the unit pin is the layer |

## Docs that describe these requests

- `ARCHITECTURE.md:99` (token list): "The request carries no credentials, referrer or holdings."
- `ARCHITECTURE.md:100` (price feed): "One batched keyless request for the full id table". Nothing on credentials or referrer.
- `legal/privacy.md:281-286` (§ 5.11) and `:127-140` (§ 5.2): legal copy, the owner's (OA-2).
- `SECURITY.md`, `CI.md`, the package READMEs and the skills: no line on these fetches' cache, credentials or referrer.

## Out of scope, checked

- `packages/aztec-runtime/src/utils/fetch.ts:51`: the node JSON-RPC client sends POSTs, which the HTTP cache does not reuse for a later request.
- `apps/extension/src/shims/bb-fetch-code.ts:19` and `packages/extension-messaging/src/core/sender-auth.ts:58`: extension-local assets.
- `S/price/real-data.test.ts`: calls the global `fetch` directly, `describe.skipIf(!process.env.COINGECKO_REAL_TESTS)`; it never goes through `PriceService`.
- Closed known limits: none for the token list's or the price feed's requests.
