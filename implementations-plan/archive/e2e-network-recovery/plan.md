# Network e2e suite recovery

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the network e2e suite runs for real and in shards (`.github/workflows/pr-extension-network-e2e.yml`, `.github/workflows/_extension-network-e2e.yml`), fails loudly when its global setup fails (`apps/extension/tests/e2e/global-setup.ts`, `apps/extension/scripts/e2e/agent.sh`), and the popup races it exposed are fixed at the source (`apps/extension/src/popup/pages/settings/networks/[id].vue`, `apps/extension/src/popup/windows/discover/index.vue`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Recover the network suite in one pull request that stacked three pieces of work, each driven by probes and root causes rather than timeout bumps or quarantine:

1. Make setup fail loud, then fix the failures that surfaced.
2. A consolidated recovery that instrumented first and fixed only what the probes showed.
3. Follow-ups on the same branch: shard the suite, make the token page refresh its own balance, and run a time-boxed investigation of the remaining slow tests.

Product code changes were in scope when a root cause lived there and the fix was well scoped. Quarantine was per mechanism, with a root-cause budget, not per test, and used honest skips so counts stay truthful.

## Why

- The suite had been green by skipping. A dependency patch that strips an ESM entry from two noir packages let the test runner's WASM simulator initialise for the first time, and setup failures had been swallowed into an undefined config that made every test skip. Once tests actually ran, most of them failed, which is why the setup change had to come first.
- Failures were clustered by symptom, and the symptom lied. The probes falsified both primary hypotheses (a broken wallet RPC dispatcher, a slow account constructor, which in fact took milliseconds) before finding the real causes below.
- Rotating failures under cumulative CI load were first treated as sandbox backpressure. They were a race in popup approval gates.

## What shipped

- A fail-loud setup gate: with `E2E_REQUIRE_SETUP=1` a failed deploy exits non-zero instead of reporting every test skipped.
- The network watcher snapshot fix in the network settings page, which cleared most of the original failures, and a change to the playground's batch payloads, whose legs asked for accounts before the capability was granted.
- The discover and capability approval popups keep their buttons disabled until their interaction payload has loaded, and `approve()` throws instead of returning silently when called before init.
- A five-way matrix on the network workflow with `fail-fast` off, per-shard artifact names and a build-output guard that fails if probe strings ship in the extension bundle.
- The token detail page refreshes its balances on entry; the test helper that polled for them was deleted.
- A retry setting in `apps/extension/vitest.e2e.network.config.ts`, kept as a load absorber, not as the fix.

## Lessons

### Shared fixture

Count shared fixture setups, not failures. Twenty-two tests with the same timeout were one bug in one fixture's setup call (switching to the local network), which made each look like a wallet RPC failure. Many identical reds that share a fixture are one red.

### Network watcher snapshot

`handleSetActive` in the network settings page read a computed derived from the route parameter after an `await`. The e2e helper navigated away right after clicking, so the computed became undefined mid-request and the active network was written as undefined, and the header never updated. The fix is to snapshot the reactive value into a local before the await. A computed bound to route params is a hazard in any async handler, and e2e helpers that navigate mid-request will surface it where manual use never does.

### Slow test investigation

A time-boxed hunt for slow shard-5 failures took nineteen iterations, because every instrumented layer pointed away from the cause. The popup's approve button was enabled before the interaction payload loaded, and the handler's silent early return swallowed the click, so the wallet never saw the approval and the test waited for a popup that would never open. Under load the mount is slower, which widens the race. Findings that carried forward:

- A silent early-exit guard is the worst failure mode; throw instead.
- Validate a hypothesis with an isolated probe before applying a fix. Two confident, trace-based fixes made things worse and one timeout theory was ruled out by a rigorous test.
- A probe that never fires can mean the log is not captured (the worker console had to be wired into the fixture), not that the code did not run.
- Enumerating the browser's targets showed that no wallet activity followed the click, which was the decisive evidence.
- Fixing the gates took the shard from rotating failures to green, and the same silent-guard shape was filed as a sweep for other popups.
