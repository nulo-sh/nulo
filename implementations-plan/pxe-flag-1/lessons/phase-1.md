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
- Request `pxe-flag-bridge-2446a428` filed 2026-11-06 19:06 UTC; `env-exec status` polled hourly (pending at 20:56, 21:56, 22:56, 23:56 and 00:56 UTC), with no run process seen in its worktree before 01:06 UTC. Dropped; `env-exec` has no cancel, so removing the request's work tree is what stops a late approval from running.

## Codex over the record (gpt-6.1-sol, high, session 01a1b2a1)

Verdict: D2's letter returns hold; record it with a separate recommendation to close, the departure being the owner's. Seven findings, all accepted: no reinterpreting "saving" after the results; c4 lacks lab corroboration rather than being refuted, and its sign does not follow order; the order effect is "consistent with", over clustered passes; cache class (ii) is "none observed", not proof of why; the 20-span batched-read figure is a loose ceiling; the send losses and ordinal pairing are stated with counts, and sends follow D3's training split; heap and warning-buffer wording.
- Resumed once on the revision: conditional approve, two Medium items, both applied: the verdict states that no paired trained-send comparison survived D3's split, and class (ii) is named for what it counts, with `getNodeInfo` left as an unassessed metadata opportunity.

## Bridge leg: the failed funded run and its fix (2026-11-08)

- **Cause.** The tools app seals a private deposit's claim secret with `personal_sign` (twice for a wallet it has not seen) before any approval; the probe's wallet answered 4200 and the wizard's stepper stopped at `seal:failed`. The old probe read any stepper as "left" and waited 60 minutes for the receipt. Reproduced address-only by restoring the 4200 answer for one run: `seal:failed`, every later phase pending, until the deadline (screenshot under the scratch `testnet/`).
- **Missed in planning:** D9's allowlist named four requests from the unleashed SDK's deposit path; the seal lives in the tools app's own send flow (`deposit-flow.ts` there), not in the SDK. The address-only rehearsal stopped at the mint, before Confirm, so it could not see it. The rehearsal now reads L1 through a public node and goes past Confirm to the first signature.
- **Detection lesson:** waiting on "the page left the review" is not waiting on progress. The step now reads the wizard's whole state each second and stops on a failed stepper phase, a refusal or a review error.
- **Codex (gpt-6.1-sol, high), session 01a1bb35:** r1 five findings, all applied: screenshots on every stop, not only the deadline (Low); the seal text matched loosely and without a count (High); typed data was not checked against Permit2's and the router's types (High); a mint needed no request (Medium); a screenshot could show a URL (Medium). r2 (resumed): all five hold, no regressions. An offline dry-run check through viem's real serialization accepted the canonical requests and refused every variant.
- **Run notes:** `agent.sh` cannot run a Testnet probe (it builds for and boots a local network); the rehearsal runs on the smoke lane like the funded leg. Rehearsals: 110 s green (first fix, stop detection mis-keyed, 60 s fallback hit); 900 s with the old 4200 answer (the reproduction, timeout and screenshot path proven); 60 s and 60 s green at b0f60e3ad and 4c4c9013e.
