---
plan: wallet-followups-5
tier: light
status: approved by the orchestrator (cecabc2); arc 1 in progress
issues: "#312, #302 (arc 1); #308, #310, #294, #290, #281, #262, #277 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); one Codex audit (gpt-6.1-sol, high) with an Opus 5.5 Plan lens beside it, Codex resumes only to settle disputes
post_implementation_hardening: not scheduled
base: origin/dev at 04137a0
trunk: dev
---

# Wallet follow-ups 5: a gone window closes quietly, and the log scan reads every logger call

Two issues the program's own leads filed. One arc, one PR against `dev`.

- **#312.** A page closes its own window with `closeCurrentWindow()`, a `chrome.windows.remove` with no rejection handler. When the background's `WindowManager`, or the user, removed that window a moment earlier, the remove rejects (`Invalid window ID: N` on Firefox) and nothing handles it. The fix makes the page's remove treat a gone window as closed, as every background remover already does, and leaves every other failure on today's path. It ships under the orchestrator's no_ask record (D-orch-2): no new log text.
- **#302.** `log-payload-ban.test.ts` does not read a logger's level methods (`log.warn(`, `logger?.debug(`), reads one log call per line, and scans to the end of the line. The fix reads every level method on any receiver and every call on a line, ends each call's window at its closing paren, and stops a paren inside an interpolation's string literal from ending a window early.

Recon: [recon.md](recon.md). Owner question: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, resolved by the orchestrator's no_ask record, D-orch-2). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue map (the arc that closes each issue)

| Issue | Arc | Reason |
|---|---|---|
| #302 | arc 1 (Phases 1 and 3) | closes when arc 1 merges |
| #312 | arc 1 (Phases 2 and 3) | closes when arc 1 merges (D-orch-2) |
| #308 | no arc | the e2e pool, after the e2e-followups-3 lane |
| #310 | no arc | `owner-decision` |
| #294 | no arc | `owner-decision` |
| #290 | no arc | `owner-decision` |
| #281 | no arc | owned by the e2e-followups-3 lane, which is running |
| #262 | no arc | waits on tokens-and-balances arc 1 (#271) |
| #277 | no arc | waits on decision page 7 |

## Outcome & Quality Bar

**For whom.** A maintainer who triages a Firefox e2e run's stderr or a user's exported log for real page errors, and a maintainer who adds a log line and relies on the payload scan to refuse a flattened secret.

**What excellent looks like.**

1. A window that is already gone when its page closes it leaves no unhandled rejection: no stderr line on Firefox, no "unhandled rejection" row in the log. Every window still closes on the same step as before, on both browsers. A remove that fails while the window stays open rejects unhandled, exactly as today, so the existing "unhandled rejection" row still reports it.
2. A sensitive name or an error's `.message` flattened into `log.warn(…)`, `logger?.error(…)` or any other logger level method fails `log-payload-ban.test.ts` with its `file:line`. Two log calls on one line are both read, code after a call is never read as its argument, and nothing the base scanner refuses is lost.

**What good enough looks like.** No change to any screen, to any window's close timing, or to the scanner's denylist. Spellings the scanner cannot read stay named in its header, not guarded.

## Assumptions

### Facts (verified against the tree at 04137a0)

- F1. `closeCurrentWindow` is `chrome.windows.getCurrent(undefined, cb)` then `chrome.windows.remove(window.id)` with no handler (`apps/extension/src/utils/close-current-window.ts:2-5`). Its callers: `popup/windows/verify/index.vue:87,113,170,177,193`, `composables/useDappApprovalWindow.ts:111` (the execute, capabilities, discover and network-unavailable windows), `popup/windows/json/index.vue:19`, `popup/windows/logger/index.vue:15`. No other page calls `chrome.windows.remove`.
- F2. Every background remover treats a gone window as success: `WindowManager._settle` (`wallet/services/window-manager/window-manager.ts:250`, "Window may already be closed — not an error"), `wallet-sdk/background.ts:297`, `wallet-sdk/session-established.ts:235,284`.
- F3. On every Reject, the network-unavailable dismiss and capabilities Approve, the background also removes the window (`dapp-interaction/service.ts:259,282`). The probe in #312 saw it first in 20 of 20 Rejects, but the Reject RPC is not awaited, so the order is not guaranteed. On execute Approve the background removes after the execution (`service.ts:356,358`), which can end while the page still awaits `scopeFollow.follow` (`execute/index.vue:503-504`). The page's close is the only one that keeps today's close step on execute Approve, verify, json, logger, the discover expired page and the execute wrong-profile overlay; verify's creation and adoption failures have their own background removers (`session-established.ts:235,284`).
- F4. A user's own close fires `beforeunload` → the window's `reject()` → `closeWindow(true)` → `closeCurrentWindow()` while the browser removes that window; WindowManager's `_settleUserClose` removes nothing (`window-manager.ts:223-234`).
- F5. Twelve page tests stub `remove` returning a number or `undefined`, never a promise (eleven run it; `verify/index.test.ts` never calls back). `json/index.test.ts:79-82` and the same test in `logger/index.test.ts` pin the lastError path: a `getCurrent` callback without a window throws a synchronous `TypeError` naming `window.id`.
- F6. `serialize-per-tuple.test.ts:27-48` holds `collectUnhandledRejections` (a process `unhandledRejection` collector with a macrotask flush; vitest defers to a process listener). `auth-guard.test.ts:95-109` repeats it inline.
- F7. Every popup document installs `console-forwarding.ts:16-21` (`popup/index.ts:8`), which logs any unhandled rejection that is not a client disconnect at Error level, as "unhandled rejection", into the buffer the log viewer renders and exports.
- F8. `LOG_CALL` (`apps/extension/src/utils/log-payload-ban.test.ts:96-97`) matches `.log|logDebug|logInfo|logWarn|logError(` on any receiver except `Math`, `console.<log|warn|error|info|debug|trace>(`, and a bare `log(`/`logWarn(`-style call with an optional `?.`. `findLoggedSecrets` (`:431-466`) runs `LOG_CALL.exec` once per line; `callWindow` (`:314-327`) returns the line of the balancing paren, so the window runs to that line's end.
- F9. `stripNoise` keeps a nested string's characters inside `${…}`, parens included (`:197`, `:206`), and `callWindow` counts them.
- F10. Aztec's `Logger` (`@aztec-labs/foundation@6.0.0-rc.1`, `dest/log/log-levels.d.ts`) has one method per level: `silent, fatal, error, warn, info, verbose, debug, trace`, and no `.log`.
- F11. On the scan roots, a level method on a non-`console` receiver appears 11 times, all loggers, none a same-name method of something else (§ Match table). None names a denied identifier.
- F12. Probes on the base scanner (fixtures appended, run, file restored): the D8 level-method fixtures report nothing; `console.error("x", { error }); setError(err.message)` reports `message`; a second call's continuation line is missed; a same-line second call is reported; `console.warn(\`${")"}${password}\`)` is reported (the window runs to the line's end); the same with `password` on the next line, and a nested template holding `)`, are missed. With F9's two characters blanked as parens, all three are reported, the 53 existing tests pass, and `bun run baseline:rescore` prints "24 acceptance(s) match their functions exactly".
- F13. `findLoggedSecrets` is accepted at 17 and `stripNoise` at 41 (`scripts/complexity-baseline/manifest.json:42-55`). `CLAUDE.md` § Complexity budgets states "**24 acceptances**: 10 production functions … and 14 test/CI-harness directives"; the manifest agrees, and no test hard-codes the count.

