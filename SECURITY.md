# Security

This document captures security-relevant design decisions for the Nulo wallet
extension. It is written for engineers working on the codebase; if you are a
security researcher, see the reporting section below.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
<https://github.com/nulo-sh/nulo/security/advisories/new>. Do not file public
issues for security bugs.

## Crypto-bound invariants (never change without a migration)

These values are cryptographically bound. Changing any of them invalidates
existing keys and profiles.

- **KDF domain separator labels**
  - `nulo:profile:v1` — WebAuthn PRF input label
    (`src/wallet/services/passkey/spec.ts:PASSKEY_PRF_LABEL`)
  - `nulo:kdf:v1` — HKDF salt label
    (`src/wallet/services/passkey/credential.ts:PASSKEY_KDF_LABEL`)
  - `nulo:master:v1` — HKDF info label
    (`src/wallet/services/passkey/credential.ts:PASSKEY_MASTER_LABEL`)
- **`AccountType.Nulo_v1 = 0`** — embedded in the Poseidon hash used to derive
  account secrets from the master secret. The numeric value is part of the
  hash input; renaming the enum is fine, but reassigning the numeric value
  is not (`src/wallet/services/account/spec.ts`).
- **AES-GCM ciphertext format** — `[1 version byte][12 byte IV][ciphertext]`
  stored base64 in `profile.secret` and `profile.guard`
  (`src/wallet/services/profile/encryption/encryption-key.ts`).
- **Passkey RP ID** — `passkey.nulo.sh`, used at credential creation AND at
  WebAuthn `get` (both literals must match — they're the same crypto
  binding). Changing it invalidates every existing passkey credential.
  The host is deliberately content-less: WebAuthn lets every origin whose
  registrable domain suffix-matches the RP ID assert with the credential
  and evaluate its PRF, which is how the wallet master is derived — so the
  RP host serves one static page with a strict CSP and no scripts, never
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
  off.
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
- **The Schnorr account artifact** — vendored byte-exact at
  `packages/aztec-runtime/src/account/artifacts/SchnorrAccount.json` and pinned by digest +
  class id, precisely so that bumping `@aztec-labs/accounts` (which rebuilds its own copy on any
  toolchain change) cannot move a derived address. Editing those bytes rotates the address
  regime and ships only as a new extension major.

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

This matches passkey profile behavior (which always requires fresh auth on
SW death — see below): in strict mode both profile types behave the same way
on SW death.

