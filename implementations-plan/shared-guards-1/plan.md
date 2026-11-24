---
plan: shared-guards-1
tier: mid
status: arc 1 merged (#1956); arc 2 in review
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet) plus an AST inventory; dual audit (Codex gpt-6.1-sol high + Opus Plan); one fresh final Codex pass; at most two in-process agents at once; one Codex consult at a time
base: origin/dev at 4a333b343
trunk: dev
post_implementation_hardening: not scheduled
---

# shared-guards-1: inline restatements of the wallet-core primitives call the primitive, and a guard stops the regrowth

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Live log: [STATUS.md](STATUS.md).

Issue #1928 (and the hex part of closed #1452). Three arcs, one PR each against `dev`, no stack. The site table is this plan's body: every site, its inline form, the helper it becomes, and whether the two accept the same values.

| Arc | Phases | Surface | Waits for |
|---|---|---|---|
| 1 | 1-4 | the guard and its baseline; the five packages; extension `content-script`, `e2e`, `utils`, `wallet/logger` | nothing |
| 2 | 5 | extension `wallet/config`, `wallet/storage`, the free `wallet/services` files; `isPlainObject` | arc 1 merged |
| 3 | 6 | the files other changes hold today (recon § Collisions), `execution/dapp-send-executor.ts` and its siblings included; closes #1928 | arc 2 merged and every holder in recon § Collisions merged or closed |

## Outcome & Quality Bar

**For whom.** The maintainer who next tightens what "object" or "32-byte hex" means at a trust boundary, and the reviewer of each arc's diff.

**What excellent looks like.**
- Every converted site accepts exactly the values it accepted before. One table test per helper mapping proves it over arrays, `null`, boxed primitives, class instances, null-prototype objects and functions.
- A local name never hides a contract: no `isRecord` that accepts arrays, no `tolerantRecord`; a kept regex is named for its case rule.
- A new inline guard or 64-hex regex in any workspace that depends on `@nulo/wallet-core` fails `bun run test` with the line to fix, and the baseline only shrinks from arc 1 to arc 3.
- No published byte, content-script byte, wire message, Zod message, log line or screen changes.

**Good enough.** No e2e scenario is added. Bare `typeof x === "object"` tests with no null exclusion in their own expression (14), the lenient base64 decodes, test-support `sleep` copies and the two `bytesToHex` restatements stay out (recon).

## Assumptions

**Facts** (at `4a333b343`)
- F1. `isObjectLike` is `typeof v === "object" && v !== null`; `isRecord` adds `!Array.isArray(v)`; `guards.test.ts` pins both over a 17-value table (`packages/wallet-core/src/utils/guards.ts:7-11`).
- F2. `!v || typeof v !== "object"` refuses exactly the values `isObjectLike` refuses: every non-null object is truthy (`document.all`, the one exception, is `typeof "undefined"`).
- F3. `x instanceof Error ? x.message : String(x)` returns what `errorMessageFromUnknown` returns for every input (`errors.ts:9-15`; `String` of a string is the string).
- F4. `toBase64` is byte-identical to `Buffer.from(bytes).toString("base64")`, pinned by `encoding.test.ts:44-65`.
- F5. `HEX_32` in `field.ts` and the regexes at `extension-messaging/src/errors.ts:368` and `aztec-runtime/src/pxe/service.ts:102` are the same literal; Zod's `.regex` message prints the pattern, so `.regex(HEX_32)` keeps it.
- F6. `session-secret-box.ts` is not reachable from `@nulo-sh/wallet-crypto`'s entry `src/public.ts` (recon § Constraints).
- F7. The content script's graph is `content.ts` → `@aztec-labs/wallet-sdk/extension/handlers` and `approval-filter.ts`, which imports nothing.
- F8. Four accepted complexity functions hold sites: `trim` (`wallet/logger/utils.ts:216, 268`), the `serialization.ts` replacer (32, 34), `encodeValue` (`operation-fingerprint.ts:55`) and `applyRowTransform` (`row-map-migration.ts:300`). `scripts/ci-cd/complexity-rescore.test.ts` (in `test:ci-gating`) requires each stamp to equal the observed score; the PR ratchet refuses a raised one, so a function that shrinks takes its lower stamp in the same PR.
- F9. The six workspaces that depend on `@nulo/wallet-core` are the six the issue names.

**Inferences**
- I1. A type-guard call narrows to `Record<string, unknown>` where the inline form narrowed to `object`; this changes types, not values. `typecheck:all` proves each site.
- I2. Biome's cognitive score of `serialization.ts`'s replacer is unchanged (one `&&` run before and after); `trim`, `encodeValue` and `applyRowTransform` may lose increments. `bun run baseline:rescore` gives the numbers; a stamp moves only to the observed value.

