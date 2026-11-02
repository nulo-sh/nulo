# port-leak-1: phase 0 (planning)

Consults, in order. Each verdict and each finding's disposition is also in `plan.md` § Panel verdicts.

## Codex R1 (gpt-6.1-sol, high, read-only): conditional approve

- I1 overclaimed: a read settled before the teardown, whose continuation runs after it, sends its next request on a closed client and opens a port. Reproduced with the real `ServiceClient` in memory. Accepted: the page fences its reads (D2), and test B gains the settled-then-unmount order.
- I2 too broad: a disconnect between Ready and the send rejects with `RpcDisconnectedError`, logged at error (`client.test.ts:878`). Accepted: I2 narrowed; logging rules unchanged.
- Fixtures: `mountPage` must seed `app.profile`; production-shaped network and account answers; the fake records, not refuses, a call after disconnect. Accepted (the draft reproducer already seeded the profile).
- Security wording: "no new trust boundary", not a trusted list. Accepted.
- E2E: keep the two network files on both browsers; do not claim they prove port cleanup; record wall-clock. Accepted.
- D3: a separate open bug issue, deduplicated first; not a known limit (a wrong screen matters, and the timing estimate is unverified); not folded in (the sign-off covers the leak). Accepted over the planner's known-limit lean.

## Reproducer (planner, before the audits closed)

The draft tests A and B, run with `bun --bun vitest run --retry=0` against the base page: both red (A: two account clients built, none of network or account disconnected; B: `getAccount` called twice). The 8 existing cases green. With the planned change (no fence yet), all 10 green. The draft is not committed with the plan.

## Opus R1 (Plan agent, opus): conditional approve

- B red for the wrong reason: rejected on evidence, the draft's red at base was the second `getAccount` (its fake answers `getNetworks` at once). Its stronger assertion is adopted: one call log, no call after the unmount.
- Profile seeding: already in the draft.
- Use the real client over the shared port harness (`tests/vitest.setup.ts`, `portRegistry()`) instead of a fake: rejected. The page test proves the page's contract (each client disconnected, no call after unmount); `packages/extension-messaging/src/background/client.test.ts` proves the port's. Codex R1 judged the harness needless coupling too.
- Logging: the network and account clients' "Disconnected" debug lines now appear on leaving. Accepted (wording).
- F7 missed `authwit-variants.test.ts`, which opens, leaves and reopens the page in one popup. Accepted into the e2e gate.
- `SettingItem` stub. Accepted.
- I1 holds and no fence is needed: recorded as a dissent; the fence is kept (D2).
- D3 as a closed known limit, premised on the blank page leaving no control to leave by: rejected, the app shell's Header and its network chip stay on screen (`components/Header.vue:138-141,228-236`).

## Codex final (fresh session, gpt-6.1-sol, high): approve

No new material finding. D2: keep the fence; B(2) verifies the page's contract, not a demonstrated browser race (plausible but unverified at the page, as recorded). D3: confirmed as a separate open bug, filed as #1486 with the Header path.
