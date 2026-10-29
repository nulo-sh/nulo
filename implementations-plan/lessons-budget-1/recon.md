# lessons-budget-1: recon

Base: `origin/dev` at `87d04118e`. Three Explore agents (sonnet), read-only: two checked every `lessons.md` entry against the tree, its linked evidence and the docs that might already hold it; one checked the candidates from the three archived plans against their natural homes. Their claims were spot-checked by hand; the reproductions are named inline.

## Reuse map

| Capability | Existing | Verdict |
|---|---|---|
| Budget and entry-shape gate | `scripts/ci-cd/plans/structure.ts` (`LESSONS_BUDGET` 8192, `curatedBudgetFindings`: one line per entry, at least one evidence link into `implementations-plan/` or an allowlisted permalink, no link leaving the plan tree); `structure.test.ts:259` pins 8192 / 8193 | reuse as is: `bun run check:plans`, `bun test scripts/ci-cd/plans/` |
| Link gate for routed text | `scripts/ci-cd/plans/links.ts` `LIVE_DOCS` covers root `*.md` (`CI.md`), `.claude/skills/**`, package READMEs; every link there must resolve | reuse as is |
| Home for a chaos-session rule | `apps/extension/tests/e2e/README.md` § Chaos runs, the `passkey` row (what a fleet agent reads with its charter) | adapt: one sentence |
| Home for a logging rule | `.claude/skills/logging-policy/SKILL.md` (CLAUDE.md: read before adding a log line) | adapt: one bullet |
| Home for a workflow-authoring rule | `CI.md` (CLAUDE.md: read before changing a workflow) § Adding a new gate | adapt: one paragraph |
| Home for a stack-delivery rule | `implementations-plan/README.md` § Post-implementation standard, step 3 | adapt: one sentence |
| A new file, script or test | none needed | build nothing |

## Path filters

Any change under `apps/extension/**` trips every e2e lane (`pr-extension-{smoke,network}-e2e*.yml` filters), so a routed line goes to `.claude/skills/`, `CI.md` or `implementations-plan/` when its readers read those; none of those trips a lane. The chaos rule's readers read only the e2e README, so that PR runs the e2e lanes. `lint-and-typecheck` and `unit-tests` (which runs `test:ci-gating`, so `check:plans`) run on every PR (`pr-quick.yml:235-247`).

## Entry by entry (numbered in file order, L1 to L33)

Installed now: Bun 1.4.2, Vue 3.5.42, VTU 2.4.11, vue-tsc 3.3.10, zod 4.6.7, zsh 5.9, `@aztec-labs/*` 6.0.0, the e2e Firefox 158.0. Every evidence file and anchor resolves.

