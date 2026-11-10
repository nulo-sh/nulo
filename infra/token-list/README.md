# @nulo/token-list-host

The static host behind `tokens.nulo.sh`, which serves the signed token list every Nulo wallet fetches,
and the tooling that publishes it. The format is [`FORMAT.md`](./FORMAT.md); the signer and the
verifier are [`@nulo/token-list`](../../packages/token-list/README.md).

## Files

| File | Purpose |
|---|---|
| `list.source.json` | The tokens and, once there is one, the `flagged` pairs; nothing else. Edit this in a PR; the sequence is assigned at signing. |
| `public/v1/list.json` | The signed envelope. Written only by the publish PR; absent until the first publish. |
| `public/_headers` | The response policy (CORS `*`, `max-age=300`, `nosniff`, CSP `default-src 'none'`, HSTS, `no-referrer`). Parsed by wrangler, never served. |
| `wrangler.jsonc` | Static assets only, `workers_dev` and preview URLs off, observability off. |
| `keys.env.example` | Keyed-run template for the key ceremony. |
| `scripts/check.ts` | The tree invariants (`bun run check`), the picture rule of § Pictures included; `test/tree.test.ts` asserts them. |
| `scripts/summary.ts` | The `prepare` job's review summary and its tokens, flags and price feeds digest. |
| `scripts/live-check.ts` | The `prepare` job's advisory live check: each entry's instance, class, symbol and decimals as a public node holds them. |
| `scripts/price-check.ts` | The `prepare` job's advisory price feed check: whether CoinGecko's quote for each feed sits inside its band. |
| `scripts/open-publish-pr.ts` | The `publish-pr` job: branch, commit, PR, close older publish PRs. |
| `scripts/floor.ts` | When a list raises the compiled floor (`packages/token-list/src/floor.json`), and that file's canonical form. |

## Invariants

- **The wallet trusts the signature and the sequence, never the host.** DNS, Cloudflare, a deploy or a
  bad commit can serve anything; a wallet accepts only a list signed by a pinned key, with a sequence
  above the last it accepted and at or above the floor its release compiles.
- **A delisting or a flag raises the floor.** The publish PR of a list that drops a served token or
  flags a new pair also sets `packages/token-list/src/floor.json` to its sequence, so every release
  built after it refuses an older list. That file is under the extension e2e lanes' path filters,
  so such a PR runs them. The tree tests refuse a floor below 1 or above the committed list. A list
  at the head of a publish PR (open or closed unmerged) or of a publish branch, signed from the floor
  up to the new list, counts as served for this rule, so such a list, signed but never served, is
  retired as a served one would be; one that cannot be read raises the floor too.
- **The tree tests are strict** (`bun run test`, in `test:all`): the source passes the strict rules in
  canonical form, and every entry carries a picture § Pictures records; every pinned key is real (a placeholder fails) and is the one `FORMAT.md` publishes;
  `public/` holds `_headers` and `v1/list.json` only; a committed envelope is canonical, verifies and
  parses strictly; the floor is canonical, at least 1 and at most the committed list's sequence.
- **One name.** `tokens.nulo.sh` only: no workers.dev origin, no preview URLs, no route in the file.

## Publishing a change

1. Edit `list.source.json` in a PR (keys in payload order, tab indent; `bun run check` says so) and
   merge it into `dev`.
2. The push runs `.github/workflows/publish-token-list.yml`. Read the `prepare` summary: the token,
   flag and price feed diffs, the digest of all three, the signing-relevant changes it lists since the
   last publish, and the live check, one row per entry: `matches`, the difference (the chain's value beside the list's), or
   `not checked` with its reason. It is advisory: no failure of it blocks `sign`, which it delays by
   at most its 5 min timeout, and `matches` means only that the public node agrees, since the wallet
   checks every entry again on its own node.
   `bun infra/token-list/scripts/live-check.ts <nodeUrl>...` runs it locally against keyless nodes.
   The price feed check follows, one row per feed: `inside`, `outside the band` with the quote,
   `unknown to CoinGecko`, or `not checked` with its reason. It is advisory too, bounded at 2 min, and
   `inside` means only that today's quote falls in the band: whether the id names the token is the
   approver's call. Its request is keyless from a shared runner, so `not checked` is common.
   That list of changes is produced by the revision under approval and is informational only;
   GitHub's compare view of the range is the authoritative review.
3. Approve `sign` in the `token-list` environment.
4. Merge the `chore(token-list): publish sequence <n>` PR the release App opens; when the list delists
   or flags against any list the floor rule reads, or one of them cannot be read, it also raises the
   floor and its body says why. Workers Builds deploys `dev`; the nightly
   `token-list-host-live` job checks the served list.