**Asks.** None for the owner. Working assumptions the panel settles: D1-D7.

## Architecture & Implementation

**The guard.** `apps/extension/src/utils/inline-guard-ban.test.ts` with `inline-guard-ban.reviewed.json` beside it, in the shape of `copy-dash-ban.test.ts` and `type-role-ban.test.ts`, reading files through `apps/extension/scripts/type-roles/source-scan.ts`.
- Roots: `src` of every workspace under `apps/` and `packages/` whose `package.json` names `@nulo/wallet-core`, plus wallet-core itself, so a new dependent is read the day it adds the dependency. Extensions `ts`, `js`, `vue` (script blocks). Skipped: tests, stories, declarations, `wallet-core/src/utils/guards.ts` and `field.ts`.
- Object finding, polarity-aware: in one run of `&&` (through parentheses), `typeof E === "object"` (or `==`) beside `E !== null`, `E != null`, `E` itself or `!!E`; or in one run of `||`, `typeof E !== "object"` (or `!=`) beside `E === null`, `E == null` or `!E` (either side of each comparison). `!Array.isArray(E)` in the `&&` run, or `Array.isArray(E)` in the `||` run, marks it `isRecord`-shaped. A mixed form (`typeof E === "object" || E === null`) is no finding.
- Its text, the content key, is the whole run's source with whitespace collapsed, so any edit to an approved expression needs a fresh review; the failure message names the helper it restates as a hint.
- Hex finding: a regex literal with a character class that holds a hex range (`a-f` or `A-F`), after `0x` (group brackets aside) and quantified exactly `{64}` (`/[z]{64}/` and a bare digest, `/^[0-9a-f]{64}$/`, are no finding: no helper has a digest's contract). Its text is the literal as written.
- Review: findings and entries match as a multiset on file and text, so a moved line needs no edit. Fails on an open finding (the message prints a ready entry), on a stale entry, on an empty `why`, and on files out of order. Snippet cases pin each form and the non-findings (`typeof x === "object"` alone, a mixed-polarity form, a null test on another operand, `{1,64}`, `{8}`, `{64,}`, `[z]{64}`) and a `.vue` script block.
- Shrink only (D8): `scripts/ci-cd/inline-guard-ratchet.test.ts` (in `test:ci-gating`) reads the reviewed JSON at the PR's base the way `complexity-baseline.test.ts` reads its manifest, and fails when the head holds an entry the base does not (multiset); an entry is its file, text and kind (pending or kept), and a kept entry that its base file no longer holds may reappear with the same text in another file, so a kept site can move. The base-reading code moves out of `complexity-baseline.test.ts` into `scripts/ci-cd/ratchet-base.ts`, which both tests import. A base with no JSON (arc 1's own PR) has nothing to compare.
- Header limits: a guard split across statements, a template expression, `new RegExp`, an alias of the operand.

**Helpers.** `field.ts` exports `HEX_32` (D3). Arc 2 adds `isPlainObject` to `guards.ts`: a non-null object whose prototype is `Object.prototype` or `null`, `emit.ts`'s body (D2). No other wallet-core change.

**Mapping proofs** (rule 3). `guards.test.ts` gains the falsy rows `0`, `""`, `false`, `NaN`, `0n` (they tell a truthiness test from a null test), and the table also asserts, per value, that `typeof v === "object" && v !== null`, `!!v && typeof v === "object"` equal `isObjectLike(v)` and that the `!Array.isArray` form equals `isRecord(v)`; arc 2 adds `isPlainObject` and its prototype form to the table. `errors.test.ts`: `x instanceof Error ? x.message : String(x)` equals `errorMessageFromUnknown(x)` over the same kinds plus an `Error` and a `{ message }` object. `toBase64` and `HEX_32` need none (F4, F5); nor does `sleep`, whose inline body is `sleep.ts:2` verbatim.

**Kept sites** (differ, or cannot import). Each keeps its behaviour, takes a name that states its contract and, where the ban finds it, a baseline entry with its reason, and its difference is pinned by a test.

