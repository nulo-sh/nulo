# Store listing — one source for both stores

What each dashboard field is filled with. `scripts/store-listing.test.ts` holds this file to the
built manifests (every permission has a justification heading), to `legal/privacy.md` § 6 (the policy
and the listing name the same permissions), to the stores' length caps, and to the Firefox build's
data-collection declaration. Edit here, then copy into the dashboards; never the other way round.
The long description keeps one line per paragraph and per bullet, because both dashboards keep
newlines.

## Shared

### Single purpose

Nulo's single purpose is to act as a self-custody wallet for the Aztec network: it holds the user's
keys on the device, shows balances and activity, sends transactions, and lets web applications the
user approves interact with those accounts. (The full statement: `legal/privacy.md` § Appendix.)

### Long description

Nothing to see. Everything to own.

Nulo is a self-custody wallet for Aztec, where your balance and payments are private unless you decide otherwise.

PRIVATE BY DEFAULT
• Send privately or publicly. Before you confirm, Nulo shows what stays hidden.
• History labels every payment private or public.
• Proofs are made on your machine: in the browser, or faster with the optional Presto prover.

YOURS ALONE
• Your keys stay on your device, behind your password or passkey.
• No account, no telemetry.
• Back up your profile whenever you want.

APPS HAVE TO ASK
• An app gets no account until you connect it and pick one.
• Every transaction it proposes waits for your yes.
• Settings → Connected Apps lists every permission and lets you take it back.

Open source, Apache-2.0: https://github.com/nulo-sh/nulo

### Data inventory

One row per kind of data the extension handles. "Leaves the device" names every destination; a
destination the user chooses (the node) or installs (the local prover) is still a destination.

