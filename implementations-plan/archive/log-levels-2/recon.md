# log-levels-2 recon

Base: `origin/dev` at `210d02f1f`. One Explore agent (sonnet) plus the driver's reads.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A run a lock ended resolves at debug, a live one rejects | `whileLive` (`apps/extension/src/composables/useStaleNetwork.ts:147`), private, one caller (`resume`); its debug line is fixed text | adapt: the debug line becomes a parameter, so `refresh` reuses it |
| A popup call's failure no caller reports, disconnect at debug | `logCallFailure` (`apps/extension/src/wallet/logger/console-forwarding.ts:34`), used by `app.vue` for the switch run and the resume | reuse as-is |
| A session a lock or profile change ends | `Session` + `live(s)` in `useStaleNetwork.ts:168-170`; `clear()` replaces the session from the shell's `isLogined && profile.id` watcher | reuse as-is |
| A superseded read in the arrival composable | its own `generation` counter (`useNetworkArrival.ts:35`), bumped by every `refresh`, a successful `stay` and `dispose` | reuse as-is |
| A run fence | `createRunFence` (`composables/runFence.ts`) | not needed: the arrival counter already is the fence; swapping it is churn |
| Typed lock refusal | none: the worker throws `new Error("Profile locked")` (`session-manager.ts:256,268`); no popup code matches it by text | not built: a new wire contract, rejected in #1304 |
| Source pin of the shell's wiring | `apps/extension/src/popup/app-wiring.test.ts` (regex over `app.vue`) | adapt: one more assertion |
| Level-pin test idiom | `useStaleNetwork.test.ts:583-605`, `network-switch.test.ts:320`: `vi.spyOn(console, "debug")` + `toHaveBeenCalledExactlyOnceWith(line, { error })`, a control that `rejects.toBe(refusal)` | reuse as-is |

Search trails for the absences: `superseded|ended with its session|isCurrent|createRunFence|whileLive|console.debug(|generation` over `apps/extension/src` and `packages/*/src`; `Profile locked` over the same, tests excluded; `NETWORK_ARRIVAL_KEY|STALE_NETWORK_KEY|\.refresh\(` over non-test `.ts`/`.vue`.

## Facts the plan rests on

- Callers: both `refresh` functions are called only from `app.vue` watchers (`:222-225`, `:246-249`); the injecting components (`NetworkArrival.vue:35`, `StaleNetworkTakeover.vue:38`) never call `refresh`.
- Composables import no logger module today; `biome.json` forbids none of them from importing `@/wallet/logger/console-forwarding` (its overrides cover `components/{core,ui,composite}`, `popup/components/modules`, `onboarding`).
- No test pins the arrival read's `warn` (`useNetworkArrival.test.ts` spies on no console method; "a failed read shows no arrival" asserts state only).
- The profile chaos `KNOWN_FINDINGS` (`apps/extension/tests/e2e/helpers/profile-chaos/checkers.ts`) holds only #432: nothing cites #1296 or either line.
- Smoke e2e files for the two surfaces: `apps/extension/tests/e2e/stale-network.test.ts`, `apps/extension/tests/e2e/network-arrival.test.ts`.

## Open work and limits

- Open: #1296 only (`gh issue list --state all --search "network arrival"`, `"stale refresh lock"`, `--label bug --search log`).
- Closed limit #1304: a lock refusal the popup handles before the lock event (another port, no order) still logs at error. It applies to both sites unchanged.