A run whose base no longer holds the list `dev` serves fails before it opens a PR: its summary and its
floor decision compared against a list no longer served. A publish PR that conflicts with `dev` on
`list.json` is stale the same way: close it and re-dispatch, never resolve the conflict. A closed
publish PR's list stays on record: the next publish's floor rule reads it at the PR's head commit,
whether or not its branch is deleted. A run that stops before its publish branch has a commit (the
stale-base stop, a failure or a cancel) leaves its signed list only in the run's `token-list-envelope`
artifact, kept 7 days: the floor rule does not read it (known limit #1001).

`gh workflow run publish-token-list.yml --ref dev` re-signs the current source with a new sequence.

## Pictures

Every entry's `icon` is one of these files, embedded byte for byte (`FORMAT.md` § Pictures).
Issuers' marks are used as published, unaltered and never recoloured, on the owner's recorded
decision of 2026-11-10, on test and bridged tokens too. cWETH, which no issuer draws for, carries
Ethereum's diamond under the same rule, on the owner's decision of the same day; any other token
with no issuer's mark gets Nulo's letter mark, a white letter on a near-black disc. The tree check
refuses an entry with no picture or with one whose SHA-256 has no row here, so changing a picture
means changing its row; a picture is never bundled in the extension.

| Picture | Used by | Drawn by | Source | Terms | SHA-256 |
|---|---|---|---|---|---|
| USDC token logo | USDC, cUSDC | Circle | `https://www.circle.com/pressroom`, `usdc.zip` → `Token Logo/USDC Token.svg` | Circle's pressroom ("use approved logos as provided … do not alter") and Brand Use Policy | `fe4f9d5f34ef4ebeb5d80e1f5ff63dcaf5a0d5495f4adf206e4c3011d1f5c57d` |
| EURC token logo | EURC | Circle | `https://www.circle.com/pressroom`, `eurc.zip` → `Token Logo/EURC Token.svg` | as USDC's | `6ae03397ca1775169d5371b1e40562714a779e9656ab0ce41ca71f79da0b3e2d` |
| USD₮ token logo, colour | USDT | Tether | `https://tether.io/en/media`, `tether_USDt_token_v2@3x.svg` | Tether's media page (copied from Tether's materials, not altered) | `7bde6a7d982a998566c8688599615410f60453994e73d31cf7636fecf3fcde74` |
| Letter mark "G" | GBPC | Nulo | this repository; the disc is the dark theme's `--app-bg`, `#0a0908` (`packages/design/src/base.css`) | Nulo's own | `7f068e3e57727bda2cf7f036041f41da59c7b6b94831c4141414b53506d34bef` |
| ETH diamond (purple), transparent background | cWETH | Ethereum Foundation (Stiftung Ethereum) | `https://ethereum.org/assets/`, "ETH diamond (purple)" → `https://ethereum.org/images/assets/svgs/eth-diamond-purple.svg` | ethereum.org's Terms of use (`https://ethereum.org/terms-of-use/`): "Unless otherwise marked", its images are "licensed under the Creative Commons Attribution 4.0 International License"; the assets page marks this one no otherwise; not altered | `7320e64e211db747308cc3e546e5360d42f3790b7a14fba0504573790e17f124` |

## Keys

Both keys are Ed25519 seeds generated by 1Password in `Keyed-Runs/Nulo-TokenList`; no agent and no
file ever holds one.

- **Install** (once, and after a rotation): `env-exec request --template infra/token-list/keys.env.example
  --slug token-list-keys -- bun packages/token-list/src/keygen-cli.ts install`, approved with
  `op-remote`. It sets `TOKEN_LIST_SIGNING_KEY` in the `token-list` environment over stdin and prints the
  two public keys, which go into `packages/token-list/src/keys.ts` and the table in `FORMAT.md`.
- **Rotation** after a suspected leak: delete the `TOKEN_LIST_SIGNING_KEY` secret; sign the current
  source, whose pictures each have a row in § Pictures, with the recovery key as a keyed run (`sign-cli.ts --key-id nulo-recovery-1 --seed-env
  TOKEN_LIST_RECOVERY_SEED`) and commit the envelope, with `floor.json` set to its sequence when it
  delists or flags against the served list or a list at a publish PR or branch head signed since the
  floor (`raisesFloor` in `scripts/floor.ts`); generate a new CI key; ship a wallet release whose
  `keys.ts` drops the leaked key. Until that release, the leaked key still verifies (`SECURITY.md`).

## Cloudflare (owner steps, outside this file)

- **Workers Builds**, Worker `nulo-tokens`: repository `nulo-sh/nulo`, root directory
  `infra/token-list`, production branch `dev`, build watch paths `infra/token-list/**`, build variable
  `BUN_VERSION=1.4.2` (the build image honours no version file), no build command, deploy command
  `bun run deploy`. Non-production branch builds off.
- **Custom domain** `tokens.nulo.sh` attached to the Worker.
- **No challenge in front of it**: a challenge or bot page replaces the list with HTML, which every
  wallet refuses. Keep Bot Fight Mode off and no WAF, rate-limit or Configuration Rule challenging
  `tokens.nulo.sh`, as for `passkey.nulo.sh` (see `infra/passkey-rp/README.md`). `bun run test:live`
  (nightly's advisory `token-list-host-live`) fails on a challenge by its effect.

`bun run deploy:dry` bundles without credentials.