| Id | Site | Contract | Name | Pin |
|---|---|---|---|---|
| K1 | `content-script/approval-filter.ts:44` | `isObjectLike`'s set; the script's bundle carries no workspace code (F7, rule 4) | local `isObjectLike` (was `isRecord`) | new case, arc 1: an array tagged `type: "discovery-approved"` with an unrequested `sessionId` is refused (an `isRecord` guard would admit it) |
| K3 | `e2e/chrome-storage-token-seeds.ts:26` | lower-case only: seeds as the suite writes them | `LOWER_CASE_FIELD` | new case, arc 1: `0x` with upper-case digits is refused |
| K4 | `dapp-interaction/approval-delta.ts:36` | lower-case only: the class id as the wallet read it | `LOWER_CASE_CLASS_ID` | new case, arc 2: `0x` with upper-case digits is refused |
| K5 | `popup/pages/send-submit.ts:9` | either case, `0X` allowed | `TX_HASH_ANY_CASE` | new case, arc 3: a `0X` hash is offered |
| K6 | `utils/restore-outcome.ts:31` | a backup checksum: 64 lower-case digits, no prefix; no finding | `LOWER_CASE_BACKUP_CHECKSUM` (was inline) | `restore-outcome.test.ts:72` (existing: an upper-case checksum is refused) |
| K7 | `dapp-session/service.ts:65` | an HMAC-SHA-256 hash: 64 lower-case digits, no prefix; no finding | `VERIFICATION_HASH` (unchanged) | not a 32-byte field shape |

| K8 | `wallet-crypto/src/session-secret-box.ts:92-96` | the bearer token is encoded from a `Buffer` copy that is wiped; `toBase64` would leave an unwipeable latin1 string of the raw token | unchanged, one comment line | none: output is identical (F4) |
| K9 | `backup/row-map-migration.ts:193-194` | prototype-only: a top-level transform map that is a function with a null prototype passes, which `isPlainObject` refuses | unchanged (no finding: no `typeof`) | none: migration maps are authored in source, never read from a file |

None of K3-K9 is a bug a person meets: K3-K5 read values the wallet itself wrote or offer a link; K9's extra value can only come from source code. No owner ask arises. `utils/pinned-tokens.ts:9`, drafted as K2 ("lower-case only", as the issue and lane brief say), lower-cases each entry before it tests it (`:26-27`), so `isHex32` on the folded value accepts the same set (Opus r1): it converts in arc 1, and `pinned-tokens.test.ts:24` already feeds an upper-cased entry that is kept.

**Site table.** "Same" means the inline form and the helper accept the same values (F1-F5). Lines at `4a333b343`.

*Arc 1: packages*

| File | Lines | Inline form | Becomes | Set |
|---|---|---|---|---|
| `wallet-core/src/migration/migrator.ts` | 104, 114; 120 | `typeof r !== "object" \|\| r === null`; `isRecord` shape on `b.entries` | `!isObjectLike`; `isRecord(b.entries)` | same |
| `wallet-core/src/utils/serialization.ts` | 32, 34 | `typeof value === "object" && value && …` | `isObjectLike(value) && …` | same (I2) |
| `extension-messaging/src/core/base-service.ts` | 109 | objectLike, negated | `!isObjectLike` | same; RPC ingress |
| `extension-messaging/src/core/envelope-summary.ts` | 35, 43, 65 | objectLike | `isObjectLike` | same |
| `extension-messaging/src/offscreen/service.ts` | 40 | objectLike | `isObjectLike` | same; runtime messages |
| `aztec-runtime/src/account/account-export.ts` | 133 | `!raw \|\| typeof raw !== "object"` | `!isObjectLike(raw)` | same (an array still fails the envelope check next); account file |
| `aztec-runtime/src/pxe/client.ts` | 181, 201 | objectLike | `isObjectLike` | same |
| `aztec-runtime/src/pxe/service.ts` | 102 | `.regex(/^0x[0-9a-fA-F]{64}$/)` | `.regex(HEX_32)` | same, same message (F5) |
| `aztec-runtime/src/routing/routed-node.ts` | 147, 148, 154-157, 175, 180 | objectLike | `isObjectLike` | same |
| `aztec-runtime/src/utils/fetch.ts` | 54, 65, 66, 142, 143 | objectLike | `isObjectLike` | same |
| `aztec-runtime/src/fee-juice.ts` | 45 | `instanceof Error ? … : String(e)` | `errorMessageFromUnknown` | same (F3) |
| `aztec-runtime/src/adapters/aztec-node-factory-adapter.ts` | 118 | `new Promise((resolve) => setTimeout(resolve, ms))` | `sleep` | same |
| `wallet-bridge/src/fee.ts` | 48 | objectLike, negated | `!isObjectLike` | same; dApp fee settings |
| `wallet-bridge/src/method-scope-checkers.ts` | 151, 234, 238, 244 | objectLike, negated or truthy | `isObjectLike` | same; dApp calls |
| `wallet-bridge/src/wallet-schema-args.ts` | 80, 90 | objectLike (`isTraversable` keeps its typed-array, `Map`, `Set` clauses) | `isObjectLike` | same; dApp arguments |
| `wallet-crypto/src/session-secret-box.ts` | 97, 98 | `Buffer.from(salt)`, `Buffer.from(packed)` base64 encodes | `toBase64` (D5); the token stays K8 | same (F4) |