| Data | Where it lives | Leaves the device | Destination |
|---|---|---|---|
| Recovery entropy, master secret, signing keys | Extension local storage, encrypted | Only when the user exports a backup file, or an account file (one account's signing key) | The file the user saves (`downloads`) |
| Passkey credential id and the random value it is used with | Extension local storage | Only to the browser and the user's authenticator, during a passkey prompt; never in a backup or an account file | The browser and the user's authenticator |
| Passkey label ("Nulo wallet · \<profile name\>") | Handed to WebAuthn at creation, `wallet/utils/passkey-ceremony.ts:40-44` | Yes | The browser and the user's authenticator; the authenticator's provider may sync it (`legal/privacy.md` § 5.4) |
| Account addresses | Extension local storage, encrypted | Yes | The configured Aztec node (queries name the address); approved applications; the files the user exports |
| Balances, transactions, proofs | Extension local storage; private state in the browser's OPFS, encrypted | Yes | The configured Aztec node; approved applications for what the user confirms; a backup file the user exports (balances and transactions) |
| Proving inputs (witnesses) | Process memory | Only with the optional local prover installed | `127.0.0.1` (`legal/privacy.md` § 5.8) |
| Public proving parameters | Browser cache | Downloaded, never uploaded | `crs.aztec-cdn.foundation`, fallback `crs.aztec-labs.com` (§ 5.9) |
| Token prices | Extension local storage (cache) | A request naming the tokens, no address | CoinGecko, unless fiat display is off (§ 5.2) |
| Token list (default tokens, their price ids) | Extension local storage, device-wide, outside every backup | Downloaded, never uploaded; the request carries no address, cookie or referrer | `tokens.nulo.sh`, once the Terms are accepted, then about daily (§ 5.11) |
| Contacts (name, address), profile names | Extension local storage, `wallet/services/contact/spec.ts:11-19` | Only when the user exports contacts, a backup file or an account file, whose file name carries the profile name, and, for a passkey profile, in its passkey label (the row above) | The file the user saves (`downloads`) |
| Connected-app origins, names, icons, URLs, grants | Extension local storage, `wallet/services/dapp-session/spec.ts:47-70` | Only an app's name, which each transaction it sent records, in a backup file the user exports; app names and origins can also appear in diagnostic logs the user exports | The file the user saves (`downloads`) |
| Diagnostic logs | Memory; session storage with Developer Mode on | Only when the user exports them | The file the user saves |
| Terms-acceptance record | Extension local storage | No | — |

### Permissions

One heading per manifest entry (`manifest/manifest.config.ts`; Firefox drops `offscreen` and
`sidePanel`). The sentence under each is the dashboard justification.

#### `storage`

Keeps profiles, accounts, contacts, settings and granted app permissions on the device, encrypted
under each profile's key except profile names, settings and a few display preferences. The wallet
has no server; this is its only persistent store.

#### `unlimitedStorage`

Private execution state (notes, proving state, synced chain data) lives in the browser's origin
private file system and grows with use; the default quota would evict it.

#### `alarms`

Schedules four jobs: the token-price refresh while the wallet is unlocked and fiat display is on,
the token list's daily refresh once the Terms are accepted, the session auto-lock timer, and the
activity journal's upkeep, which settles operations left in flight and prunes old records
(`wallet/index.ts:99-102`, `wallet/services/token-list/service.ts:143-146`,
`wallet/services/profile/session-manager.ts:200`, `wallet/runtime.ts:694`, `:711`).

#### `offscreen`

Chrome only. Runs the private execution environment (the Aztec PXE, WASM-heavy) in a hidden
extension document, because a service worker cannot host it (`wallet/utils/offscreen.ts:258-277`).
Firefox hosts the same page as a frame of the background page and does not declare it.

#### `sidePanel`

Chrome only. Lets the user open the wallet in the browser's side panel instead of the popup
(`popup/app.vue:122`). Every call is feature-gated; Firefox does not declare it.

#### `downloads`

Saves backups, account exports, contacts and diagnostic logs when the user asks for an export
(`utils/files.ts:71`). Nothing is downloaded without a click.

#### Host `https://passkey.nulo.sh/`

The WebAuthn relying-party domain for passkey profiles: an extension page must be allowed to call
WebAuthn under that RP id (`legal/privacy.md` § 5.4). The host serves no content and the content
script is excluded from it.

#### Host `https://127.0.0.1/*`

The optional local proving application answers on loopback over HTTPS; proving inputs go there and
nowhere else (`legal/privacy.md` § 5.8).

#### Host `http://127.0.0.1/*`

The same application's witness-free health check, plain HTTP. Holding both schemes keeps extension
pages out of Chrome's local-network-access prompt.

#### A script on web pages (content script, `*://*/*`)

Relays wallet-discovery and connection messages between a page and the extension so an application
can find and connect to the wallet (`legal/privacy.md` § 5.7). It reads no page content and injects
no page script; it is excluded from the passkey host.

### Data handling

See the Data inventory above and `legal/privacy.md` § Appendix. Sold: no. Used for purposes
unrelated to the wallet: no. Used for creditworthiness or lending: no.

## Chrome Web Store

| Field | Value |
|---|---|
| Title | Nulo V6 |
| Summary | A wallet for Aztec: your balance and payments stay private unless you decide otherwise. Your keys stay on your device. |
| Category | Tools |
| Language | English |
| Privacy policy URL | https://nulo.sh/privacy |
| Support URL | Empty: the field takes URLs only and rejects `mailto:`. The publisher's verified contact email, `hello@nulo.sh`, is shown instead |
| Homepage | https://nulo.sh |
| Visibility (first upload) | Unlisted |

The Title and Summary are the built manifest's `name` and `description` (`package.json`
`displayName` and `description`); the store shows the manifest values, so the dashboard fields must
match them.

### Privacy tab

- **Single purpose:** the statement above.
- **Permission justifications:** the sentences above, one per permission.
- **Remote code:** *No, I am not using remote code.* Justification: "The package bundles all of its
  code. Applications send contract artifacts as data; a bundled WASM virtual machine interprets them
  under a `script-src 'self' 'wasm-unsafe-eval'` policy, with no `eval`, no script injection and no
  fetched code. Details: `store/remote-code.md` in the repository."
