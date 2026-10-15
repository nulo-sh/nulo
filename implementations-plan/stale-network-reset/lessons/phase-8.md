# Phase 8: network e2e and chaos

## Built

- `network/stale-network-reset.test.ts` (N1): a profile imported from a known phrase, Local never opened; the harness mints to the true Local address (`deriveNuloAccountAddress(master, 31337, 0)`); `seedStaleLocalBothCauses` moves Local's row to `PREVIOUS_LOCAL_CHAIN_ID`, copies the Testnet's derived accounts onto it at moved addresses and makes Local active, plus one old send on that chain. A1 shows the address line; after the reset the row is on chain 0, the account is the true address, the minted balance syncs, a public send confirms, and every stored transaction is on chain 0 for that account.
- `network/stale-network-chaos.test.ts` (N2, `@requires-proverless`): the playground connected on Local, Testnet stale and active. Held at `network-reset-purging`: a playground `sendTx` gets no execute window and no settled answer for 4 s; with the stored active network pointed at Local, a second popup shows A4; the gate record still reads `held: true` after both checks, so neither ran after the 20 s safety release. Released: the held send is approved and lands, A5 shows once across both popups, no Local key was removed, the send's transaction row is on Local, the session row is byte-identical, and Testnet's accounts sit on the seed chain.
- `network/stale-network-resume.test.ts` (N3, `@requires-proverless`): both causes held at `network-reset-purged`, the stored active network pointed at Local, the page closed, `stopBackground`, a popup reopened at the lock screen, the hold cleared, unlock: A4 shows, A5 once, the Testnet accounts are back at their addresses, Local's account loads and a token balance read lands. Then an address change held at `network-reset-account` with two accounts: after the kill and resume, the two accounts, once each.
- `network/stale-network-a10-capture.test.ts`, opt-in with the other captures (`STALE_NETWORK_CAPTURES=1`, Chrome only): A10's toast. The Send page reaches a send only over a live node's balance, so the smoke captures cannot (D57).
- The aztec-update skill's Branch B names N1 beside S1 for a reset bump.
- Shared helpers in `helpers/stale-network.ts`: `takeoverScreen(page, screen?)` (S1 and the captures had one each; a third would have been a copy), `storeActiveNetwork`, the `both` shape of `seedStaleNetwork`, `seedStaleLocalBothCauses`, and a `readyToasts` count in the takeover trace.

## Gotchas

- The playground writes a pending result row the moment a call starts, so the highest `data-result-seq` moves at once; "not answered" means no row with status `ok` or `error` after the snapshot.
- `readAccounts` ordered rows by storage key, and the key ends in the address, so index order was luck: N3 got `[1, 0]` on Firefox. It now sorts by index, type, then address. S1a's `[name, index]` check had the same exposure.
- The restore gate's record lives in `chrome.storage.session`, which survives a background death; a resumed run passing the same hold point would park again. N3 clears it from the reopened popup before unlocking; the resume starts only after the unlock.
- `[aztec-node] Error: Address already in use` at boot is the aztec CLI's own anvil colliding with the one the runner started; the runner says so on the line before.

## Runtimes (scratch runs at retry 0, Chrome / Firefox; final versions)

- N1: 26.3 s / 34.5 s (plan estimate 150 s).
- N2: 28.4 s / 39.2 s (plan estimate 150 s).
- N3: 21.4 s / 33.6 s (plan estimate 120 s).

## Gate

Pending.