**Opt-out: lenient mode** — Settings → Security → "Strict security mode" →
toggle OFF (with a confirm dialog). A password-profile session opened from
then on also persists a silent-restore bearer (`SessionSecretBox`,
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
anyone who can read browser data can unlock the wallet without the password.

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
  by a failed storage write (logged, not retried) or by a toggle that lands
  while a restarting worker is restoring the session. A bearer left behind
  stays readable until the session record is rewritten without it or deleted,
  or the browser exits, and `restore()` refuses it while strict mode is on.
- **Toggle OFF mid-session**: no immediate effect. The next password-profile
  session open writes the bearer: an unlock, a profile creation or import, or
  a password change on the active profile.
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

Passkey profiles **do not persist any session material**. When the service
worker restarts, the user must re-perform WebAuthn PRF to re-derive the
master secret. WebAuthn PRF requires a user gesture (passkey tap), which is
impossible to satisfy silently — this is a hard API constraint, not a policy
choice.

**Passkey symmetry**: under strict-mode-ON (default), password profiles
follow the same pattern. Under strict-mode-OFF the asymmetry returns and is
documented above.

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

The script's loader imports its chunks from the extension, so the build lists
them as web-accessible to every page the script matches: a page that knows a
release's chunk names can fetch one and so detect the install on Chrome
(Firefox serves extension files from a random per-install origin). Chrome's
`use_dynamic_url` does not close this, because the chunks import each other
by relative URL and Chrome resolves those against the fixed origin, which it
then refuses. Closing it needs a content script built as one file that no
web-accessible entry has to expose.

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

## Authorization enforcement

Two layers:

1. **Capability type** (`src/wallet/services/wallet-sdk/capability-map.ts`)
   — maps each wallet-sdk method to the capability type it requires
   (`accounts`, `transaction`, `simulation`, `data`, `contracts`,
   `contractClasses`).
2. **Per-operation scope** (`src/wallet/services/wallet-sdk/scope-enforcement.ts`)
   — validates that the specific contract/function targeted by an operation
   falls within the scope granted.

`createAuthWit` validates both the `from` account and, when the request
carries a `CallIntent`, the target call itself against transaction or
simulation scope. When it carries an `IntentInnerHash`, the `consumer`
contract is validated at wildcard function. Raw message hashes cannot be
validated beyond the account check (no semantic info).

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
- **Chain-id verification is mandatory at adoption.** `addEndpoint` /
  `updateEndpoint` probe the candidate URL via
  `AztecNode.getNodeInfo()` and reject when `l1ChainId` (or the chain
  identifier carried in the response) doesn't match the parent
  `Network.chainId`. Errors surface as `EndpointChainMismatchError`
  inline in the popup.
- **Duplicate-URL guard per Network.** Adding the same `rpcUrl` twice to
  the same `Network` is rejected (`DuplicateEndpointError`).
- **Per-URL `AztecNode` cache** with 3-strike eviction: each unique URL
  gets its own client; transient failures don't poison neighbours;
  consecutive failures evict.

### Pending-tx polling pin

Once a transaction is submitted, the receipt poller is **pinned to the URL
the tx was sent on** (`Tx.submittedEndpointUrl`). Even if the user swaps the
chain's primary endpoint mid-flight, the poll keeps targeting the original
URL via `getNodeForUrl`. This avoids:

- a freshly-promoted endpoint reporting "tx not found" because it hasn't
  seen the bundle yet, and
- a malicious endpoint shadowing receipts for txs it never received.

Failover happens only after the original URL trips the 3-strike eviction.

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
- Inject arbitrary data into PXE state — every input is bound to a chain
  via the `chainId` check at adoption + reverification on `setPrimaryEndpoint`.
- Read decrypted master secrets or session records (none of these cross
  the wire).
- Trigger storage writes outside the network/endpoint surface.

## Storage privacy

Encrypted at rest:
- `profile.secret` — master secret (AES-GCM)
- `profile.guard` — password verification sentinel (AES-GCM)

Plaintext at rest (`chrome.storage.local`):
- Profile metadata, networks, accounts, contacts, dApp sessions, tokens,
  token balances, tx history, auth registry state, FPC definitions,
  config, storage version.

Expanding the encrypted boundary to cover profile-scoped metadata (contacts,
dApp sessions, tx history) is not done: a large refactor, not a near-term
patch.

### External price feed (CoinGecko)

While a profile session is unlocked (and `showFiatValues` is on — the default,
toggleable in Settings → Appearance), the wallet fetches USD quotes from
CoinGecko's keyless public API every ~3 minutes. Privacy posture:

- The request is ONE batched query for a FIXED id set compiled into the build
  (`price-map.ts`) — it never varies with the user's holdings, accounts, or
  activity, so nothing user-specific is inferable from the query string.
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

**Dependabot** updates the GitHub Actions that the workflows and composite
actions use: one grouped pull request a week, after a 7-day cooldown
(`.github/dependabot.yml`). It cannot read Bun's lockfile, so npm
dependencies are updated by hand, under the age gate above.

**`bun audit`** runs as an advisory step in `_lint-and-typecheck.yml`. It
surfaces npm advisories in the GitHub Action step summary but does not
block PRs (today). Bun 1.4 exits 1 on findings (1.3.x always exited 0),
so exit-code gating is mechanically possible — the step stays advisory
deliberately: the existing backlog (every HIGH chain classified as
dev/build/test tooling or the exact-pinned `@aztec` line, none
extension-bundle-reachable; the moderate and low ones not individually
classified) must be triaged to zero first, or a blocking flip is pure noise.

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
- **Tags.** `auto-unstick` is the only workflow that creates a stable tag, through the REST API with its own App token, and only at the merge commit of the Release PR the run was triggered by; release-please runs with `skip-github-release: true`. A tag ruleset (`release tags: no deletion or update`, no bypass actor) stops anyone from deleting or moving a `v*` tag; it does not stop an admin, who can disable it, or a stolen owner credential. A second ruleset limiting who may create a stable or rc tag (the release App and the owner) is planned but not yet applied.
- **Immutable releases** are planned but not yet applied. Once on, a published release's assets and tag can no longer change, and each release gets a GitHub release attestation, checked with `gh release verify vX.Y.Z --repo nulo-sh/nulo`; no release carries one yet. Titles and notes stay editable, which is why the check is the attestation and not the notes.
- **The jobs that tag or publish** install no dependency, check out the workflow's own revision without persisted credentials, set `GH_TOKEN` per step and run no third-party action but `oven-sh/setup-bun`, which gets no token; git-cliff, whose action downloads its binary at run time, runs in read-only notes jobs. Every App token names its permission set, so a permission later granted to the App reaches no token. `scripts/ci-cd/release-integrity.test.ts` pins all of it. Accepted residuals: a compromised `oven-sh/setup-bun`; `GITHUB_TOKEN` keeps `contents: write` in the two publish jobs; and a release published before this path stays mutable, and a dispatch with such a tag as `--ref` runs that tag's old workflow, which replaces assets. Only accounts with write access can dispatch, and the runbook forbids it.

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
  `--version` probes. GitHub scopes caches by ref: the one a run on `dev` or
  `main` restores can only have been written by a run on that branch, and a
  pull request's own cache serves only that pull request's runs.

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
not pinned by hash: the lanes run the revision the locked `puppeteer` pins
(`bun x puppeteer browsers install firefox`), fetched over HTTPS from
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
