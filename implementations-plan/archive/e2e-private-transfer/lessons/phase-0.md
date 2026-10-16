# Phase 0: planning log

## Recon

- One Explore agent (sonnet), batched over nine capabilities. Result in `recon.md`. Its two inferences (the pull token imports by address from the known catalog; the rows read `5 PULL` once imported) went to the spike below.

## Spike: does the delegated file run on the local network?

- **Method.** A temporary edit of `tx-sendTx-delegated-authwit.test.ts`, reverted after both runs (its diff kept outside the repo): the env gate removed, `ensureStandardPublicChecks` before the rig, the pull token imported from Home with `importTokenAndWaitForBalance(…, "0")`, then the toggle opened and the discovered rows logged. Amount left at the playground's `100`.
- **Chrome, proverless, retry 0: passed.** File 71.7 s (suite run 196 s, of which build and boot are most). Marks from the test's start: `PublicChecks` published 11 s; rig 32 s; import 40 s; window 48 s; structured rows 53 s; send landed 57 s.
- **What it showed.**
  - The wallet imports the pull token by address before the dApp registers it (the sample Token's class is in the known catalog).
  - When the toggle first shows, `execute-discovered-authwit-function` reads the selector `0xd73354bc` and the details read "Reading arguments…": the decode lands later. An assertion must wait for the structured rows, then read the label.
  - Rows: `data-intent-kind="transfer"`, sender kind `explicit` (shown as the account's name), To the consumer's trimmed address, Amount `0.0000000000000001 PULL` for 100 base units. No nonce row (`donate` passes 0).

## Runtime baseline (CI, before this arc)

- Network suite envelope (the `e2e-testing` skill's one-liner): Chrome 17 min (run 38889967057), Firefox 22 min (run 38889987107), both on PR head `worktree-ui-followups-p18`, 2026-10-16.
- Scenario 1, `tx-transfer-row.test.ts` (shipped in #293, four tests, three of them the private rows): Chrome 65.5 s, Firefox 108.3 s (shard 1/5 both). Each private case is about 16 s on Chrome.
- `type-roles-windows.test.ts`: Chrome 89.3 s, Firefox 139.6 s (shard 5/5 both).
- `tx-sendTx-delegated-authwit.test.ts` skips in every shard today.
- **Firefox, proverless, retry 0: passed.** File 88.5 s. Marks: `PublicChecks` 11 s; rig 33 s; import 43 s; window 53 s; structured rows 60 s; send submitted 66 s. Same rows as Chrome.
- The spike edit was reverted with `git checkout` after both runs; the tree carries none of it.

## Panel

- **Codex round 1** (`run-codex.sh … high read-only gpt-6.1-sol`, session 01a14471): approve with changes, F1 to F4 plus A1. Dispositions in `plan.md` § Audit verdicts. While checking F1's fix and D5, the planner found `serializeInstance` (`fixtures/selfpay-phase.ts:27`), which the explorer had missed; D5 now reuses it.
- **Opus Plan leg** (opus, `subagent_type: Plan`): approve with changes. Its S1 showed the planned sender-kind assertion was vacuous on this path (no caller context, so every transfer reading is `explicit`); its C1 that `clickByTestId`'s 10 s could race the estimate. Both accepted with the rest; dispositions in `plan.md` § Audit verdicts. Its F1 (the Firefox citation and the revert) was read before both landed.
- **Codex round 2** (resume of 01a14471): approve with changes. One finding, R2-1: the From-name wait did not prove To had rendered, since each `AddressDisplay` fills itself after its own awaited lookup. Accepted as Codex worded the fix (one wait over both addresses). It verified every other fold and reopened nothing. The light tier's one round trip ends here; the fix is a one-line wording change inside the approved step.
