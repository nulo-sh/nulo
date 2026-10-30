# store-images-1: recon

Base `origin/dev` at `9fba3c295`. One read-only explorer (sonnet) plus the planner's own reads and one probe run of the capture spec. `E` is `apps/extension`. `apps/extension/src/wallet/constants/network-endpoints.ts` was not opened; every grep excluded it.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Stage a wallet and capture five popup screens | `E/tests/e2e/network/store-captures.test.ts` (opt-in, Chrome only) | reuse as is: the probe staged every frame (below) |
| Frame captures into 1280×800 and render the tile | `E/scripts/store-art.ts`, `E/store/templates/{frame,tile}.html` | reuse as is |
| Run the network suite in isolation | root `e2e:agent` → `E/scripts/e2e/agent.sh` (cds into `E`, rebuilds, owns its ports) | reuse as is |
| Check that a chip's name is not cut | inline in `E/tests/e2e/appearance.test.ts:194-212` (pins "Alpha" at 360 px); nothing exported | not reused: the frames are checked by eye at 2× (plan D4) |
| Compare two capture runs | none: no `pixelmatch`, `pngjs`, `looks-same`, `odiff` in `bun.lock` or any `package.json`; `sharp` only under `miniflare` | build nothing: `sha256sum` per file, then a look at each differing pair (plan D2) |
| Other capture tooling | `E/tests/e2e/fixtures/shots.ts` (`shotSend`, `NULO_E2E_SHOT_DIR`), `E/tests/e2e/helpers/stale-network-capture.ts` | not relevant: they shoot other screens for PRs, not the listing |

## The spec against the tree

- Every helper and data-testid the spec uses exists with compatible behaviour (fixtures under `E/tests/e2e/fixtures/` and `E/tests/e2e/helpers/import-drivers.ts`). #1334's Switch button leaves `network-row` on the row's stretched link (`SettingItem.vue`, `controls` form), so `openNetworkDetail` still opens the detail page.
- Seeds (`E/src/wallet/services/network/seeds.ts:42-69`): "Testnet" (testnet), "Local Network" (local), "Alpha" (mainnet, primary). A fresh import lands on Alpha (`useProfileBootstrap.ts:179-192`); `switchToLocalNetwork` switches through the chip and Manage networks. The rename order ("Testnet" → "Aztec Testnet", then "Local Network" → "Testnet") respects name uniqueness (`network/service.ts:598-611`). A fresh profile meets no arrival (`seed-offers.ts:75`).
- An import hides Get started and the backup banner (`E/src/utils/get-started.ts:141`).
- Header (`E/src/components/Header.vue:229-239`, CSS :390-465): `network-button` with `network-name` and `network-status-dot`; 8 px sides and a 6 px gap at 359 px and wider; `header-lock` holds the padlock only.

## Run-to-run variation (why two runs are never byte-equal)

- The phrase comes from random entropy (`E/tests/e2e/fixtures/aztec.ts:576-578`); the header and the permission row show the derived address.
- Every activity row shows a slice of its tx hash (`TransactionIncomingCard.vue:56-58`, `TransactionCard.vue:117-119`).
- History's day header is the capture date (`TransactionsList.vue:31`).
- The permission window shows the playground's full origin, scheme, host and port (`useDappOrigin.ts:16-18`, since #806), and the port is drawn per run (`E/scripts/e2e/resolve-ports.ts:159`).
- The avatar is the account's initials, not an identicon; fee amounts are below the fold or round.

## The probe run (2026-10-30, at `9fba3c295`)

`STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/store-captures.test.ts` from the root: exit 0, the test 109.5 s, the run 159.8 s; `revealCutActivityRow` scrolled 58 px, `clearAmountLine` 46 px; five captures written. Then `bun scripts/store-art.ts`: five frames changed, the tile byte-identical to the committed one.

What each capture shows against the committed one (looked at with Read):

| Capture | Changed by landed work | Run-specific |
|---|---|---|
| home | Lock chip a padlock alone, network chip wider (#1369); the holding's privacy marks are a shield and a globe (#812); icons painted once on whole pixels, the bottom bar's at 24 px (#1027) | address, two hash slices |
| send | the same header; the strip's marks are shields (#812); the back arrow repainted (#1027) | address (Alice's moved with the sandbox's initial accounts in the 6.0.0 bump, #1107; fixed per version, `fixtures/aztec.ts:146`) |
| history | the same header; the bottom bar and row arrows repainted (#1027) | address, hash slices, "OCT 30, 2026" |
| security | the same header; strict mode reads "asks you to unlock more often on this device" (#1221); the back arrow repainted (#1027) | address |
| approve | the origin reads `http://localhost:<port>` (#806, full origin); the app-grid and eye glyphs repainted (#1027) | address, port |

Checks on all five: each its intended screen (no import, reveal or phrase screen), no `https://`, no Manage networks page; "TESTNET" whole with its dot inside the chip. The approve frame's port 29575 is the run's playground port; its node was on another port (`[resolve-ports]` line). The PNGs carry no metadata chunk (IHDR, IDAT and IEND only).

## Open work and collisions

- `gh issue list --state all --search "store images"` and `"screenshots store"`: #364 and #627 closed (earlier regenerations), none open. `known-limit` search "store captures": none.
- #1370 (open, owner-decision) asks to change `E/store/listing.md`'s reviewer note; out of this lane by the lane brief.
- The spec writes in place over the tracked PNGs; two runs in one worktree would race on them (never run two).
- The permission row's chain label reads "SANDBOX" (`AccountSelectRow.vue:75`, `getChainName(0)`), as in the set the owner signed on 2026-10-19 (#801).
