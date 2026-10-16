# Phase 1: implementation log

## Start

- Merged `origin/dev` at 4aa06020 (#533: cold-import timeouts, the fee ladder). The one conflict was `implementations-plan/index.md`, resolved by keeping both lines. #533 touched `same-token-concurrent-sends.test.ts` and `fixtures/browser/firefox-page-errors.ts`, which this arc does not touch.

## Change map, as applied (53c5f7d7)

- `fixtures/aztec.ts`: the private `ensureStandardPublicChecks(wallet, send)` takes the rig's wallet and `SendInteractionOptions<WaitOpts>`. Typing the options removed the helper's `as never` casts; the runtime object is unchanged.
- `tx-sendTx-delegated-authwit.test.ts`: the change map's steps 1 to 6.
  - **Deviation, step 5.** The plan says to wait for `data-address-shows="name"` on From, then read. The code instead waits until both addresses have text, and asserts `from: "name"` inside the one `toEqual`. A wrong sender then fails with a diff instead of a timeout. This is equivalent: `AddressDisplay` sets its name, its show flag and its address in one synchronous run after its single await, so its first non-empty text is final for that mount. Both reviewers confirmed this.

## Gate runs

All runs are proverless at retry 0 unless marked. "Delegated" is `tx-sendTx-delegated-authwit.test.ts`; "type-roles" is `type-roles-windows.test.ts`. Durations are vitest's per-file times.

| Head | Run | Result | Delegated | type-roles |
|---|---|---|---|---|
| 53c5f7d7 | Chrome, both files | pass | 57.4 s | 204.0 s |
| 53c5f7d7 | Firefox, both files | pass | 65.7 s | 190.0 s |
| ed54847c | Chrome, delegated alone, **prover on** | pass | 94.3 s, publish included | — |
| aea38d2b, the import removed | Chrome, delegated alone (negative control) | **fail** at the `execute-discovered-authwit-structured-args` wait (60 s), as planned | 155.7 s | — |
| aea38d2b | Chrome, both files | pass | 90.2 s, publish included | 149.4 s |
| aea38d2b | Firefox, both files | pass | 94.6 s | 182.9 s |

aea38d2b merges `origin/dev` at c5e9c8e8 (#532) over ed54847c's code. The file that runs first on a network publishes `PublicChecks`; the other skips the publish. Both orders passed. The delegated file's spread on Firefox (65.7 s, then 94.6 s, both without the publish) tracks the host's load: load1 sat near 150 at each start.

## Review loop

- **Codex round 1** (gpt-6.1-sol, high, session 01a144d0): approve with changes. Its one finding was four narrating comments (Low). Three were deleted. The fourth, at the `toEqual`, was kept and reworded: what `from: "name"` means cannot be seen in the code. Codex confirmed the step 5 deviation, the publish ordering and the typed send options. It also saw that a fee update could clear the list between the wait and the read, but found no trigger for it.
- **Opus review** (opus, general-purpose, alongside round 1): no correctness bug.
  - Accepted, plausible (Low): the wait and the read could straddle an estimate rerun that remounts the list. A fee-settings update calls `engine.schedule()`, which clears the result. The fix makes the wait's predicate return the snapshot itself. It gets the 60 s estimate budget, because a rerun during the wait has to finish inside it.
  - Accepted, wording (Low): the header's "decoded on its consumer" meant the token. It now says so.
  - Accepted (Nit): `DONOR_MINT` now sits beside `AMOUNT`.
  - Rejected (Nit): moving the docblock below the consts. The repo's network files put it first.
  - Fixes in ed54847c.
