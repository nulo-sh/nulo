# @nulo/rpc-proxy

The `nulo-rpc-proxy` Cloudflare Worker: a reverse proxy at `rpc.nulo.sh` (Alpha Mainnet) and `testnet.rpc.nulo.sh` (Testnet) in front of Nulo's paid dRPC Aztec endpoints, so the provider key, which dRPC puts in the URL path, lives only in this Worker's secrets. The wallet lists it as Nulo's relay, the second default endpoint of Alpha and Testnet after dRPC's keyless one (`apps/extension/src/wallet/services/network/seeds.ts`), so it is asked only while that endpoint fails and until it wins the role back, and for the receipts of a transaction sent through it, unless a person moves it first (`ARCHITECTURE.md` § 15).

## Threat model

- **What it holds.** Two paid provider URLs, one per network, each carrying its key. Anyone who reads one can spend that key's quota from anywhere, until the key is rotated.
- **Who attacks.** Anyone on the internet, a web page running in a visitor's browser, another extension. Their gain is the keys' quota, or the proxy as a way to reach some other host.
- **The secret never leaves the Worker** except as the destination of one `fetch` per request. Nothing is logged (no `console.*`, Workers Logs off), no response echoes it, and a redirect is refused rather than followed (its `Location` could quote the secret path, and its target is unvetted).
- **The caller never chooses the upstream.** Each hostname is bound to one secret; any other host or any path but `/` is a 404, and no header, query or body field is read for routing.
- **A web page cannot drive its visitors' browsers at it.** A page's `text/plain` POST reaches a server without a preflight, so CORS alone would not stop it: the Worker refuses, server-side, any `Origin` but a Chrome or Firefox extension's. A caller with no `Origin` is served, since a script could forge one anyway; the per-IP limit and each key's daily cap hold it.
- **Only node calls pass.** Every entry must name a method of the Aztec node API (`aztec_` and a name of `AztecNodeApiSchema`), so the keys cannot reach the provider's other chains or the node's admin namespace through this Worker.
- **No dependency in the bundle**: `test/deploy.test.ts` fails when the bundle holds anything but `src/`, so no package can read the secrets. `@aztec-labs/stdlib` is a dev dependency of the allowlist's drift test only.
- **Privacy.** Outbound headers are built fresh: `content-type` alone. No cookie, `Origin`, user agent, `CF-Connecting-IP` or `X-Forwarded-For` of the caller reaches the provider, which sees a Cloudflare address instead of the caller's (step 6 below checks what actually arrives). Cloudflare and the owner's account see the caller's IP in transit; Workers Logs stay off.

## Handler contract

In order; nothing reaches the provider before the forward. Every local refusal answers `{"jsonrpc":"2.0","id":null,"error":{"code":<n>,"message":"<short fixed text>"}}` with `content-type: application/json`, so the node client reads a 4xx as final and does not retry it.

| Step | Condition | Answer |
|---|---|---|
| Host | `rpc.nulo.sh` → secret `DRPC_MAINNET_URL`, `testnet.rpc.nulo.sh` → secret `DRPC_TESTNET_URL`; any other host, or a path other than `/` | 404, no CORS headers |
| Origin | absent, `chrome-extension://` + 32 letters `a`-`p`, or `moz-extension://` + a lowercase UUID: allowed, and echoed in `Access-Control-Allow-Origin` with `Vary: Origin` on every later answer, refusals included; anything else (`null`, a web page, a malformed id) | 403, no CORS headers |
| Kill switch | var `PROXY_OFF` is `"1"` | 503; nothing read, counted or called |
| Preflight | `OPTIONS` | 204, `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 7200`; not counted |
| Method | not `POST` | 405, `Allow: POST` |
| Client | no `CF-Connecting-IP` | 400 |
| Rate limit | over 100 requests per 10 s for this IPv4 address, or this IPv6 address's /64, the block one host is usually given (`IP_LIMITER`, counted per Cloudflare location and approximately) | 429 |
| Body | more than 1,049,600 bytes (1 MiB + 1 KiB), counted while streaming; `Content-Length` is never trusted | 413 |
| Body | not UTF-8 JSON | 400, code -32700 |
| Calls | not one call object or an array of 1 to 100 call objects, each with a string `method` | 400, code -32600 |
| Calls | a `method` outside the node API; one such entry refuses the whole body | 400, code -32601 |
| Secret | the host's secret unset, or not an `https:` URL | 503 |
| Forward | one `POST` of the bytes read, with only `content-type: application/json`, `redirect: "manual"`; no retry and no timeout of its own | a thrown fetch or a 3xx: 502 |
| Answer | the provider's status and body, streamed through | its `content-type` and `x-aztec-*` headers (named in `Access-Control-Expose-Headers`, which a browser needs to show them to the client's version check); nothing else of the provider's |

