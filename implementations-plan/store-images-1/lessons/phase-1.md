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
- All five captures differ from run A's by SHA-256 (run B, first 12 hex: home `fda956a80c46`, send `e446ae450531`, history `145fe44a559f`, security `fef5d84bdbf0`, approve `b647995ed973`). Looked at with Read, each differs by run-specific values only: the account address (`0x17dd…ec33` in A, `0x26bc…0b0d` in B), Home's two and History's three tx-hash slices, the approve frame's port (`27493`, `13951`). Alice's address, the layout, the scroll fits and the date match.
- Pixel bands, run A against the probe (run B's files were overwritten by the restore below; the probe is a third run at the same base): every capture differs only at y70-89 x168-338 (the header address), Home at two and History at three hash-slice rows (x192-330), approve at y118-137 x418-477 (the port digits) and y414-433 (the account row's address). `Bun.Image` 1.4.2 has no raw decode; a stdlib zlib PNG decoder in Python does the pixel diff.
- Restore: `cp <run-a>/captures/*.png apps/extension/store/captures/`, then `bun scripts/store-art.ts`, then `sha256sum` of the eleven against run A's list: `diff` empty. The committed set is run A:

| File | SHA-256 |
|---|---|
| captures/approve.png | `2e11a7c8bef26c4f11a3b3af83ea19d3b3d404045fb841e6b7c53d1d8da4c382` |
| captures/history.png | `7c1002a1b0ee4c85ebd2a749b8fa30dd1b72c7c3064d3c3bc8b038f44374894a` |
| captures/home.png | `448e39c1d4017f5790314169cd4b01ef4fc08eac7898ec9841806bbdcf44be62` |
| captures/security.png | `883e19b542ab9d16b68c53481b5cca62679fc547fc7a6b8ac7c7bc17886b5da5` |
| captures/send.png | `108c1b4429f414f8974ef1d39f4506597a1ce92e74aca62d0fd321851d95d752` |
| promo-440x280.png | `05381c4bdde67af68d8f1661caefc85346975f1eed81855d1a29d5b2e995999e` |
| screenshot-1-1280x800.png | `31ccd54b5620c5e0961664b5bf1e2e35ac189aa67fc0e5bbf79402fff58430d6` |
| screenshot-2-1280x800.png | `2ea8af259b42633b65696687dab70d81233e2e7b2151b8000eca52822e4cf472` |
| screenshot-3-1280x800.png | `3907edbc2537993bff4e53e6ba7c5a4e232d0f847e17e02d0d325f55e284f6f2` |
| screenshot-4-1280x800.png | `4d106b841ae3a2354aa372ac44226448756d71d072e81922f4890ee47f7af627` |
| screenshot-5-1280x800.png | `7f3d159db458661af8e6d72741fc330cca6f9d8e4f6bed191c62f579afc6b7e1` |

## 1.4

- `bun run lint` exit 0; `bun run typecheck:all` exit 0; the two store tests at retry 0, 12 passed; `bun run test:all` exit 0 at `e3e0ba9cd` (extension 952 files, 16,420 tests passed).
- `c776eb1fc chore(store): re-render the listing images from the current build`: ten PNGs; the tile is not in it (byte-identical).

## Review loop

- Codex round 1 (gpt-6.1-sol, high, read-only, the diff `9fba3c295..e3e0ba9cd`): conditional approve, 2 findings, both accepted. 1.4 was ticked before `test:all` ran at the head (run, exit 0, recorded above); the 1.3 log lacked its hashes and commands (added above). Codex also parsed all eleven PNGs: sizes right, valid CRCs, only IHDR/IDAT/IEND, nothing after IEND.
- Opus review (general-purpose, beside round 1): conditional approve, 2 findings, both accepted. Its pixel diff of each committed capture against the new one found #1027's repainted icons in every frame, which recon.md and the PR's list left out (checked: Security's back arrow at y182-185 x73-102); the same `test:all` gap. The PNG commit's body predates the finding; the PR body carries the full list.
- Codex round 2 (resumed): approve; it matched the eleven recorded hashes against HEAD.

## Final-head gates

- `bun run lint`, `bun run typecheck:all`, `bun run test:all` (16,420 extension tests passed), the two store tests at retry 0 (12 passed): all exit 0. The capture spec, run C, the same command: exit 0 in 160.3 s; its PNGs were discarded (`git checkout -- apps/extension/store`) and the eleven committed files re-hashed equal to run A.
