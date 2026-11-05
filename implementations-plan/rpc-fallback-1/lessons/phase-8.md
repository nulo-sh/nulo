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

## The arc's diff review

- Codex `01a1ac9c`, round 1: revise, two majors. The send's membership check read the build's row, so an endpoint removed while the proof ran could still carry the send; the registry checked its receipt endpoint against a row captured before an endpoint was added, failing a toggle sent through the new one.
- Opus 5.5, fresh: approve with changes. The major: a revoke's effect was checked on the background route at `latest`, which may lag the endpoint whose proven tip the wait read, and so read a reverted revoke as unauthorized and prune a live grant's row. Also the stale-row send (as Codex), the background route's cache key without the chain identity, and stale comments. Its pending-grant finding (a grant whose endpoint was removed cannot be revoked) is kept fail-closed: known limit 7.
- Fixes (`ee76fb80c`, D34): the send asks the pick over the live row and refuses a row that moved chain; the registry counts an endpoint the captured or the live row (same profile) lists; a revoke's and a toggle's check reads the endpoint the proven wait read; the route key carries the chain identity. Each new test was red with its fix reverted.
- Codex round 2: approve.
- The capture-order test indexed `getNetwork` calls across two operations; the revoke now reads the row once more, so the test checks each operation alone.

## Gate (on `83069b357`, the E1 spec then gained the header check)

- `bun run test:all` and `bun run audit:vue` green before the review fixes (162 s, 179 s); rerun on the final head below.
- Chrome: E1 + `failed-send-check` 487 s wall; `tx-sendTx-default` + `endpoint-refused-recovery` + the sandbox suite 508 s; the prover-on canaries 407 s. All green at retry 0. The canary run started at load 164, over the 150 limit: the check printed the load but did not wait. Every later run waited for it.
- Firefox: the same three sets green at retry 0 (the sandbox suite skips itself there); the canaries 186 s and 202 s of test time.
- E1 gained an assertion that the header reads connected while A is dead (OA-1 B), and opt-in shots of the header and Manage Networks (`NULO_E2E_SHOT_DIR`). Rerun: Chrome green, 194 s; peak per 10 s A 71, B 21.
- GitHub never processed the stack sync's push of a2 (the ref moved, the PR head and CI did not). Rewinding the branch to the PR's recorded head and pushing the real head again, both with lease, made it sync.
- E1 rerun (header check added): Firefox green, 203 s; peak per 10 s A 60, B 22.
