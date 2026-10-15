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
- N3's A4 check raced the resumed run: with the purge already done, the run can end within the two reads that show A4, and one gate run failed on it. The resume is now held again after its first account, A4 is asserted there, then released.
- `[aztec-node] Error: Address already in use` at boot is the aztec CLI's own anvil colliding with the one the runner started; the runner says so on the line before.

## Arc 3 Codex fix loop (gpt-6.1-sol, high)

**Round 1 (fresh): 3 material test gaps**, all verified and accepted.

1. N2 looked for the execute window only during the first 4 s, through a promise that resolves after the window renders: it now counts execute-window targets before the send, after the wait and again just before the release.
2. N3 cleared the hold after the kill without checking it had survived, so a run its 20 s safety timer released could finish before the kill and pass as a resume. It now requires the hold record, still held, at the reopen.
3. N2 accepted the dApp's answer, given at submission: it now waits for the node to prove the held send.

The fixes broke into the gate's second Chrome run, which was stopped; the gate restarted from the first run.

**Round 2 (resumed): "All three gaps are closed … No new bug, security, test-gap or comment findings. VERDICT: no new material findings"**.

## Runtimes (scratch runs at retry 0, Chrome / Firefox; final versions)

- N1: 26.3 s / 34.5 s (plan estimate 150 s).
- N2: 28.4 s / 39.2 s (plan estimate 150 s).
- N3: 21.4 s / 33.6 s (plan estimate 120 s).

## Gate

Re-run at `62b7a8db`, over arc 2's capture-review changes (the never-opened rule, the journal's unmovable names, Send closing on a key refusal), retry 0, three runs in a row per browser: Chrome 6/6 tests each run (197 s, 242 s, 209 s), Firefox 6/6 each run (250 s, 253 s, 242 s); the proverless stamp found in every bundle; production `build:chrome` and `build:firefox` exit 0 with no `nulo:e2e:restore-gate` string.

Earlier runs:


At `e681339f`, after the rebase onto `dev`, and after `bun run audit:vue` exit 0 at the same commit (794 files passed, 3 skipped; 12749 tests), retry 0, `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent` on the three files, three runs in a row per browser:

- Chrome: 3 files, 6 tests passed in each run; 169.6 s, 169.2 s, 163.9 s. N1 27.6 / 30.9 / 28.4 s, N2 35.2 / 34.7 / 34.6 s, N3 22.6 / 21.6 / 22.1 s.
- Firefox: 3 files, 6 tests passed in each run; 225.9 s, 200.1 s, 180.9 s. N1 33.0 / 29.0 / 29.9 s, N2 46.8 / 47.0 / 40.4 s, N3 40.2 / 35.8 / 33.1 s.
- `agent.sh`'s check printed "bundle contains NULO_E2E_PROVERLESS_BUILD_STAMP ✓" in all six runs.
- Production `build:chrome` and `build:firefox` exit 0; neither bundle contains `nulo:e2e:restore-gate`.

The full network suite was last run whole at the Phase 4 gate (Chrome 6391 s, Firefox 7575 s, before this arc); these three files add about 85 s of test time on Chrome and 110 s on Firefox to it, inside its run-to-run spread on this shared machine.
