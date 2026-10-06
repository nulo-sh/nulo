# E2E reliability fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: seven root-cause fixes to e2e flakes in `apps/extension/tests/e2e/` and `apps/extension/scripts/e2e/resolve-ports.ts`, plus a stable per-row attribute on the fee menu in `apps/extension/src/popup/components/modules/send/`. Nothing a person sees changes.
- **Open items**: recheck the file-scoped token fixture when vitest ships its fixture-retry fix, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Close a wave of test-reliability follow-ups left by the UX-feedback programme, each at its root cause and in one change: the launch fixture's scratch page, the send-picker setup, two cold imports inside timed bodies, the edited backups' account-state, the fee-menu sponsor rows, Home's measurements, and the port draw. Every fix was proved by a probe that reproduces the failure on the old code and passes on the new, then by repeated runs on both browsers at retry 0. Defects found on the way that are product code were recorded, not fixed here.

## Why

Each flake had a mechanism that a retry or a longer timeout would only have hidden, and a flaky gate costs more than a red one because people learn to re-run it.

## What shipped

- Both browser drivers open the scratch page on the setup page, whose lifetime no onboarding state decides. The fee menu's sponsor rows carry a `data-fpc-id` attribute beside the unchanged test id.
- The send-picker test deploys and imports its extra token in a file-scoped fixture; the two cold-import tests import in a hook; the backup tests keep only the funded chain's account-state and remove the doctored backup even when a launch fails.
- Home's test measures only after the token card settles, and the port draw skips the bad ports of the Fetch standard.

## Lessons

### Scratch page

On a fresh wallet the popup redirects to the onboarding tab and closes itself with `window.close()` once the worker answers its first lookup, before the fixture has seeded the completion flag, and Chrome honours the call. A launch fixture whose scratch page was the popup then lost its frame. The scratch page is now the setup page, which no product code opens, so deleting it fails every launch. A probe forced the redirect: the old scratch page failed all ten launches on Chrome and the setup page passed all ten on both browsers.

### File-scoped fixture

vitest 4.1.10 never re-runs a fixture whose setup failed: a retry of a test-scoped fixture reads `undefined` and fails with a misleading error, and a file-scoped one rethrows the cached first error. The send-picker setup therefore sits in a file-scoped fixture, so a retry reuses the deployed token instead of deploying a second one and failing on duplicate rows. Upstream tracks the defect and a fix is open; once a release carries it a failed setup will re-run on retry, so recheck that fixture then.

### Timed tests

A cold dynamic import inside a timed test body spends the test's own budget on module load, which a loaded host can exceed. Moving the import into a hook with its own budget leaves the callback running in milliseconds. The failures came only from the full parallel suite on a heavily loaded host; the files never failed alone, so rerun a timed file alone before triaging it.

### Account-state filter

A funded wallet's full backup also carries account-state for the public networks whose nodes answered at export, and the import registers it over public RPC on a fixed budget, so one stalled call marked every network as ran out of time. The tests now keep only the funded chain's items and throw unless one lists the funded token's contract. A negative control relabelling an item to a public chain dialled it within seconds; with the filter the restore dialled no public endpoint.

### Settled card

Home's token card is a short header until its balances land and a much taller empty state once settled, which pushes the activity row down about a hundred pixels. A test that read the icon's position as soon as the card was visible could press the empty state instead. The helper now also waits for the settled empty state. Holding the balance replies reproduced the failure on both browsers on the old helper and passed on the new.

### Bad ports

Node's WebSocket refuses a Fetch bad port before opening any socket, and Fetch itself refuses them for geckodriver's HTTP port. The port draw's window held 10080, so about one draw in twenty thousand failed with the BiDi socket "failed to open" while Firefox logged it listening. The draw now skips the standard's bad ports, spelled out rather than imported because the HTTP client's internals are not a declared dependency. Its test must spy on binds, since a held 10080 otherwise sends the draw to the random-port fallback and the test passes anyway.

### RPC 60s

A popup-to-background call rejects after 60 seconds unless its client overrides the request timeout. A public transfer proved in the browser on Firefox takes 86 to 94 seconds, so the popup showed a failed send while the transfer succeeded, and a local Firefox run waited out its snack for 300 seconds. CI's native proving lane never hits it, which is why nightly stayed green. The fix is a per-method timeout in product code that changes what Send says, so it is recorded in `.claude/skills/e2e-testing/SKILL.md` and not fixed here.
