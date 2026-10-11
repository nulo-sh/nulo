---
plan: wallet-followups-4
tier: light
status: approved (orchestrator, at 6462113); arc 1 in implementation
issues: "#299 (arc 1); #294, #290, #281, #262, #277 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet); one Codex audit (gpt-6.1-sol, high) with an Opus 5.5 Plan lens beside it, one Codex resume to settle disputes
post_implementation_hardening: not scheduled
base: origin/dev at 27af8d7
trunk: dev
---

# Wallet follow-ups 4: errors reach the log as objects, and the scanner refuses the flatteners

One privacy issue, #299, found by the program's own lead. One arc, one PR against `dev`.

Log lines flatten a caught error into a finished string before the logger sees it. The redactor (`trim` in `apps/extension/src/wallet/logger/utils.ts`) projects an `Error` to `{ name, message }`, with the message URL-scrubbed and capped at 200 characters and the stack dropped. A string gets URL scrubbing only. `warn` and `error` lines are kept for every user and reach the log viewer's CSV export, the path by which a log becomes a public bug report (CLAUDE.md § Logging policy). The fix passes the error under a named key at 26 sites, logs a fixed category at the 2 lines whose text can quote a stored row, deletes the one helper whose only use is the flattening, and teaches `log-payload-ban.test.ts` to refuse the two spellings it can read.

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue map (the arc that closes each issue)

| Issue | Arc | Closes when |
|---|---|---|
| #299 | arc 1 (Phases 1 to 3) | arc 1 merges |
| #294 | no arc | `owner-decision` |
| #290 | no arc | `owner-decision` |
| #281 | no arc | owned by the e2e-followups-3 lane, which is running |
| #262 | no arc | waits on tokens-and-balances arc 1 (#271) |
| #277 | no arc | waits on decision page 7, P7-09 |

## Outcome & Quality Bar

**For whom.** A maintainer who reads a log a user exported into a bug report, and the user whose log it is.

**What excellent looks like.**

1. Each of the 26 sites in § File-level change map records a thrown `Error` as the projected `{ name, message }` object, never as a stack or an uncapped message string. The 2 migration lines log a fixed message and a category, never the reason text. Each line keeps its level and, where it has one, its message text.
2. A new log call that hands `getErrorData(…)`, an error's `.message` or its `.stack` to the logger fails `log-payload-ban.test.ts` with its `file:line`, including in `wallet/logger/console-forwarding.ts`. The scanner's header names the spellings found that it cannot read.

**What good enough looks like.** No change to what a screen shows, no change to a log line's level, no change to the redactor, no shared rejection handler, no new logger API. Spellings the scanner cannot read (a flattener bound to a local first, `String(err)`, `${err}`, `err["message"]`) are fixed where the audit found them and named in the header, not guarded.

## Assumptions

### Facts (verified against the tree at 27af8d7)

