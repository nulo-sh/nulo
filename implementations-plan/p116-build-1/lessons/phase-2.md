# Phase 2: Holdings

- Red proof: the new `holdings.test.ts` against the base page (`git show 002b76fc7:…/holdings.vue`) fails 8 cases (the suffix pins, the two picked cases' unpriced one, the four fit cases); the all-priced case passes there, as the success control should.
- One-off height check (D7), scratch spec outside the repo (a vitest config under the lane's scratch dir that spreads `vitest.e2e.config.ts`), head build. It reloads Home with a frame sampler injected, opens Holdings, keeps the real skeleton's markup, then clones the live summary into each state:
  - Chrome: every state 39 px: empty meta + skeleton, count + skeleton, count + full figure, count + figure at scale 0.5, "Prices unavailable" + dash, empty meta + dash; the sampler also saw the real skeleton and settled frames at 39 px.
  - The scratch launch ends with two CSP records from the injected sampler (`evaluateOnNewDocument`), which the launch's CSP check reports at close; the measurement itself passed.