*Arc 1: extension*

| File | Lines | Inline form | Becomes | Set |
|---|---|---|---|---|
| `content-script/approval-filter.ts` | 44 | local `isRecord`, objectLike body | K1 | same, kept |
| `e2e/chrome-storage-incoming-poll-gate.ts`, `e2e/chrome-storage-token-list.ts`, `e2e/sealed-read.ts` | 64; 30; 28 | objectLike | `isObjectLike` | same |
| `e2e/chrome-storage-token-seeds.ts` | 26; 55 | lower-case hex; objectLike | K3; `!isObjectLike` | kept; same |
| `e2e/csp-report.ts` | 73; 102 | objectLike; `instanceof Error ? … : String` | `isObjectLike`; `errorMessageFromUnknown` | same |
| `utils/contacts-export-format.ts` | 58 | `parsed !== null && typeof parsed === "object" && …` | `isObjectLike(parsed) && …` | same; contacts file |
| `utils/estimate-when-clear.ts`, `utils/primary-method.ts` | 26; 113 | objectLike | `isObjectLike` | same |
| `utils/panel-handback.ts` | 38; 46 | record; objectLike | `!isRecord`; `!isObjectLike` | same, each keeps its own set |
| `utils/restore-outcome.ts` | 28; 31 | record; digest regex | `!isRecord`; K6 | same; kept |
| `utils/pinned-tokens.ts` | 9, 27 | `CONTRACT_RE.test(c)` on a lower-cased `c` | `isHex32(c)` | same (the input is folded first) |
| `wallet/logger/format.ts` | 31, 36 | objectLike | `isObjectLike` | same |
| `wallet/logger/request-log.ts` | 102 | record `\|\| !Object.hasOwn(…)` | `!isRecord(item) \|\| …` | same |
| `wallet/logger/utils.ts` | 216, 268 (`trim`); 307; 351 | truthy objectLike; `value === null \|\| typeof value !== "object"` | `isObjectLike` | same; `trim`'s stamp lowered to the observed score |

*Arc 2: extension, files no other change holds*

| File | Lines | Becomes | Set |
|---|---|---|---|
| `wallet/config/store.ts` | 31, 127 | `isObjectLike` | same; stored config |
| `dapp-interaction/approval-delta.ts` | 36; 39 | K4; `!isObjectLike` | kept; same |
| `dapp-session/mac-storage.ts`, `dapp-session/registration-allowance.ts` | 86; 26 | `isObjectLike`; `!isRecord` | same; stored rows |
| `dapp-session/spec.ts`, `transaction/spec.ts`, `operation-journal/spec.ts`, `auth-registry/spec.ts` | 92; 187, 194; 151; 62 | `isObjectLike` (`tolerantRecord` and `tolerantObject` removed; `z.custom(isObjectLike)`) | same; stored rows |
| `dapp-session/service.ts` | 65 | K7 | kept |
| `execution/call-decoder.ts`, `execution/fast-path.ts` | 177; 96 | `isObjectLike` | same |
| `execution/operation-fingerprint.ts` | 55 (prototype check in `encodeValue`) | `!isPlainObject(value)` | same; stamp lowered |
| `price/service.ts`, `purge-rows.ts`, `pxe/client.ts`, `token-balance/balance-identity.ts`, `token-list/service.ts` | 59, 79, 466, 470; 89; 62; 42; 47 | `isObjectLike` | same; feed and stored rows |
| `wallet/storage/migrations/index.ts`, `wallet/storage/stores.ts` | 102, 140; 113 | `isObjectLike` | same; stored rows |
| `wallet/storage/sealed-entity-storage.ts` | 25; 142, 467, 513 | `!isRecord`; `isObjectLike` | same; stored rows |
| `wallet/storage/stored-shapes/baseline.ts` | 250; 500, 501 | `isRecord`; `isObjectLike` | same |
| `wallet/storage/stored-shapes/emit.ts` | 54; 108-109 | `!isObjectLike`; local `isPlainObject` removed for the guards one | same |

*Arc 3: files held elsewhere today.* At its base, rerun the inventory; a site added since joins this arc.