- F1. `getErrorData` is `(error as Error)?.stack ?? getErrorMessage(error)` (`packages/wallet-core/src/utils/errors.ts:17`). Its 13 calls in the repository are the 13 log sites #299 lists, at the issue's line numbers; its only other reference is `apps/extension/src/wallet/logger/console-forwarding.test.ts:3,54,55`. `@nulo/wallet-core` is private, and no published npm entry reaches the helper (`scripts/publish/packages.ts`).
- F2. `LoggerStore.log` runs `trim` over `data`, and `data[0]` is the line's message (`apps/extension/src/wallet/logger/store.ts:61,76`). `trim` projects an `[object Error]` or `[object DOMException]` at any position or key (`utils.ts:157,201`). `documentLogger` trims before its RPC (`wallet/services/logger/client.ts:51`), so a popup or offscreen `Error` is projected before `jsonSanitize` could flatten it.
- F3. The three direct extractions #299 lists hold (`export/account.vue:192`, `export/full.vue:413`, `utils/files.ts:181`). Five more sites use the same spelling: `composables/full-backup-restore.ts:761,769`, `composables/useFullBackupImport.ts:458,509`, `popup/components/modules/settings/contacts/useContactImportExport.ts:130` (recon § Whole-tree audit).
- F4. Within the call windows the scanner recognises, a `.message` or `.stack` member read occurs at exactly those eight sites. A rough model found them (`lessons/phase-0.md`); both audit legs then ran the scanner's own functions in memory with the three scanner changes and got exactly 21 offenders: the 13 `getErrorData` calls and these 8. Phase 1 step 4 is the authoritative run.
- F5. `log-payload-ban.test.ts` refuses any occurrence of a denied name that is not an object key (`hazards`, line 412); `EXTRA_NAMES` (line 60) bans `getErrorMessage` and `errorMessageFromUnknown` by name. Its `ALLOWLIST` skips all of `apps/extension/src/wallet/logger/` (line 90), which holds `console-forwarding.ts`. In that directory only `utils.ts` names denied identifiers; `store.ts` and `index.ts` hold no log call, and `utils.ts`'s `console._debug(` and siblings do not match `LOG_CALL`.
- F6. Five more log lines flatten a caught error through a local bound from a flattener in the same `catch`: `wallet/services/note/service.ts:131-132`, `packages/aztec-runtime/src/pxe/service.ts:1003-1006`, `wallet/services/token-balance/balance-projector.ts:156-160`, `popup/windows/execute/index.vue:384-386`, `popup/pages/settings/advanced/account-state/notes/index.vue:81-82`. Each local has a second, non-log use that stays. No other local bound from a flattener reaches a log call.
- F7. Unit tests run with `documentLogger` mocked silent (`apps/extension/tests/vitest.setup.ts:9-13`): a popup line is observable only through a `console.*` spy. No test imports `offscreen/index.ts` or `wallet/index.ts`; the smoke suite boots both but never drives their rejection branches. No test mounts `export/account.vue` or `account-state/notes/index.vue`.
- F8. No production code reads `data[0]`'s text. The log viewer and the CSV export render a string element as is and an object as JSON (`components/JsonViewer/logs-format.ts:58-65`, `logs-csv.ts:19`). The one test that asserts the old arguments is `console-forwarding.test.ts:54-55`.
- F9. `wallet/runtime.ts:394` (error) and `:433` (warn) log `migration.reason` inside a template string. The reason can carry a `JSON.parse` excerpt of a malformed stored row (`packages/wallet-core/src/migration/staging.ts:27-30`, reaching `migrator.ts:213,331,346,425`). The reason is also the recovery screen's text (`migrator.ts:77`) and the persisted blocked or degraded status (`runtime.ts:404`, `:434`); neither changes here.
- F10. RPC rejections are rebuilt as real `Error`s at the transport (`packages/extension-messaging/src/errors.ts:589-595`); Chrome API rejections are `Error`s. Neither audit leg found a producer of a plain-object rejection or a thrown plain object on the tree.
- F11. `packages/aztec-runtime/src/pxe/opfs-store.ts:216-220` logs, through Aztec's own `Logger` (`@aztec-labs/foundation/log`, which writes to the console the extension forwards), a mismatch string that embeds the parse error of the PXE's version stamp. The stamp's writer stores a schema version and a public rollup address (`opfs-store.ts:224`); `DatabaseVersion.fromBuffer` parses it as JSON, so a malformed stamp's diagnostic can quote an excerpt of those bytes.

### Inferences (the gates prove them)

