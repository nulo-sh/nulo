---
plan: import-retry-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 612d2809d
status: approved (orchestrator brief); building arc 1
---

# import-retry-1: a token import caught by a worker restart says so and offers Retry

One arc, one PR against `dev`, closing #1799. Recon: [`recon.md`](recon.md); planning log: [`lessons/phase-0.md`](lessons/phase-0.md); asks: [`OWNER-ASKS.md`](OWNER-ASKS.md).

## The decision

- **Behaviour (the owner, 2026-11-15):** "The resume import sounds very complex for a very niche case? What do you think? If it's not, then let's go through the plan on a lane." The orchestrator agreed: no resume (a recovery policy with an attempt cap, a resuming state and a test per restart point); **a Retry** the person presses, re-running the idempotent import from the stored row.
- **Words:** the row shows a wallet sentence, never the reaper's `message`. Built: **W1** "The wallet restarted while adding this token." Captured as the alternative: **W2** "Adding this token was interrupted." The owner picks on a decision page; the PR does not land on its own.

## Assumptions

**Facts** (verified at `612d2809d`)
1. The boot sweep (`reaper.ts`, `start()`) and the unlock sweep (`reapUnlocked`, for sealed rows the boot sweep cannot read) fail every non-terminal record with `message: "Job declared lost: SW restart with non-terminal record in <stage> — unrecoverable"` and kind `stale_on_resume` (`sw_restart_post_prove` from `proving`). The periodic tick also writes `stale_on_resume` for `pending`/`simulating`/`submitting` past their grace (`classifyReapKind`), so the stored kind cannot tell a restart from a stall.
2. `TokenImportRow.vue` prints `op.error.message || "Couldn't add token"` on a failed row; `TokensView.vue` keeps a failed record on show for 30 s after `terminalAt` (`FAILED_RETENTION_MS`).
3. A token import's record holds `profileId`, `networkId`, `accountAddress`, `contractAddress`, `origin` (`token/service.ts`, `persistToken`). The popup's import path is `parseTokenInterface(networkId, contract)`, refuse an incomplete interface, then `addToken(profileId, networkId, account, iface, { origin: "popup" })` (`NewTokenPopup.vue`). `persistToken` returns the stored token without a new record when the contract is already on the profile and chain.
4. Each `addToken` opens a new journal record. Home's user imports (`home-slots.ts`, `userImports`) list every record shown, so a retry would show the failed record beside its own new one; defaults already keep one standing record per contract (`outranks`) and drop it once the token row lands.
5. `JobErrorSchema.kind` is `z.string().min(1)`: a new kind value is no stored-shape change. `KnownJobErrorKind` is an open union with a drift test (`packages/wallet-core/src/jobs/types.test.ts`). Token imports never reach `journal-state.ts` (`ACTIVITY_FEED_KINDS` excludes them).
6. Composition tests cannot run `addToken`'s live metadata read, a view simulation (`token/service.composition.test.ts` header; `tests/COMPOSITION-TESTS.md`).

**Issue claims:** the raw sentence, the boot sweep and the idempotency hold. "The red × until dismissed" does not: the × is a status mark with no action, and the row hides itself 30 s after it failed. The lane brief's "the dismiss (×) stays as today" is read as: the mark stays.

**Asks** (working assumptions, recorded in the decision ledger): Retry for `popup` and `dapp` origins, not `seed` (D3); the reaper's periodic-stall text and every other failure's text stay as today (OA-1).

## Decision ledger