Every answer also carries `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin` (checked only on no-cors requests, so the extensions' CORS reads pass), and the shared `Permissions-Policy`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options` and `X-Frame-Options` that `scripts/ci-cd/edge-headers.test.ts` holds every public surface to. An unexpected error answers 503, unlogged. The kill switch and an unset secret answer 503, which the client retries on its own schedule: neither reaches the provider, so a retry costs a Worker request and nothing more.

The 1 MiB + 1 KiB cap: the client sends a batch while its entries' summed length stays under 1 MiB, and every wallet call is ASCII (hex fields and numbers), so its largest body is 1,048,676 bytes, the array's brackets and commas included.

## Owner checklist (Cloudflare and dRPC dashboards)

Nothing here needs a token in the repository or CI, and the Worker deploys from `main` only. Steps 1, 2 and 5 were done on 2026-11-05 through the Cloudflare API, under a temporary token the owner created for the day and deleted after it.

1. **Workers Builds**, Worker `nulo-rpc-proxy`: repository `nulo-sh/nulo`, root directory `infra/rpc-proxy`, production branch `main`, build watch paths `infra/rpc-proxy/**`, build variable `BUN_VERSION=1.4.2`, no build command, deploy command `bun run deploy`, **non-production branch builds off**. Its build token, `nulo builds`, is the one every Nulo Worker (`nulo-landing`, `nulo-tokens`, `nulo-subscribe`, `nulo-rpc-proxy`) builds with: a user token holding `Workers Scripts Write` and `Account Settings Read` only. A token confined to one Worker is not possible today, since the API refuses a user token with a per-Worker role and Workers Builds accepts user tokens only (#1235 records the reopening condition); any build under that token can redeploy this Worker, and a redeploy can read its secrets; `nulo-tokens`, `nulo-subscribe` and `nulo-rpc-proxy` build from their production branch only; `nulo-landing` also builds non-production branches for PR previews (a version upload per push, no deployment), the owner's choice (#1235). The connection was created through the Builds API, which refuses a body without `previews_base_config`, even with previews off.
2. **Custom domains** `rpc.nulo.sh` and `testnet.rpc.nulo.sh` on the Worker. Universal SSL covers one level below `nulo.sh` only; attaching the hosts made Cloudflare order two Advanced Certificate packs (`rpc.nulo.sh, *.rpc.nulo.sh` and `testnet.rpc.nulo.sh, *.testnet.rpc.nulo.sh`; the zone has ACM), which validated within five minutes, during which `testnet.rpc.nulo.sh` answered a TLS handshake failure and `rpc.nulo.sh` already served under the universal certificate.
3. **Secrets**, after step 4's caps, on `nulo-rpc-proxy` (Settings → Variables and Secrets, type Secret): `DRPC_MAINNET_URL` and `DRPC_TESTNET_URL`, each the paid dRPC endpoint for its network with the key in the path, from **new keys, one per network**, never a key a wallet build ever shipped (a dRPC key may serve every network it offers). They live only there.
4. **dRPC caps**: a daily compute-unit cap and a usage alert on each key, before step 3. Confirm the cap stops traffic rather than only alerting: it is the proxy's only spend ceiling, and a scripted caller can spend up to it. If it only alerts, leave the hosts detached and say so; a global limiter would be a design change.
5. **No challenge** in front of either host: keep Bot Fight Mode, WAF and challenge rules off them, since a challenge page replaces the JSON the client reads (as for `tokens.nulo.sh`). Done as a configuration rule on the two hosts with the parameters of the passkey and token hosts' rule: security level essentially off, Browser Integrity Check off, no HTTPS or email rewriting, no Rocket Loader, Mirage, Polish, RUM or Zaraz. Bot Fight Mode was already off.
6. **Acceptance.** First, before the real secrets, set `DRPC_TESTNET_URL` to a header echo, `https://httpbin.org/anything`, and post one call:

   ```sh
   curl -s https://testnet.rpc.nulo.sh/ -H 'content-type: application/json' \
     -H "origin: chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
     -d '[{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo","params":[]}]'
   ```

   In the echo, no header may carry your IP (`CF-Connecting-IP`, `CF-Connecting-IPv6`, `X-Real-IP`, `X-Forwarded-For`), curl's user agent or the `Origin`, and its `origin` field must be a Cloudflare address, not yours. (Seen on 2026-11-05: `Accept-Encoding`, `Cdn-Loop`, `Cf-Ew-Via`, `Cf-Ray`, `Cf-Visitor`, `Cf-Worker: nulo.sh`, `Content-Length`, `Content-Type` and `Host` only, and two Cloudflare addresses; `Cf-Worker` names the zone, which Cloudflare adds to every Worker fetch.) Then set the real secrets and check:
   - the same `aztec_getNodeInfo` through each host answers the `l1ChainId` and `rollupVersion` that `https://aztec-mainnet.drpc.org` and `https://aztec-testnet.drpc.org` answer for their networks;
   - a call the node refuses, `[{"jsonrpc":"2.0","id":1,"method":"aztec_getBlock","params":["not-a-block"]}]`, answers an error body holding no part of either key;
   - dRPC's own refusals hold no key either: with `DRPC_TESTNET_URL` set for a minute to the paid endpoint with its key altered by one character, one call's error body holds no part of that path; if dRPC allows a throwaway key with a tiny cap, exhaust it the same way and read its over-cap body;
   - `curl -si -X OPTIONS https://rpc.nulo.sh/ -H "origin: chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -H 'access-control-request-method: POST' -H 'access-control-request-headers: content-type'` answers 204 with `access-control-allow-origin` echoing that origin;
   - the same POST with `-H 'origin: https://example.com'` answers 403; `curl -si https://rpc.nulo.sh/` (a GET) answers 405; a body naming `node_getNodeInfo` answers 400.
7. **Rotate the Testnet key the wallet once shipped**, no earlier than 14 days after the release that stopped shipping it is live in both stores: the stores' auto-updates reach almost every active install within days, the first unlock on that build after a background start moves a stored endpoint off the old URL, and a pending send pinned to it expires within a day. Delete that key at dRPC. An install still on an older build loses its default Testnet node until it updates (Testnet only). So does an updated one whose endpoint was not moved: its network already held the keyless URL on another endpoint, a network reset was in flight, or the move failed and the background has not restarted since; picking another endpoint in Settings → Networks restores it. Every later rotation of this Worker's keys needs no release (Operations below).
8. **Ask dRPC** whether they offer a provider-managed endpoint with its own quota cap and per-IP limits that a client can call without a secret. If they do, it would replace this whole Worker (its secrets and its rate limit): the wallet would call that endpoint directly, its key public but capped.
9. **Workers plan**: confirm the account is on Workers Paid before any wallet build references the proxy. The Free plan's 10 ms of CPU per request (a full 1 MiB batch's `JSON.parse` may not fit) and 100,000 requests a day would cap it.
10. **Narrow the shipped key meanwhile**, if dRPC lets a key be limited to one network: limit the Testnet key the wallet once shipped to `aztec-testnet` until step 7 retires it, so a copy of it cannot spend on Mainnet or another chain.

## Operations

- **Kill switch.** Set `PROXY_OFF` to `1` on `nulo-rpc-proxy` (Settings → Variables and Secrets) and deploy: every request answers 503 and nothing reaches the provider. A deploy from `main` resets vars to `wrangler.jsonc`, so a lasting shutdown also lands `"PROXY_OFF": "1"` there.
- **Key rotation**, per network, no release needed: create a new key at dRPC (its cap and alert first), paste the endpoint URL into the network's secret, run step 6's `aztec_getNodeInfo` through that host, then delete the old key. If a key is ever exposed, delete it first: the host answers the provider's refusal until the new one is set.
- **An Aztec bump** moves this workspace's `@aztec-labs/stdlib` pin with the extension's (`test/methods.test.ts` fails until they match), and the same test fails when the node API gains a method `src/methods.ts` does not list.

## Known limits

- **Shared quota** (#1632). A script with no `Origin`, or a forged extension `Origin`, from many addresses can spend each key up to its daily cap and then deny the proxy to everyone until the next day. Each admitted request carries up to 100 calls, the limiter counts requests per Cloudflare location and approximately, and every request, refused or not, is a billed Worker invocation with no ceiling of its own. A wallet asks the proxy only while the endpoint before it fails, so a spent key costs most people their fallback; someone who moved the relay first loses their first endpoint.
- **Provider bodies pass through unread.** An error body from the provider that quoted the request URL would carry the key to the caller; step 6 checks the node's and dRPC's refusals before the hosts go live.
- **Duplicate keys** (#1633). The allowlist reads an entry's `method` through `JSON.parse`, which keeps a repeated key's last value, while the bytes go on unchanged; a provider parser that kept the first would run the other name, on the same chain's endpoint. The bytes forwarded stay the bytes checked, so re-serialising is no fix; it matters only if dRPC's parser keeps the first value.
- **The rate limit is a starting value**, to be tuned against measured traffic once a release sends the wallet's fallback through it.

## Tests

`bun run test` (`bun test`): `test/worker.test.ts` drives the handler against a fake provider and pins every row above (each host to its secret, the 404s, the exact bytes and the one header forwarded, one call on a provider 500 and on `aztec_sendTx`, the body cap at its boundary and against a lying `Content-Length`, each refused body shape, the preflight, Chrome and Firefox origins echoed on successes and refusals, refused origins without CORS headers, the kill switch counting nothing, an IPv6 client counted by its /64, the 502s and 503s, the headers kept and dropped), with a console spy that requires no log line at all and a check that no answer carries a secret. `test/methods.test.ts` runs a real `createAztecNodeClient` through the handler: its prefix joined to every `AztecNodeApiSchema` name is in the allowlist, it reads a result, and it gives up after one request on a local 4xx. `test/deploy.test.ts` pins `wrangler.jsonc` and builds a `wrangler deploy --dry-run` bundle whose only inputs are `src/`. `bun run deploy:dry` bundles without credentials.
