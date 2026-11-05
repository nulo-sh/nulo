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

## Owner round: frame 3's origin (plan D10)

- The spec writes `https://playground.nulo.sh` over the `capabilities-hostname` line (the testid already existed, `src/popup/windows/capabilities/index.vue:381`), after checking it reads the run's playground origin.
- First attempt: the handle `window.waitForSelector(...)` returned was `null` on the permission window. The run failed with "the permission window has no origin line" (test 113.2 s), and no PNG was committed from it. No spec in the suite uses that handle; `waitForSelector` then `evaluate` by selector, the suite's pattern, works. Cause not traced.
- Run 2 (the committed set): exit 0, test 110.0 s, run 160.0 s, ports node `:18448`, playground `:13608`. All eleven looked at with Read: frame 3 reads `https://playground.nulo.sh`, the name line `nulo-playground`; no node address, phrase or Manage networks page; TESTNET whole. Pixel bands against the previous set: home, send, history and security only at the header address (y70-89) and hash-slice rows; approve at y115-142 (the origin line) and y414-433 (the account row). The tile is byte-identical.
- Run 3 (stability) and run 4 (final code, after the comment-only fixes): exit 0, test 111.2 s and 116.4 s, run 167.1 s and 169.7 s. Each one's approve differs from the committed one only at the account row: the staged line is pixel-identical. Their PNGs were discarded and the committed set re-hashed intact.
- The `[aztec-node] Error: Address already in use` line in every run is the CLI's own anvil bind, which the runner announces as expected.
- Gates at the final code: `bun run lint`, `bun run typecheck:all` exit 0; the store tests at retry 0, 12 passed; `bun run check:plans` 0 findings.
- Codex (fresh session, high): approve; two comment fixes applied (plan § Owner round).

| File | SHA-256 (the committed set after this round) |
|---|---|
| captures/approve.png | `019a214d8ac8625b3812fa601c87f07f96a13eacaf6ca65c88435c5d5ac0c4b5` |
| captures/history.png | `5f3ad5370a05e091aea357932b2b0f53f102a072f0e2afa842e7653cb7b0e2fa` |
| captures/home.png | `1dc0140b69570b5361da25694ab0896e89e18990a8a8e194e796ce3e1f9d9305` |
| captures/security.png | `398a9249f3bc8d73ffb00f9f059fcbc7337aaf8eeaca970d590f981db346bdab` |
| captures/send.png | `71dd8e16a19ecc628f9dacf1b6e8e83f6d8462440ccc8c358fa45743845d3e05` |
| promo-440x280.png | `05381c4bdde67af68d8f1661caefc85346975f1eed81855d1a29d5b2e995999e` |
| screenshot-1-1280x800.png | `44fc4ce8a78902edcf343e98d9e7a7d4d42819d24ad89cecd1cfe5a5473903cd` |
| screenshot-2-1280x800.png | `7d6abe5f9bd7377a4c933888e406afecd307ac48b368102cadf2b2b25924591c` |
| screenshot-3-1280x800.png | `fa4239c297182f725483835ab4399107a412271aba6c00bb957d7e7079b7c2da` |
| screenshot-4-1280x800.png | `59cc2e6631654e9840d8c0b50cf180796b90c97a77d2fdbc9cba251884395c44` |
| screenshot-5-1280x800.png | `6bedd04ee8f9b476b551467683288795cf4192dee22f34c167264f7ee9217235` |

## Close-out

- The owner signed the set on 2026-10-30, conditionally; the orchestrator checked both conditions on head c3ff40f38 (plan D5). Trunk at `9ce6bb0bd`, already merged; `index.md` and `lessons.md` unchanged since. No lesson promoted, no known limit, no open item.