| File | Lines | Becomes | Set |
|---|---|---|---|
| `composables/full-backup-restore.ts`, `utils/full-backup-helpers.ts` | 392; 463, 505, 524, 550 | `isObjectLike` | same; backup file |
| `account-state/normalize.ts`, `account/service.ts` | 65, 74, 128; 1080 | `isObjectLike` | same; backup slices |
| `backup/backup-migration-registry.ts`, `backup/trust-gate.ts` | 175, 191, 258, 339, 409; 82, 157 | `!isRecord` | same; backup file |
| `backup/row-map-migration.ts` | 300 (`applyRowTransform`, stamp to the observed score); 366 | `!isRecord`; `!isObjectLike(value) && typeof value !== "function"`; 193-194 stays (K9) | same |
| `token/seeder.ts`, `token/service.ts` | 119, 144; 937 | `!isRecord`; `!isObjectLike` | same; stored rows |
| `execution/dapp-send-executor.ts` (moved from arc 2: lane `dapp-estimation-extract-1`, #1934, is splitting it and holds `execution/service.ts`, `transfer-executor.ts`, `estimate-reuse-shared.ts` and any new file beside them) | 1432 | `isObjectLike` | same |
| `wallet-sdk/content-script-validator.ts`, `wallet-sdk/wallet-message.ts` | 75, 157; 75 | `isObjectLike` | same; dApp ingress |
| `popup/pages/send-submit.ts` | 9 | K5 | kept |
| `extension-messaging/src/errors.ts` (held by PR #1945) | 90; 368; 372, 379 | `errorMessageFromUnknown`; `isHex32`; `isObjectLike` | same; PXE wire details |

**Counts.** Same set and converted: 110 object guards, 3 hex literals, 3 message extractors, 1 delay, 2 base64 encodes, 1 stand-alone prototype check. Same set but kept inline: 1 (K1). Differs and kept: 7 (K3-K9). Differs and asked: 0. Baseline: 64 entries after arc 1 (60 pending; K1, K3-K5), 32 after arc 2 (28 pending), 4 after arc 3.

**Trade-offs** are in the decision ledger.

## Security & Adversarial Considerations

- **Threat model.** A dApp page (wallet-bridge arguments, fee settings, calls), a hostile backup, account or contacts file, a content-script or runtime message, and stored rows a bug or an older build wrote. The risk is a converted site that accepts a value it refused before (an array where `isRecord` held, or the reverse), letting a malformed value past a check that later code trusts. Rule: a site moves only to the helper with its exact set. The site table is the proof for each site and the mapping tables prove each mapping; the guard's content key only marks a site for review.
- **Refusal text.** No refusal message changes: the Zod schema keeps its regex message (F5); every other site returns the same value it returned.
- **Published package.** `@nulo-sh/wallet-crypto`'s entry gains no module (F6). `serialization.ts` sits in the barrel that `encryption-key.ts` imports, so phase 3 stages `wallet-crypto` before and after and compares the bytes; `bun run test:release` restages and repacks all three.
- **Content script.** No import is added (F7); arc 1 compares the built content script to the base build byte for byte.
- **Secrets.** `session-secret-box.ts` keeps encoding the bearer token from its wiped `Buffer` copy (K8): `toBase64` would build a latin1 string of the raw token that no code can wipe. Only the salt and the ciphertext, which are not secret, move to `toBase64`. `zeroize-sites.test.ts:52` then sees exactly one `Buffer` copy, the token's, and asserts that.
- **Supply chain, least privilege, cryptography.** No dependency, permission, workflow or primitive changes.
- **Domain.** Frontend: no rendering changes. Contracts: none touched.

## Decision ledger

| Id | Decision | Alternative not taken | Why |
|---|---|---|---|
| D1 | The guard is a vitest source scan with a reviewed JSON baseline; it matches only typeof-object tests paired with a null exclusion of the same operand | a Biome GritQL plugin; flag every `typeof … "object"` | Biome can baseline only with in-line suppressions, which CLAUDE.md treats as debt; a bare typeof test accepts `null`, a different predicate whose conversion would change its set |
| D2 | `isPlainObject` lives in `guards.ts`, added in arc 2 with its first callers; the file's header stops saying no guard checks the prototype | an extension-local helper; add it in arc 1 | `guards.ts` is the one home for shape guards and already contrasts itself with `@nulo/legal`'s copy (legal has no wallet-core dependency and keeps its own); arc 1 would ship it with no caller |
| D3 | `field.ts` exports `HEX_32`; the PXE schema uses `.regex(HEX_32)` | `.refine(isHex32)`; keep the literal | `.refine` changes the Zod message; a kept literal is the restatement the issue names. Never freeze it: Zod 4 resets `lastIndex` on the pattern |
| D4 | Kept regexes stay inline, renamed for their case rule, each on the baseline with a reason and a pin | shared `isLowerHex32` | two production callers with two different reasons; a helper for them is generality nobody needs |
| D5 | `session-secret-box.ts` encodes the salt and the ciphertext with `toBase64`; the bearer token keeps its wiped `Buffer` copy (K8); the lenient `Buffer` decodes stay | convert all three encodes (draft); convert the decodes to `fromBase64` | `toBase64` builds a latin1 string of its input, which no code can wipe, so for the token it adds a raw copy the `Buffer` path does not make (Codex r1); the decodes accept junk that `fromBase64` throws on, a different contract (like `lenient-base64.ts`) |
| D8 | A ratchet against the PR's base enforces "only shrinks", reusing the complexity ratchet's base reader (moved to `scripts/ci-cd/ratchet-base.ts`) | review alone, as `type-role-ban` does | without it a PR can add a guard and its entry together and stay green (Codex r1); new code never needs an entry, since every shape has a helper form (`isObjectLike(x) && …`, `isHex32(x) && x === x.toLowerCase()`) |
| D6 | Three arcs: collision first, then size (arc 1 is about 39 files) | one arc for every free file (about 62); arc 1 only the guard | the lane brief asks for a split past about 40 files; a guard-only arc ships a baseline of every site with nothing removed |
| D7 | Sites inside accepted complexity functions are converted and their stamps lowered to the observed score | leave them on the baseline | the skill's procedure allows a lowered stamp; a baseline entry whose only reason is "inside an accepted function" states no contract |
| D9 | From arc 2, a file that does not already import the `@nulo/wallet-core/utils` barrel takes its guards from the `./guards` leaf; one that does extends that import | the barrel everywhere, as arc 1 did | a barrel import is a new edge into a module Storybook can split into its own chunk, which is how arc 1's CI met a chunk cycle; a leaf with no imports adds no such edge, and extending an existing barrel import adds none either |

## Phases

### Phase 1 — the guard at base (arc 1)
1. Write `inline-guard-ban.test.ts` and its snippet cases. Write `inline-guard-ban.reviewed.json` with every finding at base: K1-K7 with their reasons, every other entry `pending: same set as <helper>`.
2. Move the complexity test's base reader into `scripts/ci-cd/ratchet-base.ts`; write `scripts/ci-cd/inline-guard-ratchet.test.ts` with unit cases for its multiset comparison (an added entry fails, a removed one passes, a duplicated one fails).
3. Check: delete one entry, the guard fails naming it; add a stray entry, the guard fails naming it; restore.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/utils/inline-guard-ban.test.ts`; from the root: `bun run test:ci-gating`, `bun run lint`, `bun run typecheck:all`. Pass: exit 0, both checks of step 3 seen failing. Layers: lint, typecheck, unit, CI gating.

### Phase 2 — helpers and mapping proofs (arc 1)
1. Export `HEX_32` from `field.ts`; add the inline-form assertions to `guards.test.ts` and the `errors.test.ts` mapping.

**Validation gate.** From `packages/wallet-core`: `bun run test`; from the root: `bun run lint`, `bun run typecheck:all`. Pass: exit 0. Layers: lint, typecheck, unit.

### Phase 3 — the five packages (arc 1)
1. Before any edit, from the root: `bun run build`; copy the built content script to `~/.cache/nulo-backlog/shared-guards-1/content-base.js`; `bun scripts/publish/stage.ts wallet-crypto --version 0.0.0 --out ~/.cache/nulo-backlog/shared-guards-1/stage-base`.
2. Convert every package row; delete their baseline entries. In `zeroize-sites.test.ts`, assert exactly one `Buffer` copy in `wrapPair` and drop the comment that names three.
3. Stage `wallet-crypto` again into `stage-head` and compare the two trees.

**Validation gate.** From the root: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:release`, `diff -r` of the two staged trees. Pass: exit 0 and no difference (a difference is investigated, never accepted silently: the Outcome bar names the published bytes). Layers: lint, typecheck, unit, publish staging.

### Phase 4 — extension, arc 1 files (arc 1)
1. Convert every arc-1 extension row; rename K1-K3; delete their pending entries; run `bun run baseline:rescore`, lower `trim`'s stamp to the observed score, then `bun run baseline:complexity`.
2. Add K1's tagged-array case to `approval-filter.test.ts` and K3's `0x`-with-upper-case-digits case.

**Validation gate** (the arc gate). From the root: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run audit:vue`, `bun run test:ci-gating`, `bun run test:release`, `bun run check:plans`. Then `cmp` the built content script with the copy from phase 3. Then, at retry 0 on Chrome: from `apps/extension`, `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 bun run test:e2e -- tests/e2e/account-import-export.test.ts --retry=0`; from the root, one run: `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-feePayer.test.ts tests/e2e/network/tx-sendTx-fields.test.ts tests/e2e/network/scope-refusal.test.ts` (the network config retries twice unless `NULO_E2E_RETRY` says otherwise). Pass: every command exits 0, `cmp` reports no difference, the guard's baseline holds 64 entries. Layers: lint, typecheck, unit, build, publish staging, smoke and network e2e.

### Phase 5 — extension, arc 2 files (arc 2)
1. Add `isPlainObject` and its rows to `guards.test.ts`; add K4's upper-case case to `approval-delta.test.ts`.
2. Convert every arc-2 row; delete their entries; lower `encodeValue`'s stamp as in phase 4.

**Validation gate.** As phase 4's, without the content-script `cmp` and `test:release`; the network run, with the same two variables, is `tx-sendTx-default.test.ts register-token.test.ts session-reconnect.test.ts`. Then `bun run --cwd apps/extension build-storybook`. Pass: exit 0, `stored-shapes/snapshot.test.ts` among them (no stored shape changes); the baseline holds 32 entries. Layers: lint, typecheck, unit, build, Storybook build, network e2e.

### Phase 6 — the held files (arc 3)
1. Rerun the inventory at the new base; add any new site to this arc's table.
2. Convert every arc-3 row; add K5's `0X` case to `send-submit.test.ts`; move `applyRowTransform`'s stamp to the observed score as in phase 4.

**Validation gate.** As phase 5's; the network run, with the same two variables, is `backup-restore-integrity.test.ts backup-migration-roundtrip.test.ts connect-dapp.test.ts`. Pass: exit 0; the baseline holds K1 and K3-K5 only. Layers: lint, typecheck, unit, build, network e2e.

## Delivery

- Arc 1: branch `shared-guards-1-a1` off `origin/dev` after `git fetch`, its first commit this plan's commit cherry-picked. PR `refactor: wallet-core guards replace their inline restatements, and a guard stops regrowth` (89 characters). Body: `Part of #1928`, what is left on the baseline and why, and a note for open changes in held files: editing a baselined expression, or moving its file, now needs that site converted, since the ratchet refuses a new entry.
- Arc 2: branch `shared-guards-1-a2` off `origin/dev` once arc 1 merged. PR `refactor(wallet): services and storage call the wallet-core guards` (66). `Part of #1928`.
- Arc 3: branch `shared-guards-1-a3` once arc 2 and every holder have landed. PR `refactor(wallet): backup, sdk and token sites call the wallet-core guards` (73). `Closes #1928`; the close-out commits ride on it.
- Each PR against `dev`, opened ready after its loop converges, no label at creation; a label later only where a path filter would skip a suite. The body states "No visible change", the validation runs and their results. Nothing is committed after a PR's last push.
- Close-out (arc 3's final commits): merge `origin/dev`, read `index.md` and `lessons.md`; Outcome block; lessons pass; `git mv` into `archive/` in its own commit; index line moved.
- Parallelism: arcs 2 and 3 touch disjoint files but share the baseline JSON; serial is the plan (each arc is under an hour of work).

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) as read at `4a333b343`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc at its boundary: Codex `gpt-6.1-sol` at `high` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`), resumed with each fix diff, hard stop at three rounds. Each prompt carries the arc map, the standard's two rules verbatim, and the adversarial ask on rule 1: a site moved to a helper with another set, a name hiding `isObjectLike`, a changed refusal message, a published entry that gained an import, a baseline reason that is false. One Opus 5.5 diff review (`Agent`, `general-purpose`, `model: opus`) with the same ask beside round 1. After arc 3, one fresh Codex session over the net diff from `4a333b343` asks for cross-arc issues. Log every round in `lessons/phase-N.md` and below.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch`.
- Step 4: as Delivery says.
- Step 5, after the close-out merges: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/shared-guards-1/plan.md`, then `agent-worktree done shared-guards-1 --merged`.
- Three failures on one step stop the arc and report.

## Plan review

- **Codex r1** (`gpt-6.1-sol`, high, plan and outline B): reject, seven findings, all verified and accepted. K9: `row-map-migration.ts:193` is prototype-only and `canonicalizeTransformMap` hands `cloneJsonObject` a top-level map, so a function with a null prototype passes there and `isPlainObject` would refuse it (demonstrated); it stays. The content key is the run's text, and the matcher is polarity-aware (a mixed `||` form is no finding; `/[z]{64}/` is no finding). D8, the ratchet: without it a guard and its entry can land together. Pins must tell `0x` with upper-case digits from `0X`. `extension-messaging/src/errors.ts` is held by PR #1945, so it moves to arc 3 although the lines differ. F8 named `cloneJsonValue`; the site is in `applyRowTransform`. D5: the bearer token keeps its wiped `Buffer` copy (K8). It preferred outline A after the fixes.
- **Opus r1** (Plan agent): conditional approve. Accepted: K2's claim did not hold (`pinned-tokens.ts` folds before it tests, so `isHex32` keeps its set; converted); `zeroize-sites.test.ts` pins the `Buffer` copies of `wrapPair`, so it asserts the one token copy; F8 restated (`complexity-rescore.test.ts` requires the stamp to equal the score); the published bytes are compared before and after staging; falsy rows in the mapping table; the label marks, the site table proves; `sleep`'s proof is its identical body; `HEX_32` is never frozen; arc 1's PR body warns the holders of baselined files. Superseded: a cap on `pending` entries (D8 is stronger). It confirmed every site's set, I1 by typechecking the two riskiest narrowings, and A over B.
- **Final Codex pass** (fresh `gpt-6.1-sol` session, high): conditional approve; four conditions applied: every e2e command sets `NULO_E2E_RETRY=0` and Chrome explicitly; K1's pin is a tagged array that an `isRecord` guard would admit; K6 is named `LOWER_CASE_BACKUP_CHECKSUM` and cites its existing pin; recon marks its superseded statements. It found no set mismatch left and confirmed D8's fail-closed shape and A over B. Resumed with the applied conditions: **approve**.

## Arc reviews

- **Arc 1, Codex r1** (`gpt-6.1-sol`, high, diff `65182f8d1..2ecbe62a8`): conditional approve. Accepted: the scan's prefilter looked for `object`, so `typeof x === "\x6fbject"` escaped it (now `typeof`, with the case); `emit.ts`'s prototype check is `pending: same set as isPlainObject`. Reworded rather than deleted: the mapping-proof comment in `guards.test.ts`.
- **Arc 1, Opus diff review** (general-purpose, opus): conditional approve; no set mismatch at any converted site. Accepted: a bare 64-digit digest has no helper, so the hex finding now needs `0x` before the class (K6 and K7 leave the baseline, 66 → 64); a kept entry may move files under the ratchet, which otherwise left a moved kept site no way through; `!!E` counts as a null exclusion; the ratchet's header claim. Rejected: failing closed on `predates` (reachable only by a PR that edits the gate's own path constants, and arc 1's own state).
- **Arc 1, Codex r2** (resumed): conditional approve, two findings, both accepted. Promoting a pending entry to kept in place, then moving it in a second PR, made a pending exception transferable: an entry's identity now includes its kind. `/^(?:0x)[0-9a-fA-F]{64}$/` and `/^0x(?:[0-9a-fA-F]{64})$/` slipped the adjacency test: the prefix check now looks past group brackets.
- **Arc 1, Codex r3** (resumed): conditional approve, one low finding, accepted: skipping `)` after the class, added unasked in r2, flagged `/^(0x[0-9a-f]){64}$/`, which repeats the prefix; the skip is gone and that literal is a non-finding case. Verified by its snippet case; the loop stops at three rounds with no material finding open.
- **Arc 1, CI** (PR #1956): Build Storybook failed on a static chunk cycle: `utils/panel-handback.ts` importing the wallet-core barrel gave the barrel a chunk of its own in Storybook's build, which re-exports from the shared story chunk that imports it. Found by restoring `origin/dev`'s copy of each changed file in halves. Fix, a deviation from "no other wallet-core change": wallet-core exports `./guards`, a leaf like `./chain-id`, and the hand-back imports it. CodeQL flagged a single `replace` of the key separator in the scan's stale-entry message; now `replaceAll`. Codex, resumed for targeted verification of the fix: **approve**.

## Seeds

Not run: the orchestrator drives each arc.

```
/goal Every phase of implementations-plan/shared-guards-1/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript; each arc's Codex loop converged (a resumed pass reporting no new material point, quoted); the arc's PR exists against dev, opened after its loop; bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/shared-guards-1 forward per its plan.md: read plan.md, STATUS.md and lessons/ first; take the next unmarked phase of the current arc; run its gate; at an arc boundary run the Codex loop per the Post-implementation section, then open the arc's PR; never merge; stop and report after three failures on one step.
```