- **D1. The reason kind.** The unconditional sweeps (boot and unlock) write `error.kind: "interrupted_by_restart"` on a `token_import` record; transfers and dApp calls keep `stale_on_resume`/`sw_restart_post_prove`, which the send check and Activity read; the periodic tick keeps `stale_on_resume`. A token import has no transaction for a send check to look up, so the restart is its whole reason. Rejected: mapping `stale_on_resume` in the row (a stall would read "restarted"); renaming the boot-sweep kind for every journal kind (moves the send check's inputs for no gain). `message` is unchanged and stays in the record.
- **D2. The row.** `importFailureSentence(op)` maps `interrupted_by_restart` to W1; any other failure renders as today. Retry is a native `<button>` (`token-import-retry`, the seed row's RETRY style moved into `token-row.module.css`), left of the × mark, shown when `canRetryImport(op)`. The failed dim moves from the row to the lead and the mark so the button keeps full contrast (accessibility call under the owner's 2026-10-19 delegation).
- **D3. Who may retry.** `canRetryImport`: failed with D1's kind, origin `popup` or `dapp`, and string `profileId`, `networkId`, `accountAddress`, `contractAddress`. `seed` imports are the seeder's (its own retry and Home's seed Retry). A `dapp` import retried is the person's own `popup`-origin add of that address, as Import token would make it: the approval window's details are not re-checked, since the press, not the app, authorizes it.
- **D4. Dispatch.** `retryTokenImport(client, op, isLive)` in the popup runs the existing two RPCs with the record's fields; no new worker method. `isLive` stops the add when the page unmounted during the parse (a call on a disconnected client reopens its port). A refusal logs at `debug` as `{ error }`.
- **D5. One row per retry, only after a press** (narrowed by Codex round 1, finding 2: a rule for every import would change flows the owner has not seen). `TokensView` holds `importRetries` (id → `"running"`, `"done"`, or the refusal time). Running: the failed row renders in flight (spinner, "Adding token…", no Retry, no ×) and stays on show past the 30 s window. A retried record gives way to any later record of its contract in scope (`supersededImports`), and goes once its retry resolves (the token was added, or was already there). Refused with no new record: the row returns to failed with its sentence and Retry, its 30 s window restarted at the refusal (Codex round 1, finding 1). A record never retried behaves as today.
- **D6. Tests.** Unit and component for each seam; one network e2e scenario for what only a live worker proves (below). No composition test: the import's metadata read is a simulation (Fact 6).

## Phase 1: reason kind, row sentence and Retry

| File | Change |
|---|---|
| `packages/wallet-core/src/jobs/types.ts` (+ `types.test.ts`) | `interrupted_by_restart` in `KnownJobErrorKind`, its table, the producers line, the drift list |
| `apps/extension/src/wallet/services/operation-journal/reaper.ts` (+ `reaper.test.ts`) | D1 in `classifyReapKind`; the module doc's kind list |
| `apps/extension/src/popup/components/modules/general/token-import-retry.ts` (+ test, new) | `importFailureSentence`, `canRetryImport`, `retryTokenImport` (D2-D4) |
| `.../general/TokenImportRow.vue` (+ test) | `retrying` prop, `retry` emit, sentence, Retry button, dim moved (D2, D5) |
| `.../general/TokenSeedRow.vue`, `token-row.module.css` | `.retry` moves to the shared module; no visual change |
| `.../general/home-slots.ts` (+ test) | `supersededImports` (D5) |
| `.../general/TokensView.vue` (+ test) | a `TokenServiceClient`, `importRetries`, the filter, both row sites wired, disconnect in `onBeforeUnmount` |
| `apps/extension/tests/e2e/network/token-import-retry.test.ts` (new) | the scenario below |

**Tests that land.**
- `reaper.test.ts`: the boot sweep fails a pending `token_import` with `interrupted_by_restart` and a pending transfer with `stale_on_resume` (control); the unlock sweep gives the import the same kind; the periodic tick keeps `stale_on_resume` on a stalled import.
- `token-import-retry.test.ts`: the sentence for D1's kind and none for another; `canRetryImport` true for `popup` and `dapp`, false for `seed`, another kind, and each missing field; `retryTokenImport` calls parse then add with the record's fields and `{ origin: "popup" }`, refuses an incomplete interface before any add, and adds nothing once not live.
- `TokenImportRow.test.ts`: a failed record whose `message` is the reaper's sentence shows exactly W1 and none of its words, with Retry; pressing emits `retry`; `retrying` shows the spinner and no Retry or ×; a `metadata_fetch` failure keeps its message and no Retry (success control).
- `home-slots.test.ts`: an older failed record is followed by a later one of its contract in any stage; another contract's is not.
- `TokensView.test.ts`: Retry on a restart-failed row calls parse and add with its fields and reads in flight; a refused parse returns it to failed with Retry; the retry's own pending record replaces it; a refusal after the failure's window keeps the row from the refusal on; a retry that adds no record ends it.
- **E2E** `network/token-import-retry.test.ts`: seed a pending import of the sandbox token (`seedTokenImport`), close the pages, `stopBackground`, unlock; the row reads W1 with Retry; press it; the TST card lands and no import row remains. Failure mode only it proves: the reaped record's stored fields drive the real parse and live metadata read through a real worker restart and unlock sweep (the composition layer cannot simulate, Fact 6; the component test fakes the client). Estimated 60 s on Chrome; measured: TBD. Shots through `shotSend` under `NULO_E2E_SHOT_DIR` only.

**Gate (pass = every command exits 0 at retry 0, in order):** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension test:components`, `bun run check:plans` (staged), then one `agent.sh` run from the root (`NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/token-import-retry.test.ts tests/e2e/network/tokens.test.ts`), Chrome only. The touched-spec sweep (`git grep` of the import testids under `tests/e2e`) also names the smoke specs `type-roles.test.ts`, `shipped-token-list.test.ts`, `rows.test.ts`, `home-links.test.ts`; they run once through `bun run test:e2e -- <files> --retry=0`.

## Phase 2: captures and the PR

- Run the scenario with `NULO_E2E_SHOT_DIR` set; rename into `ir1-row-w1`, `ir1-retry-pending`, `ir1-retry-done` (`-light`, `-dark`) under `~/.cache/nulo-backlog/import-retry-1/shots/`; apply a throwaway one-line W2 patch, rerun for `ir1-row-w2`, revert it; write `captions.json`.
- Commit the W1 pair under `pr-captures/import-retry-1/` in one commit, embed it in the PR body, remove it in the next commit.
- PR title: `fix(tokens): an import caught by a worker restart says so and offers retry` (74 characters). Body: the owner's words above, W1 built and W2 captured, the UI impact below, the accessibility call (D2), the gates with outcomes, the scenario's measured runtime and each browser's network wall-clock before and after from CI's job envelopes, `Closes #1799`.

## UI impact

Home and Holdings, the token import row only (owner sign-off: the lane brief records the Retry decision; the sentence is picked on the decision page).
- Before: a restart-failed import reads "Job declared lost: SW restart with non-terminal record in pending — unrecoverable" with the × mark, dimmed.
- After: it reads W1, with a RETRY button left of the mark; pressing shows the in-flight row; the retry's own import row then follows as today, or the row goes when the token was already there; a refused retry shows the sentence and RETRY again for 30 s. Nothing else changes.

## Security & Adversarial Considerations

- Trust: the record is the worker's own sealed row; the popup sends back its fields, and `addToken` re-authorizes them (fence on the active profile; a profile that is not the fence's is refused).
- A `dapp` import retried stores what the contract reports at the press, not what the approval window showed (D3): the same exposure as importing the address by hand. The import row's title already shows the read symbol.
- No new RPC, permission, storage key or log field; the refusal log is `debug` with a named key.

## Post-implementation and Delivery

The lane brief's proportion replaces the standard's loop: after Phase 1's gate, ONE Codex pass (gpt-6.1-sol, high, read-only) over this plan and the net diff, with the standard's two verbatim rules and the adversarial ask ([`README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `612d2809d`); its fixes, a rerun of what they touch, no second round unless it says anything but approve. Branch `import-retry-1-a1` off `origin/dev` carrying the plan commit; one PR, opened ready; `gh pr checks --watch` once; never merged here. Close-out (Outcome, archive move, index line) as the PR's final commits.

## Seeds

- `/goal`: "#1799 ships: a restart-failed token import reads the picked sentence and Retry completes it."
- `/loop`: "Check PR checks for import-retry-1; on red, read and fix at the cause."

## Audit verdicts

- Plan audit: none (lane brief, light and thinned).
- **Codex round 1** (gpt-6.1-sol, high, read-only; plan and net diff at `d1370c6c2`): changes requested. D1, D3, D4, D6 agreed. Findings: (1) a retry refused after the failure's 30 s window hid the row with its reason and Retry: demonstrated, fixed (window restarts at the refusal; test added). (2) D5's rules also changed ordinary imports (a manual re-import hid an older failure; any import yielded to its landed card): accepted, narrowed to records a press retried; the `landed` change to `homeSlots` reverted. (3) Comments that narrated a literal, a prop or CSS, and two reaper comments whose kind lists became wrong: fixed. (4) Drop the row-wide "no word of the reaper's sentence" check as redundant with exact equality: rejected; the lane brief asks for exactly that check, and it also covers text outside the subtitle.
- **Codex round 2** (resumed, at `f26097ce3`): approve, no findings; the four dispositions verified.