- L1 Bun `--parallel`: holds. Reproduced on 1.4.2: the failing leg prints `Exited with code 3`, the other `Signaled: SIGINT`, the script exits 3. Not stated elsewhere.
- L2 root `test`: holds for tests (`package.json` `test` = `--cwd apps/extension test`; `apps/extension/vitest.config.ts:29` jsdom; `:37-48` also takes six packages' `src` tests and `scripts/`, `:50-70` excludes the node-only ones). Its "`audit:vue` runs only `apps/extension`" is stale: `audit:vue`'s typecheck and lint legs are repo-wide.
- L3 vue-tsc: holds; 158 of 233 extension SFCs lack `lang="ts"`, and no extension tsconfig sets `checkJs`. Reproduced on vue-tsc 3.3.10: a wrong prop from a JS `<script setup>` passes, the same from a `lang="ts"` one fails TS2322. Not stated elsewhere.
- L4 Vue unit tests: holds (`vitest.config.ts:14-15` auto-imports `vue` and `vue-router` only); versions match the stamp.
- L5 success control: holds; not in CLAUDE.md or a skill. Its "match screenshot state exactly" comes from `archive/harden-dedupe/plan.md#success-control` (a substring accepts `Mainx` for `Main`; `innerText` follows case transforms), not from `connect-window`.
- L6 virtual authenticator: holds. `apps/extension/tests/e2e/README.md:317` states a fault's one-command life; "approves silently, so arm it before the press" is in no live doc (only the archived chaos-3 brief). A fleet agent reads that README's session commands and its charter only (`archive/passkey-chaos-1/CHARTERS.md:3,15`); the e2e skill never mentions chaos sessions.
- L7 CodeQL ReDoS: holds (default setup configured); not stated elsewhere.
- L8 merge ref: `pr-quick.yml` builds `head.sha` too, so it bites every PR; stated only in `.claude/skills/e2e-testing/SKILL.md:924-926` (PR lanes build the head SHA; merge the trunk again) and `:972-973` plus `.claude/skills/aztec-update/SKILL.md:249` (a conflicting PR gets no run).
- L9 `always()`: holds; CI.md:127 shows one instance, the rule is in no doc. Several jobs keep a bare `always()` on purpose (the `status` aggregators post FAILURE on a cancel, CI.md:107).
- L10 R100: holds; not stated elsewhere.
- L11 `gh stack`: holds. Its "index lines auto-merge as two" clause lost its evidence when an earlier pruning dropped `archive/owner-feedback-1/lessons/phase-8.md`. Not in a live doc.
- L12 popup RPC: holds (`extension-messaging/src/core/base-client.ts:111-134`, `background/client.ts:17,57-58`, `useConfigRead.ts:5-12`); the e2e skill's ledger row 42 states the 60 s default.
- L13 `PopupManager`: holds, except `SelectTokenPopup`, `v-if`-gated on unlock (`PopupManager.vue:97`); its second link names a promotion note, the substance is `archive/passkey-unlock-1/lessons/phase-A4.md:25`.
- L14 window close: holds (`useDappApprovalWindow.ts:122-135`); not stated elsewhere.
- L15 `EventHandler.invoke`: holds (`wallet-core/src/utils/event-handler.ts:47-58`).
- L16 typed errors: holds, but `viaPxe` now also synthesizes `SessionEndedError` when its session ended (`account-state/service.ts:178-181`).
- L17 hidden rows: holds (`entity_storage.ts:212-223`, `sealed-entity-storage.ts:271-293`, `id-allocators.ts:17`).
- L18 chain id 0: holds (`network/seeds.ts:55`).
- L19 error text: holds; `logging-policy` says a caught error logs as a capped `{ name, message }`, but not that a message can quote its input.
- L20 classify by selector: holds (`wallet-bridge/src/fee-payer.ts:41-49`, `field-address.ts:21-26`).
- L21 MAC and class: two unrelated rules in one line. The class clause's evidence (`archive/security-fixes-1/lessons/phase-6.md`, `archive/tokens-and-balances/lessons/phase-3.md`) was dropped by an earlier tightening (#368). It still holds: `aztec-runtime/src/pxe/effective-class.ts:1-15` and the installed 6.0.0 PXE's `contract_class_service.js:32` read the node's current class for a call.
- L22: four facts. The `composes` clause is covered by `packages/design/README.md:51-55` (a role composes in the element's own single-class module rule) and enforced by `type-role-ban.test.ts`. The storage clause was seen on the 153.0.4 pin (`archive/onboarding-3/lessons/phase-4.md:7`).
- L23 `ActiveSession`: holds; ARCHITECTURE.md:185 states the first clause only.
- L24 `Lock`: holds (`wallet-core/src/utils/lock.ts:86-90`); its deleter-count clause is the one service's remedy, stated at `incoming-transfer/service.ts:292-295`.
- L25 C1 `dispose()`: holds; CLAUDE.md § Composables does not say terminal.
- L26 pruning: holds (`incoming-transfer/service.ts:2489-2495, 2791-2793`).
- L27 node retries: holds at 6.0.0: the wallet's own `aztec-runtime/src/utils/fetch.ts:99-106, 152` (mirrors the SDK's `makeFetch([1,2,3])`, `NoRetryError` on 4xx).
- L28 HandshakeRegistry: stated at its code: `execution/transfer-sequence-keys.ts:1-9` (the Aztec 6 mechanism) and `execution/README.md:16`; the send sequencer orders popup transfers and dApp sends alike (`dapp-send-executor.ts:355-358`, `send-sequencer.ts:15-17`).
- L29 field addresses: holds. Reproduced on 6.0.0: `schemas.Fr.safeParse("")` and `("abc")` throw; the `safeParse` clause's source, `archive/dapp-ingress-grants/lessons/phase-3.md:29`, is not linked.
- L30 `getNotes`: holds at 6.0.0: the installed `stdlib` `l2_block_stream.js:178-183` logs a failed run and returns.
- L31 zsh: reproduced on 5.9 (`set -e; false && true` continues; `false | true` is 0; `$F` stays one word).
- L32 `pgrep`: holds; the `$$`/`$PPID` clause restates its evidence's "exclude the launcher's own pid and parent".
- L33 base copy: holds; not stated elsewhere.

## Candidates from the three archived plans

`archive/firefox-pin-1/`, `archive/send-picker-1/`, `archive/send-side-1/`, every `lessons/` file and Outcome.

- Meets the bar: C5 (a `<script setup>` local shadows a same-name prop in the template; `send-picker-1/lessons/phase-1.md:3`, demonstrated) and C6 (a display that lifts a gate shows the malformed stored values it hid; `send-picker-1/lessons/phase-4.md:13`, demonstrated in review).
- Already in their home: C1 `clickByTestId` moves no focus (e2e skill :439-441); C2 leave transition (:422-435); C3 `e2eRetry(2)` (:42-48, :215); C4 proverless guard and the 7,200 s limit (:87-90, :111-113); C7 verbatim review rules (README § Post-implementation standard, step 2); C10 Firefox override facts (`FIREFOX.md:44, :72`, the UTF-8 comment in `firefox-answer-requests.ts:31`); C11 the projector's zero (e2e skill ledger row 66); firefox-pin-1's four Firefox 158 differences (`FIREFOX.md`).
- Below the bar: C8 the watcher's flush (one file, known limit #1345; send-side-1's own Outcome says nothing generalizes); C9 a vitest filter is a substring (harmless here); C12 the off-curve fixture (L29 applied); C13 a per-row spy (one test file); C14 `DOMWrapper.exists()` (typecheck catches it, CLAUDE.md § Quality gates); C15 the red half of a pin bump (run-specific, a case of L33).
