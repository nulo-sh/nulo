# Recon: egress-guard-2

Base `origin/dev` at 19399c82. One reuse sweep (Explore, sonnet), then the parent read every file below. `E` = `apps/extension/tests/e2e`, `F` = `E/fixtures`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Know, at the moment a request reaches the guard, whether the launch's interception holds the node's origin | `Standing.current` in `F/browser/standing-interception.ts:16-17`: undefined while a spec's interception or a kill has the origin, set again by `resume` (`:68`); private, read by nothing outside the closure | adapt: expose it on `hold()`'s handle |
| Count guard attempts apart from the total | `note()` in `F/egress-guard.ts:205-210` keeps one `{host, port, count}` per `host:port`; no hook, no timestamp, nothing calls out | adapt: one predicate per watched host, read in `note()` |
| Judge the record at close | `egressFailure` (`:292-311`), a pure function of `attempts`, `overflowed` and `canaryConnections`; `closeAfterEgressCheck` (`:318-360`) | adapt: one more failure class |
| The stand-in's handle | `HeldNode` (`:39-47`) from `holdNodeStub` (`F/node-stub.ts:44-64`), the only caller of `holdRpcInterception` (`F/browser/index.ts:262`) | adapt: add the node's host and the predicate |
| Suspension windows | `whileReleased` (kill, `index.ts:278-279`, every `stopBackground`) and `intercept` (a spec's own) already flip `current`; recorded windows or timestamps exist nowhere | reuse-as-is (no window record needed) |
| Unit harness, guard | `apps/extension/scripts/e2e/egress-guard.test.ts`: real loopback guard with raw sockets (`exchange`, `:52-66`); `rig()` fakes guard, canary and browser for `ownGuardedLaunch` (`:215-237`); `heldNode()` fake (`:337`) | reuse-as-is; the fake guard literal gains the new member |
| Unit harness, standing | `apps/extension/scripts/e2e/standing-interception.test.ts`: `fakeBrowser()` arm log, `failArm`, `pauseArm`; 12 tests | reuse-as-is |
| Red proof on a real browser | the allow-list filter Phase 5 of ci-e2e-hygiene-1 measured leaking (24 refused attempts, `implementations-plan/archive/ci-e2e-hygiene-1/lessons/phase-5.md`) | reuse as a one-off mutation, never committed |

Absence trails: grep of `F/egress-guard.ts` for `Date.now|performance.now|timestamp|onAttempt|listener|subscribe`: plumbing only. `grep -rnE "standingInterceptions|holdRpcInterception|whileReleased|HeldNode"` over `*.ts|md`: the callers above. No test pins `DECLARED_REFUSALS` or any guard wording in the docs (`grep -rn DECLARED_REFUSALS`; `grep -rlE "SKILL.md|e2e/README|FIREFOX.md"` over `*.test.ts`).

## Where a node request legitimately reaches the guard

- Before `holdNode` runs (`F/egress-guard.ts:415`, after the canary proof). Measured: never in the full network selection (135 Chrome launches, 175 Firefox).
- A background kill: every `stopBackground` goes through `whileReleased`. Smoke callers: `imported-account-lifecycle`, `rows`, `token-list`, `sw-restart-network`, `sw-resilience` (7 kills), `type-roles`, and `F/extension.ts:337`. Network callers: `backup-restore-sw-restart`, `cold-wake-discovery`, `balance-row-reconciliation`, `frozen-account-canary`, `connect-locked-queue-sw-restart`, `firefox-background-restart`, `failed-send-check`, `same-token-concurrent-sends`, `inflight-call-background-death`, `passkey-execution-canary`, `incoming-arrival`, `stale-network-resume`.
- A spec's own interception on the Testnet origin: smoke `security-reset`, `send-fee-privacy`, `send-keyboard`, `received-fee-privacy`, `rows`, and `refuseTestnet` (`E/helpers/contacts.ts:38`) in `contacts-import`, `token-list`, `type-roles`; network `backup-import-stalled-network`, and `contacts-import-stop`, `senders-advanced` through the same helper.
- Measured by ci-e2e-hygiene-1 (its `lessons/phase-5.md`): Chrome smoke saw `lb.drpc.live` once each in `type-roles`, `contacts-import`, `sw-resilience`, `passkey-retry`; Firefox smoke twice. All in kill or swap specs.

## Docs that state the guard's node rule (change together)

- `E/README.md:83` (stand-in paragraph), `:85` ("no failure, only the slowness of a refused node"), `:91` (table row), `:103`.
- `F/egress-guard.ts:42-43` (`HeldNode.failures` doc), `:75` (`DECLARED_REFUSALS` text).
- `.claude/skills/e2e-testing/SKILL.md:161-173`.

## #835's passages, checked

- `SKILL.md:161`: "Smoke refuses every outside host" (held). Same bullet, `:169`: `launchExtension({ liveNode: true })` sends "the node's host" direct; the option is `live` (`F/extension.ts:98`), and it sends the node's and the list's hosts. CRS hosts going direct on every launch are unstated. Not in the issue.
- `SKILL.md:699-701`: the cold-wake order omits `closePxeHost` (held), and its order is off: the spec clears the alarms, opens the dApp page, closes the popup, then closes the offscreen document (`E/network/cold-wake-discovery.test.ts:42-57`).
- `FIREFOX.md:67`: "A guarded smoke launch" (held). Its last sentence says the live launch adds one `DIRECT` line; every guarded launch adds one per CRS host and the live launch two more. `:71` "by the one `DIRECT` line above" and `:48` "the smoke launch's stand-in node" carry the same drift. Not in the issue.
- `SKILL.md:194` and `FIREFOX.md:71`'s first sentence are about the artifact smoke, which is smoke-only: correct as written.

## Collisions

- Draft #743 (onboarding-3) touches `E/keyboard-guards.test.ts` only now; no shared file.
- test-infra-1 arc 4 (queued) will touch e2e fixture waits later; this lane lands first.