- **Data usage** (ticked; Google requires disclosure even for data processed or stored locally):
  - *Financial and payment information* — balances, transactions.
  - *Authentication information* — passwords and keys (local, encrypted); the passkey label handed
    to the authenticator.
  - *Personally identifiable information* — contact names and addresses, profile names (local); the
    passkey's name, which carries the profile's name and which the user's password
    manager may sync.
  - *Web history* — the origins and URLs of connected applications (local only).
- **Certifications:** all three — not sold to third parties; not used or transferred for purposes
  unrelated to the item's single purpose; not used or transferred to determine creditworthiness or
  for lending purposes.

## Firefox Add-ons

| Field | Value |
|---|---|
| Name | Nulo V6 |
| Summary | A wallet for Aztec: your balance and payments stay private unless you decide otherwise. Your keys stay on your device. |
| Categories | Privacy & Security (AMO's "Other" is "My add-on doesn't fit into any of the categories", exclusive of the rest) |
| License | Apache-2.0 |
| Support email | hello@nulo.sh |
| Support website | Empty |
| Homepage | https://nulo.sh — not on the submission form; set afterwards under Edit Product Page → Additional Details |
| Privacy policy | The text of `legal/privacy.md` at its current version, as published at https://nulo.sh/privacy, pasted as § Privacy policy text says |
| Channel | Listed |

### Release notes

The version's "Release notes" field, which Chrome's dashboard does not have. It covers the span
since the last version the store listed, not since the last tag: for 1.1.0 that is 0.31.0.0, so it
names the 1.0.0 changes too, led by the one an existing user must act on.

```
The first stable Nulo V6, on Aztec's Alpha V6.

• Alpha V6, Aztec's main network, is now the default; Testnet stays beside it. Testnet was reset with Aztec 6.0.0, so a profile from an earlier version is offered a Testnet reset when it opens.
• Passkey profiles keep a recovery phrase their passkey unlocks. A passkey profile made with an earlier version needs to be set up again. After a phrase import or a backup restore you choose how to unlock.
• Everything the wallet stores is encrypted under each profile's key: accounts, contacts, tokens, balances, activity, app sessions and networks.
• Updated Terms and Privacy Policy, shown once for acceptance.
• App windows read a multi-call transaction as rows, show what a grant reaches, and ask again when a fee rises above the approved figure.
• Default tokens come from a signed list; a token off the list is flagged with a warning.
• On Firefox, passkey steps run in a sidebar and Presto's loopback permission is asked in place.
• Redrawn icons, a shield and a globe for private and public, settings search, and every page fits a 240 px window.
• Over a hundred fixes across send, backup, connect, import and the activity view.
```

### Privacy policy text

AMO's privacy field renders Markdown but deletes headings, so the policy goes in with each heading
turned into a bold line. Build it from the release tag that carries the new version:

```
git show vX.Y.Z:legal/privacy.md | tail -n +3 \
  | sed -E -e 's#]\(terms\.md\)#](https://nulo.sh/terms)#g' -e 's/^#{2,3} (.*)$/**\1**/'
```

That drops the `# Privacy Policy` title, makes the `terms.md` links absolute, and keeps every word.
The box is under Manage Authors & License, in the same form as the authors and the license. To
check the result, read `https://addons.mozilla.org/api/v5/addons/addon/3077967/eula_policy/` with
a cache-busting query, because that endpoint is cached for six minutes.

### Data collection declaration

`browser_specific_settings.gecko.data_collection_permissions.required` in the Firefox build:

```
financialAndPaymentInfo
```

The value here must equal the manifest's; the test enforces it. Firefox's taxonomy is about what is
**transmitted**, so the other categories were assessed against outbound flows and left out:
`authenticationInfo` (passwords and keys never leave the device), `browsingActivity` /
`websiteActivity` / `websiteContent` (connected-app origins are stored locally and sent nowhere),
`personallyIdentifyingInfo` (contacts stay local; a passkey profile's name is part of its passkey
label (§ 5.4)). One reading is contestable and is stated in `legal/privacy.md` § 5.4: for passkey
profiles the label "Nulo wallet · \<profile name\>" and a random
identifier are handed to the browser's passkey interface (`wallet/services/passkey/spec.ts:78-79`,
`wallet/utils/passkey-ceremony.ts:40-44`); the declaration treats that as the browser acting at the
user's request, not the add-on sending data to a party of its choosing. Chrome's form covers local handling as well and so ticks more boxes; the
two differ by design.

