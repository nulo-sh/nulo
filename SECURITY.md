# Security

This document captures security-relevant design decisions for the Nulo wallet
extension. It is written for engineers working on the codebase; if you are a
security researcher, see the reporting section below.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
<https://github.com/nulo-sh/nulo/security/advisories/new>. Do not file public
issues for security bugs.

### How findings are tracked

A suspected exploitable weakness, whoever finds it, is a private draft security
advisory, never a public issue. Until the advisory is published its finding
appears in no committed plan, PR body or test name: a plan records only
"tracked privately: GHSA-…", and the fix's PR and tests describe the change,
not the weakness. The advisory is published once its fix ships in a tagged
release, with no CVE request unless store-installed users must be notified, or
it is closed with a written disposition. Everything else, hardening with no
exploit path included, is a GitHub issue.

## Crypto-bound invariants (never change without a migration)

These values are cryptographically bound. Changing any of them invalidates
existing keys and profiles.

- **KDF domain separator labels**
  - `nulo:passkey-unlock:v1` — HKDF info label of a passkey profile's unlock key
    (`packages/wallet-crypto/src/passkey-unlock-key.ts`)
  - Kept as the record of passkey profiles made before 1.1: `nulo:profile:v1`
    (WebAuthn PRF input), `nulo:kdf:v1` (HKDF salt) and `nulo:master:v1` (HKDF info)
- **`AccountType.Nulo_v1 = 0`** — embedded in the Poseidon hash used to derive
  account secrets from the master secret. The numeric value is part of the
  hash input; renaming the enum is fine, but reassigning the numeric value
  is not (`src/wallet/services/account/spec.ts`).
- **AES-GCM ciphertext format** — `[1 version byte][12 byte IV][ciphertext]`
  stored base64 in `profile.secret` and `profile.guard`
  (`packages/wallet-crypto/src/encryption-key.ts`).
- **Passkey RP ID** — `passkey.nulo.sh`, used at credential creation AND at
  WebAuthn `get` (both literals must match — they're the same crypto
  binding). Changing it invalidates every existing passkey credential.
  The host is deliberately content-less: WebAuthn lets every origin whose
  registrable domain suffix-matches the RP ID assert with the credential —
  so the RP host serves one static page with a strict CSP and no scripts, never
  application code (`infra/passkey-rp/`: a Cloudflare Worker on a single
  custom domain, no `workers.dev` origin), every `*.passkey.nulo.sh`
  descendant stays unregistered in DNS, and the extension's own content
  script is excluded from them (`manifest.config.ts`
  `content_scripts[].exclude_matches`). The apex `nulo.sh` and the
  application subdomains are therefore not eligible. What remains on the
  hostname is Cloudflare's own (`/cdn-cgi/*`, a challenge page if a rule
  ever challenges it) — the edge that already terminates the host's TLS,
  so no new trust root, and the page's CSP refuses any script a zone
  feature would inject; the README lists the dashboard settings to keep
  off. A passkey profile's recovery phrase is sealed in the wallet's storage
  under a key rebuilt from the passkey for that profile; the seed and every
  key stay encrypted in the wallet's own storage, and nothing that leaves it
  (a backup, an export) opens with the passkey alone. A fresh install
  recovers from the recovery phrase or a full backup. Who may use the passkey for this RP ID is decided by the
  browser and the authenticator, not by the wallet, which adds no
  restriction beyond the measures above (known limit #597).
  - **Build-time gate** (`scripts/check-rp-id.ts`): single source
    of truth is `RP_ID` exported from
    `src/wallet/services/passkey/spec.ts`. The gate fails the build if
    (a) `manifest.config.ts:host_permissions` doesn't contain
    `https://${RP_ID}/`, or (b) any passkey-touching source file
    (`src/popup/windows/passkey/index.vue`, etc.) contains a string
    literal of the RP ID value instead of importing the constant.
  - Forks repurposing this extension under a different domain MUST
    change BOTH the constant and the manifest entry atomically. There
    is no migration path for WebAuthn credentials.
- **Row-seal labels, frame and AAD** — every sealed row (§ Storage privacy)
  is `{ profileId, sealed }`, `sealed` being the AES-256-GCM frame
  `[1 version byte = 1][12 byte IV][ciphertext ‖ tag]`, base64, that the
  DEK-rooted imported-key boxes share (`packages/wallet-crypto/src/aes-gcm-frame.ts`).
  Its key and the keyed-id HMAC key are HKDF-SHA256 over the 32-byte master,
  salt the JSON `["nulo:row-seal:v1", profileId, pxeGeneration]`, info
  `nulo:row-seal:aead:v1` and `nulo:row-seal:index:v1`; its AAD is the JSON
  `["nulo:row:v1", root, storageKey, profileId]`
  (`packages/wallet-crypto/src/row-seal.ts`). Pinned by V12 and the DEK-rooted
  boxes by V13 (`apps/extension/src/wallet/crypto/key-vectors.test.ts`).
  Changing any of them hides every sealed row of every profile, and the
  pre-unlock migrator cannot re-seal: a change converts at unlock.
- **The Schnorr account artifact** — vendored byte-exact at
  `packages/aztec-runtime/src/account/artifacts/SchnorrAccount.json` and pinned by digest +
  class id, precisely so that bumping `@aztec-labs/accounts` (which rebuilds its own copy on any
  toolchain change) cannot move a derived address. Editing those bytes rotates the address
  regime: on the owner's recorded decision, as an appended regime entry with the artifact's
  provenance and regenerated vectors, shipped in place off Mainnet and only as a new extension
  major on Mainnet (CLAUDE.md § Account-address freeze).

Any PR that touches these must include:
1. Explicit mention of the invariant being changed.
2. A migration plan for existing users.
3. Cross-version regression test vectors.

## Session secret (password profiles)

**Default: strict security mode.**

When a user unlocks a password profile under strict mode (the default):

1. The password is hashed with SHA-256 to produce `passhash`.
2. `passhash` is used transiently to derive the PBKDF2 base key (600k iterations,
   SHA-256) that decrypts the encrypted master secret.
3. The decrypted master secret is held in service-worker memory as an `Fr`.
4. **`passhash` is NOT persisted.** The persisted session record in
   `chrome.storage.session` contains only `{profile, since, lockedAt}` — opaque
   metadata that cannot decrypt anything.
5. After SW death (browser restart, force-stop, true long idle), the in-memory
   `Fr` is gone and the persisted record cannot reconstitute it. The next popup
   interaction shows the lock screen and the user re-authenticates (paying
   ~1s PBKDF2 again).

Passkey profiles follow the same rules (see below).

**Opt-out: lenient mode** — Settings → Lock → "Strict security mode" →
toggle OFF (with a confirm dialog). A session opened from then on, under
either unlock, also persists a silent-restore bearer (`SessionSecretBox`,
`packages/wallet-crypto/src/session-secret-box.ts`):

1. The master secret and the profile's imported-keys key are wrapped together
   in one AES-256-GCM frame, under a key derived with HKDF-SHA256 from a fresh
   random 256-bit token, with the profile id as associated data. A session in
   recovery mode, which lacks the imported-keys key, persists no bearer.
2. The token and the wrapped pair are persisted together as the session
   record's `bearer` in `chrome.storage.session` (session storage — not
   `local` — cleared when Chrome fully terminates). Nothing derived from the
   password is persisted.
