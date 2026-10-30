# Phase 1: arc 1 log

## 1.0

- Dedupe again (`gh issue list --state all --search "store images"`, `"listing images predate"`): #364 and #627 closed, none open. Filed #1376 (`ux`) with the lane brief's title.

## 1.1 (run A)

- `STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 NULO_E2E_BROWSER=chrome NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts`: exit 0; test 109.3 s, run 163.4 s; longest silence 24.9 s. Ports: node `:11038`, playground `:27493`. `revealCutActivityRow` 58 px, `clearAmountLine` 46 px; five captures written. No spec change needed.

## 1.2

`bun scripts/store-art.ts` over run A's captures: five frames changed; the tile rendered byte-identical to the committed one (`05381c4b…`), so git records no change for it. Each file looked at with Read:

| File | Intended screen | URL, host, path | Password, key | Manage networks | Header chips |
|---|---|---|---|---|---|
| captures/home.png | Home | none | none | no | TESTNET whole, dot inside; padlock alone |
| captures/send.png | Send, filled | none | none | no | same |
| captures/history.png | History | none | none | no | same |
| captures/security.png | Settings → Lock | none | none | no | same |
| captures/approve.png | permission window | `http://localhost:27493`: the run's playground port, not the node's `:11038` | none | no | no header (window) |
| screenshot-1..5 | the five above, framed with their unchanged titles and captions | as above | none | no | as above |
| promo-440x280.png | tile, unchanged | none | none | no | n/a |

History's day header reads OCT 30, 2026, the capture date. Alice's address `0x3029df…2aca3d08` equals the probe's.

## 1.3

- Run B, the same command: exit 0; test 114.8 s, run 178.7 s; longest silence 27.5 s; ports node `:20585`, playground `:13951`; the same two scroll fits (58 px, 46 px).
- All five captures differ from run A's by SHA-256, each by run-specific values only (looked at with Read; `Bun.Image` 1.4.2 has no raw decode, so no pixel diff): every frame's account address (`0x17dd…ec33` in A, `0x26bc…0b0d` in B); Home's two and History's three tx-hash slices; the approve frame's port (`27493`, `13951`). Alice's address, the layout, the scroll fits and the date match.
- Run A's captures copied back and `bun scripts/store-art.ts` run again: all eleven PNGs hash as run A's did (`sha256sum` diff empty). The committed set is run A.

## 1.4

- `bun run lint` exit 0; `bun run typecheck:all` exit 0; the two store tests at retry 0, 12 passed (`bun run test:all` ran green at the base during planning; it runs again on the final head).
- `c776eb1fc chore(store): re-render the listing images from the current build`: ten PNGs; the tile is not in it (byte-identical).