### Reviewer notes

The block between the two markers is sent as `approval_notes` with every version.

<!-- reviewer-notes:start -->
Testing without funds: install, choose "Create profile", set a password. The wallet opens on Aztec
Alpha with a zero balance. The Alpha V6 upgrade is executable on L1 from 2026-10-26; until it runs,
the wallet shows Alpha as unavailable. To try a send with sponsored fees, switch to the Aztec
testnet under Networks. Every screen is reachable without a transaction.

Build: the add-on is bundled (Vite). Source is attached to this version as a `git archive` of the
tagged commit. `apps/extension/store/SOURCE-BUILD.md` inside it names the exact Bun version and the
one script to run; the output must match `dist/firefox` byte for byte.

Modifications to third-party code, stated exactly:
- `patches/`: in `@aztec-foundation/noir-noirc_abi` and `@aztec-foundation/noir-acvm_js` (6.0.0)
  the `package.json` `module` entry is replaced with an `exports` map so bundlers pick the web build
  (no JavaScript or WASM changes); in `@aztec-labs/pxe` (6.0.0), one `return` in `dest/pxe.js`
  `registerAccount` becomes a comment.
- `detect-node` is aliased to a module that exports `false` (`apps/extension/vite.config.ts:56-60`)
  so `@aztec-labs/foundation`'s logger uses its browser transport.
- `function-bind` is aliased to a stub that delegates to the native `Function.prototype.bind`
  (`vite.config.ts:63-78`); the upstream package builds a function from a string, which the
  extension's CSP forbids.
- `@aztec-foundation/bb.js`'s browser `fetch_code` module is replaced at build time by a shim that
  `fetch()`es the bundled WASM asset (`apps/extension/scripts/bb-fetch-code-shim.ts`,
  `apps/extension/src/shims/bb-fetch-code.ts`), and the build fails if the upstream loader survives;
  upstream uses a dynamic `import()` that MV3 service workers forbid.
- The bundled contract artifacts (`apps/extension/vite.shared.ts:69-72`) have their `debug_symbols`
  and `file_map` blanked (`vite.config.ts:94`, `scripts/strip-artifact-debug-info.ts`); this removes
  the embedded Noir sources and changes no bytecode.

Linter warnings and their origin: `innerHTML` is assigned by Vue's runtime (`insertStaticContent`).
`Function` and `eval` appear in zod's eval-capability probe, msgpackr's record decoder and
get-intrinsic's constructor probe, each inside try/catch with a non-evaluating fallback, and in
get-intrinsic's intrinsics table, which references `eval` without calling it; the extension CSP forbids
evaluating strings, so none of them evaluates one. `UNSUPPORTED_API` is `chrome.offscreen` and
`chrome.sidePanel`, both feature-gated and never called on Firefox.

Remote code: the package loads no code from the network. Applications send contract artifacts
(ACIR and Brillig bytecode with an ABI) as data over the wallet-sdk channel; a bundled WASM virtual
machine interprets them and can reach nothing outside the wallet's own oracle callbacks. The token
list from tokens.nulo.sh is signed data, verified before use. Full account:
`apps/extension/store/remote-code.md`.
<!-- reviewer-notes:end -->
