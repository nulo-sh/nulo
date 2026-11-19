---
plan: locked-refusal-1
tier: light
status: completed; delivered by the PR that carries this close-out
issues: "#1833 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: no recon agent, no plan audit round, no Opus leg (lane proportion); one Codex pass (gpt-6.1-sol, high, read-only) over the plan and the net diff after the build
base: origin/dev at 33906a052
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at 33906a052
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-17. Planned and delivered the same day; one arc.
- **Status:** completed. One PR into `dev` carries the fix and this close-out; its merge closes #1833 and archives this plan.
- **Shipped:** a request on a connected session while the wallet is locked answers `{ code: 4900, message: "The wallet is locked. Unlock it to continue.", data: { walletErrorCode: "WALLET_LOCKED", walletTraceId } }` instead of the unclassified -32603, and logs at `debug` instead of `error`. `WalletLockedError` stays a plain `Error` with its message and gains `CODE` (D1); one `CONSTANT_ENVELOPES` row; the wallet-bridge README's envelope and recipe. Tests: the envelope row, a message-level case with its unlocked control (both red before), one envelope assertion in `wallet-locked-mid-session`.
- **Review:** no plan audit (lane proportion); Codex over the plan and the diff `approve` with three low comment findings, taken.
- **Gates:** lint, `typecheck:all`, `test`, `test:components` and the network spec green at retry 0 ([lessons/phase-1.md](lessons/phase-1.md)); CI's required lanes on the PR head are the gate of record.
- **Known limits:** #1841 (D8, a lock landing after a request's admission).
- **Open items:** none.
- **Lessons:** none promoted; the typed-error hop rule already in `lessons.md` covers it.
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# locked-refusal-1: a locked wallet answers a dApp with a classified refusal

One issue, one arc, one PR against `dev`. Facts: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

**The decision**, the owner's on #1833 (chat, 2026-11-17): "#1833 -- ok, let's do that! Go with that lane", on the proposal: answer a locked wallet as a classified refusal, code 4900 with `walletErrorCode: "WALLET_LOCKED"` and a constant message; no popup on a dApp's request, no new event, no queueing.

## Outcome & Quality Bar

- **For whom**: a dApp whose connected session sends a request while the wallet is locked (Shield's background balance reads during a long withdrawal, the reporter's case).
- **Excellent**: (1) the dApp receives `{ code: 4900, message: <constant>, data: { walletErrorCode: "WALLET_LOCKED", walletTraceId } }` and can say "unlock your wallet" and retry; (2) the refusal logs at `debug`, so polling while locked writes no `error` line; (3) every in-wallet reader of the lock error behaves as today.
- **Good enough**: no event, popup, queue, stored shape, permission or dependency change.

## Assumptions

**Facts** (at `33906a052`; traces in [recon.md](recon.md)):
- F1 Every dApp message on an established session runs `profileService.captureExecutionFence()` first (`wallet-message.ts:369`); with no live session it throws `WalletLockedError` (`profile/service.ts:575`), a plain `Error("Wallet locked")`.
- F2 `toWalletResponseError` has no arm for it, so the envelope is `UNCLASSIFIED_ERROR_ENVELOPE` (-32603, "The wallet could not process the request."), and `isExpectedRefusal` does not list it, so every locked request logs at `Error` (`wallet-message.ts:451-457`, `:493-502`). The issue's claim holds, and the log line is a second defect it did not name.
- F3 The class is read by `queued-journal.ts:320` (`session_ended`) and `ui-preference/service.ts:119,255` (its own refusal), by class only. It is thrown by the fence, `sealed-entity-storage.ts:78,217,260,489` and `account-integrity/coordinator.ts:235`. Many other sites throw a plain `Error("Wallet locked")` and stay as they are.
- F4 The fence's other branch, a profile whose deletion has begun, throws a plain `Error("Wallet locked")` on purpose (`profile/service.ts:576-577`: "it is not a lock").
- F5 `traceAnswers` adds `data.walletTraceId` to every error answer (`live-session.ts:53`), so the new envelope carries it with no extra code.
- F6 `tests/e2e/network/wallet-locked-mid-session.test.ts` locks a connected wallet and sends `getChainInfo`, asserting only `status: "error"`; its header blames `silentInteraction`, but the ingress fence refuses first (F1).
- F7 The playground has no `walletErrorCode` rendering of its own (no match under `apps/playground`); nothing changes there.

**Asks**: none. The message text is the dApp API's constant, not a wallet screen (D3).