3. On SW restart, `restore()` reopens the session without a prompt only when
   it has not expired, its bearer unwraps, the profile's envelope MAC verifies
   under the unwrapped secrets and the master is a valid field element.
   Anything else (a tampered bearer, one minted for another profile, an older
   format) closes the session, and the next popup shows the lock screen.

The consequence under lenient mode is that **the session record's `bearer` is
sufficient to recover the master secret and the imported-keys key**. The
browser keeps the bearer only for its session, but a copy taken during that
time exposes both secrets for good: locking, expiry, turning strict mode on
and changing the password do not rotate them. It reveals nothing about the
password, because its token is random. The disable-confirm dialog warns that
anyone who can read browser data can unlock the wallet without the password
or passkey.

### Threat model

| Attacker capability | Impact (strict ON, default) | Impact (strict OFF, opt-out) |
|---|---|---|
| Can read `chrome.storage.session` during an active session | None — the record holds no bearer, unless one was left behind (see the toggle bullets) | **Full compromise of the master secret and the imported-keys key** whenever the record holds a `bearer`; the password stays unexposed |
| Can observe disk during a browser-locked / Chrome-exited state | No impact — session storage is not persisted across full browser termination | Same as strict ON |
| Can observe disk during a browser-running / wallet-locked state | Partial — can read encrypted `profile.secret`/`profile.guard`, must brute-force password (600k PBKDF2) | Same as strict ON |
| Can read SW process memory during an active session | Full compromise (master secret held as `Fr` in SW memory) | Same as strict ON |

### Strict-mode toggle semantics

- **Default**: ON for new wallets and after upgrade.
- **Toggle ON mid-session**: the in-flight in-memory secret keeps living (no
  force-lock) but the `bearer` is removed from BOTH `chrome.storage.session`
  AND the in-memory `activeSession.session` object (so a subsequent `refresh()`
  cannot re-write it). The removal is best effort: a bearer can be left behind
  by a failed storage read or write (logged, not retried), or by a worker that
  stops before the removal completes. A bearer left behind
  stays readable until the session record is rewritten without it or deleted,
  or the browser exits, and `restore()` refuses it while strict mode is on.
- **Toggle OFF mid-session**: no immediate effect. The next session open
  writes the bearer: an unlock, a profile creation or import, or a change of
  the active profile's password or unlock method.
- **Stale bearer**: a session record left by a lenient session is untrusted by
  `restore()` while strict mode is ON — silentClose + lock screen on the next
  SW restart. A record left by the retired design (a non-empty `passhash`) is
  never restored, in either mode.

### Related hardening

- **Proactive session TTL** via `chrome.alarms`, so a session expires on time
  rather than at the next method call.
- **Best-effort zeroization** of decrypted secret + passhash buffers across the
  unlock + import + change-password + export paths.

## Session secret (passkey profiles)

A passkey profile's unlock opens its slots under the key its passkey rebuilds
in place of the PBKDF2 key, and nothing derived from the passkey is persisted.
Its session follows the rules above: under strict mode a worker restart asks
for the passkey again; under lenient mode the bearer holds its master and
imported-keys key.

## Content script injection

The extension injects a content script on `*://*/*` at `document_start`,
`all_frames: true` (`manifest/manifest.config.ts`). **Broad injection is
required by the protocol**, not an expedient default:

- The `@aztec-labs/wallet-sdk` discovery flow is **page-initiated**: a dApp
  calls `ExtensionProvider.discoverWallets(...)` which posts
  `WalletMessageType.DISCOVERY` via `window.postMessage(..., '*')`.
- Without a content script already listening on `window.addEventListener('message', ...)`,
  the discovery is silently dropped — the wallet never sees the dApp.
- There is no alternative protocol (no `chrome.runtime.connect()` from
  the page, no extension-API surface accessible from page context).
- Designs that narrow the scope (allowlist of known dApps, dynamic
  registration via `chrome.scripting`) all break unknown-dApp discovery
  and would require a bootstrap UX (extension-action click first, then
  the dApp can discover) — an ecosystem-breaking change.

The local content script (`src/content-script/content.ts`) is 22 lines:
a thin relay around `ContentScriptConnectionHandler` from the upstream
SDK. The upstream handler:

- Parses page messages with `JSON.parse` inside try/catch (no `eval`).
- Filters incoming events by `event.source !== window` (rejects
  cross-frame spoofing via the synchronous same-origin check).
- Never reads or writes page DOM state.

