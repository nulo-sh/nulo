# Phase 5: bind the Allow's row (#680)

## Trace recheck (2026-10-18, base `dev` @ 9470d4e9)

#759 (dapp-boundary-3 arc 2) touched neither `wallet-sdk/discovery-flow.ts` nor `dapp-session/service.ts`; the trace in recon § #680 holds line for line (`persistAndApprove` at `discovery-flow.ts:492-562`, `addDappSession` at `dapp-session/service.ts:189-233`). No revision needed.

## Reproducer

`wallet-sdk/connect-profile-binding.composition.test.ts`: the booted discovery path over the real `DappSessionService`, whose profile stub answers `getActiveProfile` with p1 and `captureExecutionFence` with p2. On the base it is red: the discovery approved (`approve:r1`), two row-root writes, one `onDappSessionAdded`, and the row under p2. Green on the head: `reject:r1`, no write.

- The SDK tests replace `chrome` wholesale; the real service's constructor subscribes to `chrome.runtime.onConnect`, and `ConfigStore` needs `chrome.storage`, so the harness adds `onConnect` to its stub and gives both the service and the handler the no-op logger.
- Mutation check: deleting the refusal line reds exactly the reproducer and the two refusal cases in `dapp-session/service.test.ts`; the success controls stay green.

## Review loop

- Codex round 1 `clean`; Opus `approve` with a comment overclaim and a window-close test gap, both fixed in 7124b617; Codex round 2 `clean`. Known limit #771 filed and closed (A→B→A during a queued admission); #681 already covers the dedupe-waiter note.
- A commit body line that starts with a word and a colon (`refuses: …`) is read by commitlint as a footer token and warns `footer-leading-blank`; reword before pushing.
