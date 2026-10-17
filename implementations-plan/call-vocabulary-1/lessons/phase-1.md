# Phase 1-3: implementation and fix loop

- **Concurrent test-utils mounts re-create stubbed subtrees.** `OperationCard.wire.test.ts` compared the HTML of two cards mounted under `Promise.all`. `DetailsToggle`'s new conditional `aria-controls` serialized in a different attribute order in one of them. Probe: in the parallel mount the toggle button was a new element after the click, while the card root was the same element. Cause: `@vue/test-utils` installs stubs through Vue's process-wide `transformVNodeArgs`, one hook per mount with its own stub objects, so a card that re-renders after a later mount gets that mount's stub types and Vue re-creates those subtrees (an element created with the attribute already set lists it in creation order; one patched later appends it). Fix: mount the two cards one after the other; the byte-exact assertion stays.
- **Codex round 1** (session 01a14b85, gpt-6.1-sol, high): approve. Minor: no test held the mint arity gate; added a three-argument mint (fails with the gate removed). Nit: the `actionReads` comment restated the computed; it now states the index invariant; `rowTitle`'s comment deleted.
- **Opus review** (beside round 1): conditional approve, nothing material. Seven findings:
  1. Prototype keys in the label tables (`constructor` → `Object`'s source). Demonstrated by a unit probe. Pre-existing on `dev`; the fix changes copy on screens outside the UI impact, so it is filed as #714, not fixed here.
  2. Applied: no test held the contract argument on the grant line or the Calls box. Added both; each fails with the contract dropped.
  3. Applied: `settledReading`'s comment said the record reads less than the window could, which is the wrong direction for K1. Reworded.
  4. Applied: the wire test's comment named the wrong cause. Reworded to the stub-hook cause.
  5. Recorded: the grant line now switches from the plain name to the label once its decode lands. Verified that approval waits for every grant decode (`index.vue:414,629`). Added to UI impact under P36-01.
  6. Applied: the two-grant test could not catch indexing by action. It now leads with a `call` action, and fails when `grantRows` is indexed by action.
  7. Applied: `ListedToken` was declared twice. It is now exported once from `tx-amount.ts`.
- **Codex round 2** (resumed, same session, on `2bab2ff2`): approve, "No new regression, adversarial path, or comment finding." Converged after two rounds.
