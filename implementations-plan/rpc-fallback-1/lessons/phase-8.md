# Phase 8 (arc 3): E1, the legal text, the architecture section

- **Legal (OA-2).** Privacy 1.2.10 (§ 5.1) and Terms 1.2.2 (§ 7.1) add the owner's sentence after each section's control sentence ("Settings → Networks lets you replace…", "You can change the endpoint…"), so it sits before the pinned-transaction sentence. Both are patches, archived (`legal/archive/privacy-1.2.9.md`, `terms-1.2.1.md`) and undated (`«FILL: effective date»`, the form 1.2.8 and 1.2.9 had until their promote); `BEFORE-LAUNCH.md` § 4 lists the boxes the next promote ticks. The landing's `legal-pages.json` is generated and gitignored.
- **E1 shape, as built.**
  - The mint is the playground's phase section: `mint_to_private` as X, self-pay. That fee route needs X's public Fee Juice (`fundPublicFeeJuice`), and `phase.register` needs the `transaction-contracts` bundle, so the spec uses `dappConnectedExtensionWithFirstTwoAccountsContractsCap` and takes the first account.
  - The network row is rewritten in place (`rewriteActiveNetwork`): the primary's URL becomes relay A, and a copy with a fresh id and relay B's URL is appended. Both contexts rebuild their routes from the changed endpoint list.
  - The relay gained a `hold` fault, a `carrying` match, `held()`, `release()` and `arrivals()`; one unit test in `scripts/e2e/rpc-relay.test.ts`. `held()` counts only requests whose client still waits.
  - Attribution of the held read: the background's pending poll awaits every update before its next 1 s tick (`TransactionService.runWorker`), so it has at most one hash read in flight. B holding two live requests carrying the hash therefore holds one the background cannot account for.
  - The phase balance read (`phase.balance`) reads X's balance, so the recipient input is cleared for those reads: a utility call scoped to R, a non-session account, is refused.
  - The dApp sees a refused simulation only as the unclassified envelope ("The wallet could not process the request."). The spec reads the kernel's reason from the offscreen's `[WRITE] simulateTx failed` line (error level, `pxe` source, stored with Developer Mode on).

## Runs

- 2026-11-05, Chrome, run 1: red at the last check, which read the dApp's envelope for "nullifier"; every routing assertion before it held. Fixed by reading the offscreen's logged reason.
- 2026-11-05, Chrome, run 2: green. Test 190 s, wall 270 s (build and sandbox included). The simulation stayed unfinished for the 10 s hold and finished 191 ms after B released; its reason was the kernel's "Nullifier read request at index 2 is reading an unknown nullifier". Peak requests per 10 s: A 67, B 19; totals A 134, B 125 over 160 s.
- 2026-11-05, Chrome, with the routed node's receipt pin removed in `call` (a one-line mutation, reverted with `git checkout`): red, as required. `B holding a hash read the background's one poll cannot account for: not within 90000 ms; last: 1`: the offscreen's receipt read went to A.
- 2026-11-05, Firefox: green. Test 202 s, wall 294 s. Held 10 s, finished 240 ms after the release, the same kernel reason. Peak per 10 s: A 57, B 18; totals A 134, B 119 over 163 s.
- The peak is a local lower bound for `rpc-proxy-1`: one wallet, one network, one send, an unlock's catch-up and an idle minute. The highest 10 s window was A's at 67 requests (Chrome), under the relay's 100 per 10 s.