- I1. No log line's level changes and no screen changes: every edit replaces one argument or a string's interpolated error, and adds a fixed message only where the line has none (Phase 2's diff review; F8).
- I2. With `getErrorData` in `EXTRA_NAMES`, the member-read rule and the narrowed allowlist, the scanner on unfixed sources reports exactly the 13 `getErrorData` sites and the 8 direct extractions, and nothing else (Phase 1 step 4 proves it).
- I3. For a non-`Error` value, the change widens what can reach the log. A plain object whose `stack` or `message` is not nullish used to contribute that one selected value; under `{ error }` its other fields are walked too, with `trim`'s key-name redaction and depth bound, as every logged object is. A plain object with neither was already logged raw. A string stays uncapped, before and after. No producer of such objects was found (F10).

### Asks

- None open. Everything a person would see stays as it is; the orchestrator's no-ask record covers log lines (§ UI impact).

## Architecture & Implementation

### Proposed architecture

No new code path. Each site hands the caught error to the logger under the key `error`, as CLAUDE.md § Logging policy asks and as the five #295 lines do; `trim` does the rest. Five pieces:

1. **The sites** (table below): 13 `getErrorData` calls, 8 direct extractions, 5 locals bound from a flattener. A line without a message gains a fixed one; a line with a message keeps it. Locals with a second use stay; only their log use changes.
2. **The two migration lines** (F9). They log a fixed message and a category (`kind` or `version`) under named keys. The reason stays where it is shown and stored. This follows `lessons.md`: an error message can quote its input, so log a fixed category.
3. **The helper.** `getErrorData` has no caller once the sites move (F1). Delete it from `packages/wallet-core/src/utils/errors.ts`.
4. **The scanner** (`apps/extension/src/utils/log-payload-ban.test.ts`):
   - `EXTRA_NAMES` gains `getErrorData`, beside the two flatteners it already bans; the comment above it covers three flatteners.
   - A member read matching `(?<!\.)\.\s*(?:message|stack)\b` inside a log-call window is a hazard in every position, except an arity read (`err.message.length`). The lookbehind keeps a spread (`...message`) out. This is the existing "not an object key, so a hazard" rule applied to a member read, which is never a key; it sits in `occurrences` or `hazards` so the arity filter still applies.
   - `ALLOWLIST`'s `wallet/logger/` entry narrows to `wallet/logger/utils.ts`, the redactor that must name what it redacts.
   - The header's known-false-negative paragraph names the spellings found that it cannot read: a flattener bound to a local first, `String(err)`, `${err}`, `err.toString()` and computed access (`err["message"]`).
5. **The policy text.** One clause in CLAUDE.md § Logging policy: a caught error goes under `{ error }`, and the scanner refuses `getErrorData` and a `.message` or `.stack` read at a log call.

### File-level change map

| File | Change |
|---|---|
| `apps/extension/src/offscreen/index.ts:51` | `logger.log("pxe", LogLevel.Error, "unhandled rejection", { error: e.reason })`; drop the `getErrorData` import |
| `apps/extension/src/wallet/index.ts:73` | `logger.log("wallet", expected ? LogLevel.Debug : LogLevel.Error, "unhandled rejection", { error: e.reason })` |
| `apps/extension/src/wallet/index.ts:100,112` | `"price alarm dispatch failed", { error }`; `"Runtime start failed", { error }`; drop the import |
| `apps/extension/src/wallet/logger/console-forwarding.ts:21` | `logger.log("ui", disconnect ? LogLevel.Debug : LogLevel.Error, "unhandled rejection", { error: e.reason })`; drop the import |
| `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue:383,705,731` | keep each message; the second argument becomes `{ error: e }`; drop the import |
| `apps/extension/src/popup/windows/network-unavailable/index.vue:82` | `console.error("Network-unavailable window init failed", { error })` |
| `apps/extension/src/popup/windows/discover/index.vue:89,115` | `"Discover window init failed", { error }`; `"Discover approve failed", { error }` |
| `apps/extension/src/popup/windows/capabilities/index.vue:178,333` | `"Capabilities window init failed", { error }`; `"Capabilities approve failed", { error }` |
| `apps/extension/src/popup/pages/settings/security/export/account.vue:192`, `export/full.vue:413` | `console.error("Download failed:", { error: err })` |
| `apps/extension/src/utils/files.ts:181` | `` console.warn(`Failed to decompress ${file.name}:`, { error: err }) `` |
| `apps/extension/src/composables/full-backup-restore.ts:761,769` | `console.error("[full-backup] restore failed; rollback incomplete:", { error: err })`; `console.error("[full-backup] restore failed:", { error: err })` |
| `apps/extension/src/composables/useFullBackupImport.ts:458,509` | keep each message; `{ error: err }` |
| `apps/extension/src/popup/components/modules/settings/contacts/useContactImportExport.ts:130` | `console.error("Export failed:", { error: err })` |
| `apps/extension/src/wallet/services/note/service.ts:132` | `this.logError("Failed to parse note", { error })` |
| `packages/aztec-runtime/src/pxe/service.ts:1006` | the error branch logs `{ error: err }` in place of `message` |
| `apps/extension/src/wallet/services/token-balance/balance-projector.ts:160` | `this.logger?.log(TOKEN_BALANCE_SERVICE_NAME, LogLevel.Error, "Failed to sync chunk", { error: err })` |
| `apps/extension/src/popup/windows/execute/index.vue:386` | `` console.warn(`[Execute] previewTokenMetadata failed for ${op.address}`, { error: err }) `` |
| `apps/extension/src/popup/pages/settings/advanced/account-state/notes/index.vue:82` | `console.warn("[notes] failed to build display row:", { error: err }, note)` |
| `apps/extension/src/wallet/runtime.ts:394` | `logger.log("wallet", LogLevel.Error, "Storage migration blocked boot", { kind: migration.kind })` |
| `apps/extension/src/wallet/runtime.ts:433` | `logger.log("wallet", LogLevel.Warn, "Storage migration failed on an additive migration; booting degraded", { version: migration.version })` |
| `packages/wallet-core/src/utils/errors.ts:17` | delete `getErrorData` |
| `apps/extension/src/utils/log-payload-ban.test.ts` | the scanner changes and the header sentence above; the self-tests of Phase 1 |
| `apps/extension/src/wallet/logger/console-forwarding.test.ts` | its two assertions expect the new arguments; drop the import |
| `CLAUDE.md` § Logging policy | the one clause above |
| the test files of Phase 2 step 1 | one assertion per changed line an existing test file can drive |

### Trade-offs and alternatives not taken

- **Bound every value under `error` in the redactor** (Codex round 1). A string or plain object under `error` would get an error-shaped, capped projection. Rejected after the resume (D9): no producer of such values exists on the tree (F10), it changes the meaning of every existing `{ error: … }` line, and `trim` is an accepted complexity function whose stamp the CI ratchet will not raise. I3 and § Security state the residual instead.
- **Keep `getErrorData` and only ban it.** It would keep an exported helper whose every use is the defect. Deleting it removes the only producer; the `EXTRA_NAMES` entry is #299's own proposed fix and costs one entry (D3).
- **One shared `unhandledrejection` logger for the three contexts.** The three classify expected rejections differently (the worker also treats a gone receiver as expected; the offscreen logs a fixed benign line and swallows a logger failure). Unifying them changes behaviour beyond a log argument (D1).
- **A `String(…)` rule.** Rejected in wallet-followups-3 (D4 there): `base-client.ts:248` is a legitimate `String(event)`, and a rule on `String` alone gives false coverage. The member-read rule has no false positive on the tree (F4) and needs no level parsing.
- **`message` as a denied name.** It would refuse every log wrapper that forwards a `message` parameter (`execution/service.ts`, `transfer-executor.ts:570` and others). The member read is the exact spelling.
- **A fixed category instead of `{ error }` at the backup and contacts sites.** `lessons.md` asks for a category where the message can quote file content (`JSON.parse`). These five sites log a download, a restore RPC or a `completeImport` failure, not a parse of the file; restore errors are already allowlisted per service (`wallet/services/restore-rows.ts`). The one parse site, `useContactImportExport.ts:194`, already logs a category and is unchanged.
- **Change the migration reason at its source** (`staging.ts:30`). It would change the recovery screen's text, an owner question. The log lines change instead (D10).

## Decision ledger

Each line: the decision, both legs' views, the outcome and why.

- **D1. Each site's shape.** Draft: `{ error }` (or `{ error: <local name> }`); a line with no message gains a fixed one; the three rejection handlers log `"unhandled rejection"` with `{ error: e.reason }` at their current levels; no shared handler. Codex: agree; the handlers' classification and failure behaviour differ. Opus: agree; the fixed first field keeps the line readable. **Outcome: as drafted.**
- **D2. Scope beyond the listed 16.** Draft: fix the 5 extra direct extractions and the 5 locals bound from a flattener; leave `opfs-store.ts` and `runtime.ts`. Codex round 1 (High): agree with the ten; the two exclusions confuse UI text with log text and an unread opener with a fix. Opus: agree with all; the ten are the same defect, and the extractions must move anyway or D4 turns the scan red. **Outcome: the ten are in; `runtime.ts` moves in (D10); `opfs-store.ts` stays out (D11).**
- **D3. `getErrorData`.** Draft: delete and ban, because Azguard's upstream still has the helper. Opus: agree, but the reason does not hold (git history has one Azguard import and no later port). Codex: agree, drop the port argument. **Outcome: delete and ban; the ban is #299's proposed fix at one entry's cost.**
- **D4. A rule for the direct extraction.** Draft: a `.message` / `.stack` member-read rule. Codex: agree, a conservative syntactic rule; it will also flag a benign `event.message`, and needs no receiver heuristics; keep the arity exception and test it. Opus: agree; ran it over the tree (21, nothing else); the draft regex also matched a spread. **Outcome: the rule with the `(?<!\.)` lookbehind, a spread control, an optional-member case and an arity control.**
- **D5. The allowlist.** Draft: narrow to `wallet/logger/utils.ts`. Both legs: agree; nothing else in the directory is flagged. **Outcome: as drafted.**
- **D6. Tests.** Draft: pins only where an existing test already drives the failure; no new failure case only to reach a log line. Codex (Medium): disagree; the alias sites have no scanner guard, so they need pins, through existing builders first; no new notes-page file is needed. Opus (Medium): the smallest proving set is the scanner, `console-forwarding.test.ts` and the alias sites with existing reach; pins on scanner-visible lines only fix shape. The lane brief asks for one assertion per changed line where a file's builders reach it. **Outcome: one assertion per changed line whose failure path an existing test file can drive, through an existing case or one new case in that file; alias sites and the migration lines first. No new test file: the lines no test file reaches (the four entry-module lines, `export/account.vue`, `account-state/notes/index.vue`) are listed with the reason in `lessons/phase-2.md`.**
- **D7. `LOG_CALL`'s unread openers** (`log.warn(` in `opfs-store.ts`, `logger?.error(` in `claim-helper.ts`). Both legs: agree, out of this arc; extending the opener means judging receivers (`toast.error(` is no logger). **Outcome: the close-out opens one issue (dedupe first).**
- **D8. Network e2e.** Draft: none, because every touched file is loaded by a test or booted by smoke. Codex: agree on none, but the reason overstates coverage (`export/account.vue` has no test; smoke never drives the rejection branches). Opus: agree. **Outcome: none; the reason is that every change is a log argument, guarded by the scanner, the targeted pins, typecheck and smoke, and no touched line is reached only by the network suite.**
- **D9. Bound non-`Error` values under `error` in `trim`** (Codex round 1, High). Opus: no new exposure; RPC rejections are rebuilt as `Error`s (F10), and no producer of a plain-object rejection exists. Codex, resumed: withdraws the blocker, as the change is disproportionate to #299 with no producer found; the widening also covers objects with a `stack`, and I3 must say "no producer found", not "none exists". **Outcome: no redactor change; I3 and § Security restated.**
- **D10. The migration lines** (`runtime.ts:394,433`). Codex round 1: fix with a fixed category. Opus: the reason can carry a `JSON.parse` excerpt of a stored row (F9); it had judged leaving right because logging the error itself would need a new field on the migration result. Codex, resumed: agree with the fixed message and `{ kind }` / `{ version }`; pin with a reason that holds a sentinel, which must be absent from the logged arguments. **Outcome: fixed message plus the category; the reason stays on screen and in storage.**
- **D11. `opfs-store.ts:216-220`.** Draft: out, as Aztec's `Logger` is another API and the thrown error is projected. Codex, resumed: agree to leave it out, because the stamp holds only a schema version and a public rollup address (F11); but Aztec's logger reaches the same forwarded console, so it is no privacy boundary, and projecting the later thrown error does not sanitize the earlier warning. **Outcome: out; the residual (a malformed stamp's parse excerpt, unbounded, in a warn line) is recorded in § Security and the Outcome, not called protected.**
- **D12. The red runs.** Opus (Medium): reverting a line after `getErrorData` is deleted makes a non-TypeScript SFC fail with a TypeError, not the assertion's diff. Codex: agree. **Outcome: every red run happens before the helper is deleted (Phase 2 step 2).**
- **D13. Phase 3's unit commands.** Draft: `bun run test` and `bun run test:all`, claiming the first adds coverage. Codex: wrong; `test:all` includes `@nulo/extension`, so it already runs the extension's jsdom configuration, and CI's unit job runs `test:all` (`.github/workflows/_unit-tests.yml:25`). **Outcome: Phase 3 runs `test:all` only.**
- **D14. The commit trailer.** Opus (Low): take it from the implementing session's reminder. **Outcome: kept as the orchestrator's common brief names it (`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`); the brief governs.**
- **D-orch-1. No stack** (the orchestrator's standing call): one branch, one PR against `dev`; the close-out lands as that PR's final commits.
- **D-orch-2. The widened scope stands** (orchestrator, approving the plan): 28 lines, `getErrorData` deleted and banned (D2, D3). The red run must list exactly the 21 offenders named here, and every one of the 28 lines is in the PR body's table with its before and after.
- **D-orch-3. D10 and D11 as settled** (orchestrator): the two migration lines log a fixed category with `{ kind }` / `{ version }` and never the reason; `opfs-store.ts:216-220` stays out. Its residual is a disposition line in the Outcome unless it names actionable work, in which case it joins the D7 close-out issue.
- **D-orch-4. The CLAUDE.md change is one sentence** (orchestrator) in § Logging policy, stating the rule the scanner enforces; no other CLAUDE.md edit, the routing table untouched.
- **D-orch-5. D12 and the two-commit order are binding** (orchestrator): every red run before the helper's deletion; the sites in one commit and the scanner file in the next, so the scanner commit can be run alone against the sites commit.
- **D-orch-6. Merge `origin/dev` before delivery** (orchestrator): e2e-followups-3 may land first and edits `index.md` and `lessons.md`; read what changed, never a union merge, and rerun Phase 3's gates on the merged head.

## Security & Adversarial Considerations

- **Threat model.** The asset is the content of an exported log: a user attaches it to a public bug report. An attacker who controls an error's text (a hostile dApp's RPC error, a crafted backup file, a node's response) can try to plant data in it, and a stack carries file paths. After the fix, an `Error` or `DOMException` at any of the 26 sites is projected: its name plus a URL-scrubbed message capped at 200 characters, no stack. The two migration lines log no error text at all.
- **What the projection does not do.** It does not remove a secret a thrower interpolated into a message; keeping one out stays the thrower's job (`utils.ts:172`). The cap bounds exposure; it does not sanitize.
- **Non-`Error` values (I3).** A string under `error` stays uncapped, as it was. A plain object whose `stack` or `message` is not nullish used to contribute that one value and is now walked, with key-name redaction and a depth bound; no producer of such objects was found (F10). The redactor is not changed (D9).
- **Residual left (D11).** A malformed PXE version stamp's parse excerpt still reaches a warn line uncapped, through Aztec's `Logger`. The stamp's writer stores only a schema version and a public rollup address.
- **The guard.** The scanner is textual: aliasing through a local, `String(err)`, `${err}`, `err.toString()`, computed access and wrapper indirection defeat it, and its header says so. The member-read rule refuses a `.message` in every position, including `{ msg: err.message }`, because `trim` never caps a string under a benign key.
- **Least privilege, cryptography, supply chain.** No change: no dependency, permission, key or workflow.

## UI impact

None. No screen, copy, row or format changes; the recovery screen keeps its reason. Log lines change: their text where an error was interpolated or the stack was the message, and their shape in the log viewer and its CSV export (a JSON object where a string was). No level changes. The orchestrator's no-ask record, quoted from the lane brief: "Nothing a person sees changes: log lines only, and no log line's level changes."

## Phases

### Phase 1: the scanner refuses the two spellings ✓

Done: five red self-tests, then exactly the 21 expected offenders ([lessons/phase-1.md](lessons/phase-1.md)).

Write the self-tests first and see them red, then change the scanner.

1. In `log-payload-ban.test.ts`, add self-tests, with paths as the file's other cases use them:
   - `console.error("x", getErrorData(e))` gives one offender naming `getErrorData`;
   - `console.error("Download failed:", err?.message || err)` gives one offender (an optional member read);
   - `` this.logWarn(`failed: ${err.stack}`) `` gives one offender;
   - `console.warn("x", { msg: err.message })` gives one offender (a benign key does not make a member read safe);
   - `logger.log("ui", LogLevel.Error, getErrorData(e.reason))` at path `apps/extension/src/wallet/logger/console-forwarding.ts` gives one offender, and the existing redactor case at `wallet/logger/utils.ts` still gives none;
   - the controls give no offender: `console.error("x", { error })`, `console.error("x", { error: err }, { message: "fixed" })`, `console.warn("x", { ...message })` (a spread) and `` this.logDebug(`len ${err.message.length}`) `` (an arity read).
2. Run `cd apps/extension && bun run test -- src/utils/log-payload-ban.test.ts`. Expect the five refusing cases red and the four controls green. Record the output in `lessons/phase-1.md`.
3. Make the scanner changes (§ Proposed architecture, item 4).
4. Run the same command on the unfixed sources. Expect every self-test green and the whole-tree test red, listing exactly the 13 `getErrorData` sites and the 8 direct extractions (21 lines) and nothing else. Record the list in `lessons/phase-1.md`. Any other line is a finding: stop and settle it with Codex before Phase 2.

**Validation gate.**
- Commands: steps 2 and 4.
- Pass criteria: step 2 shows the five red cases and the four green controls; step 4 shows every self-test green and exactly the 21 expected offenders. Both outputs are in `lessons/phase-1.md`. Phase 1 is not committed on its own: its whole-tree test is red until Phase 2.
- Layers: unit (the scanner).

### Phase 2: the pins, the sites, the helper ✓

Done: 22 pins red then green, 6 lines without reach listed, the gate green ([lessons/phase-2.md](lessons/phase-2.md)). Commits `fix(logging): log caught errors under a named key` and ``test(logging): refuse `getErrorData` and error message reads at log calls``.

Warning: keep `getErrorData` in `errors.ts` until step 4. A line reverted after the deletion fails with a `TypeError`, not with the assertion's diff.

1. Add the pins. For each changed line, find the existing test file whose builders can drive its failure path (recon § Test reach). Add one assertion there, through an existing case or one new case in that file. Do the alias sites and the migration lines first. Assertion forms:
   - Real `LoggerStore`: find the entry by `data[0]` (`loggedAfter` in `apps/extension/tests/helpers/logged.ts`) and expect `[{ error: { name: "Error", message: "<thrown message>" } }]`.
   - A `console.*` spy or a mocked logger: expect the message and `{ error: <the thrown error> }`, with `toBe` on `error` where the test holds the instance, else `expect.objectContaining({ message: "<thrown message>" })`.
   - `console-forwarding.test.ts:54-55`: `("ui", LogLevel.Debug, "unhandled rejection", { error: disconnect })` and `("ui", LogLevel.Error, "unhandled rejection", { error: other })`.
   - The two migration lines (`runtime.ts:394,433`): in the runtime test that drives a blocked or degraded outcome (`runtime.blocked-persist.pins.test.ts`, `runtime.migration-gate.test.ts`, `runtime.test.ts`), give the reason a sentinel string. Expect the line's fixed message with `{ kind }` or `{ version }`, and expect the sentinel in none of the line's arguments.
   - Known starting points: `note/service.test.ts:132` (`brokenNoteDao`), `execute/index.test.ts:658-663` (the metadata catch), `balance-projector.test.ts:210-216`, `FeeSettingsCard.test.ts:1014`, `discover/index.test.ts:289,308`, `capabilities/index.test.ts:300`, `files.settle.pins.test.ts:84` (replace `expect.anything()`; keep the message check).
   - A line no test file reaches gets no new file. Write the line and the reason in `lessons/phase-2.md`. Expected: `offscreen/index.ts:51`, `wallet/index.ts:73,100,112`, `export/account.vue:192`, `account-state/notes/index.vue:82`.
2. Run the new assertions on the unfixed lines: `cd apps/extension && bun run test -- <each touched test file>`, and `bun run --cwd packages/aztec-runtime test -- <file>` for an aztec-runtime pin. Expect each new assertion red on its own diff (the old string or reason in the arguments). Record the output in `lessons/phase-2.md`.
3. Change every site in the file-level change map. Keep each message string that exists. Rerun step 2's commands and expect green.
4. Delete `getErrorData` from `packages/wallet-core/src/utils/errors.ts` and remove every import of it. Run `rg -n 'getErrorData' apps packages scripts` and expect only `log-payload-ban.test.ts`.
5. Add the clause to CLAUDE.md § Logging policy (§ Proposed architecture, item 5).
6. Run the gate.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun run test`; `bun run --cwd packages/aztec-runtime test`; `bun run --cwd packages/wallet-core test`.
- Pass criteria: every command exits 0, including the scanner's whole-tree test. `rg -n 'getErrorData' apps packages scripts` lists only `log-payload-ban.test.ts`. Each new assertion's red and green runs, and each line with no pin with its reason, are in `lessons/phase-2.md`. No existing assertion was loosened or removed; `console-forwarding.test.ts`'s two assertions changed only their expected arguments, and `files.settle.pins.test.ts` only got stricter.
- Layers: typecheck/lint, unit, component.
- Commits: two signed conventional commits. First: the sites, the pins, the helper's deletion and the CLAUDE.md clause (`fix(logging): log caught errors under a named key`). Second: only `log-payload-ban.test.ts` (``test(logging): refuse `getErrorData` and error message reads at log calls``; commitlint does not case-check a backticked identifier). Nothing imports the scanner file, and the old scanner refuses a subset of what the new one refuses, so the first commit's tree is green whenever the head is. Write that reasoning in `lessons/phase-2.md`.

### Phase 3: final validation on the arc head

Warning: smoke loads whatever `dist/chrome` holds. Build right before the run, and never run two e2e runs in this worktree at once.

1. Run `bun run lint`, `bun run typecheck:all`, `bun run test:all` (it includes `@nulo/extension`), `bun run test:ci-gating` and `bun run lint:actions`.
2. Build and run the Chrome smoke suite at retry 0. It boots the offscreen document and the worker, whose handlers changed, and its runner claims its ports through `~/.agents/ports.md`:
   `cd <worktree> && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome && cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`
3. Record each command's outcome in `lessons/phase-3.md` and `STATUS.md`.

**Validation gate.**
- Commands: steps 1 and 2.
- Pass criteria: every command exits 0; smoke passes at retry 0. A red smoke file gets one rerun only for a known flake fingerprint (the `e2e-testing` skill lists them); anything else is a fix. The stall watchdog's limit stays as it is.
- Layers: typecheck/lint, unit, component, e2e smoke (Chrome).

## Delivery

Single-arc plan, the orchestrator's standing D-orch-1: one branch (`worktree-wallet-followups-4`), one PR against `dev`, no stack. The close-out lands as that PR's final commits.

| Arc | Phases | Stacks on | `/code-review` |
|---|---|---|---|
| arc 1 | 1, 2, 3 | `dev` | off |

- **PR title** (81 characters, lower-case subject): `fix(logging): log caught errors under a named key, refuse flatteners at log calls`.
- **PR body:** what changed and why; the audit's counts (16 listed, 28 changed, 1 left with its reason); the Phase 1 red list and the Phase 3 outcomes; `Closes #299`; the claims that did not hold (8 direct extractions, not 3; 5 more through a local; 2 migration lines).
- **Open it** with `gh pr create --base dev` only after the Phase 3 gate passes and the Codex fix loop converges. Open it without labels, then read the run list: add `e2e:extension-smoke` only if the path filter skipped the smoke suite.
- **Commits:** conventional, lower-case subject, signed (`git log --format='%h %G?' -3` shows no `N`); if a commit hangs, rerun it as `env -u SSH_AUTH_SOCK git commit …`. Each ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not merge.** The orchestrator merges.

## Post-implementation

Run these steps in order after the Phase 3 gate passes. `code_review` is `off`, so there is no `/code-review` step.

1. **Codex audit.** Run `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. Write the prompt under `~/.cache/nulo-backlog/wallet-followups-4/`. It carries: the diff from the plan base (`git diff 27af8d7...HEAD`, or from the merged `origin/dev` base), this `plan.md` with its decision ledger, an adversarial and security ask, and both rules below, word for word. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`.
2. **Fix loop.** Verify each finding against the repository first. Apply the accepted fixes, commit, and log the round (the consult and its verdict) in `lessons/phase-3.md`. Then resume the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and the fix diff. Repeat until a round brings no new material finding. Hard stop at three rounds: if round three still finds material problems, stop and surface them in the report.
   - **No-over-engineering rule:** "Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."
   - **Comment-quality rule:** "Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."
3. **Delivery.** Merge `origin/dev` into the branch first. Read what changed in `implementations-plan/index.md` and `lessons.md` (the e2e-followups-3 close-out edits both); never a union merge. Rerun the fast gates, then open the PR per the Delivery section. This is the first PR the plan opens.
4. **Close-out, as the PR's final commits.**
   - Write an `## Outcome` block directly after the front matter: date, status, what shipped with the PR number, the dispositions (D9's redactor change rejected, D11's residual, D14's trailer), an `Open items:` line, and a line retiring this plan's `/goal` and `/loop` seeds.
   - `lessons.md` is at its 8 KiB budget: promote nothing unless a retirement pays for it.
   - File open items, per the table below. D7 becomes one issue after `gh issue list --state all --search "LOG_CALL"` and `--search "log-payload"`, with the five sections (`## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`) and the `privacy` label.
   - Comment on #299 with the claims that did not hold, the site left out (D11) with its reason, and the redactor change not made (D9).
   - Delete `STATUS.md`.
   - In its own commit: `git mv implementations-plan/wallet-followups-4 implementations-plan/archive/wallet-followups-4`, repair any relative link the extra level breaks (`git grep -n wallet-followups-4`), and move the index line into `implementations-plan/archive/index.md` marked completed.
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

5. **Report and wait.** Write the report: what shipped, each panel decision with both views, the Phase 1 red list, open items by number. Merging is the orchestrator's call.
6. **Teardown after the merge.** The check is `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-4/plan.md`. A `/loop` session runs it on every firing. A session without a loop arms one background wait right after its report (`Bash` with `run_in_background` at the maximum timeout: `until <the check>; do sleep 300; done`). Once it succeeds, run `ExitWorktree` with `keep` if the session entered through `EnterWorktree` (a session started inside the worktree has nothing to exit), then `agent-worktree done wallet-followups-4 --merged`. It refuses rather than forces: relay a refusal and stop. This step is standing authorization; do not ask first.

## Audit verdicts

- **Codex, round 1** (gpt-6.1-sol, high, session `01a12b4f`): reject (with blocking findings: unsafe non-`Error` rejection handling; unjustified exclusions of the same flattening defect).
  - Accepted: `runtime.ts:394,433` move in (D10); I3 restated (it understated the widening); D6's alias sites need pins through existing builders (D6); D8's coverage claim corrected; F4 qualified to the scanner's recognised windows and the evidence described accurately; computed access added to the header's false negatives; D4 described as a conservative syntactic rule; the two `[full-backup]` messages take the trailing colon; Phase 3 runs no duplicate unit pass (D13, settled on the resume).
  - Rejected after the resume: the redactor change (D9), withdrawn by Codex; moving `opfs-store.ts` in (D11), withdrawn by Codex with the residual recorded.
  - Independently reproduced: exactly 21 offenders on unfixed sources.
- **Opus 5.5 Plan agent, round 1:** conditional approve (with conditions: take the Phase 2 red runs while `getErrorData` still exists; stop the member-read regex matching spreads; restate I3 and the Security claim; aim D6's assertions at the sites the scanner cannot see).
  - Accepted: D12's red-run order; the spread lookbehind and its control; I3 and § Security restated; alias sites first in D6; D3's reason replaced; the phase-0 note's direction corrected; F9 (the migration reason's `JSON.parse` excerpt); the header says "the spellings found" and adds computed access; the CLAUDE.md clause; the two-commit reasoning recorded; precise assertion forms; `client.ts:51` and `files.settle.pins.test.ts:84`.
  - Rejected: leaving `runtime.ts` out (D10; its own F9 finding made the fixed category the house rule); taking the commit trailer from the session (D14; the orchestrator's brief names it); "the other assertions are optional" (the lane brief asks for one per reachable line).
  - Independently reproduced: exactly 21 offenders, with the real scanner functions over 1,686 files.
- **Codex, round 1 resumed:** conditional approve (with conditions: correct the non-`Error` widening description, the OPFS exclusion rationale, and the Phase 3 coverage rationale). All three are in this version (I3, § Security, D11, D13), so the gate's Codex verdict is satisfied without another round.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose.

```
/goal All phases marked ✓ in implementations-plan/wallet-followups-4/plan.md, each ✓ backed by its phase's validation gate reported passing in the transcript; for each phase the agent has printed `LESSONS_FILE=implementations-plan/wallet-followups-4/lessons/phase-N.md`; the Phase 1 red run lists exactly the 21 expected offenders and is quoted in the transcript; `/code-review` was NOT run (code_review: off); the Codex fix loop on gpt-6.1-sol at high converged over the whole diff, evidenced by a resumed pass reporting no new material findings, quoted in the transcript; one PR against dev exists, opened only after the loop converged (`gh pr view` output in the transcript), carrying `Closes #299` and the close-out commits, including the archive move (`git show --stat` of that commit in the transcript); `bun run test:all` and `bun run lint` both report exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/wallet-followups-4 forward. Never idle waiting for input. Each firing:
1. Reality check: read implementations-plan/wallet-followups-4/plan.md and lessons/ (not the chat), including its Outcome & Quality Bar. If that path is gone, the close-out ran: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-4/plan.md` succeeds → run the teardown now (ExitWorktree keep if entered through EnterWorktree, then `agent-worktree done wallet-followups-4 --merged`), report its output, clear this loop and STOP; fails → babysit the PR's checks only, report once when green, STOP. A live plan.md with an `## Outcome` means an interrupted close-out: finish it. Otherwise rebuild the task list from plan.md; run `git status`, `git log --oneline -5`; with a PR, `gh pr view --json statusCheckRollup`.
2. Waiting on CI is fine; confirm it progresses (`gh run watch <id>` up to 10 minutes), use the wait to review the diff.
3. No task in hand? Take the next pending step in plan.md. After each edit run `bun run lint` and the touched tests. Commit (signed, conventional, lower-case subject).
4. Stuck or facing a decision? Consult Codex (`env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol`), settle on the stronger argument, log it in lessons/phase-N.md. Never merge, publish, force-push or widen scope; a UI question goes to OWNER-ASKS.md and that part is left out.
5. Same step failed 5 times? Stop retrying; reassess with Codex.
6. Phase green means its plan.md gate passes: paste the result, mark ✓, write the lessons entry, print LESSONS_FILE=…, move on.
7. All phases ✓? Run the Post-implementation section: the Codex fix loop until clean (hard stop at 3 rounds), then the PR, then the close-out commits, then `gh pr checks --watch`, then the report. Merging is the orchestrator's call.
```
