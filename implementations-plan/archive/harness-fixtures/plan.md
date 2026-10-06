# E2E harness complexity refactors

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: shared storage-join helpers in `apps/extension/tests/e2e/fixtures/helpers.ts`, extracted helpers in the three e2e specs that carried a complexity suppression, and a stage coordinator in `apps/extension/tests/e2e/global-setup.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Remove six cognitive-complexity suppressions in the e2e harness by refactoring on merit, in two behavior-preserving steps, rather than accepting any of them as essential complexity. Every wait, probe order, kill order, log line and `provide` call stays; only where the code lives and how many copies exist changes.

- Deduplicate: one in-page storage reader and Node-side row parsers replace the copies that joined token and balance rows, and three specs gain named helpers (an active-account triple resolver, a held-drive scan loop, a record poll, a pure batch-reply planner for the dead-RPC import test, a restore-residue reader, a recovery-backstop probe).
- Split the long boot function in `global-setup.ts` into stage functions with a short coordinator that owns the order.

## Why

A 400-line boot function is not essential complexity. Isolated scoring put the original at well over the budget and the split at under it for every stage, and the coordinator makes the ordering contracts legible: the provisional lock before any spawn, the boot-started marker between the lock and the first service, and node killed before anvil on failure.

The audits fixed several rules for the split. A child process's handle and flag are set in a spawn callback before listeners and the wait, never return-then-assign, so a cancel window cannot orphan a process. Health probes stay first in each ensure step, so a healthy existing node with an unusable pin still passes. Per-child log filters are passed as data, not defaults, since anvil has no stdout handler. Flags are deliberately not reset on kill paths, because teardown's data-dir removal keys off them. The only accepted ordering difference is that the playground URL is provided after the optional tools probe, which no test worker can observe because workers start after setup returns.

## What shipped

- `readStorageValuesByPrefixes` as one in-page reader that returns raw values, with the parsing and predicate logic kept in Node-side helpers that match the old loop bodies exactly.
- A browser-free test pinning the batch-reply planner (unparsed body, single request, batch, a batch with one unanswerable element blackholing the whole).
- Stage functions for the boot (prior-lock reconciliation, anvil, node, dev servers, shared log piping) behind a coordinator, proven equivalent by a fresh boot, a reuse-after-kill boot that must not start anvil again, a changed-ports reap, and a fail-loud run with a missing binary.
- A note in `.claude/skills/e2e-testing/SKILL.md`: a review that runs a smoke suite in the same checkout kills the dist's browsers and fails a concurrent network run, so reviewers are told not to run the e2e configs during a local gate.
