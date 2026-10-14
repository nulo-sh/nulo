# Arc 3a: explorer links (#142, #97)

## Phase 3.1 step 1: Aztecscan routes, verified 2026-10-14

testnet.aztecscan.xyz is a single-page app; every path answers 200 with the same shell, so a `curl` of
a page proves nothing. The routes were read from its router and checked against its live API:

- **Router.** The served bundle (`/assets/index-B2_D_Xfg.js`) registers `/blocks/$blockNumber`,
  `/address/$address`, `/contracts/instances/$address` and `/tx-effects/$hash`, each with a lazy
  route chunk.
- **Block.** The `/blocks/$blockNumber` chunk loads the block with
  `e.startsWith("0x") ? getBlockByHash(e) : getBlockByHeight(e)`, so one route takes a number or a
  hash. Live: `GET /v1/<the app's public key>/l2/blocks/latest` gave height 118677; the same block
  read by height and by its hash both answered 200 with height 118677.
- **Account.** The `/address/$address` chunk heads its page "L2 address · account" (public calls as
  sender, Fee Juice balance). The explorer's own search lists an account under "Accounts" with a link
  to `/address/$address`: a live search for a public call's `msgSender` returned it in `accounts`
  (and also in `contractInstances`, since an Aztec account is a contract).
- **Contract.** The search lists contract instances with `/contracts/instances/$address`; a live
  instance address from `/l2/contract-instances` answered 200 on the detail call.
- The demo branch's account path, `/contracts/instances/<address>`, opens an account's instance page,
  not its account page. The builders use `/address/` for accounts.

Every kind has a route, so no builder returns null for a missing route.

## Attempts

- `bun run test` first run: `scripts/type-roles/inventory.test.ts` red, six identifier sites with no
  entry (the Block hash on tx and received, the journal To value, each now split into a link branch
  and a text branch). Entries added for each, with the link branch on its new testid; the copy
  branches keep `tx-block-hash` and `journal-detail-recipient`. Green on the rerun.
- `rows.test.ts`'s new To-card scenario, Chrome, retry 0: 6.4 s alone. Mutation checks, each on a
  rebuilt armed dist: the link's padding back to 4 px fails "expected 20 to be greater than or equal
  to 24"; `@click.stop` removed fails on a copy recorded after Enter. Firefox: the file's 7 tests
  green, the scenario 2.1 s.

## Review round 1

- Codex `01a13b8a-70d9-7e80-9685-f2fa7218eefa` (default login), `approve with fixes`: two Medium
  (explorer choice read once on the received page; no focus ring on the new links), three Low.
- Opus, alongside: the same focus finding; a long name under the corner glyph; the tx builder's
  unchecked hash; the shot spec matching the smoke glob.
- Rejected: rings on the Block and To links (OA-6 makes them the Tx hash row's link; OA-7 asks);
  deleting two comments that state a cross-file anchor and the row a colour matches.
- The tx builder's check reddened `TransactionCard.test.ts`, whose fixture hash was not 32-byte hex;
  the fixture is now wire-shaped.
