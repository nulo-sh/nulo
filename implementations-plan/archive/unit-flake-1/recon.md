# Recon: unit-flake-1

Done in the lead session (reproduction and sweep need running code; an explorer could not run them). Evidence: [lessons/phase-0.md](lessons/phase-0.md).

## Reuse map

| Need | Reuse | Where |
|---|---|---|
| Send an event past Vue's attach-time guard | test-utils' `trigger`, which sets `event._vts = Date.now() + 1` (vuejs/test-utils#1854) and dispatches synchronously before its returned promise | `@vue/test-utils` 2.4.11, `DOMWrapper.prototype.trigger` |
| `trigger` on a node outside the wrapper (teleported sheets) | `new DOMWrapper(el).trigger(...)` | `src/popup/components/modules/settings/SettingsSearch.test.ts:43` |
| Read the sent event back (`defaultPrevented`) | a capture listener at the top of the path, as SettingsSearch's `key` does | `SettingsSearch.test.ts:35-49` |
| A still clock that makes a raw dispatch fail every run | `vi.spyOn(Date, "now").mockReturnValue(Date.now())` | `SettingsSearch.test.ts:100-107` |
| The shared helpers most exposed tests call | `expectMaskToggle`, `typeNow`, `enterOn`, `IGNORED_ENTERS`; `pressOn` | `apps/extension/tests/helpers/credential-pins.ts`, `apps/extension/tests/helpers/press-key.ts` |
| The house rule already written down | "a raw event in its mount's ms runs its 1st listener only" | `implementations-plan/lessons.md` § CI & gates; detail in `archive/ux-feedback/plan.md#vue-tests` |
| The sibling component's tests | `StaleNetworkTakeover.test.ts` already presses through `trigger` | `src/components/stale-network/StaleNetworkTakeover.test.ts:259-263` |

## Not reused, and why

- `DOMWrapper.setValue`: it also fires `change`, which `typeNow`'s callers do not send today.
- `vi.useFakeTimers({ toFake: ["Date"] })` plus an advance before each press: correct but a clock dance in every file; `trigger` already carries the "after the render" stamp.

## Closed limits and open issues searched

`gh issue list --state all --label known-limit --search "flake vitest click"`, `--search "same millisecond"`, `--label ci --state open`: nothing on this mechanism. #536 (unit tests waiting on guessed turn counts) is a different cause.