The script is built as one self-contained file
(`apps/extension/scripts/content-script-isolation.ts`), which the browser
injects directly, so the built manifest lists no web-accessible file. A file
that is listed can be fetched by any page the entry matches, and on Chrome the
extension's origin is fixed by its store id, so one fetch tells a page the
wallet is installed (Firefox's origin is random per install). Chrome's
`use_dynamic_url` cannot stand in for this: the loader crxjs uses for a
multi-chunk script imports sibling chunks by relative URL, which Chrome
resolves against the fixed origin and refuses. The smoke suite fetches every
injected file from a web page on both browsers (`tests/e2e/security.test.ts`).

### Content-script boundary (defense-in-depth)

Because the protocol mandates broad injection, a zod-validated boundary
sits at the SW seam where content-script messages arrive:

- `validateContentScriptMessage()` (`src/wallet/services/wallet-sdk/content-script-validator.ts`)
  filters envelopes claiming `origin: "content-script"` against an
  allowlist of upstream `InternalMessageType` values that content
  scripts are expected to send (DISCOVERY_REQUEST, KEY_EXCHANGE_REQUEST,
  SECURE_MESSAGE, DISCONNECT_REQUEST). Adversarial envelopes claiming
  background-to-content-script types (DISCOVERY_APPROVED, etc.) from
  the content-script origin are rejected before reaching the upstream
  handler.
- Non-content-script messages (ServiceClient responses, offscreen
  pings) pass through untouched — the upstream handler does its own
  origin filter.

### Content-script threat model

| Attacker capability | Impact |
|---|---|
| Compromised page can post arbitrary `window.postMessage` payloads | Limited — discovery requires user approval via popup; encrypted channel uses ECDH P-256 + AES-GCM with verification hash; content script filters cross-frame spoofing. Bugs in upstream `ContentScriptConnectionHandler` are still page-reachable. |
| Compromised content script (XSS in upstream relay) | High — would bypass the SW envelope check, which cannot mitigate it; depends on upstream code review + minimization. |

The background sets `chrome.storage.local` to trusted contexts at every start
(`src/wallet/utils/storage-access.ts`): the extension's pages and workers read it, a content script
does not, and Chrome keeps the level across restarts. Firefox has no such setting, so there the
area keeps the browser's default access, and a compromised content script is a writer with storage
access in the sense of § Storage privacy.

## Authorization enforcement

Two layers:

1. **Capability type** (`packages/wallet-bridge/src/capability-map.ts`)
   — maps each wallet-sdk method to the capability type it requires
   (`accounts`, `transaction`, `simulation`, `data`, `contracts`,
   `contractClasses`).
2. **Per-operation scope** (`packages/wallet-bridge/src/scope-enforcement.ts`)
   — validates that the specific contract/function targeted by an operation
   falls within the scope granted.

`createAuthWit` takes a `CallIntent` or an `IntentInnerHash`, never a raw
message hash: the argument schema refuses a raw hash before the scope check
and before any window (`packages/wallet-bridge/src/wallet-schema-args.ts`),
and the scope check refuses it again
(`packages/wallet-bridge/src/method-scope-checkers.ts`). The `from` account
must be one the app's accounts grant allows. When the app holds a
transaction grant, or a simulation grant with a transaction scope, a
`CallIntent` whose call is outside that scope is refused, and so is an
`IntentInnerHash` whose `consumer` contract that scope does not grant at
every function (a `*` function pattern); with no such grant, nothing else
is refused on scope. A `CallIntent`
inside the scope is signed without a window only while the app's consent to
sign authorizations without asking is in effect
(`packages/wallet-bridge/src/dispatcher.ts`). Every other admitted request
opens a confirmation: for a `CallIntent` it shows the authorized caller, the
target contract, the function and its arguments; for an `IntentInnerHash`,
the consumer contract and the inner hash, with a warning that the wallet
cannot show what the hash authorizes. An `IntentInnerHash` whose consumer is
the signing account itself is refused before any window, whatever the grant:
only the wallet's own send authorizes that account's transactions.

The authorization registry's grant functions answer only the wallet's own
authorization action (`grantPublicAuthwit`), so a public authorization a dApp
obtains by naming the registry is always in the wallet's index, where a person
can review and revoke it. A dApp's
`sendTx` call to a grant function, a `createAuthWit` intent naming the registry,
and a registry authorization request raised inside a dApp transaction are each
refused, whatever the grant (`packages/wallet-bridge/src/auth-registry.ts`).

## RPC endpoint as user input

The wallet talks to Aztec nodes over HTTPS-JSON-RPC. The endpoint URL is a
user-controlled input — users add custom endpoints (Settings → Manage Networks
→ chain → Add endpoint), and any added endpoint can be promoted to the
chain's primary. The network model separates `Network` (chain-level) from its
nested `NetworkEndpoint[]` (see
`implementations-plan/archive/production-hardening/plan.md#network-model`),
which makes the endpoint trust boundary explicit.

### Trust posture

- **Endpoints are not authoritative.** They cannot sign on behalf of the
  user, decrypt session material, or write to storage. The threat model
  reduces to: a malicious endpoint can serve crafted RPC responses to a
  PXE / wallet that already trusts the **chain**.
- **Chain identity is checked at adoption.** `addNetwork` probes the node's
  `getNodeInfo()` and records its exact L1 chain id and its wallet chain id:
  0 for a loopback node at the Local Network's URL or on the Local Network's
  row, otherwise the composite `walletChainId(l1ChainId, rollupVersion)`.
  `addEndpoint` / `updateEndpoint` refuse a node unless both equal the row's;
  the refusal carries `ENDPOINT_CHAIN_MISMATCH` and shows inline in the popup.
  Chain 0 is the Local Network: L1 31337 (`LOCAL_L1_CHAIN_ID`) on `localhost`
  or `127.0.0.1`. Any other node whose answer computes to 0 is refused.
- **Chain identity is checked at use.** Every step that builds the chain
  metadata a signature, proof or simulation commits to compares the live
  node with the stored row (`assertLiveChainIdentity`): the L1 and the
  wallet chain id on a non-zero chain, and L1 31337 on chain 0, whose
  rollup version is not pinned because every local sandbox redeploys it.
  Promotion to primary does not probe. Loopback is checked when an endpoint
  is adopted, built into a row or promoted, not at use. The guarantee
  covers the metadata the wallet builds and the accounts it allocates: an
  existing account is re-derived from its own stored L1 for verification
  and export, and an imported key or an opaque message hash carries no
  chain (§ Authorization enforcement).
- **Duplicate-URL guard per Network.** Adding the same `rpcUrl` twice to
  the same `Network` is rejected (`DUPLICATE_ENDPOINT`).
- **Per-URL `AztecNode` cache** with 3-strike eviction: each unique URL
  gets its own client; transient failures don't poison neighbours; three
  reported failures, which a success does not reset, evict the client and
  the next use rebuilds the same URL.

### Pending-tx polling pin

Once a transaction is submitted, the receipt poller is **pinned to the URL
the tx was sent on** (`Tx.submittedEndpointUrl`). Even if the user swaps the
chain's primary endpoint mid-flight, the poll keeps targeting the original
URL via `getNodeForUrl`. This avoids:

- a freshly-promoted endpoint reporting "tx not found" because it hasn't
  seen the bundle yet, and
- a malicious endpoint shadowing receipts for txs it never received.

Three reported failures rebuild that URL's client; the poll never moves to
another endpoint.

### What endpoints can still do

A malicious-but-chain-id-honest endpoint can:

- Serve stale block data (delaying note-discovery sync).
- Refuse to relay user-submitted txs (denial of service; user retries on a
  different endpoint).
- Track which addresses the wallet asks about (privacy, not integrity).

Mitigations are user-driven: the per-Network detail page lists every
endpoint, lets the user promote/demote primary, and surfaces probe failures
inline. There is **no automated reputation system** — endpoint trust is
explicit and per-Network.

### What endpoints cannot do

- Spend or sign without account material the SW already holds.
- Make the wallet build signing or proving metadata for a chain other than
  the stored one.
- Read decrypted master secrets or session records (none of these cross
  the wire).
- Trigger storage writes outside the network/endpoint surface.

## Storage privacy

Encrypted at rest:
- `profile.secret` — master secret (AES-GCM)
- `profile.guard` — password verification sentinel (AES-GCM)
- Every profile-scoped root but the profile row itself: contacts, dApp
  sessions and registration counts, the operation journal, the transaction
  history, accounts and imported keys, tokens and the default-token seeder's
  marker, networks, fee payers, token balances, the authwit registry and its
  enable flags, incoming receipts with their trust, scan cursors,
  balance-refresh outbox and arrival rows, the popup's pinned tokens and
  fee-payer picks (one row per profile each), and the device's last account
  selection (one row, naming the profile that made it) — sealed per row under the
  profile's row-seal key (§ Crypto-bound invariants). The envelope names the
  profile; the row, its names, addresses, origins, grants, amounts, balances,
  fees, endpoints, errors and hashes are ciphertext. An imported key's
  signing key is sealed again inside it, under the password-derived key.
- Storage keys name no address or hash. A transaction row is stored at the
  keyed id of its hash, so two profiles holding one hash keep two rows. An
  account and its imported key keep their profile and chain and replace the
  address with its keyed hash, one id in both roots. An incoming key keeps
  its profile and network and replaces the note, transaction, account or
  contract it named with its keyed hash, so a profile or network wipe still
  deletes by prefix with no key; an enable flag's key keeps its profile and
  chain and hashes the account.
- The AAD binds each row to its root, its storage key, its profile and,
  through the key, the profile's incarnation: a row moved, swapped between
  profiles or kept from a deleted profile whose id is reused never opens. A
  row that fails to open reads as absent and is kept; the log names a fixed
  category (`sealed-authentication`, `sealed-format`, `sealed-identity`),
  never the row.
- The account-integrity stamp and the stale-network record keep a keyed
  digest of the account set, `HMAC(K_idx, accountSetDigest)`, never the
  address list.

Plaintext at rest (`chrome.storage.local`), each family with the reason it is
read without a row key in `apps/extension/src/wallet/storage/root-census.test.ts`,
which fails on a family that is neither sealed nor reviewed:
- Profile rows (name, type, the sealed master and its supporting key
  material), config, the storage version and the migration engine's state,
  cached prices, the signed token list, the Terms-acceptance record.
- Per-profile records the pre-unlock gates read: the active network's id, the
  default network kinds a profile was offered, the stale-network record and
  the integrity stamp (network and chain ids and the keyed digest), and the
  torn-restore gate.
- Records that name accounts only while their work runs: a profile deletion's
  tombstone (addresses, token and network ids), the network-reset journal
  (accounts and the probed endpoint) and an account-integrity block.
- The popup's `nulo:ui:*` preferences: per-profile Get Started flags and how
  the last restore ended. A pin or fee-pick map an earlier build stored is
  plaintext until its profile's next unlock seals it in place, and the
  selected account an earlier build stored (`nulo:ui:activeAccount`, an
  address) until a profile holding that account claims it or a selection
  overwrites it.
- A note's nullifier is never stored; it stays in the PXE's encrypted store.

What sealing does not hide or prevent:
- Root names, row ids, the `profileId` in each envelope (so per-profile row
  counts, and which profile made the device's last account selection),
  ciphertext length and write times. A balance or authwit row's id
  is a local sequence number; an account, imported-key or authwit-flag key
  shows its profile and chain (so per-chain account counts), an incoming key
  its profile and network (so per-network row counts) and an outbox key its
  local token id (known limit #1056).
- A profile's rows written before this build stay plaintext until that
  profile's next unlock seals them; until then they read as before (known
  limit #1060). The browser may keep the replaced plaintext in its storage
  files until it compacts them (#1058). A build from before the seal reads
  none of them (#1059).
- A transaction row written before this build that names no profile stays
  plaintext at its hash, served to every profile, until a profile that alone
  holds its account on its chain adopts and seals it at unlock. One whose
  account two profiles hold, or whose ownership a locked profile's unreadable
  accounts leave unknown, stays plaintext (known limit #1057).
- An offline writer can delete a sealed row, roll it back to an earlier
  sealed value at the same key, or plant a plaintext row, which the wallet
  reads and seals at the next unlock. dApp sessions are the exception: each
  keeps its HMAC (keyed `HKDF(master ‖ dek)`) inside the seal, so a planted or
  edited grant is dropped on read (known limits #1052, #1053).
- The row-seal keys come from the master alone, so a same-phrase sibling
  profile, or anyone holding the recovery phrase and a copy of the disk, can
  open the rows; neither can forge a dApp grant (known limit #1054).
- The service worker holds the row-seal keys of every profile it has opened
  until it ends or the profile is deleted, a lock included, so work that lands
  after a lock still seals. Code running inside the extension can use them,
  never the master (`packages/wallet-crypto/ATTACK-SURFACE.md`, known limit #1055).

Each dApp-session row carries a MAC keyed from the profile's keys: it stops a
forged row and a row replayed under another id or profile, not a writer with
storage access putting back an earlier authentic row under the same key
(known limit #967).

Who reads what, by capability:

| | Attacker | What it gets from the sealed roots |
|---|---|---|
| T1 | Reads storage: a disk image, a synced browser profile, an extension with storage access | Ciphertext. Its work factor is the password, as for the master; a passkey profile has no offline path |
| T2 | A same-phrase sibling profile, or anyone with the recovery phrase and a copy of the disk | Every sealed row of every profile that phrase made, since the row keys come from the master alone. Never a dApp grant it could forge, nor an imported signing key, sealed again under the profile's DEK |
| T3 | Writes storage offline | Deletes, rollbacks to an earlier value at the same key, and planted plaintext rows, as above. Never a row moved across keys, roots, profiles or incarnations, nor a forged one |
| T4 | Runs code inside the extension | Out of scope (`packages/wallet-crypto/ATTACK-SURFACE.md`). On a locked, live worker: the row keys of every profile opened in its lifetime, never the master |
| T5 | A Firefox content script sharing `storage.local` | Ciphertext, as T1 |

### External price feed (CoinGecko)

While a profile session is unlocked (and `showFiatValues` is on — the default,
toggleable in Settings → Privacy), the wallet fetches USD quotes from
CoinGecko's keyless public API every ~3 minutes. Privacy posture:

- The request is ONE batched query for the FIXED id table compiled into the
  build (`PRICE_IDS` in `@nulo/token-list`) — it never varies with the user's
  holdings, accounts, activity or the token list, so nothing user-specific is
  inferable from the query string. The signed list only says which token an id
  prices.
- No fetch is ever triggered by transaction activity (fee-USD reads are
  cache-or-nothing), so request timing does not correlate with transactions.
- What CoinGecko (and any on-path observer) does learn: an IP address running
  Nulo is active while the wallet is unlocked. Turning `showFiatValues` off
  stops all fetching and clears the cache.
- Terms: keyless access is used under CoinGecko's public-API tier with in-app
  attribution ("Token prices by CoinGecko", Settings → About). Revisit the
  plan tier before a public marketplace release (release-checklist item; an
  optional `VITE_COINGECKO_API_KEY` exists for CI/local rate-limit relief and
  MUST NOT be set in release builds — enforced fail-fast in
  `_build-extension.yml`).
- Quotes are display-only except the send screen's fiat-input mode, which is
  bounded by a frozen session quote, round-down bigint conversion, a >1%%
  drift re-confirmation, and the always-visible derived token amount.

## Published packages

The repository publishes three npm packages, `@nulo-sh/*`, staged from workspaces by `scripts/publish/stage.ts`. Every code-bearing version (`0.1.0` on) is published only by `.github/workflows/publish-packages.yml`, through npm trusted publishing, with a provenance attestation. The one exception is the code-free, deprecated `0.0.0-bootstrap.0` placeholders, published once from a workstation to attach the trusted publisher; npm never frees a version, so they stay listed. No npm token exists in the repository, in Actions or on a workstation after that bootstrap.

- **Where the bytes come from.** The `pack` job builds them from a frozen install that restores no shared Actions cache (any dev- or main-scoped job can write one) and runs no lifecycle script or test code; the tests run in a separate job. The first version is bound to the exact bytes a rehearsal proved against its consumer (`scripts/publish/approved-digests.json`), and no other version can be published before it.
- **Who can publish.** Only the `publish` job holds `id-token: write`, and it runs no repository code. Its gate is the `npm-publish` environment (owner as required reviewer, deployment branches `dev` and `main`), which is repository configuration the owner creates, not something the workflow file enforces: GitHub creates a missing environment with no protection. Each package's trusted-publisher record names that workflow and environment. `publishConfig.provenance` in the staged manifests is only a default, which a command-line flag overrides. The boundary is each package's "require 2FA and disallow tokens" setting: no token can publish, which leaves the trusted publisher and the owner's own interactive 2FA session, and a version published that way carries no provenance, which the `verify` job rejects whenever the workflow meets that version.
- **What is checked afterwards.** The `verify` job fetches each version's SLSA bundle from the registry and has `gh attestation verify` require that it was signed, through Sigstore, by this workflow on `dev` or `main` (the certificate identity, not the statement's own claims) and names the packed bytes (`scripts/publish/verify-provenance.sh`); then it runs `npm audit signatures`. `publish` and `verify` take `pack`'s artifact by ID and check every tarball against the digests `pack` output, so the parallel `test` job cannot swap the bytes.
- **Consumers.** The `@aztec-labs/*` packages are exact peer dependencies, never bundled, so a consumer *can* share a single `Fr` and `WalletSchema`; installing one copy is theirs to check (`assertPackageIdentity` with `lockstepVia` from `@nulo-sh/resolve-asset`).

See [`scripts/publish/README.md`](./scripts/publish/README.md).

## Dependency policy

**Supply-chain age gate.** `bunfig.toml` sets `minimumReleaseAge = 604800`
(7 days). Newly published npm versions are filtered out at install time.
Defends against the npm-token-compromise attack pattern (the axios and
chalk/debug compromises) — those poisoned versions were detected and pulled
within hours.

Seven days rather than 14, because Bun 1.3.x wrongly applied the gate
during `bun install --frozen-lockfile`, blocking installs of pinned
lockfile entries inside the window. **On Bun 1.4 that bug is fixed** — a
14-day gate passes frozen installs cleanly against this lockfile
(evidence: `implementations-plan/archive/bun-1.4-bump/plan.md#age-gate-probe`).
Widening to 14 days is viable; it is a deliberate policy change to make
on its own PR, not a side effect of a toolchain bump.

**No install at run time.** With no `node_modules`, Bun's default fetches a
bare import from npm while a script runs, past `bun.lock`'s hashes and the
age gate; the CI jobs that hold a release credential install nothing, so a
stray import in one of their scripts would run unpinned code beside it.
`bunfig.toml` sets `install.auto = "disable"`, and Bun reads that file only
from its working directory, so it covers every Bun call made from the root
of the workflow's own revision. The jobs that run another revision's code
(the two store publishers, the preview comment) pass `bun --no-install`.
`scripts/ci-cd/release-integrity.test.ts` pins that every Bun call in a job
that installs nothing is reached by one of the two, and proves Bun refuses
under the committed file. `bunx`, `bun x` and `bun create` fetch whatever
the file says, so that test counts them as installs, and the jobs that tag
or publish refuse them. A fresh clone refuses the same way until
`bun install`.

**Dependabot** updates the GitHub Actions that the workflows and composite
actions use: one grouped pull request a week, after a 7-day cooldown
(`.github/dependabot.yml`). npm dependencies are updated by hand, as
policy. Each update is held to the age gate above and read with
`bun pm diff` (the review workflow below). The CVE-on-Friday runbook and
the exact-pinned Aztec line, bumped through the `aztec-update` skill, both
further down this file, are exceptions to the age gate. GitHub's
[supported-ecosystems page for
Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories),
read 2026-10-27, lists version updates for Bun ≥ 1.1.39 (the text-format
`bun.lock`) as supported and security updates as not supported. Whether
Dependabot reads this repository's `lockfileVersion: 2` lockfile, or
resolves under the age gate (a frozen install never re-gates a locked
version), is untested. Turning on its Bun version updates is the owner's
decision.

**`bun audit`** runs at every severity in `_lint-and-typecheck.yml`, through
`scripts/ci-cd/audit-gate.ts`. Each advisory it reports must have an entry in
`scripts/ci-cd/audit-acks.json` with the same id, package, affected range and
severity; the entry says whether the extension zips contain the package
(decided by the build's `THIRD-PARTY-NOTICES.txt`, not by reading dependency
trees), why the advisory cannot reach a user, and the event that reopens it.
An entry no advisory matches any more is stale and must be deleted, and a
report the gate cannot read, or an exit code other than 0 or 1, is a failure
rather than a clean result.

- **When it blocks.** On a pull request whose `bun.lock`, `package.json`,
  `bunfig.toml` or ack-file diff is more than `"version"` lines, an
  unacknowledged, stale or unreadable result fails `quality-status`. Release
  PRs and the `main → dev` sync change only version lines, so they, and every
  push, nightly and release run, report in the step summary without failing.
  The cost: a new advisory blocks the next dependency change, a promote PR
  included, until it is fixed or acknowledged on `dev`, and a release can ship
  while one is open.
- **Acknowledging.** Fix it first (`bun audit fix --dry-run`, then a bump
  reviewed as below). Only an advisory that cannot move and cannot reach a
  user is acknowledged, in a reviewed PR. A bundled one needs a reason that
  says why the extension cannot reach it; without one it is not acknowledged.

What is acknowledged today (24 advisories; the ack file holds each one):

| Package | Advisories | Comes in through | Reopens at |
|---|---|---|---|
| `uuid` 9.0.1 | 1 | `@aztec-labs/stdlib`'s Google Cloud Storage client | the next Aztec bump |
| `@opentelemetry/core`, `@opentelemetry/propagator-jaeger` 1.x, `systeminformation` 5.23.8 | 7 (6 high) | `@aztec-labs/telemetry-client`, which nothing here imports | the next Aztec bump |
| `undici` 7.29.0, `sharp` 0.35.2 | 15 (5 high) | miniflare, wrangler's local simulator (`apps/landing`, `infra/passkey-rp`, `infra/subscribe`, `infra/token-list`) | the next wrangler bump |
| `elliptic` 6.6.1 | 1 (low) | `vite-plugin-node-polyfills`' crypto-browserify | a fixed release (none exists) |

None of them is in either extension zip.

**Bun pinned** to a specific patch version in `package.json#packageManager`
and in `setup-bun/action.yml`, plus the five `bun-version:` literals in jobs
that skip that composite (listed in `CLAUDE.md`, Dependency policy). Cache
keys include the Bun version so a bump invalidates stale state. Local
development requires bun ≥1.4 (`bun run --parallel` scripts), and
`bun.lock` is `lockfileVersion: 2`, unreadable by Bun ≤1.3.

**pm review workflow** (Bun ≥ 1.4):

- `bun pm diff <pkg>@<old> <new>` (both versions EXPLICIT) on every
  bump and every review of one — un-minified diff, flags new
  install scripts and new `child_process`/`fs`/`net`/`vm` imports.
  On a checked-out bump branch the lockfile already holds the NEW
  version, so the unqualified `bun pm diff <pkg>` form (lock → latest)
  reviews the wrong or an empty delta — always name both versions.
- Raising a range's floor (`^3.5.41` → `^3.5.42`) locks the newest
  version the age gate allows, which can be releases past the one
  reviewed. To land exactly one version: `bun add <pkg>@<version>` in
  the workspace, restore the manifest it rewrote (exact pins, re-sorted
  keys), raise the floor by hand, `bun install`, then read `bun.lock`
  for nested copies still on the old version (Bun 1.4.2).
- `bun audit fix --dry-run` for advisory triage — shows the in-range
  upgrade set without touching anything; `--latest` previews
  cross-major fixes.
- `bun pm licenses --prod --json` at release prep.
- `bun pm ls --trusted` whenever `trustedDependencies` changes — lists
  exactly which packages may run lifecycle scripts.
- `bun dedupe --check` runs ADVISORY in CI (`_lint-and-typecheck.yml`):
  collapsing resolves to the range intersection, which can DOWNGRADE
  transitives, so a human reviews each collapse (`bun dedupe` locally,
  then read the lockfile diff) instead of CI auto-failing on drift.

**Lockfile is text (`bun.lock`)** — reviewable in PR diffs, no binary
opacity.

**CVE-on-Friday runbook.** When an advisory drops for a package newer than
the 7-day gate window:
1. Identify the patched version from the advisory.
2. Confirm `bun audit` flags it.
3. Open a hand PR:
   - Edit `bunfig.toml`: temporarily add the package name to
     `minimumReleaseAgeExcludes`.
   - Run `bun update <pkg>` (or `bun add <pkg>@<version>`).
   - Run `bun run audit:vue` + `bun run test:e2e`.
   - Commit the lockfile + bunfig change.
4. **Remove the exclude in the same PR, once `bun.lock` holds the patched
   version.** The gate applies whenever `bun install` RESOLVES a version.
   A frozen install never resolves, so CI and deploys need no exclude:
   prove it before committing, with the exclude deleted,
   `bun install --frozen-lockfile --force` must still succeed. An exclude
   left in place "until the window passes" exempts every FUTURE version of
   that name for days, which is the exposure the gate exists to prevent.

   **What removing it costs, until the version is 7 days old:** editing the
   `package.json` of a workspace re-resolves that workspace's dependency
   tree, and a young version in it is gated again even though it is locked
   — the install fails with `was published within minimum release age`
   (verified on Bun 1.4.2 with a one-line edit to
   `apps/extension/package.json` while a dependency was three days old). Workspaces that do not reach
   the young version are unaffected, and so is an install that changes
   nothing. So for that week, a dependency change in an affected workspace
   either waits, or is resolved with the exclude added **locally and not
   committed**: the lockfile it writes is the same, and the frozen install
   proves it. Commit an exclude across PRs only when a later PR of the same
   series must re-resolve the young version; date it, and remove it there.
5. PR description must cite the CVE and link the advisory.

**Bun bug oven-sh/bun#25305 — closed on Bun 1.4.** On 1.3.x, `bun update --latest`
did not apply `minimumReleaseAge` to transitive deps (workaround was
deleting `bun.lock` first). Verified fixed on 1.4.0 with a
positive-control mock-registry probe: when a gated update actually
re-resolves, direct AND transitive candidates are both held to the gate
(matrix: `implementations-plan/archive/bun-1.4-bump/plan.md#age-gate-probe`). One
nuance remains by design: update never re-gates versions already in
`bun.lock` — evicting an already-locked too-young version takes a
deliberate lockfile regeneration.

**`bun pm scan`** is a plugin system for third-party scanners (Socket,
Snyk, etc.), not a built-in tool. Not configured today; revisit if/when
we pick a scanner.

**`@aztec-labs/*` and `@aztec-foundation/*` outside this policy.** Exact-pinned, bumped manually with
the class-id + address invariant fixtures (`CLAUDE.md`, Account-address
freeze).

**Bun-version sync trap.** Bumping `package.json#packageManager` (the
Bun version) does NOT touch the versions the workflows pin themselves:
`.github/actions/setup-bun/action.yml` and the `bun-version:` literals
in a few jobs. CI still passes, because those jobs run their own pinned
Bun, NOT the new `packageManager` version. The discrepancy is silent:
there's no CI step that verifies the pinned values match. Move every pin
site together on a Bun bump (the list is in `CLAUDE.md`, Dependency
policy) until a consistency-check script lands as a CI step.

## GitHub Actions

Every third-party action is pinned to a **full commit SHA**, with its release
in a trailing comment (`uses: actions/checkout@3d3c42e… # v7.0.1`). A tag is a
mutable pointer held by the action's maintainers, or by whoever takes over
their account: `@v4` re-resolves on every run, so a moved tag runs new code
with the job's token and secrets and leaves no diff to review. A SHA is
content-addressed, so an upgrade is a reviewed line in a PR.

- **Enforced** by `scripts/ci-cd/action-pins.test.ts` (in `test:ci-gating`):
  a tag or branch ref, a SHA without its `# vX.Y.Z` comment, or two
  different SHAs for one action all fail CI.
- **Resolve the SHA from the action's own repository**, never from a search
  result or a fork: `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, and
  when `.object.type` is `tag` (annotated), follow it once more through
  `git/tags/<sha>` to the commit. GitHub serves fork commits under the
  parent's URL, so a SHA that was not read off a tag of the real repo
  proves nothing.
- **The 7-day age gate applies here too.** Pin the newest release at least
  7 days old, not what the major tag currently points at; the two differ
  whenever an action shipped this week.

## Release integrity

One path makes an extension release: `release.yml`'s `attach-assets` job, and `nightly.yml`'s `publish-nightly`, which runs the same `scripts/release/attach-assets-run.ts`. It creates the GitHub Release as a draft, uploads the two zips and `SHASUMS256.txt`, reads every asset's digest back, attests the three files, writes the notes, publishes, and reads the digests and the tag back once more. It publishes only when the run's commit is the commit the tag names, and a published release is never uploaded to again.

- **Build-provenance attestations.** Every asset published by that path carries a SLSA build-provenance attestation from `actions/attest-build-provenance` (SHA-pinned), signed through Sigstore's public-good instance and stored by GitHub. It binds the file's digest to this repository, the workflow file and the commit. The release notes print the check with the commit filled in:
  ```bash
  shasum -a 256 -c SHASUMS256.txt
  gh attestation verify nulo-chrome-X.Y.Z.zip --repo nulo-sh/nulo \
    --signer-workflow nulo-sh/nulo/.github/workflows/release.yml \
    --source-digest <the tag's commit> --deny-self-hosted-runners
  ```
  A nightly names `nightly.yml`. `--signer-workflow` matches that workflow on any ref; `--source-digest` is what pins the commit. An attestation proves where and from which commit a zip was built, not that the commit is benign: a malicious commit merged to `main` gets a valid one. Releases published before this path existed (`v0.30.2` and its nightlies) carry none, so a store submission through the workflow refuses them.
- **Digest read-back.** The first read-back keeps a draft that changed after upload from being published. The second reports a change that another holder of `contents: write` made between that check and the publish; GitHub has no compare-and-publish call, so it cannot prevent one.
- **Store submissions ship the published bytes.** A dispatch on a published release downloads its assets, checks them against `SHASUMS256.txt` and their attestation, and hands those bytes to the store jobs. A rebuild that differs is only a warning: zip bytes depend on the runner's `zip`.
- **Tags.** `auto-unstick` is the only workflow that creates a stable tag, through the REST API with its own App token, and only at the merge commit of the Release PR the run was triggered by; release-please runs with `skip-github-release: true`. One tag ruleset (`release tags: no deletion or update`, no bypass actor) stops anyone from deleting or moving a `v*` tag, and a second (`release tags: creation by the release app only`, whose one bypass actor is the release App) stops anyone else from creating a stable or rc tag; nightly tags are outside both. The App's id and private key are secrets of the `release-app` environment, whose deployment branches are `main` and `dev` and which has no reviewer, so `auto-unstick` and the sync PR never wait. GitHub opens the environment only to runs from those branches, so only workflow code that has reached `main` or `dev` can mint the App token; `release-integrity.test.ts` keeps the environment on exactly the jobs that mint it, a repository check rather than a GitHub rule. An rc tag, or a stable tag pushed by hand, goes through `scripts/release/tag-by-hand-run.ts`, which adds the owner as a bypass actor for that one push and puts the App back alone after it, whether or not the push succeeded; only a killed helper or an unreachable GitHub leaves that close to the owner by hand. Neither stops an admin, who can edit or disable them, or a stolen owner credential.
- **Store copies are compared with the release.** `verify-store-copies.yml` (weekly, and on dispatch) downloads what the Chrome Web Store and Firefox Add-ons serve to the public, takes the version from its `manifest.json`, verifies that version's release zip and `SHASUMS256.txt` through the publish path's own digest and attestation checks, and compares the two file for file. Each store may add only its own exact entries (Chrome's `_metadata/verified_contents.json` and `update_url`, AMO's `META-INF/` signature); anything else, a missing copy, a served version with no release, or a failed check, reds the run. `v0.30.2` predates attestations and is checked by digest and `SHASUMS256.txt` only. It samples what a store serves once a week; it cannot see what one served to a single user.

- **Immutable releases** are on since 2026-10-29 (`gh api repos/nulo-sh/nulo/immutable-releases` reads `{"enabled":true,"enforced_by_owner":false}`). A published release's assets and tag can no longer change, and each release published from then on gets a GitHub release attestation, checked with `gh release verify vX.Y.Z --repo nulo-sh/nulo`; releases up to v1.1.0 carry none, so the check applies from the next stable release. Titles and notes stay editable, which is why the check is the attestation and not the notes.
- **The jobs that tag or publish** install no dependency, check out the workflow's own revision without persisted credentials, set `GH_TOKEN` per step and run no third-party action but `oven-sh/setup-bun`, which gets no token; git-cliff, whose action downloads its binary at run time, runs in read-only notes jobs. Every App token names its permission set, so a permission later granted to the App reaches no token, and is minted only in a job that declares `release-app`. `scripts/ci-cd/release-integrity.test.ts` pins all of it. Accepted residuals: a compromised `oven-sh/setup-bun`; a workflow change merged into `dev`, which needs no approving review, or into `main` runs with the App's key on its next run there; `GITHUB_TOKEN` keeps `contents: write` in the two publish jobs; and a release published before this path stays mutable, and a dispatch with such a tag as `--ref` runs that tag's old workflow, which replaces assets. Only accounts with write access can dispatch, and the runbook forbids it.

## Token list signing

The wallet's default tokens come from `https://tokens.nulo.sh/v1/list.json`, an Ed25519-signed list (format: `infra/token-list/FORMAT.md`). A wallet accepts a list only when its signature verifies against a key pinned in `packages/token-list/src/keys.ts`, its sequence is above the last list it accepted, and it is at or above the floor its release compiles; DNS, Cloudflare, the deploy and the host are not trusted.

- **The signer is the asset.** A forged list can seed a real standard Token deployed with the attacker's supply, named "USDC" and priced as `usd-coin`. What bounds it: an entry must run a Token class the wallet bundles; its price id must be in the compiled table, under that id's sanity band; at most 16 entries per chain; the wallet names an entry as known only after the seeder verified its class, symbol and decimals on chain; a list carries no endpoint, chain, fee payer or code. Delisting stops seeding but keeps rows a user already has, by owner decision, so rows a sequence of forged lists seeded stay until each user deletes them. A forged list can also flag a real token as a scam. The approver's digest covers the tokens and the flags, so `sign` refuses a flag set the approver was not shown.
- **Custody.** Both keys are 32-byte seeds generated by 1Password in `Keyed-Runs/Nulo-TokenList` and installed by a keyed run (`infra/token-list/keys.env.example`): the CI seed becomes the `token-list` environment secret over stdin, and only public keys are printed. `nulo-recovery-1` never leaves 1Password. No agent and no file holds either. Keeping the CI key in an environment secret is an owner decision (2026-10-13) that bends the keyed-run rule.
- **Signer code.** The `token-list` environment (owner reviewer, branch `dev`) approves a run, not its code, and `dev` needs no approving review, so a merged change to the workflow or the signer runs on the next approval. `publish-token-list.yml`'s `prepare` job shows, before that approval, a summary of the signing-relevant changes since the parent of the commit that first carried the list before the served one (a squash-merged publish's parent is the trunk at merge time, not the commit its run signed; a commit that restores or re-touches envelope bytes moves nothing; a first publish shows every such commit, and a shallow clone is refused). The summary is produced by the candidate revision and is informational only; GitHub's compare view of the range is the authoritative review. The tree check holds the envelope to the signer's exact key order; `sign` installs nothing, runs `bun --no-install` over a signer whose import closure `packages/token-list/src/import-closure.test.ts` pins, and holds the secret in one step; `scripts/ci-cd/release-integrity.test.ts` counts any job that reads a custom secret as credentialed and pins it, and `behavior-gating.test.ts` pins the command. The trust root is the owner's GitHub account and that approval, as for the store-publish environments.
- **Rotation.** Delete the `TOKEN_LIST_SIGNING_KEY` secret; sign the current source with the recovery key as a keyed run (`infra/token-list/recovery.env.example`) and publish it; install a new CI key; release the wallet with the leaked key removed from `keys.ts`. A stored list signed by a key no longer pinned is discarded at the next start, so a forged maximum sequence cannot freeze updates after that release. **Until the release, the leaked key verifies.**
- **Rollback and freeze.** Sequences are the signing time in seconds, so two signings never share one. Each release compiles a floor, `packages/token-list/src/floor.json`: the sequence of the last list that delisted or flagged a token against the served list or against a list at a publish PR or branch head signed since the floor, so such a list, signed but never served, is retired as a served one would be. A wallet refuses any list below it, fetched or stored, so on a release built after a delisting or a flag no older list restores the token or drops the flag. Accepted limits: a host that serves the last good list forever withholds corrections; a release built before a delisting or a flag does not know its floor; and the floor moves only for delistings and flags (owner decision, 2026-10-15), so a fresh install served an older list at or above the floor can still get an entry's earlier fields (a `priceId`), a flag removed since, or a list without a token added since; and a list signed by a publish run that stopped before its publish branch had a commit is read by no floor decision (#1001).
- **The floor's writer.** `publish-pr`'s App token writes `floor.json` beside the envelope when the list delists or flags against one of those lists, or one of them cannot be read, and the owner merges that PR; every build enforces the file. The tree check refuses a floor below 1 or above the committed list's sequence, so a floor can never refuse the served list; lowering it only weakens it, and is a reviewed source change, like an edit to `keys.ts`. A recovery-key publish skips `publish-pr` and sets the floor by hand (`infra/token-list/README.md`).

## Binary dependencies

`presto-server` (Linux x86_64 binary from
[`alejoamiras/presto`](https://github.com/alejoamiras/presto))
is installed on every CI runner that executes a prover-ON network-e2e lane, via
the [`setup-presto-server`](./.github/actions/setup-presto-server/action.yml)
composite action. Trust posture:

- **Version + two SHA-256 pins in repo.** The composite action requires
  callers to pass `expected_tarball_sha256` (the release tarball, checked
  before anything is extracted) AND `expected_sha256` (the EXTRACTED
  `presto-server` binary, re-checked on every run, cache hits included,
  because `actions/cache` restores the binary, not the tarball). The
  workflow ([`_extension-network-e2e.yml`](./.github/workflows/_extension-network-e2e.yml))
  pins both as literals. Bumping the version requires updating all three
  fields together in the same PR. Reviewers MUST treat any change to the
  binary URL, version, or either hash as security-relevant.
- **The archive is inspected before extraction.** It must hold exactly one
  member, a regular file named `presto-server` — a link, a duplicate or an
  extra entry fails the step — and only that member is extracted. On a
  cache hit the restored directory must hold exactly that one regular file
  before it is hashed, made executable or put on PATH.
- **The upstream `.sha256` sidecar is a transfer-integrity check, not a
  security boundary.** A release-origin compromise would replace the
  tarball AND the sidecar together. The two repo pins are pins established
  once from the release assets — they are not independent provenance.
- **Bump procedure**:
  1. Download the release tarball and compute both hashes:
     ```bash
     VER=<VER>
     curl -sSfLO "https://github.com/alejoamiras/presto/releases/download/presto-v${VER}/presto-server-${VER}-linux-x86_64.tar.gz"
     sha256sum "presto-server-${VER}-linux-x86_64.tar.gz"            # expected_tarball_sha256
     tar -tvf "presto-server-${VER}-linux-x86_64.tar.gz"             # exactly one regular member: presto-server
     tar -xzf "presto-server-${VER}-linux-x86_64.tar.gz" presto-server && sha256sum presto-server   # expected_sha256
     ```
  2. Update `version`, `expected_tarball_sha256` AND `expected_sha256` in
     `_extension-network-e2e.yml`'s `setup-presto-server` step in one commit.
  3. CI re-verifies on EVERY install (cache-miss + cache-hit); a mismatch
     is loud (workflow goes red).
- **Single-maintainer trust model.** `alejoamiras/presto` is a
  single-maintainer repo. The maintainer is the same person who owns
  Nulo, so the trust model is what it is. Defense: pinning + per-bump
  PR review.

The Aztec toolchain (the `aztec` CLI and its npm tree, Foundry's `forge`,
`cast`, `anvil` and `chisel`, noir's `nargo`) is installed on every runner
that boots a local network by
[`setup-aztec`](./.github/actions/setup-aztec/action.yml)'s `install.sh`,
which the local Docker runner (`docker-ci-like.sh`) runs too:

- **Every download is SHA-256-pinned** in `installer-pins.sha256` and checked
  before use: the per-version installer and its `versions` manifest, and the
  noir and Foundry release tarballs that manifest names. The Foundry tarball
  must hold exactly its four tools, as regular files. Its pin equals the
  release asset's GitHub digest, and the binaries match Foundry's
  build-provenance attestation, checked once at pin time (the pin file's
  header names the signer); CI does not re-check the attestation.
- **The installer runs from the verified file with two steps replaced.** Its
  Foundry step (`foundryup` from `foundry.paradigm.xyz`) becomes a copy of
  the verified binaries, and its lockfile-less `npm install` becomes
  `npm ci --ignore-scripts` against the committed `cli/package-lock.json`,
  every entry of which is a registry tarball with a sha512
  (`scripts/ci-cd/setup-aztec-pins.test.ts`). An installer whose shape no
  longer fits the replacement fails the install.
- **One install script runs**: `bcrypto`'s, which `@aztec-labs/aztec-node`
  needs to load. It compiles the package's bundled C sources against the
  running Node's headers, with no header download.
- **What stays trusted**: the npm registry when the lockfile is generated
  (`lock.sh`, under the 7-day gate with the Aztec scopes exempt; each Aztec
  bump's lockfile diff is reviewed), Aztec's install host and the noir and
  Foundry release pipelines when they are pinned, Node from
  `actions/setup-node`, and a restored toolchain cache, checked only by
  `--version` probes. A run restores caches written on its own ref or on
  `dev`, the default branch; a pull request also restores its base branch's
  and writes only its own, so poisoning what `dev` or `main` restores takes
  code merged to one of them.

The Docker runner's own Bun and Node come only from the x64 archives
`apps/extension/scripts/e2e/docker-ci-like.pins.sha256` pins, each checked
before extraction and put first on `PATH`; a Bun bump that leaves that pin
behind fails `scripts/ci-cd/docker-ci-like-pins.test.ts`.

`geckodriver` (Linux x86_64, from
[`mozilla/geckodriver`](https://github.com/mozilla/geckodriver) releases) is
installed on every CI runner that executes a Firefox e2e lane, via the
[`setup-geckodriver`](./.github/actions/setup-geckodriver/action.yml)
composite action, under the same posture: a tarball SHA-256 checked before
extraction, a single-regular-member archive rule, and the extracted binary's
SHA-256 re-checked on every run, cache hits included. Its three pins (version
+ two hashes) live in the action itself rather than in each caller, because
both reusable e2e workflows install it and one bump must reach each; the bump
commands are in the action's description. Mozilla publishes a detached `.asc`
signature rather than a checksum sidecar, and the lanes do not verify it, so
the pins are the integrity check. Firefox itself is
not pinned by hash: the lanes run the e2e suite's pinned revision, apart
from `puppeteer`'s (`apps/extension/scripts/e2e/install-firefox.ts`),
fetched over HTTPS from
Mozilla's archive — the same trust as the Chrome that `puppeteer` downloads
for the required lanes — and the suite refuses to launch below the
manifest's `strict_min_version`.

geckodriver runs with `--allow-system-access`, without which Firefox refuses
remote navigation to `moz-extension://` pages. That flag lets the automation
session reach privileged browser contexts, so the Firefox e2e suite assumes
**trusted co-tenants**: a single-user development host or a single-tenant CI
runner. geckodriver listens on loopback ports the run reserves; any local
process that can reach them can drive that browser. Do not run the suite on
a shared multi-user machine.

**Distribution scope.** We download + execute the binary on ephemeral CI
runners only. We do NOT vendor it into the repo, ship it with the
extension, or expose it on a public network. The binary writes to
`~/.presto/versions/` on the runner (transient — destroyed with the VM)
and listens on `127.0.0.1:59833` only.

**Origin authorization.** presto-server is deny-by-default: with
`ALLOWED_ORIGINS` unset it denies every non-localhost browser origin
(localhost stays auto-approved on the headless build). Our offscreen prover
calls from `chrome-extension://<id>`, whose unpacked-extension id isn't
known until Chrome loads it, so the start step sets `PRESTO_ALLOW_ALL=1` on
the server process only (mutually exclusive with `ALLOWED_ORIGINS`). Safe in
our threat model because (a) CI runners are single-tenant and ephemeral, (b)
`pull_request` workflows from forks do not receive repo secrets, (c) the
server is loopback-only (`127.0.0.1:59833`) and the only call traffic
originates from the wallet we built. It is never set on a self-hosted runner
or at job level.

**Production transport.** The wallet talks to the Presto desktop app over
HTTPS only (`httpsOnly: true` is passed explicitly; plaintext is derived from
the CI proving mode inside the factory and the production build guard greps
the required-mode stamp out). That is a **bounded** guarantee: HTTPS-only
defeats a local process squatting the Presto ports without a
browser-trusted certificate for `127.0.0.1` — TLS fails, the SDK falls back
to WASM, no witness leaves the browser, and the witness-free HTTP diagnostic
never POSTs. It does **not** authenticate the Presto application: the
browser trusts any certificate its store trusts (no CA pinning), and Presto
persists its leaf TLS key on disk in an owner-only directory (the CA key
stays in memory), so same-user malware that can read that key, or a
compromised trust store, can impersonate the server. Those are residual
risks of the loopback-prover model, not solved here. The wallet never offers
Presto's session-only HTTP downgrade to users;
`apps/extension/src/presto/presto-policy.test.ts` drives the real client
and pins that a production configuration never issues an HTTP `/prove`.

**License posture.** The `@alejoamiras/presto` npm packages the extension
bundles are MIT at the pinned versions (relicensed from AGPL-3.0-only;
`apps/extension/src/presto/presto-licence.test.ts` fails if a pin drifts
back, and the third-party notices build refuses AGPL outright). The
`presto-server` binary is a separate artifact that CI invokes as a
build/test tool and never distributes: check its own release for the
licence that applies to it before shipping it anywhere. This is not legal
advice.
