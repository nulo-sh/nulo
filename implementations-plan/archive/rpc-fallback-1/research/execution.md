<!-- Research subagent (Explore, sonnet) for the rpc-fallback-1 plan, at dev e5cffd82d plus origin/rpc-proxy-1-a1 (PR #1622). Persisted verbatim by the planner. -->

# Report: Execution, submission and pending-tx checks (lane rpc-fallback-1, base origin/dev)

All paths are relative to the worktree root. `apps/extension/src/wallet/services` is shortened to `S/`.

## 1. Module purpose

- **Pipeline.** The wallet builds, simulates, proves, sends and records. The proof runs in the offscreen PXE. The send runs in the service worker through a `node` object that `NetworkService` builds. A receipt poller and a "send check" then watch the tx on the endpoint recorded with it.
- **Failover.** None exists today. A grep for `failover|fail over|secondary endpoint|backup endpoint` over `apps/extension/src` and `packages` (ts/vue) hit only `packages/wallet-bridge/src/method-descriptors.test.ts`.
- **One-endpoint model.** A `Network` has `endpoints[]` and a `primaryEndpointId` (`S/network/spec.ts:117-124`, `findPrimaryEndpoint`). Everything dials the primary only.

## 2. Public surface (file:line)

**Coordinator** (`S/execution/execution-coordinator.ts`)
- `ProveAndSendContext` (:96-142) carries `node: AztecNode`, `pxe: IPXE`, `commitSubmitting` (:122) and `submittedEndpointUrl: string|undefined` (:124).
- `proveAndSend` (:335-379) runs this frozen sequence: `checkCancelled` → journal `proving` → prove → `assertAuthorization` → `toTx` → `commitSubmitting` → `checkCancelled` → `sendTxTask` → `recordTransaction` → journal `succeeded`.
- `sendTxTask` (:309-331) holds the only `node.sendTx` (:320). Immediately before it: `await this.legal.assertCurrent()` (:319) then `assertLive()` (:320). `S/legal/call-sites.test.ts:23-29` pins this.
- `sendTxTask` has no `AbortSignal` and no timeout of its own (grep `signal` in the file: no hits).
- `simulateTxTask` (:226) calls `pxe.simulateTx`. `proveTxTask` (:251) calls `pxe.proveTx`.
- `sendExpiryOf(tx)` (:382-389) records `{timestamp, nullifier}` from the tx. It returns undefined when the anchor is block 0.
- `resolveLiveHandles` (:158-171) re-reads `getNetwork`, then `getNode(network.chainId)` and `getPXE`. It serves estimate-reuse paths.

**Callers.** There are exactly four `proveAndSend` call sites:
- `S/execution/transfer-executor.ts:252` (`submittedEndpointUrl` at :266)
- `S/execution/dapp-send-executor.ts:890` (:902)
- `S/execution/dapp-send-executor.ts:1123` (:1135)
- `S/execution/dapp-send-executor.ts:1291` (:1302)

The activity record is written by `recordTransfer` (`transfer-executor.ts:459`) and `sentTxRecorder` (`dapp-send-executor.ts:749`). Both call `primaryEndpointUrl(network)` again, so each row's URL comes from that same `network` snapshot.

**NetworkService** (`S/network/service.ts`)
- `getNode(chainId)` (:965-980). Cache `this.nodes` is keyed by chainId only. It builds with `nodeFactory.createNode(primary.rpcUrl)` for the active profile's row.
- `getNodeForUrl(url)` (:1013-1019). Per-URL cache `transientNodes` (:230), retrying client. It never falls back to the active profile (doc :1000-1010).
- `getSingleAttemptNodeForUrl(url)` (:1027-1033). Per-URL `singleAttemptNodes` (:232), one non-retrying attempt, 60 s timeout, silent logger.
- `reportEndpointFailure(url)` (:1043-1048). The third reported failure evicts the cache entry; a success does not reset the count. Its only caller is `S/transaction/service.ts:598`.
- `updateEndpoint` (:855-872) evicts `transientNodes[oldUrl]` and `nodes[chainId]` if primary. `deleteEndpoint` (:880-896) refuses the last or the primary endpoint and evicts `transientNodes[removed.rpcUrl]`. `setPrimaryEndpoint` (:898-917) does `nodes.delete(chainId)` and emits `onPrimaryEndpointChanged`.
- Cache clears: :1154-1155, :1244-1245, :1258-1259.
- `singleAttemptNodes` is never evicted. A grep of the file finds it only at :232 and :1028-1031.

**Node factory**
- `packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:69-111` is the only `createAztecNodeClient` call site. `createNode(url, RetryOptions)` (:69), `createSingleAttemptNode` (:77), `probeChainId` (:85), `readPublicStorageOnce` (:97).
- Port: `packages/aztec-runtime/src/ports/node-factory-port.ts`. Test double: `apps/extension/src/core/testing/fake-node-factory.ts`.

**Journal** (`S/operation-journal/`)
- `failedFrom` (`service.ts:690-694`). A row failing from `submitting` copies `txHash`, `submittedEndpointUrl` and `expiry` into `failed`. The caller's values are discarded.
- `setSendCheck` (:442-461) is a compare-and-set under `transitionLock`.
- `isSendCheckable` (`spec.ts:317-320`) is `failed && from==="submitting" && txHash && error.kind !== "session_ended"`. `wasNeverSent` (:324-328) is the complement. `isSendCheckMove` is at :292.
- `JobProgress` (`packages/wallet-core/src/jobs/types.ts:95-117`). `submitting` carries `{txHash, submittedEndpointUrl, expiry}`. `failed` carries `from, txHash, submittedEndpointUrl, expiry, check, inclusion, checkSince`.
- `submittedEndpointUrl` is also in the zod schemas at `spec.ts:257` and `:265`, and in `transaction/spec.ts:176` and `:232`.

## 3. Which node object each step uses

| Step | Node used | Source |
|---|---|---|
| Build: `getNodeInfo`, `assertLiveChainIdentity`, fee reads, contract resolution | `networkService.getNode(network.chainId)`, the primary of the **active profile's** row cached by chainId | `tx-request-builder.ts:261` (`resolveBuildContext`), :420 (`buildNoFrom`) |
| `simulateTx` | The PXE in the offscreen document, not the SW `node` | `execution-coordinator.ts:238` |
| `proveTx` | Same PXE (`proveTxTask` :251). It runs `withPxeWrite("proveTx", network, (pxe, _node, runtime)=>…)`, which ignores the passed `_node` (`packages/aztec-runtime/src/pxe/service.ts:456`). | PXE side |
| `sendTx` | The `node` from `getNode(chainId)`, a retrying client | `execution-coordinator.ts:320`; the `node` is threaded from the build, e.g. `transfer-executor.ts:247`, `dapp-send-executor.ts:1123` |
| Recorded URL | `primaryEndpointUrl(network)`, where `network` came from `getNetwork(networkId)` at build time | the four `submittedEndpointUrl:` lines in section 2 |
| Pending receipt poll | `getNodeForUrl(tx.submittedEndpointUrl)`, retrying; falls back to `getNode(tx.chainId)` only when no URL is recorded | `S/transaction/service.ts:585-587` |
| Mined-row finality | `getSingleAttemptNodeForUrl(url)` | `transaction/service.ts:640` |
| Failed-send check | `getSingleAttemptNodeForUrl(url)` | `operation-journal/send-check.ts:353` |
| dApp `wait` | `waitForTx(node, …)` with the **build's** `node` (aztec.js poll) | `dapp-send-executor.ts:1043-1045`, `node` returned at :1146 |
| Auth-registry mutation txs | `getNodeForUrl(primaryEndpointUrl(network))` | `auth-registry/service.ts:194-201` |

**PXE node binding**
- `PXEProxy` curries the `NetworkInfo` into every call (`packages/aztec-runtime/src/pxe/proxy.ts:36-44`). `getPXE` is at `pxe/client.ts:359`.
- `NetworkInfo.rpcUrl` comes from `networkInfoFrom(network)`, the primary (`network/spec.ts:105-109`).
- The offscreen registry binds one runtime per (profileId, chainId) to a URL. `ChainRuntimeRegistry.ensure` (`chain-runtime.ts:369-385`) disposes and rebuilds the runtime if `existing.rpcUrl !== network.rpcUrl`. `peekMatching` (:349-355) is the read-lock probe for the same check.
- The PXE node is built with `nodeFactory.createNode(network.rpcUrl, retries)` (:181). `retries.retryWhile` only stops retries on teardown (`stopRetries`, :381-382, :397+).

**Can simulate/prove and send use different nodes? Yes, structurally.**
- The PXE dials whatever `rpcUrl` was captured in the `pxe` handle at build time (offscreen).
- The send dials the SW-side `NetworkService.nodes[chainId]` client captured at build time.
- Both are the primary at build time. `getNetwork` and `getNode` are separate awaits, not one atomic read.
- `built.network` and `built.node` stay frozen across a long prove (up to 30 min). If the primary changes mid-prove, the send still goes to the old node and records the old URL. That is self-consistent but stale.
- A later PXE call with a newer `NetworkInfo` would rebind the offscreen runtime to the new URL.

**Other readers of the primary** (relevant to a "current endpoint" design):
- `S/execution/view-executor.ts:164,220,236,282` and `helpers/get-view-simulation-deps.ts:36`.
- Estimate-reuse invalidates when the primary moves: `primaryEndpointMoved` in `estimate-reuse-shared.ts:97-100`, fed from `dapp-send-executor.ts:705-706` and `transfer-executor.ts:409`.
- Gas-balance reads: `readPublicStorageOnce` (`network/service.ts:984`). Chain tip: `readChainTip` (:1056). Probes: `probeNodeStatus` (:951).

## 4. Key invariants about endpoint, send and receipt

1. **One broadcast site.** `execution-coordinator.ts:320`, pinned by `legal/call-sites.test.ts:23-29`. No wrapper replays it: `sendTxTask` is invoked once per `proveAndSend`. A grep for `retry`/`replay` in `S/execution/*.ts` found none around sends.
2. **`submitting` is the precondition of the send.**
   - `commitSubmitting` (:366-370) must durably write `{txHash, submittedEndpointUrl, expiry}` before `sendTxTask`. A refused write sends nothing (`execution-coordinator.test.ts:238,264`).
   - So the endpoint is recorded before the send, from the executor's `network` snapshot, and never re-derived at poll time. See the comment at `transaction/service.ts:301-308`.
3. **Receipts stay on the submit endpoint.**
   - `updateTx` (`transaction/service.ts:585-587`) uses `getNodeForUrl(submittedEndpointUrl)`. This holds across profile switches and endpoint edits or deletes.
   - Pinned by `network/service.test.ts:401,441,461`. `:441` shows that it dials a URL matching no configured endpoint.
   - Privacy policy § 5.1 and Terms § 7.1 promise this behaviour.
4. **The send check is pinned the same way.** Row-scoped, one read in flight per row (`inFlight`, `send-check.ts:43,141`), one attempt per read (`nodeFor`, :350-355), and only inside a live fence of the row's own profile (:149).
5. **Backup rows are never dialed.**
   - `restore` refuses Pending rows and strips the finality marker (`transaction/service.ts:~750`; `arm` doc :168-174).
   - `ambiguous` rows are never armed (:175).
6. **"Maybe landed" is decided by journal stage, not by error text.**
   - Any throw after `commitSubmitting` marks the row `failed` from `submitting` with hash and URL. That covers a throw in `sendTxTask`, in `recordTransaction`, or in `markJournal(succeeded)`.
   - `isSendCheckable` therefore treats a timeout, a 5xx, a refusal and a post-send bookkeeping error alike.
   - The only "never sent" cases are `session_ended` (`assertLive` throws before the send) and a failure before `submitting`.
7. **Refusal vs maybe-landed** (`operation-journal/final-refusal.ts:9-16`).
   - `isFinalRefusal` is an exact-string match on `Invalid tx: <existing nullifier | invalid expiration timestamp>`.
   - `send-check.ts:366` sets `refusal=true` only for such rows. On a DROPPED receipt inside the 30 min window that gives `check:"refused"` (:234-240). Otherwise the row ends `unconfirmed` once 30 min pass (:231-232).
   - A DROPPED receipt alone never means "not sent" (plan, "Decision"). The reason is that a replica may not have seen the hash (`transaction/service.ts:39-51`).
   - Lesson: `implementations-plan/lessons.md:42` and `archive/failed-send-check/plan.md`, section "Node retries". A refusal arrives as a per-call error inside an HTTP 200, so the client never retries it. A POST retried after a lost answer can come back refused for a send the node took.

## 5. Timeouts, aborts and retry loops

| Where | Value | Cite |
|---|---|---|
| Per HTTP attempt (retrying client) | 60 s `AbortController`, covers the body read | `packages/aztec-runtime/src/utils/fetch.ts:19,40-75` |
| Retries | `makeBackoff([1,2,3])` gives 1 + 3 attempts, 1/2/3 s sleeps | `fetch.ts:132-157`; SDK `retry` in `apps/extension/node_modules/@aztec-labs/foundation/dest/retry/index.js` |
| What is not retried | 4xx and oversize bodies (`NoRetryError`, `fetch.ts:94-105`) | |
| What is retried | Timeouts, network errors, 5xx. JSON-RPC errors in a 200 are not retried (lesson). | |
| Worst case for `sendTx` on the retrying client | about 4×60 s + 6 s = 246 s before it throws. The reaper's `submitting` grace is 5 min (`reaper.ts:82`), so the margin is thin. | derived |
| `retryWhile` | Only `chain-runtime.ts:381-382` passes one (PXE teardown). The NetworkService clients use the default (always retry). | |
| Single-attempt client | One shot, `DEFAULT_REQUEST_TIMEOUT_MS`=60 s | `network/service.ts:1030` |
| Identity probe | `IDENTITY_PROBE_MS`=5 s, one attempt | `network/spec.ts:~130` |
| Popup `executeTransfer` | Transport deadline 60 min | `S/execution/client.ts:12,29` |
| Other offscreen RPCs | Default 90 s | `packages/extension-messaging/src/offscreen/client.ts:22` |
| `pxe.proveTx` | 30 min | `packages/aztec-runtime/src/pxe/client.ts:74,141` |
| Reaper | Periodic alarm every 1 min (`REAP_PERIOD_MINUTES`, `reaper.ts:56`). Boot sweep unconditional. Grace: queued 10 min, pending 2, simulating 10, proving 35, submitting 5. | `reaper.ts:73-83,143-160` |
| Send sequencer | `SUBMITTED_HOLD_MS`=10 min, `MAX_WAIT_MS`=60 min, poll 500 ms | `send-sequencer.ts:23-28` |
| `TransactionService.waitForTx` | 120 s default, polls in-memory `pending` every 100 ms | `transaction/service.ts:353,383` |
| Pending-poll loop | `runWorker` sleeps 1000 ms per iteration | `transaction/service.ts:~462-480` |
| Dropped debounce | `DROPPED_GRACE_MS`=60 s, `DROPPED_CONFIRMATIONS`=3, resurrection window 30 min, recheck 15 s | `transaction/service.ts:54-63` |
| Finality read | 60 s | `transaction/inclusion.ts:13` |
| SendCheck | 5 s tick; fast window 2 min; then 15 s; window 30 min | `send-check.ts:20-22,409` |
| dApp wait interval | Clamped by `WAIT_INTERVAL_BOUNDS_S` | `dapp-send-executor.ts:1428-1435` |

**Pain points in the poll loop.**
- `runWorker` awaits `Promise.allSettled` over every due pending tx, then sleeps 1 s. The poll uses the retrying client (4 attempts). A hung endpoint can therefore stall the whole loop, and so other txs' polls, for up to about 4 min.
- `reportEndpointFailure` is the only per-endpoint health signal. It is counted only on a failed receipt poll, never reset by success, and it merely evicts a cached client object (it is not a health state).

## 6. Pending-tx lifecycle

- **Added.** `addTransaction` (`transaction/service.ts:263-340`) writes a `Pending` row with `submittedEndpointUrl` (:327) and puts it in the in-memory `pending` map (:337).
- **Polled.** `updateTx` (:579-635) → `getTxReceipt`.
  - On a throw it calls `reportEndpointFailure` and rethrows. `allSettled` swallows it, the row stays Pending, and it is retried next tick.
  - Dropped is debounced by `trackDroppedStreak` (:520-540).
  - The write re-checks object identity under the tx lock (:613-621).
- **Finality.**
  - A mined row below Finalized with a URL and block is marked `awaitingFinality` (`awaitsFinality`, :767-769) and watched through `checkFinality` (:642-662).
  - Final → `Finalized`. Block pruned → `clearInclusion` back to Pending.
  - If `submittedEndpointUrl` is missing, the row is never finality-checked (:641).
- **Restart recovery.** `init` re-arms every row whose profile keys are present: Pending rows and rows with the finality marker (:153-156, `arm` :174-181). Others arm at `onRowKeysReady` (:183-192). Dropped rows are never re-armed (:111-113).
- **Locked wallet.** `runWorker` skips polling when `getActiveProfile()` is empty.
- **Removed or changed endpoint.** The poll still dials the recorded URL. `getNodeForUrl` just rebuilds a client for it (`network/service.ts:1013-1019`, test `network/service.test.ts:441`). Nothing consults the current endpoint list.
- **Legacy rows.** A row with no URL polls through `getNode(chainId)`, the active profile's primary (:585-587).
- **Expiry and lifetime.**
  - No local `MAX_TX_LIFETIME` exists. A grep over ts and md found it only in `implementations-plan/archive/send-queue-activity/lessons/phase-3a.md:12`, as the protocol constant (86400 s).
  - A Pending activity row has no age cap. It ends only through a Dropped streak or a mined receipt.
  - The `SendExpiry` proof exists only in SendCheck (`proveExpired`, `inclusion.ts:48-54`; `expiryAnswer`, `send-check.ts:267-293`). `transaction/service.ts` has no use of `expiry`.
- **SendCheck restart.** `start()` scans `failed` rows (`send-check.ts:80-102`) and re-scans a profile on `onRowKeysReady` (:92). Only the answer is persisted, so a restart resumes every open row.

## 7. Legal text (verbatim)

**Current privacy version: 1.2.8**
- `legal/privacy.md:3` reads `**Version 1.2.8 — effective «FILL: effective date»**`.
- Manifest head: `packages/legal/src/manifest.ts:113-119`, `{version:"1.2.8", effective:null, material:false}`. It is unpublished.
- Terms head is 1.2.1, also `effective: null`, `material:false` (`manifest.ts:35-40`).

**§ 1 (`legal/privacy.md:23-39`)**
> ## 1. Who is responsible
>
> Nulo is maintained by **Alejo Amiras**, a natural person resident in Argentina ("**the Developer**",
> "**I**"). There is no company.
>
> Where applicable data-protection law applies, I am responsible as controller for processing carried
> out for the Nulo website, the passkey relying-party host, the token-list host, and correspondence
> described below.
> Independent providers are responsible for processing they determine themselves; providers acting on
> my instructions are processors.
>
> In Argentina that processing is governed by **Law No. 25,326** (*Protección de los Datos
> Personales*), and the supervisory authority is the **Agencia de Acceso a la Información Pública
> (AAIP)**. Where the GDPR or UK GDPR applies to particular processing, the bases stated below apply to
> it.
>
> Contact: **hello@nulo.sh**

**§ 2 (`legal/privacy.md:41-57`)**
> ## 2. No wallet telemetry; limited website and correspondence processing
>
> I do not operate a backend for the wallet. The one host of mine it contacts by itself,
> `tokens.nulo.sh`, serves the same signed file to every wallet and receives no wallet data (§ 5.11).
> Nulo requires no Developer-hosted account or sign-up. It
> creates local identifiers for wallet operation, including profile identifiers, but does not use them
> for wallet telemetry.
>
> Specifically, the extension contains **no** analytics SDK, **no** crash or error reporting service,
> **no** telemetry, **no** advertising or marketing tags, **no** cookies set by me, **no**
> fingerprinting, and **no** third-party scripts. Its content security policy forbids loading remote
> scripts.
>
> I do not sell personal information or share it for cross-context behavioural advertising. I and the
> providers identified below process the limited website, correspondence and service data described in
> this policy. The website `nulo.sh` and its mailing list are described in the separate
> [Website Privacy Notice](../../../../legal/website-privacy.md).

**§ 5 lead and § 5.1 (`legal/privacy.md:104-133`)**
> ## 5. What leaves your device, and to whom
>
> The extension's network functions and the destinations it can open on your request are described
> below.
>
> ### 5.1 The Aztec node you are connected to
>
> **What it is:** to read chain data and submit transactions, Nulo sends requests to the configured
> Aztec node. Remote endpoints use HTTPS; loopback endpoints may use HTTP. Nulo ships with default
> endpoints operated by a third-party provider so the wallet works on first run.
>
> **What the node receives:** protocol-defined transaction data, including proofs, public effects and
> encrypted data, plus ordinary request metadata — your IP address, user agent, timing, and the shape
> of your requests, which for some requests reveals the contracts and public addresses you are reading.
>
> **What Nulo does not send:** your recovery phrase, password or master secret are never included in
> an RPC request. Private-note plaintext is processed locally unless an application or operation
> intentionally discloses it. Protocol privacy does not eliminate inference, and does not protect
> information that a transaction makes public.
>
> **Your control:** Settings → Networks lets you replace any endpoint with one you trust or run
> yourself. **Pending transactions may continue to be checked through the endpoint used to submit
> them, including after you change or remove that endpoint.** Changing an endpoint does not withdraw
> information already disclosed.
>
> **What the Developer can see:** the default Testnet endpoint uses a provider account belonging to
> the Developer. Information available to the Developer through that account is aggregate usage
> statistics — request counts, compute units and cost by network, method, key and request type, and
> average latency — over selectable periods, and an error log that groups failed requests from the
> past 3 days by error, method and network.

**§ 5.5 (`legal/privacy.md:184-227`)**
> ### 5.5 `passkey.nulo.sh` and `tokens.nulo.sh` hosting, contacting me, and the uninstall page
>
> The website `nulo.sh`, including its mailing list, is described in the
> [Website Privacy Notice](../../../../legal/website-privacy.md). The extension opens it only on uninstall (below) and
> when you follow a link to it.
>
> Hosting for `passkey.nulo.sh` and `tokens.nulo.sh`, the hosts the wallet's functions involve, is
> provided by Cloudflare, Inc. ([privacy policy](https://www.cloudflare.com/privacypolicy/)), which
> also hosts `nulo.sh`. Requests to them expose IP addresses,
> requested URLs and ordinary browser headers to the hosting provider. Information available to the
> Developer through hosting tools is aggregate traffic statistics (requests, bandwidth, unique visitors
> and countries) and, for up to the past 30 days, a sample of individual requests showing the time, IP
> address, country, network, user agent, method, protocol, hostname, requested path, and how the
> request was cached or filtered. Request logging on the `passkey.nulo.sh` and `tokens.nulo.sh` applications is
> turned off, and the hosting provider's browser analytics are not enabled. This processing supports delivery and
> security of the
> hosts, relying on legitimate interests where applicable. The retention information below and the
> international-processing information in § 12 cover these hosting records.
>
> The Feedback, Report Issue and Report Scam items in the wallet open your own email client addressed
> to `hello@nulo.sh`; nothing is submitted to a form service, and no third-party form provider
> receives anything.
>
> If you email me, I receive what you send — your message, your email address, and any attachments —
> through the email provider Google LLC (Google Workspace;
> [privacy notice](https://cloud.google.com/terms/cloud-privacy-notice)). I use correspondence
> to respond, investigate reported problems and maintain security, relying on legitimate interests
> where that basis is available and appropriate. Writing to me is entirely optional. **Do not attach
> wallet secrets, recovery phrases or unencrypted backups.**
>
> **Retention.** Hosting and security records are kept only for as long as the hosting provider makes
> them available in its dashboard (currently up to 30 days); I do not export or copy them.
> Correspondence and attachments are retained until the matter is resolved and then for no more than
> two years. Provider retention is set by each provider's data processing terms:
> [Cloudflare's](https://www.cloudflare.com/cloudflare-customer-dpa/) and
> [Google's](https://cloud.google.com/terms/data-processing-addendum). I may retain relevant records
> longer where necessary to
> comply with law or to establish, exercise or defend legal claims.
>
> **Uninstall page.** If you remove the extension, your browser opens the site root, `nulo.sh`. There is
> no uninstall survey. The URL the extension configures contains no wallet address and no
> per-installation identifier. Opening it still exposes ordinary website request metadata, including IP
> address, browser headers and any cookies applicable to that site, as the Website Privacy Notice
> describes.

(§ 5.5 names `tokens.nulo.sh` only as a hosting subject. § 5.11 `tokens.nulo.sh` is the token-list section, `legal/privacy.md:286-310`.)

**Other places that name nodes, endpoints or the provider**
- Summary box, `privacy.md:15`: "requests to an Aztec node".
- § 3 line 95: "…to RPC providers or to connected applications."
- § 5.8/5.9 line 268: "…the RPC endpoint or disabling fiat prices does not disable them."
- § 8 lines 339-340: no remote logging endpoint; "the logger redacts recognised sensitive fields and scrubs recognised endpoint URLs…".
- § 12 closing (`privacy.md:399-401`): "Independent providers — including the node provider, the price API and the block explorer you reach directly from your own browser — describe their own international processing in their privacy notices."
- Appendix: "transmitted to configured nodes and to approved applications".
- Version row 1.2.5 (:467): "Only the default Testnet endpoint uses the Developer's provider account (§ 5.1)."
- **Terms § 7.1** (`legal/terms.md:227-233`) repeats the pending sentence verbatim: "…**Pending transactions may continue to be checked through the endpoint used to submit them, including after you change or remove that endpoint**, and changing an endpoint does not withdraw information already disclosed."
- `grep -c` of the provider name in `legal/*.md`: 0 hits. `BEFORE-LAUNCH.md` has one row (line 21, a "What the … account exposes to you | `legal/privacy.md` § 5.1" row). I am not quoting it because it names the provider.

**What failover would touch in the text**
- § 5.1 and Terms § 7.1 say "default endpoints operated by a third-party provider".
- § 5.1 "What the Developer can see" says only the default Testnet endpoint uses the Developer's provider account.
- Any fallback endpoint operated by a different provider, or through a proxy, changes who receives IPs and transaction data. It also needs § 5.1 (and likely § 12's "the node provider") to name it.
- A claim that a send is never replayed on another endpoint would be consistent with the existing pending-tx sentence. That sentence promises receipt checks on the submit endpoint, not on a fallback.

**How a privacy-only bump is made**
- `packages/legal/README.md`, "Shipping a new version":
  1. Copy `legal/privacy.md` to `legal/archive/privacy-<version>.md`.
  2. Edit the document: version line, text, and a new history row.
  3. Append to `LEGAL_MANIFEST` in `packages/legal/src/manifest.ts`, `material: true` plus hand-written `changes` only if users must re-accept.
- `packages/legal/README.md` invariants: "Status derives from the **Terms only**. The privacy version is recorded as *shown*." A material version must bump minor or major.
- `CLAUDE.md` § "Terms acceptance", bullet "Status derives from the Terms alone": a privacy-only change never blocks. The record keeps `privacyVersionShown` as evidence, and Settings → About shows a non-blocking notice.
- The next bullet, "A material change is a `minor` bump… a patch bump never asks again", adds that `packages/legal/**` is in the smoke and network e2e path filters.
- So a privacy change is always a patch in effect. A "minor" privacy bump would still not force re-acceptance. A Terms minor bump does.
- Test pins in `packages/legal/src/manifest.test.ts`:
  - :16 well-formed and strictly increasing
  - :29 material implies minor or major
  - :37 first version material, material versions have changes
  - :42 head equals the document's version line, placeholder included
  - :49 the history table lists exactly the manifest versions
  - :53 every superseded version has an archive copy whose header agrees
  - :63-69 control labels and risk points
- Other pins: `status.test.ts`, `launch.test.ts`, `apps/extension/src/utils/legal-about.test.ts`, `apps/landing/scripts/legal-pages.test.ts`.
- e2e fixtures: `apps/extension/tests/e2e/fixtures/update/v1.1.0.storage.json:41,46` holds `privacyVersionShown: "1.2.7"`.
- **Open question.** 1.2.8 is unpublished (effective null). Folding a failover edit into 1.2.8 (and into its `changes` text at `manifest.ts:116-118`) or adding 1.2.9 is a drafting choice. A new version requires the archive copy.
- `BEFORE-LAUNCH.md:210-218` carries the "Due at the release that publishes privacy 1.2.8" checklist. A new version would add a sibling block.

## 8. Pain points for a failover design

1. **Send timeout vs maybe-landed.**
   - A `sendTx` that times out, or gets a 5xx or network error, on the retrying client has already been retried up to 4 times on the same endpoint. The tx may have landed. This is exactly the lesson.
   - The wallet's answer today is to mark the row `failed` from `submitting` and let `SendCheck` read its receipt on the **recorded** endpoint for 30 min.
   - Replaying the same tx on a second endpoint is therefore a double-submit risk: duplicate hash, or an "existing nullifier" refusal that hides a landed send. A refusal after a retry cannot prove "not sent".
   - The brief's rule (never replay a submission) matches the current structure. Failover for sends can only apply **before** `sendTx` begins (choose the endpoint). It cannot apply after.
2. **Recorded URL must be the dialed URL.** `submittedEndpointUrl` is written by the executor from `primaryEndpointUrl(network)` (a snapshot), while the send dials a separately cached `getNode(chainId)` client. With failover, "the endpoint actually dialed" can differ from the configured primary. The recorded URL must come from the node actually used (for example an endpoint-bound node handle), not from a re-derived primary.
3. **Cache keyed by chainId only.** `NetworkService.nodes` and the PXE registry are keyed by (profile, chainId) with a single URL. Failover that changes the effective endpoint means `nodes.delete` plus an offscreen runtime rebind. `ChainRuntimeRegistry.ensure` disposes the runtime on URL change under the chain WRITE guard (`chain-runtime.ts:369-385`). That is heavy and waits behind an in-flight proof.
4. **Split brain between prove and send.** Each of the two (PXE offscreen, SW node) holds its own client with its own retries. A failover decision must be shared, or a tx can be proven against endpoint A's anchor and sent to B. The PXE already has a stale-anchor retry (`pxe/service.ts:~489`, `retryOnceOnStaleAnchor`).
5. **Estimate-reuse invalidation.** `primaryEndpointMoved` (`estimate-reuse-shared.ts:97-100`) drops any stashed estimate when the primary id or URL changes. A failover that rewrites the primary would invalidate in-flight estimates. Failover as separate state avoids that.
6. **Pending polls pinned to the old endpoint.**
   - If endpoint A is down and the tx was sent via A, receipts keep polling A (by design, privacy § 5.1) with a 4-attempt, 60 s-per-attempt client.
   - `runWorker` blocks on `allSettled`, so a dead pinned endpoint delays all polls, and `reportEndpointFailure` only evicts a client.
   - No fallback read of a different node exists for the pending path. Doing that would send the tx hash to a different provider, which § 5.1 does not promise and `getNodeForUrl`'s doc forbids for cross-profile cases.
   - A row sent via an endpoint that is later removed keeps being dialed (`network/service.test.ts:441,461`).
7. **DROPPED is not "not sent".** Receipt reads on a different replica or endpoint than the sender read DROPPED for a healthy tx (`transaction/service.ts:39-51`). Any failover on the read path multiplies this. The debounce (60 s and 3 consecutive reads) assumes one endpoint.
8. **Health signal.** The only failure counter is `reportEndpointFailure`, bumped on failed receipt polls and never reset. No timing or health model exists for sends, probes or the PXE. Status probing uses `probeChainId` (5 s, single attempt) via `probeNodeStatus`/`getNodeStatus` (`network/service.ts:~933-960`).
9. **Cancel/lock semantics.** Retries must stop on lock, stop or delete. SendCheck does this via `live()`. The retrying NetworkService clients have no `retryWhile` (only the PXE has `stopRetries`), so a retry loop can dial after a lock. That is why SendCheck uses a single-attempt client.
10. **Logging/URL hygiene.** `submittedEndpointUrl`, `rpcUrl` and `endpointUrl` are in `URL_KEYS` (`wallet/logger/utils.ts:153`). Any new field carrying a URL needs the same treatment (`log-payload-ban.test.ts`).

## 9. Tests and helpers

**Execution unit tests** (`S/execution/`)
- `execution-coordinator.test.ts`. Frozen sequence (:102), `submitting` precondition and recorded URL (:191-296), session checks (:297), profile switch with the real TaskService (:397), duplicate-init classification (:442), Terms wall (:481).
- `execution-coordinator.prove-phase.test.ts`: prove-phase events.
- `service.composition.test.ts` (1859 lines), `send-order.composition.test.ts`, `fee-race.composition.test.ts`, `register-counts.composition.test.ts`: composition tests.
- `transfer-executor.test.ts` and `dapp-send-executor.test.ts`: both reference `submittedEndpointUrl`. The latter is 3513 lines.
- `service.refusal.test.ts`, `service.characterization.test.ts`, `estimate-reuse*.test.ts`, `transfer-estimate-reuse*.test.ts`, `execution-lane.test.ts`, `send-sequencer.test.ts`.

**Transaction service tests** (`S/transaction/`)
- `service.test.ts`: persistence and add path.
- `service.dropped.test.ts`: the dropped debounce and resurrection (fake `getNodeForUrl` :100).
- `service.finality.test.ts`: finality watch.
- `inclusion.test.ts`: `proveFinal` and `proveExpired`.
- `sealed-transactions.composition.test.ts`: per-URL `chain.node(url)` fake (:86), URL `NODE_P` (:135).

**Journal and network unit tests**
- `S/operation-journal/send-check.test.ts`: the largest. It asserts `getSingleAttemptNodeForUrl` is called with the recorded URL (:441,646) and `getNodeForUrl` never (:443).
- `final-refusal.test.ts`, `service.test.ts`, `service.transition-order.pins.test.ts`, `reaper.test.ts`, `sealed-journal.composition.test.ts`.
- `S/network/service.test.ts`: `getNodeForUrl` per-URL caching (:382), cross-profile pin (:401), deleted-endpoint pin (:441,461), single-attempt (:469), `reportEndpointFailure` (:478-493), endpoint CRUD (:776-1000).
- Fakes: `core/testing/fake-node-factory.ts` (per-URL overrides, `created`, `singleAttempt`).
- Legal pins: `S/legal/call-sites.test.ts`.
- Transport tests: `packages/aztec-runtime/src/utils/*` (the fetch tests are pinned by the `fetch.ts` comments).

**E2E (`apps/extension/tests/e2e/network/`, need a sandbox node)**
- `failed-send-check.test.ts`: the send-check path. A send refused at the send line stays unconfirmed; a restart picks it up; the expiry nullifier is read from the finalized tree. Also follows a real send to Finalized. Proverless build only, `NULO_E2E_RETRY=0`.
- `wait-for-tx-mined.test.ts`: uses `isFinalRefusal` and spies on `node.sendTx`. A successful mint followed by the node's refusal of a resend, a reverted public execution, a DROPPED hash.
- `restart-closes-check-window.test.ts`: background restart (a check window, not a send check).
- `delete-after-prove.test.ts`: delete a profile that just proved and sent.
- `profile-switch-sweeps-transfer.test.ts`, `lock-cancels-dapp-send.test.ts`, `cancel-mid-prove.test.ts`, `in-flight-send-guard.test.ts`: cancel and lock windows (proof gate).
- `inflight-call-background-death.test.ts`: a send parked in proving when the background dies.
- `transfers.test.ts` and `tx-transfer-row.test.ts`: popup transfers and the activity row.
- `tx-sendTx-*.test.ts` (default, delegated-authwit, feePayer, fields, multicall, noFrom, reject, selfPay, sponsoredFpc): dApp sends.
- `concurrent-sendtx*.test.ts`, `same-token-concurrent-sends.test.ts`, `send-chaos.test.ts`: ordering and chaos.
- `endpoint-refused-recovery.test.ts`: an endpoint the wallet no longer dials, then editing it back.
- `networks.test.ts`: switching to Local Network.
- `stale-network-*.test.ts`: reset and resume.
- Smoke-lane: `apps/extension/tests/e2e/endpoints.test.ts` (endpoint form UX; the full add → setPrimary → delete cycle "lives in the network suite" per its header), `import-dead-rpc.test.ts` (refused, blackhole and stateful dead endpoints), `egress-guard.test.ts` (imports `MAINNET_RPC_URL`/`TESTNET_RPC_URL`; not read).
- Helpers: `tests/e2e/fixtures/proof-gate.ts` (`holdProofGate`/`releaseProofGate`), `fixtures/helpers` (`rewriteActiveNetwork`, `openNetworkDetail`, `switchToLocalNetwork`), `fixtures/aztec` (`createTestWallet`, `waitForTxMined`).
- There is no e2e for endpoint failover (none by name in `network/`: listed all files).

## 10. Search trail for absence claims

- No other `node.sendTx(`: `S/legal/call-sites.test.ts:23` asserts `filesMatching(/\bnode\.sendTx\(/)` equals only `execution-coordinator.ts`. My `sendTx\b` grep over `apps` and `packages` (non-test .ts/.vue) agrees.
- No replay or retry in `S/execution` around sends: the only retry loop in the send path is `makeFetchWithTimeout`/SDK `retry` (`fetch.ts:132-157`). The PXE's stale-anchor retry never replays a send (`pxe/service.ts:~489` comment).
- No timeout or abort on `sendTxTask`: no `signal`/`AbortSignal` in the file.
- No `MAX_TX_LIFETIME` in code: repo-wide ts and md grep found it only in `implementations-plan/archive/send-queue-activity/lessons/phase-3a.md:12`. A grep for `expir` in `transaction/service.ts` finds only the comment at :111.
- No `singleAttemptNodes` eviction: only :232 and :1028-1031 reference it.
- No `reportEndpointFailure` caller besides `transaction/service.ts:598`: from the repo grep.
- `apps/extension/src/wallet/constants/network-endpoints.ts` was never opened or grepped. All greps used `--exclude=network-endpoints.ts` or `--glob '!**/network-endpoints.ts'`. The one e2e file importing from it (`egress-guard.test.ts`) was only viewed through a header slice and was filtered for the provider name.
