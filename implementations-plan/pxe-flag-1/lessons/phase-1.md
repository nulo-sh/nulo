# pxe-flag-1, phase 1: the measurement

## Lab (2026-11-06)

- One run, retry 0, through `agent.sh` (`e2e:agent`), 562 s, green: six (b) pairs, five (a) pairs, three (c) pairs, all at moved anchors. Numbers in `recon.md` § Probe.

## Builds

- Two plain `build:chrome` builds with the instrument, the on build with the Route A define. The on bundle alone defines the key (`PXE_CONCURRENT_CONTRACT_SYNC_ENABLED:"true"`); the one hit in the off bundle is PXE's own config-mapping string. Both patches reverted with `git checkout`.

## Harness against a release build on Testnet: what broke, in order

1. Profile creation: `page.type` left Create disabled; the shared helpers fill passwords with `replaceInputValue`. The phrase grid is `onboarding-phrase-word`, read before "Do it later".
2. Long waits: a `waitForFunction` of several minutes is one CDP call, which Puppeteer's protocol timeout kills (`Runtime.callFunctionOn timed out`). Long waits poll `page.evaluate` instead.
3. Home shows three token rows at most. The settled check reads the token count from the wallet's token service and `data-settled` from the page.
4. "Add to wallet" in the tools app hung in `submitting` for more than five minutes when it followed a drip of the same token (seen twice, under load1 about 200). Without drips it lands in seconds, so setup adds both tokens before dripping. Not investigated further; four drips went to these two attempts.
5. The probe's drain ran before the wallet had an offscreen document; it now reads as empty until there is one.
6. One session lost its browser connection under load1 about 380; a stale "Transaction submitted" toast cut three sends short. Both are in `recon.md` § Probe.

## Keyed run (OA-1)

- Harness, egress option and template committed at `2c6ca0ad6` and pushed; a detached worktree at that commit ran the address-only rehearsal under `env -i` with the keyed PATH (Node 26 from `/usr/bin`), green: the tools app connected, the first signature (a mint) was refused and "Token + gas", private, was selected after it.
- Request `pxe-flag-bridge-2446a428` filed 2026-11-06 19:06 UTC; `env-exec status` polled at most hourly.

## Codex over the record (gpt-6.1-sol, high, session 01a1b2a1)

Verdict: D2's letter returns hold; record it with a separate recommendation to close, the departure being the owner's. Seven findings, all accepted: no reinterpreting "saving" after the results; c4 lacks lab corroboration rather than being refuted, and its sign does not follow order; the order effect is "consistent with", over clustered passes; cache class (ii) is "none observed", not proof of why; the 20-span batched-read figure is a loose ceiling; the send losses and ordinal pairing are stated with counts, and sends follow D3's training split; heap and warning-buffer wording.
- Resumed once on the revision: conditional approve, two Medium items, both applied: the verdict states that no paired trained-send comparison survived D3's split, and class (ii) is named for what it counts, with `getNodeInfo` left as an unassessed metadata opportunity.
