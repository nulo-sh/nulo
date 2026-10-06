# A live dApp channel stays bound to the profile that approved it

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Profile binding for dApp sessions in `apps/extension/src/wallet/services/wallet-sdk/` (`background.ts`, `session-established.ts`, `discovery-approval.ts`, `pending-verification.ts`, `profile-switch-teardown.ts`), the extracted serializer `to-json-safe.ts` beside them, and the network spec `apps/extension/tests/e2e/network/session-profileSwitch.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Bind every encrypted dApp session to the profile that approved it, and enforce the binding twice: switching profile terminates every session stamped with a different profile, and dispatch validates the stamp on every message. Lock semantics are unchanged: a locked wallet keeps its channels and answers each call with the locked error. The same change fixes the verification marker leaking on a tab close and a serializer that corrupted shared references.

## Why

- A channel established under profile A kept serving profile B after a switch. Beyond the identity gap, one continuous channel across two profiles lets a dApp link them, which defeats profile isolation.
- Terminating on switch alone leaves a race: an in-flight message re-reads the live active profile mid-dispatch, and the termination itself runs after the switch. Stamping alone leaves the dApp believing it is connected while every call errors. The pair gives the clean disconnect signal and the structural check.
- The upstream session type is closed, so the stamp lives in a side map in the background closure, dropped with the session.
- A verification marker that outlives its handshake made a later reconnect demand a spurious emoji re-verification.

## What shipped

- The approval stamps a marker keyed by the transport request id, with the approving profile and the tab. Establishment reads its own marker: a fresh match stamps the session; a mismatch terminates; a stale marker terminates and is deleted, never downgraded to an unmarked reconnect. With no marker, a trusted reconnect is stamped from the validated row.
- Dispatch compares the stamp to the active profile, treating a missing stamp as a mismatch. It sends the error envelope first and then terminates, because terminating first breaks the response path. The dispatcher's session lookup takes an explicit profile id instead of re-reading the live one.
- The queued-send path, which creates its journal entry before the dispatch guard, runs the same check first, anchors sessions, accounts and network resolution to the stamped profile, and revalidates immediately before persisting.
- Response delivery is gated on a profile-switch epoch that bumps only when one real profile replaces another. A switch followed by a lock suppresses a late response; a plain lock or an unlock to the same profile still delivers. The first profile seen after a silent service-worker restore also bumps, since the baseline is unknown.
- The switch listener terminates sessions stamped for another profile and unstamped ones; a lock triggers no teardown.
- Tab close deletes that tab's markers, with a 90-second expiry as a backstop for leaks the tab lifecycle cannot see.
- The serializer tracks ancestors, not every visited node, so shared siblings serialize in full and only true cycles print as circular.
- The e2e connects under one profile, switches in the popup, sees the disconnect and a rejected queued call, and reconnects under the other.
- Not claimed: cancelling a callback that is already running when termination happens. New messages cannot start.
