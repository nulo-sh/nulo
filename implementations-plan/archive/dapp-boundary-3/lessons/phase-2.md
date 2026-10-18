# Phase 2: discovery refuses an authorization request from the registry

## The rule

`decodeAuthwitEffects` refuses the whole effect set when any effect's `contractAddress` is the registry, ahead of the loop, so nothing decodes or hashes and no partial set returns. Outside the per-effect `catch`, which would otherwise skip it.

## I2, read at each caller

- Standalone: `AuthwitDiscoverer.discoverPrivateAuthwits` awaits the decoder with no catch; `DiscoveryAwareEstimator.estimate` awaits it ahead of `buildAndEstimateValidated`, so the validated build (where a discovered witness is signed) never starts.
- Folded: `CollectingDiscoveryProbe.extractEffects` sets `used` before decoding and has no catch. Both probe call sites in `fpc-strategy.ts` and the one in `fee-juice-strategy.ts` sit in `try { … } catch (error) { task.fail(error); throw error }`. `buildAndEstimateTxRequest` (`service.ts`) returns the strategy's promise with no fallback.
- NO_FROM: `discoverNoFromAuthwits` returns the decoder's promise; `addDiscoveredNoFromAuthwits` awaits it before `enforcePreview` and before any `createAuthWit`. The send's catch runs `markFailedUnlessCancelled`, which maps the refusal to `registry_refused`, and rethrows.
- No retry or fallback added.

## Tests and guard-removal

| Test | Rule removed |
|---|---|
| decoder: a registry request refused, neither seam called | red |
| decoder: a valid request ahead of a registry one, no partial set | red |
| decoder: other contracts decode in order (control) | green |
| estimate, standalone (real `AuthwitDiscoverer`, `fjwc`): refused, validated build never runs, nothing signed | red |
| estimate, standalone: another contract's request reaches the validated build once (control) | green |
| estimate, folded (real probe, `fj`): refused; then another contract's request listed | red |
| NO_FROM preview: refused | red |
| NO_FROM Confirm: refused, nothing signed or sent, journal `registry_refused` | red |

The NO_FROM success controls already exist and stayed green: "preview discovers through the confirm's own path, returns the records, signs nothing" and "preview and confirm agree on the fingerprint" (signs once, submits once). Restored: 188 of 188 across the five discovery test files.

## F12, the window's failure paths (`src/popup/windows/execute/index.vue`)

- Standard estimate: the refusal reaches `useFeeEstimationMap`'s `onError`, which shows "Couldn't estimate fee. Try again." for an operation the person pays; `awaitsFeeFigure` keeps Confirm off while the estimate is missing. App-paid sends skip discovery, so the refusal never reaches them.
- NO_FROM preview: its `onError` shows "Couldn't preview authorizations. Try again."; the Confirm gate does not read previews, so Confirm stays on and ends in the refusal above.
- Both paths unchanged; matches OA-4's "ships now".