## Architecture & Implementation

- `WalletLockedError` stays a plain `Error` with message "Wallet locked" in `apps/extension/src/wallet/services/profile/wallet-locked-error.ts` and gains `static readonly CODE = "WALLET_LOCKED"`; its doc says the dApp answer is classified (D1).
- `error-envelope.ts` exports `WALLET_LOCKED_MESSAGE = "The wallet is locked. Unlock it to continue."` and adds one `CONSTANT_ENVELOPES` row `[WalletLockedError, 4900, WALLET_LOCKED_MESSAGE]`; the table's doc gains a 4900 bullet (D2, D3).
- `wallet-message.ts`: `isExpectedRefusal` lists `WalletLockedError` (D6).
- `packages/wallet-bridge/README.md` § What other error shapes look like: the new envelope and the recipe (show an unlock prompt, retry after the person unlocks; nothing queues or opens on the wallet's side).

### Phase 1: The classification, its tests, the README, the PR ✓

**Change map**

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/profile/wallet-locked-error.ts` | `CODE`; doc rewritten |
| `apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts` | `WALLET_LOCKED_MESSAGE`, one table row, a 4900 bullet |
| `apps/extension/src/wallet/services/wallet-sdk/wallet-message.ts` | `isExpectedRefusal` gains the class |
| `apps/extension/src/wallet/services/wallet-sdk/error-envelope.test.ts` | the row: the class maps to the envelope with the literal message; a plain `Error("Wallet locked")` (the deletion branch) stays unclassified |
| `apps/extension/src/wallet/services/wallet-sdk/wallet-message.trace.test.ts` | a `locked` harness option and a logger spy; one case: locked, the request answers the envelope with its own trace id, dispatches nothing and logs nothing above `debug`; control, unlocked, the same call is served |
| `apps/extension/tests/e2e/network/wallet-locked-mid-session.test.ts` | the envelope assertion (`errorEnvelopeOf` + `tracedEnvelope`); the header states the ingress refusal (F6) |
| `packages/wallet-bridge/README.md` | the envelope block and recipe |

**Validation gate** (retry 0, in order, once each; the lane's list replaces the full suites):
1. `bun run lint`
2. `bun run typecheck:all`
3. `bun run test`
4. `bun run --cwd apps/extension test:components`
5. `bun run check:plans` after staging
6. From the root, Chrome only (no fixture changes): `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/wallet-locked-mid-session.test.ts`

Pass: every command exits 0; the e2e asserts the 4900 envelope with a trace id. A red is read, never retried blind. Layers: lint, typecheck, unit, component, e2e on a local network. No e2e scenario is added (one assertion in an existing one), so no before/after wall-clock.

## Security & Adversarial Considerations

The change discloses one bit, locked or not, and only to an origin with an established, emoji-checked session on this profile: the fence runs only on such a session's messages, and a Connect while locked stays on the discovery queue, untouched. That origin could already probe it, less reliably: today every request fails while locked and succeeds once unlocked, but a failure also reads as a fault; the envelope makes the bit explicit and reliable, and adds nothing else. It is the same order of disclosure as the Terms refusal (4100), which tells any connected origin one bit about the install. The message is a constant: no method, argument, profile, account or chain. The deletion branch (F4) stays unclassified, so a begun deletion is not told apart from a fault, and `AccountAddressInconsistencyError` stays unclassified as before. No popup, event or queue is added: a site able to summon the unlock screen at will is a nagging and phishing surface, and queued background reads would pile up across a 30-minute auto-lock; the dApp's own retry after the person unlocks is the whole recovery. The log line stays at `debug` and carries only the envelope, so a polling dApp cannot fill every user's log buffer.

## UI impact

None. No wallet screen, copy or behaviour moves; the change is the dApp API's error envelope. The owner's sign-off for that envelope is quoted above and goes in the PR body.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Keep `WalletLockedError` a plain `Error` in the extension, with a static `CODE` | move it to `@nulo/extension-messaging/errors` as a `WalletError` | a `WalletError` crosses the popup RPC as a structured payload and changes in-wallet behaviour: `transfer-executor.ts:640` rethrows any `WalletError` where a lock in journal creation now becomes `OperationNotRecordedError`, whose class the Send copy keys on. Only the dApp envelope needs the discriminator, and it lives in the extension, beside `queued-journal.ts`, which already imports the class |
| D2 | One `CONSTANT_ENVELOPES` row | a dedicated arm like `SessionEndedError`'s | the table is "classified errors whose dApp message is a wallet constant", which this is; the row reads the class's `CODE` like every other |
| D3 | "The wallet is locked. Unlock it to continue." | the lane's suggestion, "The wallet is locked. Ask the person to unlock it, then retry." | the README recipe surfaces `info.message` to the person, so the text must read right to them; it mirrors the Terms refusal's form; it names nothing. dApp API text, not a wallet screen (lane brief) |
| D4 | 4900 | 4100 | the owner's words; `SESSION_ENDED` already reads 4900 as "re-request after the user unlocks" |
| D5 | The deletion branch's plain error stays unclassified | classify it as `WALLET_LOCKED` | unlocking does not bring that session back (F4) |
| D6 | The refusal logs at `debug` | `info` | a connected dApp polls while locked; `warn` and `error` reach every user's log buffer |
| D7 | One assertion in `wallet-locked-mid-session` | a new e2e scenario | the spec already drives the locked request; the message-level unit case proves the trace id and the log level |
| D8 | A lock that lands after admission keeps today's answer | reclassify the plain `Error("Wallet locked")` throws downstream | traced, not reproduced: the fence passed, then `silentInteraction` re-captures it and rethrows a plain `Error("Wallet locked")` (`dapp-interaction/service.ts:704-710`), which also covers a profile switch, so it cannot read as a lock; fenced sends answer `SESSION_ENDED`. One answer per request in flight at the lock moment; the next request answers `WALLET_LOCKED`. A known limit, filed at close-out |

## Audit verdicts

**Plan**: no audit round (lane proportion).

**Build pass** (plan and `git diff 33906a052...081ca99e3 -- apps packages`): Codex (gpt-6.1-sol, high, read-only, session `01a1eb5c`) `approve`, three low comment findings, all demonstrated and taken, comment-only, so no second round:
- C1 the class doc named only the fence; sealed storage and the integrity coordinator throw it for absent row keys too, and "no in-wallet path sees a new type" narrated history → doc rewritten to both causes and the RPC reason.
- C2 the trace test's added header line and the e2e's `callExpectingNoPopup` line restated their code → deleted; `WALLET_LOCKED_MESSAGE`'s "names nothing" → "safe to show the person verbatim, carrying no request or profile data".
- C3 the table's 4900 bullet and this plan's Security paragraph said the bit was already observable; a failure also reads as a fault, so the envelope makes it explicit and reliable → both reworded.
- Held, high confidence: D1 (nothing needs the class in the messaging package; the popup RPC and `transfer-executor.ts:640` keep their paths), every reader and thrower (keys installed before a session opens and kept across lock; no supported path answers "locked" while unlocked), `debug`, the disclosure (one bit, nothing else), D3. D8 moderate, source-traced: a supported timing race kept as a known limit (#1841).
- Targeted verification: biome on the four files and the two unit files, green.

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1 | `locked-refusal-1-a1` (the plan commit on `origin/dev`) | `dev` | `fix(wallet-sdk): a locked wallet answers a dApp with a WALLET_LOCKED refusal` (77) | #1833 |

Open the PR ready, without labels, after the gates and the Codex pass; `gh pr create`, not a stack (one arc). Body: what changed, the envelope before and after, the threat paragraph, the owner's words as the sign-off, the gates with outcomes, `Closes #1833`. Watch `gh pr checks` to the end; never merge.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `33906a052`, bounded-work form:

- **One Codex pass** after Phase 1's gates: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over the plan and `git diff origin/dev...HEAD`, with the standard's two rules verbatim and the adversarial ask, asking about the class placement (D1), every reader and thrower of `WalletLockedError` (F3), the log level, and whether the message leaks anything. A second round only if the first says anything but approve. Log it in `lessons/phase-1.md` and here.
- **Approval boundary**: any change to the discovery queue, an event, a popup, a stored shape or a wallet screen is a plan change and stops.
- **Close-out**, the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; the Outcome block; D8's known limit filed and closed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line moved; `bun run check:plans` green.
- **Teardown**: the orchestrator's.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phase 1 of implementations-plan/locked-refusal-1/plan.md marked ✓ with every gate green at retry 0; the Codex pass approve (quoted); the PR against dev open ready with Closes #1833 and the close-out's archive move; never merged.
```

```
/loop 15m Drive implementations-plan/locked-refusal-1 per its plan.md: reality check (plan, git status, PR checks); next pending step; its gate; Codex for any decision; never merge.
```