### Inferences (the gates prove them)

- I1. With the fix, the remove a `closeCurrentWindow` call makes leaves no unhandled rejection, whichever closer runs first. The lastError path before it keeps its pinned synchronous `TypeError` (F5) and is outside this claim. Phase 2's unit test proves it; Phase 3's Firefox count corroborates it.
- I2. The windows close on the same step as before: the callback stays synchronous and calls `remove` at the same point. The page tests, unchanged, prove it.
- I3. The widened scanner reports nothing on the tree (F11), and nothing the base scanner refuses is lost: every existing self-test still passes and the D8(e) single-line fixture guards the cut. Phase 1 proves it.
- I4. `findLoggedSecrets` split into three functions comes under 15, so its acceptance is deleted. If it does not, the split goes further; no new acceptance and no raised stamp.
- I5. The `stripNoise` edit leaves its score at exactly 41 (F12). Phase 1's `baseline:rescore` proves it.

### Asks

None open. OA-1 in `OWNER-ASKS.md` is resolved by the orchestrator's no_ask record (D-orch-2).

## Architecture & Implementation

### Proposed architecture

**#312.** Window removal is idempotent: the background, the page and the user may each close the same window, and "already gone" is the outcome each wants. The background's removers encode that with a handler; `closeCurrentWindow` does not. The fix stays inside the one shared util, so no caller changes. The callback stays synchronous (F5's pinned `TypeError`); it hands the remove to a private async function that is silent only when a successful window listing confirms the window is gone, not by parsing the browser's error text (which differs per browser). Any other failure rethrows the remove's own error, so it stays an unhandled rejection with today's reason and today's log row (D-orch-2):

```ts
/** Closes the browser window this page runs in; a window reported without an id is left open. */
export function closeCurrentWindow(): void {
	chrome.windows.getCurrent(undefined, (window) => {
		if (window.id) void removeWindow(window.id)
	})
}

/** The window manager or the user may close this window first: a failed remove still rejects unless a
 *  window listing confirms the window is gone. */
async function removeWindow(windowId: number): Promise<void> {
	try {
		await chrome.windows.remove(windowId)
	} catch (error) {
		if (await isConfirmedGone(windowId)) return
		throw error
	}
}

/** True only when a listing succeeds without the window; a dying page's API call can throw synchronously. */
async function isConfirmedGone(windowId: number): Promise<boolean> {
	try {
		const open = await chrome.windows.getAll()
		return !open.some((window) => window.id === windowId)
	} catch {
		return false
	}
}
```

**#302.** Four edits inside the scanner, no new file:

1. `stripNoise` blanks parens in the nested-string characters it keeps inside `${…}` (`:197`, `:206`): `line.slice(i, i + 2).replace(/[()]/g, " ")` and `ch.replace(/[()]/, " ")`. No new branch, so its score stays 41 (F12); its declaration line and the manifest do not change.
2. `LOG_CALL`'s receiver alternative gains the level methods that emit (`debug|info|warn|error|trace|verbose|fatal`, not `silent`), on any receiver, `?.` included, `Math` still excluded, with an optional call (`warn?.(`). It then covers every `console.<level>(`, so the separate `console` alternative is folded into it. The bare-port alternative stays. `LOG_CALL` takes the `g` flag.
3. Every opener on a line is read (`matchAll`), and each window ends at its balancing paren: `callWindow` returns `{ line, column }`, and the window's last line is cut after that column. Its doc comment drops "truncated window … fails closed-eyed" for the cut's reason.
4. `findLoggedSecrets` splits into `lexedLines(path, content)` (the `scannableLines` + `stripNoise` loop), `callWindows(code)` (every opener, its window and its first line) and the reporter (allowlist, `hazards`, one report per `file:line → name`). Each is under 15, so the `findLoggedSecrets` acceptance is deleted and the manifest regenerated.

