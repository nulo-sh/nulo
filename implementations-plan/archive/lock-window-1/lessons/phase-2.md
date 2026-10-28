# lock-window-1: phase 2 (the landing for an import and a new profile)

- An issue's chaos seed drifts with the model: seed 1003's plan no longer held a `restoreHeld` step, and on the base it met #1132 first. A hand-trimmed list under `NULO_E2E_CHAOS_ACTIONS` (validated by `planFromList` against the base record's caps first) reproduced #1138 at its own step.
- On a port drop the client rejects every pending call before the reconnect boot runs (`packages/extension-messaging/src/background/client.ts:145-146`), so a flow's failure path runs before the landing decides.
- The landing's `router.push` is not awaited, so a completion that settles before it commits still reads its own route name: a route check cannot tell it the flow is over, a synchronous fence can.
- Scenario B takes one of two paths, by whether the shell bootstrapped the restored profile before the kill; both showed up within two runs.
- Consults: the amendment review (Codex, `changes requested`, three findings accepted); arc 2 Codex round 1 `changes requested`, round 2 `approve with nits`; Opus `approve with nits`. The arc's prompts asked about comments in their own words, not with the standard's two verbatim rules; the cross-arc pass carries them.
- The cross-arc pass found one more await in New profile's hand-off that read only the route; a fence added to a flow has to reach every check after every await, the `unless` callbacks included.