### File-level change map

| File | Change |
|---|---|
| `apps/extension/src/utils/close-current-window.ts` | the code above |
| `apps/extension/src/utils/close-current-window.test.ts` | new: three cases (D3) |
| `apps/extension/tests/helpers/unhandled-rejections.ts` | new: `collectUnhandledRejections`, moved from `serialize-per-tuple.test.ts` unchanged (D4) |
| `apps/extension/src/wallet/services/account/serialize-per-tuple.test.ts` | imports the helper; its local copy is deleted |
| `apps/extension/src/popup/auth-guard.test.ts` | its inline collector uses the helper |
| `apps/extension/src/utils/log-payload-ban.test.ts` | `stripNoise`'s two lines; `LOG_CALL` and its doc comment; `callWindow` returns the column; `lexedLines`, `callWindows`; `findLoggedSecrets` without its directive; five new self-tests (D8) |
| `scripts/complexity-baseline/manifest.json` | regenerated by `bun run baseline:complexity` (23 entries; `log-payload-ban.test.ts: 1`) |
| `CLAUDE.md` | § Complexity budgets: "**23 acceptances**" and "13 test/CI-harness directives", only if the acceptance is deleted |

No caller of `closeCurrentWindow` changes, and no page test changes (F5: `await` accepts their stubs, and the synchronous `TypeError` stays synchronous).

### Match table (#302: every new opener on the tree)

| File:line | Call | Receiver | Verdict |
|---|---|---|---|
| `apps/extension/src/wallet/services/execution/claim-helper.ts:84` | `logger?.debug(\`… ${queuedJournalId} …\`)` | the claim helper's logger (forwards to `logDebug`/`logInfo`/`logError`, `execution-lane.ts:516-520`) | logger; ids only; no hazard |
| `claim-helper.ts:114` | `logger?.info(\`… ${queuedJournalId} is ${stage} …\`)` | same | logger; no hazard |
| `claim-helper.ts:131` | `logger?.debug(\`… ${queuedJournalId} …\`)` | same | logger; no hazard |
| `claim-helper.ts:170` | `deps.logger?.error("Failed to terminalize …", { journalId, error: err })` | same | logger; error under a key; no hazard |
| `claim-helper.ts:206` | `logger?.info(\`… ${stageBeforeRefile} …\`)` | same | logger; no hazard |
| `claim-helper.ts:210` | `logger?.info(\`… was aborted before re-file …\`)` | same | logger; no hazard |
| `claim-helper.ts:214-217` | `logger?.info(` two templates: journal id, account addresses, network ids `)` | same | logger; public identifiers; no hazard |
| `claim-helper.ts:235` | `logger?.info(\`… left the pre-claim stage …\`)` | same | logger; no hazard |
| `claim-helper.ts:244` | `logger?.debug(\`… already at pending …\`)` | same | logger; no hazard |
| `claim-helper.ts:262` | `logger?.info(\`… ${recheck.progress?.stage}'d …\`)` | same | logger; no hazard |
| `packages/aztec-runtime/src/pxe/opfs-store.ts:220` | `log.warn("PXE store version mismatch …", { detail: mismatch })` | Aztec `Logger` (`:201`) | logger; no denied name in the window (D9) |

Lines with two calls (`incoming-transfer/service.ts:376`, `aztec-runtime/src/pxe/service.ts:685,708`) and a call followed by code (`token-balance/service.ts:550`) name no denied identifier either.

### Trade-offs and alternatives not taken

See the decision ledger: no ownership change and no `window.close()` (D1); no `async` callback and no stub rewrite (D2); a gone-check, not a blanket catch (D2); the paren fix in the lexer, not in a second cleaning pass (D11); no receiver allowlist (D5).

## Decision ledger

Both legs' views are in § Audit verdicts; each line here is the decision and its reason.

- **D-orch-1. No stack.** One branch, one PR against `dev`; the close-out lands as its final commits.
- **D-orch-2. OA-1 is resolved by the orchestrator, not the owner: #312 ships in this arc under a no_ask record, with no new words.** The record is quoted in § UI impact. Only the confirmed-gone case is silent; every other outcome keeps today's path (the remove's error rethrown, so the existing "unhandled rejection" row reports it). The planned "This window could not be closed" row and its `error` payload are dropped. The rest of D2 stands: the synchronous `getCurrent` callback, the private async remover, the `getAll` listing in its own `try`. Phases 2 and 3 wait on nothing.
- **D-orch-3. D9 is filed at close-out** as an issue (dedupe first; five sections; `privacy` label; `Record` link to the archived plan), not fixed here.
- **D-orch-4. #308 is not this lane's.** The `send-keyboard` smoke failure belongs to the e2e pool; its file and fixtures are not touched, and a gate that hits it is reported, never worked around.
- **D-orch-5. No release-class dispatch.** `nightly.yml`, `release*.yml` and `publish-*.yml` are never dispatched. Every e2e run goes through `agent.sh` (ports from `~/.agents/ports.md`), retry 0, the stall watchdog untouched; parallel runs with e2e-followups-3 (PR #313) on this host are allowed.
- **D-orch-6. `lessons.md` is at 8190 bytes.** Promote nothing unless a retirement pays for it; no wholesale reformat; reconcile against `origin/dev` right before the final gates (#313's close-out edits `index.md` and `lessons.md`), never a union merge.
- **D-orch-7. The complexity manifest shrinks only.** Deleting `findLoggedSecrets`'s acceptance means `bun run baseline:complexity` in the same PR and the CLAUDE.md counts (24→23, 14→13) in the same commit; the `stripNoise` stamp stays exactly what `baseline:rescore` reports.
- **D1. #312: the page's remove handles a gone window; the ownership stays as it is.** Both legs agree. The issue offers a second fix: stop the pages WindowManager settles from closing themselves. Rejected: the page's close is the only one that keeps today's close step on most paths (F3), so each page would have to know which background path removes its window (`settle` and `cancel` do, `detach` and `handOver` do not), tying the UI to WindowManager's internals; a page-only design loses the background's timeout and cancel cleanup; and the user is a closer no ownership scheme removes (F4). `window.close()` was also considered: it cannot reject, but in a tab it closes only the tab where `remove` closes the browser window, and whether every window that pushed router history may still close itself through it is unverified on both browsers.
- **D2. #312: a synchronous callback and a private async remover that is silent only when the window is gone.** An `async` callback (the first draft) breaks F5's pinned synchronous `TypeError` and turns it into an unhandled rejection (Opus). `.catch(() => undefined)` on the remove works but needs eleven page-test stubs rewritten to return a promise, for no behaviour, in files other lanes edit (Opus names the private remover as the fallback). A blanket catch exceeds "already gone" (Codex): after `closeWindow(true)` the unload rejection is detached, so a remove that fails while the window stays open must stay visible; it does, as today's unhandled rejection (the remove's error rethrown, D-orch-2). A failed `chrome.windows.get` would only show that the lookup failed (Codex, resumed), so absence is confirmed by a successful `chrome.windows.getAll()` that does not list the window; a failed listing rethrows the original error. Matching error text would not work on both browsers (Chrome's "No window with id", Firefox's "Invalid window ID"). The listing sits inside its own `try`, because a dying page's extension call can throw synchronously ("Extension context invalidated" in Chromium's bindings; Codex, resumed), and a throw there must still surface the remove's error. The planned "This window could not be closed" line is dropped (D-orch-2): no new string reaches the log.
- **D3. #312's test.** New `close-current-window.test.ts` with a `chrome.windows` stub holding a live set {7}: `getCurrent` calls back with `{ id: 7 }`; `remove(id)` resolves and drops a live id, or rejects with `Error("Invalid window ID: 7")` and records the id in a `refused` list; `getAll()` resolves with the live windows, rejects while a `failList` flag is `"reject"`, or throws synchronously while it is `"throw"`; a `failRemove` flag makes `remove` reject while 7 stays live. Case 1, the probe's order: 7 is already removed; after `closeCurrentWindow()` and a macrotask, `refused` is `[7]`, nothing was collected, and `console.error` was not called. Case 2, the success control: 7 is live; it is removed once, `refused` is empty, nothing collected. Case 3, an unconfirmed failure keeps today's path, in three setups: `failRemove` alone (7 still listed), then with `failList` `"reject"`, then with `failList` `"throw"`; in each, exactly one rejection was collected and it is the remove's own error, and `console.error` was not called (D-orch-2). Case 1 is red on base; case 3 passes on base by design, since it pins that the fix leaves this path as it was. No handler is attached to the stub's promises, so a collected rejection is never hidden by the test itself (both legs).
- **D4. The collector moves to `apps/extension/tests/helpers/unhandled-rejections.ts`.** It would otherwise exist three times (F6). Both legs agree.
- **D5. #302: level methods on any receiver, with an optional call.** The scanner is receiver-agnostic on purpose (its own comment). The tree has no same-name non-logger method (F11); a future one fails safe with a refusal naming its `file:line`. A receiver allowlist would miss `this.deps.l.warn(`. `logger.warn?.(` is read too (Opus).
- **D6. #302: `silent` is not an opener.** It emits nothing.
- **D7. #302: the `console` alternative folds into the receiver alternative.** Every `console.<level>(` contains `.<level>(` (Opus checked it is exact).
- **D8. #302's self-tests**, each asserting the exact offender list: (a) for each of the seven level methods, `log.<m>(\`k=${password}\`)` and `logger?.<m>("x", password)`, plus `this.deps.l.warn?.(\`k=${password}\`)`: 15 offenders, each on line 1, red on base; (b) `console.error("x", { error }); setError(err.message)` reports nothing, red on base; (c) `promise.catch((error) => console.warn("x", { error })); this.logWarn(` / `\tpassword,` / `)` reports line 2, red on base; (d) control: `console.warn("ok", { error }); this.logWarn(\`k=${password}\`)` reports line 1 (the cut never drops a second call); (e) a `)` kept inside an interpolation's string never ends a window: `console.warn(\`${")"}${password}\`)` reports line 1, and two multi-line calls (`this.logWarn(\`${")"}\`,` and `this.logWarn(\`${\`a)${b}\`}\`,`, each followed by `\tpassword,` / `)`) report line 2; red on base for the two multi-line forms (F12).
- **D9. #302: `opfs-store.ts:220` keeps its line here.** The widened scanner reads it, and `{ detail: mismatch }` names no denied identifier. On a parse failure `mismatch` carries the parser's message, bound from `errorMessageFromUnknown` before the call: a flattened error by the letter of CLAUDE.md § Logging policy, through the local binding the scanner's header names as a false negative (Codex: do not call it safe; Opus: file it). It is not an offender the widening surfaces, so the lane brief's fix rule does not reach it; the close-out files it as an issue (after `gh issue list --state all --search "opfs-store"`).
- **D10. #312's callers.** Every caller in F1 is covered by the util; none changes. Swept and unaffected: `passkey/index.vue`, `own-window.ts`, `settings/display.vue`, `onboarding/*` close with `window.close()`, which returns nothing; `core/adapters/chrome-browser-api.ts:196` is `WindowPort.remove`, whose callers all handle the rejection (F2).
- **D11. #302: the kept-paren cause is fixed in `stripNoise`.** Both legs found that the column cut loses `console.warn(\`${")"}${password}\`)`; the base already loses the multi-line form (F12). Opus proposed counting parens over `blankComparisonLiterals(line)`, which leaves `stripNoise` alone but still counts a paren in a nested template literal or a bracket key. Chosen: blank the paren where `stripNoise` keeps it, which fixes the window count and `enclosingBracket` together. The probe shows its score unchanged at 41 and its declaration line untouched, so the manifest holds; `bun run baseline:rescore` is the proof.
- **D12. The Firefox measurement corroborates; the unit test proves.** A dying page prints a lost race only sometimes (4 of 20 in the probe), so a zero alone proves little (both legs). The check: list each step in the six files that closes a window through `closeCurrentWindow` (`file:line`, K per run); run the six files N times at base, each run to its own log, with N the smallest count that gives N×K ≥ 20 and at least 3 lines matching `Invalid window ID|No window with id` in total (add runs until both hold); run them the same N times on the head; the head total must be 0, and any head line is traced to its source, never rerun away.

## Security & Adversarial Considerations

- **Threat model.** #312: none new. The page removes its window after it has sent its decision (approve, reject, refuse) or with none to send; the change moves no message, no `beforeunload` registration and nothing in `useDappApprovalWindow`'s order. A remove the browser does not confirm gone still rejects unhandled with the browser's error, as today; the window stays visibly open, as it does today. The change leaves no approval pending that is not pending today: a decision RPC that is sent but fails, together with a failed remove, already leaves one until WindowManager's timeout. A dApp cannot reach `closeCurrentWindow`. #302: the scanner is a privacy guard over log output a user may export (CLAUDE.md § Logging policy). Its risk is a false negative. The widening and the multi-opener read remove false negatives; the paren fix (D11) removes the early window end; the cut removes a false positive, and D8(d) and D8(e) pin that it drops nothing the base reads.
- **Least privilege, cryptography, supply chain.** No permission, key, dependency or workflow changes. `chrome.windows.getAll` needs no permission.
- **Input validation.** The scanner reads repository source, not user input. A malformed file still fails typecheck and lint first; an unbalanced call still runs its window to EOF.
- **Log redaction.** No new log line (D-orch-2). A real failure reaches the log through `console-forwarding.ts`'s existing unhandled-rejection row, unchanged.

## UI impact

No screen changes. The lane brief's owner boundary is the whole visible budget: "Nothing a person sees changes: a window closes when it closes today, and the scanner is a test." Every window keeps its close step (I2). One effect a person could notice went to the owner as OA-1: the log viewer (Settings → Developer → Logs) and its CSV export no longer gain an "unhandled rejection" Error row when a window was already gone (F7). The orchestrator resolved it (D-orch-2):

> Orchestrator no_ask record, 2026-10-11, precedent #205 / #210 / #214: a bug fix that restores intended behaviour with existing words. The log viewer stops gaining an Error row for a window that was already closed; no new log text is added.

The constraint that makes it a no_ask: only the gone-window case (a remove that rejects and a successful `windows.getAll()` that confirms the window absent) is silent; every other outcome keeps today's path exactly, so its rejection propagates as it does now and the existing "unhandled rejection" row is what a real failure shows.

## Phases

### Phase 1: the scanner reads every logger call (#302) ✓

1. Add the five self-tests of D8. Run the file and see (a), (b), (c) and (e) fail on the base scanner, and (d) pass.
2. Blank the kept parens in `stripNoise` (D11). Do not change its declaration line.
3. Widen `LOG_CALL` (D5 to D7) and give it the `g` flag. Rewrite its doc comment to name the level methods and Aztec's `Logger`.
4. Make `callWindow` return `{ line, column }`. Read every opener on a line, and cut each window after its closing column. Rewrite `callWindow`'s doc comment to match.
5. Split `findLoggedSecrets` into `lexedLines`, `callWindows` and the reporter. Delete its directive. From the worktree root, run `bun run baseline:complexity`, then `bun run baseline:rescore`. If a function is still over 15, split further: never a new acceptance, never a raised stamp.
6. If step 5 deleted the acceptance, edit CLAUDE.md § Complexity budgets to "**23 acceptances**" and "13 test/CI-harness directives".
7. Check the match table. Copy the scanner's functions into a scratch script under `~/.cache/nulo-backlog/wallet-followups-5/`. List every window the new scanner opens on a level method of a non-`console` receiver. The list must equal the 11 rows of § Match table, and the tree must report no offender.
8. Commit: `test(logging): read every logger call in the payload scan, end each window at its call`.

**Validation gate.**

- Commands: `cd apps/extension && bun --bun vitest run src/utils/log-payload-ban.test.ts`; then, from the worktree root, `bun run lint`, `bun run typecheck:all`, `bun run baseline:rescore`, `bun run test:ci-gating`.
- Pass criteria: every command exits 0. The step 1 red run (four failing tests) and the step 7 list (11 windows, 0 offenders) are quoted in `lessons/phase-1.md`. The manifest holds 23 entries with `stripNoise` still at 41.
- Layers: lint, typecheck, unit, CI gating.

### Phase 2: a gone window closes quietly (#312)

This phase runs under the orchestrator's no_ask record (D-orch-2, quoted in § UI impact and `STATUS.md`); it waits on nothing.

1. List each step in the six network files that closes a window through `closeCurrentWindow`, with `file:line`, in `lessons/phase-2.md`. Its count is K.
2. Before any #312 code edit, do the base runs of D12 on Firefox. Phase 1 changed only a test, the manifest and CLAUDE.md, so the built extension equals the base's. Write each run to `~/.cache/nulo-backlog/wallet-followups-5/ff-before-<n>.log`. Record N, K and the line total in `lessons/phase-2.md`.
3. Write `close-current-window.test.ts` (D3) and move the collector (D4). Run the new file and see case 1 fail on the base util (case 3 passes there by design, D3).
4. Change `close-current-window.ts` as § Proposed architecture shows. Run the new file again: all three cases pass.
5. Commit: ``fix(windows): treat an already-closed window as closed in `closeCurrentWindow` ``.

**Validation gate.**

- Commands: `cd apps/extension && bun --bun vitest run src/utils/close-current-window.test.ts src/wallet/services/account/serialize-per-tuple.test.ts src/popup/auth-guard.test.ts src/composables/useDappApprovalWindow.test.ts src/popup/windows`; then, from the worktree root, `bun run lint` and `bun run typecheck:all`.
- Pass criteria: every command exits 0. The step 3 red run is quoted in `lessons/phase-2.md` (case 1 collects one `Invalid window ID: 7` rejection). Every page test passes unchanged, the lastError `TypeError` pins included.
- Layers: lint, typecheck, unit.

### Phase 3: final validation on the arc head

1. Do the head runs of D12 on Firefox: the same N runs, each to `ff-after-<n>.log`.
2. Run the six files once on Chrome at retry 0.
3. Run the full local gates.

**Validation gate.**

- Commands, all from the worktree root. Each Firefox run: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_BROWSER=firefox bun run e2e:agent tests/e2e/network/cap-request-reject.test.ts tests/e2e/network/connect-deny.test.ts tests/e2e/network/connect-unserved-chain.test.ts tests/e2e/network/connect-one-window.test.ts tests/e2e/network/snack-placement.test.ts tests/e2e/network/cap-window.test.ts --retry=0 > ~/.cache/nulo-backlog/wallet-followups-5/ff-after-<n>.log 2>&1; echo "exit=$?"` (a redirect, not a pipe: the agent shell reports a pipe's last stage). Then `cat ~/.cache/nulo-backlog/wallet-followups-5/ff-after-*.log | grep -cE "Invalid window ID|No window with id"`: it prints the total and exits 1 when the total is 0, which is the expected status here. The Chrome run is the same command without `NULO_E2E_BROWSER`, to `chrome-after.log`. Then `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating`, `bun run test:release`.
- Pass criteria: every e2e run exits 0 at retry 0 (one rerun only for a known flake fingerprint in the `e2e-testing` skill's ledger; that run's log is kept too). The head total is 0 over N runs, against the base total of at least 3 (D12); both totals, N and K are in `lessons/phase-3.md`. Every other command exits 0. Never run two `e2e:agent` runs in this worktree at once.
- Layers: lint, typecheck, unit, CI gating, release, network e2e on both browsers.

## Delivery

Single-arc plan, the orchestrator's standing D-orch-1: one branch (`worktree-wallet-followups-5`), one PR against `dev`, no stack. The close-out lands as that PR's final commits.

| Arc | Phases | Stacks on | `/code-review` |
|---|---|---|---|
| arc 1 | 1, 2, 3 | `dev` | off |

- **One path (D-orch-2).** The PR carries both issues and its body quotes the orchestrator's no_ask record (`STATUS.md` is deleted at close-out).
- **PR title** (84 characters): `fix(windows): close an already-gone window quietly; log scan reads every logger call`.
- **PR body:** what changed and why; the panel's decisions on the kept paren (D11) and on #312's owner (D1, D2); the no_ask record; the Firefox totals; the Phase 1 red list and the match table; the claims that did not hold (below); `Closes #302` and `Closes #312`.
- **Open it** with `gh pr create --base dev` only after the Phase 3 gate passes and the Codex fix loop converges. Open it without labels, then read the run list: add `e2e:extension-network` only if the path filter skipped the network suite.
- **Commits:** conventional, lower-case subject, signed (`git log --format='%h %G?' -3` shows no `N`); if a commit hangs, rerun it as `env -u SSH_AUTH_SOCK git commit …`. Each ends with a `Co-Authored-By:` line naming the model that wrote it. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not merge.** The orchestrator merges.

### Claims that did not hold

- #312, "Choosing between them is a product call": no. Neither fix changes a screen; the lane brief gives the choice to the panel (D1).
- #312, "the window is removed twice" when a request is answered: on every Reject, the network-unavailable dismiss and capabilities Approve, and on execute Approve when the execution ends first. Not on discover Allow (the window is handed over). Verify's double removes come from a user's own close or a background failure path.
- #312, "None visible to a person": a lost race can add an "unhandled rejection" Error row to the log viewer (F7, OA-1, resolved by D-orch-2).
- #302, "`deps.logger?.debug(`, `?.info(`, `?.error(`": nine of the ten calls are on a destructured `logger?.`, one on `deps.logger?.`; the logger is the extension's forwarding type, not Aztec's.
- #302 left one blind spot unnamed: a `)` inside a string inside `${…}` already ended a multi-line window early (F12, D11).

## Post-implementation

Run these steps in order after the Phase 3 gate passes. `code_review` is `off`, so there is no `/code-review` step.

1. **Codex audit.** Run `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. Write the prompt under `~/.cache/nulo-backlog/wallet-followups-5/`. It carries: the diff from the plan base (`git diff 04137a0...HEAD`, or from the merged `origin/dev` base), this `plan.md` with its decision ledger, an adversarial and security ask, and both rules below, word for word. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`; if that fails too, log the failed consult in `lessons/phase-3.md` and continue on your own judgment within scope.
2. **Fix loop.** Verify each finding against the repository first. Apply the accepted fixes, commit, and log the round (the consult and its verdict) in `lessons/phase-3.md`. Then resume the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and the fix diff. Repeat until a round brings no new material finding. Hard stop at three rounds: if round three still finds material problems, stop and surface them in the report.
   - **No-over-engineering rule:** "Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."
   - **Comment-quality rule:** "Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."
3. **Delivery.** Merge `origin/dev` into the branch first. Read what changed in `implementations-plan/index.md` and `lessons.md` (the e2e-followups-3 close-out edits both); never a union merge. Rerun the fast gates, then open the PR per the Delivery section. This is the first PR the plan opens.
4. **Close-out, as the PR's final commits.**
   - Write an `## Outcome` block directly after the front matter: date, status, what shipped with the PR number, the dispositions (D1's rejected alternatives, D2's rejected forms, D11's rejected alternative), an `Open items:` line, and a line retiring this plan's `/goal` and `/loop` seeds.
   - `lessons.md` is at its 8 KiB budget: promote nothing unless a retirement pays for it.
   - File D9 as an issue (five sections, `privacy` label, `Record` linking the archived plan), after `gh issue list --state all --search "opfs-store"` and `--search "errorMessageFromUnknown"`; name it on the `Open items:` line.
   - Comment on #302 and #312 with the claims that did not hold.
   - Delete `STATUS.md`.
   - In its own commit: `git mv implementations-plan/wallet-followups-5 implementations-plan/archive/wallet-followups-5`, repair any relative link the extra level breaks (`git grep -n wallet-followups-5`), and move the index line into `implementations-plan/archive/index.md` marked completed.
   - Run `bun run check:plans` on the staged files before each close-out commit.

   | Situation | Home |
   |---|---|
   | Work inside the implementation you are on | the active `plan.md` and the PR |
   | Actionable work that outlives the plan: a bug, a gap, a missing test, a deferred refactor | a GitHub issue, with a domain label and a `Record` link to the archived plan |
   | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` (the body names the trigger) |
   | A suspected exploitable weakness | a private draft security advisory; `plan.md` records only "tracked privately: GHSA-…" until it is published |
   | Rejected, superseded or already done | a disposition line in the plan's Outcome block; no open item anywhere |
   | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
   | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
   | Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

5. **Report and wait.** Write the report: what shipped, each panel decision with both views, the Phase 1 red list, the Firefox totals, open items by number. Merging is the orchestrator's call.
6. **Teardown after the merge.** The check is `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-5/plan.md`. A `/loop` session runs it on every firing. A session without a loop arms one background wait right after its report (`Bash` with `run_in_background` at the maximum timeout: `until <the check>; do sleep 300; done`). Once it succeeds, run `ExitWorktree` with `keep` if the session entered through `EnterWorktree` (a session started inside the worktree has nothing to exit), then `agent-worktree done wallet-followups-5 --merged`. It refuses rather than forces: relay a refusal and stop. This step is standing authorization; do not ask first.

## Audit verdicts

- **Codex, round 1** (gpt-6.1-sol, high, read-only, session `01a12d12`): reject (with blocking findings: column truncation can hide a logged secret; D8 does not test this regression).
  - Accepted: (1, High) the kept-paren window end, fixed at its cause (D11) with D8(e); (2) the blanket catch replaced by a gone-check that keeps a real failure visible (D2); (3) F3 and F4 restated (order observed, not guaranteed; execute Approve's later remover; verify's background failure paths); (4) every root script runs from the worktree root, and the CLAUDE.md count edit is conditional; (5) the Firefox count framed as corroboration, every run's log kept, a reproduced base required, both browser spellings counted (D12); (6) D9's wording qualified.
  - Positions: agreed with D1, with D2's `await` form (superseded by Opus's finding below), with D3/D4 (no handler on the rejected promise: adopted), D5–D8, D9 left in place.
- **Opus 5.5 Plan lens, round 1:** conditional approve (with conditions: keep `closeCurrentWindow`'s callback synchronous; stop the column cut from losing a payload behind a paren kept inside a nested string; run the root scripts from the repo root; say that the fix removes a phantom Error row from the user's log).
  - Accepted: (1, High) the synchronous callback (F5, D2); (2, High) the kept paren, fixed in `stripNoise` rather than by its proposed `blankComparisonLiterals` count (D11, reason there); (3) gate directories; (4) the log row, disclosed (F7, OA-1, § UI impact); (5) the measurement (D12); (6) `warn?.(` read (D5); (7) a receiver an allowlist would miss, exact lines (D8); (8) I4 says split further; `callWindow`'s comment rewritten; (9) refusals recorded in the stub (D3); Ask (b), D9 filed at close-out.
  - Rejected: the `.catch` form with eleven stub rewrites as the first choice (D2: Opus's own fallback, the private remover, needs no test edit and keeps both pins).
  - Corrected in recon: a line starting with `.method(` is read by the receiver alternative.
- **Codex, round 1 resumed** (same session): conditional approve (with conditions: distinguish failed lookup from confirmed absence; obtain explicit owner sign-off for log-viewer changes). The original scanner blocker is resolved.
  - Accepted: (1) absence confirmed by a successful `getAll()` listing, the remove's error logged when the listing fails, and a test setup for that (D2, D3); (2) OA-1 turned from a disclosure into an ask that gates #312's delivery, with #302 shipping either way (§ Delivery; phases reordered so #302 comes first); (3) I1 limited to the remove path, the pending-approval and redaction wording in § Security made exact; (4) `grep -c`'s exit 1 on a zero total accepted explicitly.
  - Its positions: D11 is the better fix (its probes passed ordinary and escaped parens, nested templates, bracket keys holding `)`, denied bracket keys, comparison literals and safe objects; `blankComparisonLiterals` is insufficient); the synchronous callback with the private async remover is right; the D12 measurement and D9's tracking are sound; the D8 set is the smallest useful one.
  - Complexity wording: Codex notes CLAUDE.md § Complexity budgets says both that an acceptance "stays until its function is rewritten on merit" and that a touched accepted function is refactored under budget. D11 edits `stripNoise`'s body without changing its score, branches or declaration; the lexer stays the accepted design its adjudication records, and `baseline:rescore` proves the stamp. Refactoring a 41-point lexer state machine to fix two characters is the rewrite the owner's rule forbids.
- **Codex, round 1 resumed again** (same session, on revision 3): conditional approve (with conditions: catch synchronous failures of the getAll invocation). Applied in this version: `isConfirmedGone` holds the listing in its own `try` and D3 case 3 adds a synchronous-throw setup; the owner's own answer to OA-1, not the orchestrator's approval, gates Phase 2, and the PR body quotes it. Codex found no other material finding; with its one condition applied verbatim, the gate's Codex verdict is satisfied without another round.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose.

```
/goal All phases marked ✓ in implementations-plan/wallet-followups-5/plan.md (Phase 2 runs under the no_ask record, D-orch-2), each ✓ backed by its phase's validation gate reported passing in the transcript; for each phase the agent has printed `LESSONS_FILE=implementations-plan/wallet-followups-5/lessons/phase-N.md`; the Phase 1 red run and the Phase 2 red run are quoted in the transcript; the Firefox count over the same N runs is at least 3 on base and 0 on the head, quoted with N and K; `/code-review` was NOT run (code_review: off); the Codex fix loop on gpt-6.1-sol at high converged over the whole diff, evidenced by a resumed pass reporting no new material findings, quoted in the transcript; one PR against dev exists, opened only after the loop converged (`gh pr view` output in the transcript), carrying `Closes #302` and `Closes #312` and the close-out commits, including the archive move (`git show --stat` of that commit in the transcript); `bun run test:all` and `bun run lint` both report exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/wallet-followups-5 forward. Never idle waiting for input. Each firing:
1. Reality check: read implementations-plan/wallet-followups-5/plan.md and lessons/ (not the chat), including its Outcome & Quality Bar. If that path is gone, the close-out ran: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-5/plan.md` succeeds → run the teardown now (ExitWorktree keep if entered through EnterWorktree, then `agent-worktree done wallet-followups-5 --merged`), report its output, clear this loop and STOP; fails → babysit the PR's checks only, report once when green, STOP. A live plan.md with an `## Outcome` means an interrupted close-out: finish it. Otherwise rebuild the task list from plan.md; run `git status`, `git log --oneline -5`; with a PR, `gh pr view --json statusCheckRollup`.
2. Waiting on CI is fine; confirm it progresses (`gh run watch <id>` up to 10 minutes), use the wait to review the diff.
3. No task in hand? Take the next pending step in plan.md. After each edit run `bun run lint` (from the worktree root) and the touched tests. Commit (signed, conventional, lower-case subject).
4. Stuck or facing a decision? Consult Codex (`env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol`), settle on the stronger argument, log it in lessons/phase-N.md. Never merge, publish, force-push or widen scope; a UI question goes to OWNER-ASKS.md and that part is left out.
5. Same step failed 5 times? Stop retrying; reassess with Codex.
6. Phase green means its plan.md gate passes: paste the result, mark ✓, write the lessons entry, print LESSONS_FILE=…, move on.
7. All phases ✓? Run the Post-implementation section: the Codex fix loop until clean (hard stop at 3 rounds), then the PR, then the close-out commits, then `gh pr checks --watch`, then the report. Merging is the orchestrator's call.
```
