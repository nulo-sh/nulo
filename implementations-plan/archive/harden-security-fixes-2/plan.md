---
plan: harden-security-fixes-2
tier: mid (the lane brief names it; see Asks)
status: completed 2026-10-16; arcs 1 (#598), 3 (#611) and 4 (#619) merged, arc 2 (#607) in review carrying the close-out
issues: "#416 (arc 2 reopens it and closes it); arcs 1 and 3 have no public issue; known limits #570 (arc 1) and #614 (close-out)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; a final fresh Codex pass
base: origin/dev at c5e9c8e8
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-16
- **Status:** completed; four PRs against `dev`, no stack: arcs 1 (#598), 3 (#611) and 4 (#619) merged, arc 2 (#607) carries this close-out, and merging it is the owner's call.
- **Shipped:** #598 (a passkey backup carries a check its own passkey makes, and import restores only a body that check verifies; restored token metadata is re-read from the chain and never trusted on its own; the Testnet endpoint row's disposition as a comment); #607 (a dApp send the person pays for is held to the approved fee: a rise of more than 10 percent and 0.000001 FJ opens a new window that asks again, and Confirm waits for the figure; closes #416); #611 (a public grant's arguments decoded at open as the rows the wallet signs; a grant the wallet cannot read cannot be confirmed); #619 (the transaction card reads a dApp call's arguments only when they encode back to its fields, else the existing unreadable notice).
- **Dropped:** OA-G2, withdrawn (D17); OA-F2 part 2 A's known limit, since C was picked and Confirm cannot pass before the figure.
- **Known limits:** #570 (E, the Testnet endpoint row); #614 (K1, a passkey backup's check proves which passkey made it, not when). K2 is tracked privately.
- **Open items:** none.
- **Lessons:** two promoted to `lessons.md`: a change to when Confirm enables reaches the e2e that press it on refused requests; parallel arcs collided on decision ids.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# harden-security-fixes-2: what the person approves is what the wallet restores, pays and signs

Four items the owner decided on decision page 22 (2026-10-16), tracked privately. Arc 1 records the endpoint row's disposition, has a passkey backup carry a check its own passkey makes, and reads restored token metadata from the chain. Arc 2 holds a dApp send's fee to the figure the person approved. Arc 3 shows a public grant's arguments as the wallet signs them. Arc 4, added by the orchestrator after arc 3 merged (D-orch-2), has the transaction card read a dApp call's arguments only when they encode back to its fields. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

| Item | Owner's pick (page 22) | Arc | Issue |
|---|---|---|---|
| E. The Testnet endpoint row | P22-02 **B**, as is | 1 (a comment only) | files and closes one `known-limit` issue |
| B. The passkey backup | P22-03 **C**: a check over the backup body, and the chain re-read with no auto-trust | 1 | none public |
| F. The fee after approval | P22-04 **A**: the shown fee is a ceiling; ask again only when higher | 2 | #416, reopened by arc 2 (its reopening condition: "the owner asks for the figure to bind the confirm") |
| G. The grant card | P22-01 **A**: decode at open, the argument table, refuse what does not decode (shots `o-grant-a`) | 3 | none public |
| H. The transaction card's decode | none needed: an existing notice, UI impact none (D-orch-2) | 4 | none public |

## Outcome & Quality Bar

- **For whom:** a person restoring a passkey backup on a new device; a person approving a dApp's transaction or public grant in the 360 px approval window.
- **Excellent:** (1) a passkey backup restores only a body its own passkey checked, and a restored token's metadata is the chain's whenever the chain answers in time; (2) a dApp send whose fee the person pays never proves above the figure they approved without a second yes (given OA-F2 part 2 B or C); (3) the grant card shows every argument whole, named, in token units, exactly as the wallet will sign it, and a grant it cannot read cannot be confirmed.
- **Good enough:** no new words beyond the signed and asked ones; password backups keep their format; Send's own re-ask keeps its behaviour.

## Assumptions

**Facts** (verified at `c5e9c8e8`; recon has the paths):
1. Password and passkey backups share one export page, one envelope builder (`assembleFullBackup`) and one import gate (`validateAndMigrateBackup`, also called by `useRestoreAgain.ts:238`); `profile.type` decides the key material, the ceremony, the entropy and DEK carriers and whether a plain file may be downloaded.
2. After the passkey prompt the popup holds `credentialData` (with the PRF output) and nothing is written yet (`useFullBackupImport.ts:379-389`). `PasskeyCredential` derives keys from it by HKDF with distinct labels (`passkey-credential.ts:31-35,110`), and the same credential reproduces them.
3. The session opens at `finalizeWithReminder` (`useFullBackupImport.ts:455-460`), before the account-state tail (`:471`), whose deadline `runImportChainSync` creates inside itself (`importChainSync.ts:65`). `trustRestoredTokens` runs before finalize (`:423`). The add path's `onTokenAdded` trusts a token (`incoming-transfer/service.ts:1307-1336`).
4. `OperationApprovalDelta` carries no figure; `send_transaction` gets no approval envelope (`execution/service.ts:908-914`); Confirm waits for an estimate only when the app sets its own fee (`index.vue:174-176,718-727`); an embedded `fjwc` payment charges the sender (`fee/embedded-strategy.ts:18-38`).
5. #402's `QueuedFeeAnswers` and the `queued` stage with `reask` are generic; `acceptQueuedFee` (`execution/service.ts:717`) and the popup (`RecentActivityView.vue:367,376,381,563`, `reask-review.ts:30`, `in-flight-send.ts:41`, `journal-state.ts:446-451`) gate on `kind === "transfer"`. Send compares raw integers, `fee <= cap` (`transfer-executor.ts:366`). `runInSlot`'s callback holds the slot but has no way to park it (`dapp-send-executor.ts:261-266`). Only standard, non-app-capped `fj`/`fpc` `aztec_sendTx` builds can be stashed (`:595-603`).
6. The window closes itself after `approveInteraction` returns, and the worker deletes the stored interaction at approval (`dapp-interaction/service.ts:229`).
7. A grant reaches the window as `send_transaction` with one `add_public_authwit` action of kind `call` (`dispatcher.ts:640-679`); signing encodes its `args` with `encodeArguments(fn, args)` for the function found by name, and hashes `caller` too (`authwit-discoverer.ts:141-166`). Display and signing resolve the same artifact, the PXE instance's `currentContractClassId`. Every grant opens a window (`dapp-interaction/service.ts:95,741`).
8. Dependency, not a fact at this HEAD: #508's arc leaves `send_transaction` untouched and adds `DetailsToggle.vue`, `UnreadableArgsNotice.vue` and helpers in `call-surface.ts`.

**Claims that needed narrowing:** E's record differs from the code in one detail of where the row prints the URL (recorded privately). F, the orchestrator's check, holds: #402 covers Send-page sends only (`archive/send-queue-activity/plan.md:403-407`: "a dApp send keeps 'Queued...'"); the owner's remembered "pop-up to reconfirm the new fee" is that Send sheet.

**Inferences:** the re-read and the trust change add consistency to the body check (the owner picked both). OA-F2 part 2 A would leave a press before the figure without a ceiling.

**Asks:** OA-B1, OA-B2, OA-F1, OA-F2, OA-F3, OA-G1 in [OWNER-ASKS.md](OWNER-ASKS.md), each with what ships now. Tier: the spawn prompt says `light` and also "the tier the lane brief names"; the lane brief names `mid`, so the plan runs `mid`.

## The owner's backup question: why the two paths differ, and what they share

- **Why:** on 2026-10-08 (`archive/security-ui-1/`, answer D) the owner split plain export by profile type: a password profile's plain file holds the master secret, so only the encrypted file may leave; a passkey plain file holds no key that moves funds without the passkey. That call settled what a plain file may carry; this arc adds what it must prove.
- **How much is duplicated:** little. One page, one envelope builder, one import gate and one restore pipeline serve both; the type branches are about 60 popup lines and two pairs of service methods that reach different secrets (`account/service.ts:1026-1072`, `profile/service.ts:2241-2465`). The pairs repeat a six-line fence preamble.
- **What they share after this arc:** the check joins the shared seams, `assembleFullBackup` (an optional callback) and `validateAndMigrateBackup` (one field, one rule), so the new code lives once. Folding the service pairs would mix two key models for six lines; the arc leaves them (D5).

## Architecture & Implementation

### Arc 1: the endpoint disposition and the passkey backup

**E.** Arc 1 files one issue labelled `known-limit` and `privacy`, closed as not planned at once, in README's five sections. Its body comes from the private record's disposition: it names the constant `TESTNET_RPC_URL` and no key or URL, quotes P22-02 B, and states the reopening condition. The comment at `seeds.ts:23` is corrected to what Settings does ("Settings titles the row with it"), a documentation fix with no behaviour change (D12).

**B, the check.**
- `packages/wallet-crypto/src/passkey-credential.ts`: `deriveBackupMacKey()`: the same HKDF extract, expand label `nulo:backup-mac:v1`, a non-extractable HMAC-SHA256 key (`sign`, `verify`).
- `packages/wallet-crypto/src/backup-mac.ts` (new; the package index exports it, `public.ts` does not): `computeBackupMac(credential, checksum)` and `verifyBackupMac(credential, checksum, mac)` over the UTF-8 checksum hex; verify uses `subtle.verify` and answers `false` on a malformed MAC.
- `apps/extension/src/utils/full-backup-helpers.ts`: `assembleFullBackup` takes an optional `authenticate(checksum)`; its result lands in `BACKUP_MAC_FIELD` (`"backup-mac"`), outside the checksummed body.
- `popup/pages/settings/security/export/full.vue`: a passkey run passes `authenticate` built from `run.credentialData`; a password run passes none. An encrypted passkey file carries the field inside.
- `composables/useFullBackupImport.ts`, `validateAndMigrateBackup`: strip `checksum` and `backup-mac` before the hash; after the profile shape check, a passkey body with no string MAC returns the existing "Incompatible backup" refusal, before any prompt; the result carries the MAC. `useRestoreAgain` inherits it.
- `composables/full-backup-restore.ts`: `verifyPasskeyBody(profile, credentialData, checksum, mac)`, run in `executeRestore` right after `resolvePasskeyCredential` and before `buildRestoreSecret`; a mismatch returns `INTEGRITY_REFUSAL` (existing words). Comment: a passkey body restores only when the passkey that opens it made its check.

**B, the re-read and the trust.**
- `wallet/services/token/service.ts`: `refreshRestoredTokens(fence, deadlineAt)`: for each token row of the fence's profile on a live chain, read the instance and its interface and metadata as `previewTokenMetadata` does, with no pin taken from the row (its `classId` is the file's claim, D18), then update the row's class, interface, name, symbol and decimals where they differ. It updates, never adds, so no `onTokenAdded` fires and no trust follows. One write per changed row, under the token lock and the deletion fence the restore writes use. Each read is raced at the exact remainder to `deadlineAt` with its rejection contained (`registerOneNetwork`'s pattern, `importChainSync.ts:111-120`); the write checks the deadline again under the lock, so a read that lands late writes nothing. A failed or late read keeps the row and logs a fixed category at `debug`. Spec, client and RPC list gain it.
- **The update event** (D19): each changed row's write emits `onTokenUpdated` (`TokenInfo & { profileId }`, a third event beside add and delete). `send.vue`, `useScopedTokens` and `settings/tokens/index.vue` re-read their list on it, so a Send page opened before the refresh integerizes with the chain's decimals after it; `token-balance` re-sends the token's balances with the new metadata and queues them for a re-read (D22); `incoming-transfer` does not subscribe, so no trust follows.
- `composables/useFullBackupImport.ts`: `executeRestore` takes one absolute `tailDeadlineAt` before the tail, passes it to `runImportChainSync` (a new parameter replacing its internal one, same budget constant) and then to `refreshRestoredTokens`, on the restore run's fence; the popup races that call at the same remainder. It never fails the restore.
- Trust: the `trustRestoredTokens` call goes, with its stage (`full-backup-restore.ts:583-593`), service method, spec line and client entry; each restored token's first note uses the existing first-receipt prompt. OA-B1 may keep trust for list tokens.

### Arc 2: the approved fee is a ceiling (after OA-F1 to OA-F3)

- **Carried figure.** `approval-delta.ts`: `feeCeiling?: string`, the exact `maxFee` of the estimate the window showed for that operation. `dapp-interaction/service.ts` refuses a figure that fails `isFeeAmount` and copies it into `OperationApprovalEnvelope` (`execution/models/index.ts:78`). `index.vue` `approve()` sends `estimate?.maxFee`. The worker has no figure of its own (D7); under OA-F2 part 2 C the window always sends one for a person-paid fee, under B the worker asks when none came.
- **Which sends** (OA-F2 part 1, recommended A): classified from the build's route, not from `paymentMethod.kind`: the account's Fee Juice (`fj`, `fjwc`, and an embedded `fjwc`) and Private Fee Juice carry the ceiling (Private Fee Juice told from a sponsor by the build's FPC identity, since both are `EXTERNAL`); Nulo's sponsor and an app's own fee contract keep today's behaviour. `default_entrypoint` has no wallet fee.
- **Compare.** One rule in `execution/fee-reask.ts`, on raw integers: a build asks when its fee exceeds the approved figure by more than 10 percent **and** by at least 0.000001 FJ (`FEE_RISE_ASKS`, OA-F3 C); below that it goes out at the new fee, and a fall never asks. Figures print at six decimals, so a question's two figures never print alike (D8).
- **Hold and ask.** `dispatchOperation` passes the envelope to `executeSendTransaction` too. After each standard build and before `proveAndSend`, a fee above the ceiling stashes the build where it can be stashed, parks the slot through a `park(wait)` the `runInSlot` callback gains (the `parkSlot` path; the account lines stay held), and asks. Accept with figure Y reruns the build with ceiling Y: `aztec_sendTx` through `tryConsume` (its drift ladder) or a rebuild; `send_transaction`, embedded, `fjwc` and app-capped sends rebuild, so a further rise asks again and every accept is bounded by its figure. The authorization preview taken before the first build is asserted after every build (`PreviewSnapshots.take` is single-use). Refusal, a closed window, or the question's own deadline (`MAX_WAIT_MS` from the ask, shared by the waiter and the window, D36) ends it as `JobCancelledSentinel`: the dApp gets `JOB_CANCELLED` (4001). A person-paid approval that carries no figure is refused before the proof (D37).
- **One ask mechanism.** Send's `askAgain` body (waiter before the question, journal `queued` + `reask`, `beginQueuedWait`/`endQueuedWait`, expiry → `cancelled`) moves into `fee-reask.ts`; both executors call it; Send's behaviour and tests stay as they are (D9).
- **Accept and surface** (as built). OA-F1 B: the worker opens a fee window (`popup/windows/fee/`) over the approved request, read-only, with the fee block "Fee went up" over "Was … FJ · Now … FJ" and the buttons Reject and "Send for … FJ"; `DappInteractionService.askFeeAgain` keeps the approved request in memory until its execution ends, and the window's answer settles the worker's waiter with the worker's own captured figure. `acceptQueuedFee` stays transfer-only (D35). OA-F2 part 2 C: Confirm waits for the figure wherever the wallet picks the fee or the account pays it, an app's claim to the account included (D38).

### Arc 3: the grant card decodes (after #508 merges)

- **Shared encode.** `execution/authwit-discoverer.ts`: `encodeGrantCall(artifact, content) → { fn, selector, fields }`; `computeCallMessageHash` uses it, so display and signing run one encoding.
- **One RPC.** `execution/service.ts`: `decodeGrantsForDisplay(networkId, contents)` → per grant `{ kind: "decoded", call, decoded }` (`call` a `DisplayCallInput` with the selector and the encoded fields) or `{ kind: "undecoded", reason }`. A content not of kind `call`, an unknown contract or function, arguments that do not encode, or a decode that fails is undecoded. It shares the memoized PXE artifact lookup, the profile check and the count bound with `decodeCallsForDisplay` (one private helper).
- **Window.** `index.vue` decodes each grant at open, beside `decodeOperationArguments`. `grantsPending` and `grantRefusal` hold Confirm in the footer and in `approve()` itself; the refusal feeds `DappApprovalFooter`'s error row through its own state, which `handleFeeUpdate`'s `clearError()` does not touch (D11).
- **Card, as signed (`o-grant-a`).** `OperationCard.vue` `send_transaction` branch: the action line ("Authorize public spend — spender … for … on …", `OperationActionRow.vue` without its argument text), then an "Arguments" group, testid `execute-grant-args`, laid out as the `aztec_createAuthWit` card's, with `CallArguments` over `callSurface(undefined, grant.call, grant.decoded, isToken(contract))` and prefix `execute-grant`. No caller context: the spender makes the future call, so a transfer reads only an explicit `from`. `CallArguments` gains `full`: every value prints whole (`valueText(v, true)`, addresses as full mono text with no name in their place, in every branch `CallArguments` renders, nonce and structured addresses included), and row names do not wrap. Only the grant card sets it (D17).
- **Files expected to meet #508:** `OperationCard.vue` (its `<style module>`, the branch beside `op_divider`), `CallArguments.vue` (the `full` prop beside `UnreadableArgsNotice`), `call-surface.ts` (read), `identifier-sites.expected.json`, `type-roles-windows.test.ts`, the `OperationCard.*.test.ts` mounts. Arc 3 branches from `dev` after #508's merge and rereads them.

### Arc 4: the transaction card reads what encodes back (orchestrator-added)

- `execution/call-decoder.ts`: the encode-back check D28 put on the grant path moves into the shared `decodeFields`, over the values it already decoded, so `decodeCallForDisplay` (the transaction card, a discovered authorization) and `decodeGrantForDisplay` run one check (D31). A call whose decode does not encode back reads as `undecoded` with reason `arguments`: the card shows the existing unreadable-arguments notice and its raw fields. Confirm keeps today's rule for an unreadable call (D32).
- UI impact: none (an existing notice shows for one more input).

### Trade-offs: the competing outline (worker-centric)

It put every check in the worker: the MAC verified inside `ProfileService.restore`, token decimals re-read before every send, the shown figure recorded per estimate under a new id, grants refused at ingress. Rejected: the popup restores the slices through separate RPCs that a profile-row check would not bind; a per-send re-read adds a node round trip to every send; a worker record needs an id, an expiry and cleanup for estimates that have none (Fact 4); ingress refusal contradicts the signed words. Kept from it: one encoding shared by display and signing.

## Security & Adversarial Considerations

- **Tracked privately.**
- **Trust boundaries:** a backup file is outside input; a dApp's arguments and fee settings are untrusted; the fee a node predicts can change between the estimate and the build (#416). The popup stays inside the extension's trust boundary (D7).
- **Invariants and their tests:** a passkey body restores only under its own passkey's check (refused classes: wrong, missing, malformed, stripped MAC, another credential; bodies with a token, contact, setting or active-chain field changed and the checksum recomputed write nothing; control: a true body restores); a restored token's metadata is the chain's when the chain answers in time (control: an agreeing chain writes nothing); a person-paid dApp send proves above the approved figure only after a yes for the new figure (control: within the figure proves once); a grant is confirmable only when every argument decoded, and the hash signs the fields the card decoded (control: a decoded transfer enables Confirm).
- **Cryptography:** WebCrypto HKDF-SHA256 and HMAC-SHA256, as the existing `nulo:*` derivations; a distinct expand label, so the key never coincides with the master or the wrap key; verify by `subtle.verify`.
- **No new permission, dependency or stored item.** The MAC field is a backup-format change the owner approved (C). The ceiling and the ask live in the worker's memory and the journal's existing `reask` field.
- **Known limits** (closed `known-limit` issues at close-out, worded as behaviour): K1, the check proves which passkey made a backup, not when (an older backup of the same passkey restores). K2 is tracked privately.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`. Pass: each exits 0. A phase is ✓ only when its gate passes. Each phase logs to `lessons/phase-N.md`. Every e2e runs at `--retry=0` (smoke: `cd apps/extension && bun run test:e2e -- <file> --retry=0`; network: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts --retry=0`; the network config retries twice otherwise) with load1 under 150.

### Arc 1

**Phase 1. E.** ✓ Search first: `gh issue list --state all --label known-limit --search "endpoint provider"`. File and close the issue; write its number on the Outcome's `Known limits:` line at close-out. Correct the `seeds.ts:23` comment. UI impact: none. Gate: `F`. Pass: exit 0; the issue closed with `known-limit`.

**Phase 2. B: the check.** ✓
- Change the files listed under Arc 1. E2E: `buildSyntheticPasskeyBackup` (`tests/e2e/helpers/import-drivers.ts:516`) adds the MAC with `computeBackupMac`, fed by a PRF the test reads through an in-page `get` on the same virtual authenticator with the wallet's PRF input (`PASSKEY_PRF_LABEL`); its three callers (`passkey-backup.test.ts:328`, `passkey-retry.test.ts:37`, `passkey-toolbar-panel.test.ts:544`) keep their flows. Estimate: +2 s per call.
- Tests: `backup-mac.test.ts` (a known-answer vector; true on the same body; false on another checksum, another credential, a malformed MAC); `key-vectors.test.ts` pins the label; `full-backup-helpers.test.ts` (the MAC sits outside the checksum preimage; no callback, no field); `useFullBackupImport.test.ts` (a true passkey body restores; each refused class above returns its refusal and `profileService.restore` is never called; a missing MAC never prompts; a password body without the field restores).
- UI impact: the two existing refusals also answer a passkey body whose check fails or is missing (OWNER-ASKS, consequences; P22-03 C, words verbatim).
- Gate: `F`; `bun run test:all`; the three smoke files at retry 0 on Chrome and under `NULO_E2E_BROWSER=firefox` (WebAuthn, a fixture change); the Firefox panel round trip (`passkey-toolbar-panel.test.ts`, its real export and import, 96-180 s) locally. Pass: exit 0; each file's wall-clock before and after per browser in `lessons/phase-2.md`.

**Phase 3. B: the re-read and the trust.** ✓
- Change: `token/{service,spec,client}.ts`, `useFullBackupImport.ts`, `importChainSync.ts`, `full-backup-restore.ts`, `incoming-transfer/{service,spec,client}.ts`, `send.vue`, `useScopedTokens.ts`, `settings/tokens/index.vue`, and the tests that pinned `trustRestoredTokens` (`useFullBackupImport.test.ts:642`, `incoming-transfer/service.scenarios.test.ts`).
- Tests: a row whose decimals, symbol or class differ from the chain's is updated (never: the row keeps them), with no `onTokenAdded`; an agreeing chain writes nothing (control); a failed read, and a read that never settles, return by the deadline, keep the row and write nothing later; each changed row emits `onTokenUpdated` once and `incoming-transfer` ignores it; a Send page mounted before the update integerizes "1" with the updated decimals (`send-amount.test.ts`); `useScopedTokens` re-reads on it; another profile's rows and a token deleted during the read are never written; `importChainSync` honours a passed deadline. `incoming-transfer`: a restored token's first note is `pending` (control: an added token's note is visible).
- Network e2e: `tests/e2e/network/backup-restore-integrity.test.ts` gains one case: a backup whose token row disagrees with the chain restores with the chain's metadata on Home. Failure mode: the read after finalize against a real PXE and node, which no mocked layer reaches. Estimate +20 s.
- UI impact: OA-B1 (what ships now: every restored token asks on its first note) and OA-B2.
- Gate: `F`; `bun run test:all`; that network file at retry 0. Pass: exit 0; wall-clock before and after in `lessons/phase-3.md`.

### Arc 2 (starts once OA-F1 to OA-F3 have answers)

**Phase 4. The figure and the hold.** ✓ Change the files under Arc 2, `transfer-executor.ts` through `fee-reask.ts`, and `execution/service.ts`. Tests: `approval-delta.test.ts`, `service.approval-binding.test.ts` (a malformed figure refused; the figure reaches the envelope); `index.test.ts:759-775` seeds a nonempty `maxFee` and pins its exact handoff as the fourth key; `dapp-send-executor.test.ts`, one matrix over `aztec_sendTx` (reuse hit, reuse miss, embedded `fjwc`, embedded fee contract, app cap, app priority, Private Fee Juice) and `send_transaction` (`fj`, Private Fee Juice): within the figure proves once (control); above it nothing proves, the slot is free, the row is `queued` with `reask`; accept proves at the accepted figure; a rise after an accept asks again; refusal and deadline end `JOB_CANCELLED`; the preview holds on every build; the payers OA-F2 leaves out prove as today. `transfer-executor.test.ts:1500-1735` stays green unchanged. Gate: `F`; `bun run test:all`. Pass: exit 0.

**Phase 5. The surface (OA-F1's pick).** ✓ Build the picked option and its component tests over a wire-shaped fixture. UI impact: OA-F1 to OA-F3 as answered, quoted in the PR with the shots. Gate: `bun run audit:vue`. Pass: exit 0.

**Phase 6. One network scenario.** ✓ Failure mode: worker hold, the surface, accept and proof in a real browser against a live node, which jsdom and mocks cannot reach. Force (D16): the test estimates on the account's public Fee Juice through the worker (asserting no shortfall, since the card defaults to Nulo's sponsor and its own balance read can lag the funding) and approves through the worker's approval entry with half that figure, the two thresholds asserted in the test, so the real build lands above it; it asserts the queued question and the window before accepting, and the proof after. No production seam, no node fixture. File: `tests/e2e/network/tx-sendTx-default.test.ts` gains the case; estimate +60 s per browser. Gate: that file at retry 0, on Chrome, and on Firefox if OA-F1 picks a window option. Pass: exit 0; wall-clock in `lessons/phase-6.md`.

### Arc 3 (branches from dev after #508's PR merges)

**Phase 7. One encoding, one RPC.** ✓ Change `authwit-discoverer.ts`, `execution/{service,spec,client}.ts`. Tests (real Token artifact; addresses checked with `isValidAztecAddress`): `computeCallMessageHash` over the content equals the hash over `decodeGrantsForDisplay`'s call; an object, a decimal string and a hex string argument each decode to the value the hash encodes; one refused class each: a non-`call` content, unknown contract, unknown function, an argument that does not encode, a decode that fails. Gate: `F`. Pass: exit 0.

**Phase 8. Window and card.** ✓ Change `index.vue`, `OperationCard.vue`, `OperationActionRow.vue`, `CallArguments.vue`, the grant fixtures in `OperationCard.test.ts`, `.authwit.test.ts`, `.long-strings.test.ts` (rewritten wire-shaped), `identifier-sites.expected.json`. Tests: a decoded transfer grant shows spender, From, To (whole) and Amount with the symbol, and enables Confirm (control); a field, a long string and an array print whole; pending holds Confirm with "Reading arguments…"; each undecoded reason shows the card's warning, the error row, a disabled Confirm, and `approve()` refuses; a fee change keeps the refusal. UI impact: P22-01 A as signed (`o-grant-a`) and OA-G1's what ships now. Gate: `bun run audit:vue`; `bun run test:all`. Pass: exit 0; `scripts/complexity-baseline/manifest.json` unchanged.

**Phase 9. Real browsers.** ✓ `type-roles-windows.test.ts`: the grant flow waits for `execute-grant-amount` and sweeps the new rows; `authwit-lifecycle.test.ts`: the grant window shows the decoded amount at rest. No scenario added. Run both, then `authwit-consume-smoke`, `snack-placement`, `frozen-account-canary` and `passkey-execution-canary` (they confirm a grant). Gate: all green; `bun run test:ci-gating`; `bun run check:plans`. Pass: exit 0; wall-clock before and after in `lessons/phase-9.md`.

### Arc 4 (orchestrator-added, from `origin/dev` at `493ff497`)

**Phase 10. The call path's encode-back.** ✓ Change `call-decoder.ts`. Tests: `call-decoder.test.ts`, wire-shaped fields (`0x` + 64 hex): the real TokenBridge `exit_to_l1_public` by its real selector decodes its recipient (control) and reads `arguments` under the same last 20 bytes with a set upper bit; a boolean field of 2, a string character past 16 bits, an integer past its width (an encoder refusal) and a Some holding None each read `arguments` beside a control that decodes; the twin-selector grant test takes a field both functions read canonically. `OperationCard.wire.test.ts`: the same exit through `displayCallsOf`, the real decoder and the card shows the notice with reason `arguments` and no decoded row; the canonical exit shows its four rows (control). No e2e scenario: none is added, and the window's lanes run in CI. Gate: `F`; `bun run test:all`. Pass: exit 0; each new case red against `493ff497`'s decoder.

## Delivery

Four PRs against `dev`, no stack (D-orch-1), each opened after its arc's gates and Codex loop converge. Branches `harden-security-fixes-2-arc1` (from this branch), `-arc2`, `-arc3` and `-arc4` (each from `origin/dev`; arc 4 after arc 3 merged). If OA-F1 is still open when #508 merges, arc 3 may ship second and the close-out moves to arc 2.

| Arc | Phases | PR title | Body |
|---|---|---|---|
| 1 | 1-3 | `feat(backup): bind passkey backups to their passkey; read restored tokens from the chain` (88) | P22-02 B and P22-03 C, the signed words about the change; the known-limit issue; runs |
| 2 | 4-6 | `feat(execute): ask again when a dApp send's fee rises above the approved figure` (79) | P22-04 A; OA-F1 to OA-F3 with the shots; `Closes #416` |
| 3 | 7-9 | `feat(execute): show a public grant's arguments as the decoded rows it signs` (75) | P22-01 A and `o-grant-a` as the sign-off; OA-G1; screenshots light and dark |
| 4 | 10 | `fix(execute): read a dApp call's arguments only when they encode back to their fields` (86) | the change, the tests, `UI impact: none (an existing notice shows for one more input)` |

Each body states what changed and why, the validation runs, and each browser's suite wall-clock before and after for the suites it touched; it names no private record and describes only the change. It ends with the Claude Code line. Labels only after creation, and only when a path filter would skip a needed suite. Parallelism: none; the arcs wait on outside events, not on each other's files.

## Post-implementation

Execute `implementations-plan/README.md` § Post-implementation standard as it reads at `c5e9c8e8`, with: step 1 absent (`code_review: off`); step 2 per arc at its boundary, Codex by `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; the arc map in every prompt; before the last PR opens, one fresh Codex pass over the net diff from `c5e9c8e8` for cross-arc issues; step 4's close-out as the last PR's final commits (merge `origin/dev` first), with K1, E's issue and OA-F2 part 2 A's issue (if picked) on `Known limits:`; step 5 `agent-worktree done harden-security-fixes-2 --merged` once `implementations-plan/archive/harden-security-fixes-2/plan.md` is on `dev`. Merging is the orchestrator's.

## Decision ledger

Ids by arc: D1 to D19 at planning, arc 1 D20 to D23, arc 3 D24 to D30, arc 4 D31 to D34, arc 2 D35 to D41; `D-orch-1` to `D-orch-3` are the orchestrator's. Each arc took the next free id on its branch, so arc 2's collided at all three merges and were renumbered.

| # | Question | Decided | Why |
|---|---|---|---|
| D1 | Tier | `mid` | the lane brief names it; four items, three PRs |
| D2 | Where the check is made and verified | popup, at the shared seams | the prompt and every import gate run there; a worker check would not bind the slices restored through separate RPCs |
| D3 | What the MAC covers | the checksum, stored beside it | the checksum binds every field and slice, `master-key`, the sealed DEK and `active-chain-id` included |
| D4 | A passkey body with no MAC | "Incompatible backup" before the prompt | stripping the field must not pass; the words exist |
| D5 | Fold the export and restore service pairs | no | different secrets; six shared lines |
| D6 | When the token re-read runs | after finalize, on the tail's one deadline | the session is open; no new lifecycle; a late read keeps the row |
| D7 | Where the approved figure comes from | the popup's delta | the threat is the node, not the popup; a worker record needs ids, expiry and cleanup |
| D8 | Compare | raw integers, with the owner's tolerance: more than 10 percent and at least 0.000001 FJ above asks | OA-F3 C; the floor of one readout unit keeps "Was" and "Now" apart at six decimals |
| D9 | Send's ask loop | extract the answer and transition mechanism once | no copy |
| D10 | Grant decode | one worker RPC: shared encode, existing decoder | shown and signed share one encoding; ingress refusal contradicts the signed words |
| D11 | Grant refusal state | its own computed, also checked in `approve()` | `clearError()` runs on every fee change |
| D12 | The stale seeds comment | correct it, a documentation fix | a comment must state what the code does; the brief's "no code change" concerns behaviour |
| D13 | A worker decodability check at grant confirm | no | every grant opens the window; signing already throws on an unknown contract, function or unencodable arguments |
| D14 | Restored-token trust | the call goes | P22-03 C; OA-B1 may keep it for list tokens |
| D15 | #416 | reopened and closed by arc 2 | its reopening condition is the owner's pick |
| D16 | How the e2e forces a dearer build | approve through the worker's entry with half the estimate's figure, both thresholds asserted | deterministic, crosses the production compare past the tolerance, no seam; a speed change re-estimates the window, so it cannot force one |
| D17 | Address and value print in the grant rows | whole, as `o-grant-a` draws them, via `CallArguments`' `full` | the signed picture; the transaction card keeps its trimmed rows |
| D18 | The re-read's pin | none from the row | a pin from the file's `classId` would turn a mismatch into a kept row |
| D19 | How open pages learn of an updated row | an `onTokenUpdated` event, separate from add | Send integerizes with its list snapshot (`send.vue:154,490`); the add event trusts the token |
| D20 | Phase 3's network case (implementation) | doctor the funded token's row inside the existing `backup-restore-integrity` scenario | a separate case needs its own funded wallet and export; the same import already reaches the real PXE and node |
| D21 | Where the open-Send test sits (implementation) | `send.test.ts`, not `send-amount.test.ts` | the helper takes the decimals as an argument; only the mounted page re-reads its list |
| D22 | The balance service on `onTokenUpdated` (arc 1 review) | re-send the token's balances with the new metadata and queue them, for a token its map already holds | each balance carries its token's metadata from a map loaded at activation, which precedes the re-read |
| D23 | Send's transfer kind after an update (arc 1 review) | when the active token's transfer capabilities change, move only a selection it can no longer transfer | the id watcher does not fire for the same token, so a kind the chain does not support stayed selected; re-running the full selection would replace a still-valid choice with the preselected kind |
| D24 | Arc 3's start (orchestrator) | released while arcs 1 and 2 are open, cut from `dev` at `d461b059` | arc 3's gate was #508's merge (#594); it shares no file with arc 1 and only `index.vue` with arc 2 |
| D25 | The shared encoder's shape (implementation, arc 3 review) | `encodeAuthwitCall(fn, args)` takes the function each caller resolved by name; a non-`call` content reads as `unavailable` | signing keeps its frozen error text and the display its own reason for a missing function; no existing reason fits a content with no function, and a new one would be new copy |
| D26 | `full` and the `this account` sender (implementation) | left out: the prop documents that only a call read without caller context sets it | the grant card passes none, so the branch is unreachable under `full`; a full variant there would be an inventory entry no state can seed |
| D27 | What the grant decode reads (arc 3 review) | the stored operation, by reference and as a draft before any fee choice: `decodeGrantsForDisplay(interactionId, index)` through `materializeStoredDraft`, which holds the guards `materializeStoredOperation` had | the popup's copy passes through the message layer's JSON replacer, which rewrites some values the encoder reads; the completed read refuses a send whose fee is unchosen, which is when the window decodes |
| D28 | A decode that does not encode back (arc 3 review) | on the grant path, it reads as undecoded (`arguments`) | the decoder reads some types narrower than the encoder writes them; arc 3 changes the grant path only |
| D29 | A value that cannot print whole (arc 3 review) | the grant reads as undecoded (`arguments`), the existing refusal | the signed picture prints every value whole; a stripped value is not the one signed, and a marker would be new UI |
| D30 | Which function a grant decodes with (arc 3 review) | the one resolved by name and encoded for, as signing resolves it | an artifact may list another function with the same selector, so a selector lookup can read the signed fields through a different interface |
| D-orch-2 | Arc 4 (orchestrator, after #611 merged) | the transaction card's decode gets D28's check | a review note kept private |
| D31 | Where arc 4's check runs (implementation) | inside `decodeFields`, over its decoded values | one check for every decode the window shows, and one decode instead of two; every function of the 40 bundled artifacts (`noir-contracts.js`, `aztec-standards`) reads as before under random canonical arguments; what now reads as unreadable is a decode that loses fields (a Some holding None reads as None, a `BoundedVec`'s storage past its length is dropped) or a tuple parameter, which the stdlib encoder does not take and no bundled artifact has |
| D32 | Confirm for an unreadable dApp call (implementation) | unchanged: the notice, Confirm as today | the notice asks the person to check the app's description before approving; holding Confirm for a call would change what a person can do, an owner decision this arc does not have |
| D33 | Where arc 4's card test sits (implementation) | `OperationCard.wire.test.ts`, over the real decoder; the dispatcher test unchanged | the window hands the decode to the card untouched; the dispatcher test pins no decoded shape |
| D34 | A string the transaction card prints shorter than its characters (arc 4 review) | unchanged in this arc | the card's string print is a display rule outside the decode, and the grant card's whole-print rule would refuse the padding a canonical `str<N>` carries; noted privately |
| D-orch-3 | Arc 2's start | in parallel with arc 1, before its merge | the orchestrator released it (2026-10-16), overriding "Parallelism: none" under Delivery; the arcs share no source file |
| D35 | Who answers a dApp send's question | its own window only; `acceptQueuedFee` stays transfer-only | the window settles the waiter with the worker's captured figure, so no RPC takes a figure from a page; Home's queued dApp row focuses the window |
| D36 | The question's deadline | `MAX_WAIT_MS` from the ask, one absolute deadline for the waiter and the window | the owner's "unanswered after 60 minutes"; opening the window must not restart it |
| D37 | A person-paid popup approval with no figure | refused before the proof | under OA-F2 C the window always sends one; accepting none would send unbound |
| D38 | Which operations Confirm waits on | a fee picked in the window that the person pays (Fee Juice, Private Fee Juice, or a payer the fee card has not reported yet), an app's payment the person makes (a claim to the account, the PrivateFPC), and an app's own cap or priority | the figure binds wherever the person pays; a sponsor picked in the window carries none, so its Confirm behaves as before the arc (revised after PR CI: waiting on it kept a sponsored request the estimate refuses from reaching its refusal) |
| D39 | What the held send keeps across the question | the build stashed in the reuse cache, and only the question and the stash id in the waiting frame | the cache's two-minute bound holds the signed request, not the person's wait |
| D40 | After the question | re-check earlier sends under the slot, then claim the record back (`queued → pending`, or still `pending`) | another send of the account may reach the node while this one waits |
| D41 | An app's own payment naming the PrivateFPC as payer | carries the figure as Private Fee Juice: the worker reads the kernel's payer, the window the request's `feePayer`, both against one address constant the derivation test pins | it charges the account's own Private Fee Juice, which OA-F2 A names; an app's other fee contracts stay exempt |

## Audit verdicts

**Round 1** (2026-10-16). Codex `gpt-6.1-sol` high: **reject**, 8 findings. Opus 5.5 Plan lens: **conditional approve**, 11 findings. Each was checked against the tree; all were accepted, folded as below.

| Finding | Decided |
|---|---|
| C1, O8: committed wording described more than the change | plan, recon and the asks reworded; the E body and K2 stay private; PR bodies quote only the signed words about the change |
| C2, O1: arc 3's default trimmed what `o-grant-a` draws whole | D17: the signed picture ships; OA-G2 withdrawn |
| C3, O2: a press before the figure leaves no ceiling | OA-F2 part 2 states that A leaves it open and becomes a known limit; the Outcome criterion names B or C; C's wording fixed |
| C4: payer classification by `paymentMethod.kind` misses an embedded `fjwc` | route-based classification; the executor matrix in phase 4 |
| C5, O10: D8's rounding bucket | D8 reversed to raw integers; OA-F3 asks how the figures print |
| C6: the tail's budget is internal to chain-sync; the session opens earlier; the add path trusts | one deadline threaded; the re-read updates, never adds; OA-B2 corrected |
| C7, O5: the fee reproducer was open; retry-0 and suite wall-clocks unstated | D16 settled; commands at retry 0; suite wall-clocks per browser in each PR body |
| C8: the comment edit against "no code change" | D12 classifies it as a documentation fix |
| O3: a third synthetic-backup caller; a real export costs 96-180 s | the synthetic builder adds the MAC from an in-page PRF; the real panel round trip runs locally |
| O4: phase 2's gate missed `packages/wallet-crypto` | `bun run test:all` added |
| O6: a pin from the row's class would keep its metadata | D18 |
| O7: OA-F1's costs understated | B's obligations and A as the simpler build written into OA-F1; C's wait corrected |
| O9: spender row, non-`call` content, `approve()` guard, testid clash | all in arc 3; testid `execute-grant-args` |
| O11: two candidate known limits | K1 filed at close-out; K2 tracked privately |

**Final fresh pass** (2026-10-16). Codex `gpt-6.1-sol` high, a fresh session: **reject**, 4 findings, all verified and accepted; the same session then re-read the changes: **approve** ("no new blocking issues").

| Finding | Decided |
|---|---|
| F1: an open Send page keeps its token snapshot after the re-read updates a row | D19's `onTokenUpdated`; Send, `useScopedTokens` and the token settings re-read on it |
| F2: a read started near the deadline is not bounded by it | each read raced at the remainder; a commit-time deadline check drops a late result |
| F3: the fee e2e accepted the card's default payer, Nulo's sponsor | phase 6 picks the account's public Fee Juice; phase 4 pins a nonempty `maxFee` handoff |
| F4: the network command allowed retries | `--retry=0` on every network run |
| Ask: the `/loop` seed could read as settling owner choices | the seed leaves what a person sees to the owner |

**Arc 2 design consult** (2026-10-16). Codex `gpt-6.1-sol` high, read-only, on the worker design: **approve with changes**, 3 findings, all accepted ([lessons/phase-4.md](lessons/phase-4.md)).

| Finding | Decided |
|---|---|
| A: an app's claim to the account read as app-paid, so Confirm could pass with no figure | D38 |
| B: the waiting frame would hold the signed request past the cache's bound | D39 |
| C: a figure one unit below no longer asks once the tolerance exists | D16 revised |

**Arc 1 review, round 1** (2026-10-16). Codex `gpt-6.1-sol` high, read-only, over `2ea17854..6da190f6`: **reject**, 2 material findings and comment nits. Opus 5.5 general-purpose, alongside: **conditional approve**, 1 material finding (Codex's first) and nits. The round ran while the phase 2 and 3 e2e gates waited on host load. Each claim was checked against the tree.

| Finding | Decided |
|---|---|
| The balance service keeps the backup's metadata after the re-read (both) | D22; two tests, each red without its guard |
| An open Send page keeps a transfer kind the chain does not support (Codex) | D23; one mounted-page test, red without the watcher; the decimals test now also pins the kind it keeps |
| No refresh test removes the chain mid-read or mid-write (Opus) | two tests, each red without its guard |
| No test imports an encrypted passkey file (Opus) | one case each way: the check survives the seal, and a file stripped before the seal is refused before any prompt |
| Comments: a caller-specific note on the MAC label, a restating type doc, a redundant line in `full.vue`, the tail budget's stale scope; no comment on why restore-again needs no prompt (both) | fixed |
| A test name carried a review label (Opus) | renamed to what it proves |
| One out-of-scope question (Opus) | sent to the lane's private record; no change in this arc |

**Arc 1 review, round 2** (2026-10-16). Codex, resumed over `90137f90`: **reject**, 1 material finding, verified and accepted: the capability watcher re-ran the full selection, so gaining private transfers replaced a valid public choice with the preselected kind. It now moves only a selection the token can no longer transfer (D23); a mounted-page test pins the kept choice and is red against the round-1 watcher.

**Arc 1 review, round 3** (2026-10-16). Codex, resumed over `cd9c8be5`: **approve**, no new findings. The loop converged.

**Arc 2 review, round 1** (2026-10-16), on the implementation. Codex `gpt-6.1-sol` high, read-only: **approve with changes**, 1 finding. Opus 5.5 general-purpose: **approve with changes**, 6 findings. Each was checked against the tree.

| Finding | Decided |
|---|---|
| Codex: the fee window dropped the authorization rows the approval window listed | the preview snapshot keeps them; the question carries them and `OperationCard` lists them again (`approvedAuthwits`) |
| Opus 1: a send held on its question was not counted as an approved send in flight | `isApprovedSendInFlight` counts a queued `dapp_execute` carrying `reask` |
| Opus 2: an app's own payment through the Private Fee Juice contract is exempt | first filed as an owner ask; round 2 below |
| Opus 3: two stacked doc comments | removed and moved |
| Opus 4: the reask adapter built twice; an inline type restating `StandardBuild` | declined: two small call sites; the inline type predates the arc and also types the estimate path's call |
| Opus 5: the e2e takes the re-hold of a reused build | accepted as is: the fresh-build path is unit-tested; the e2e accepts well inside the reuse entry's life |
| Opus 6: Available for a wallet-picked claim excludes the claim | recorded in [lessons/phase-5.md](lessons/phase-5.md); the row is the mockup's |

**Arc 2 review, round 2** (2026-10-16). Codex, the same session: **approve with changes**, 1 finding; round 1's finding resolved.

| Finding | Decided |
|---|---|
| The exemption of an app's payment through Private Fee Juice narrows OA-F2 A, and the route is supported (the playground's PrivateFPC routes, `selfpay-phase.test.ts`) | D41 |

**Arc 2 review, round 3** (2026-10-16). Codex, the same session, on D41 and the e2e's settled-row check: **approve**, no findings ("both prior findings are resolved").

**Arc 3 review, round 1** (2026-10-16). Codex `gpt-6.1-sol` high, read-only, over `d461b059..17dd2c43`: **reject**, 3 material findings. Opus 5.5 general-purpose, alongside: **reject**, 2 material findings (one is Codex's first), a cost note and comment nits. Each was checked against the tree; all were accepted and fixed in `8b49f561`.

| Finding | Decided |
|---|---|
| The card decoded the popup's copy of the request, not the request approval executes (both) | D27; a service test pins a stored value the copy rewrites |
| A decode can read narrower than the fields it came from (an `EthAddress`, a boolean, a string character) (Codex) | D28; a test with an address past 160 bits, red without the check |
| A value with control or direction characters printed with them stripped (Codex) | D29; `readableGrants` tests |
| A batch shorter than the operation's grants left the rest unrefused (Opus) | each index without a decode reads as `unavailable`; a window test, red without it |
| A wide `str<N>` parameter encoded before the argument bound (Opus) | the bound runs first |
| Comments: the window's init note out of date; three docs named their caller (Opus) | fixed |

**Arc 3 review, round 2** (2026-10-16). Codex, resumed over `cd3f739e`: **reject**, 2 material findings, both verified and accepted, fixed in `8829a309`: the decode read the completed operation, which refuses a send whose fee is not yet chosen, so every such grant read as undecoded (D27; the service test now drives the real interaction service, red against the round-1 read); and the grant decoded through a selector lookup while its round trip checked the function resolved by name (D30; a test with two functions sharing a selector, red without the fix). The pre-fix Chrome run caught neither, as it built from the popup-copy path; it also showed the lifecycle file's read of a wait's handle, which this suite's fixtures resolve to `null` (fixed in `cd3f739e`).

**Arc 3 review, round 3** (2026-10-16). Codex, resumed over `8829a309`: **approve**, no material findings; it re-ran the transaction card's decoder over its inputs and found its results unchanged. The loop converged.

**Arc 4 review, round 1** (2026-10-16). Codex `gpt-6.1-sol` high, read-only, over `493ff497..02391a30`: **approve**, 3 findings and 2 nits. Opus 5.5 general-purpose, alongside: **approve**, no material finding, 4 nits. Each was checked against the tree.

| Finding | Decided |
|---|---|
| A canonical Some holding None now reads as unreadable (Codex) | kept: the decode reads it as None, a reading the fields do not carry; recorded in D31 and pinned by a test row |
| A string's control characters do not print on the transaction card (Codex) | not in this decode; D34 |
| An unreadable call's title falls back to the dApp's name or the selector (Codex) | the existing rendering of an unreadable call, and execution refuses a name that does not match the selector; the PR body says so |
| No case exercised an encoder refusal inside the shared decode (both) | a row: an integer past its width |
| The public exit was sent as a private call in the card test (Codex) | `type: "public"` |
| The wire test's TokenBridge selector is not checked against the hash; the card test overlaps the unit test (Opus) | kept: the selector is the real one at 6.0.0-rc.3 and only needs to agree with itself under the stood-in hash; the card test is the decode-to-card chain D33 asks for |

**Arc 4 review, round 2** (2026-10-16). Codex, resumed over `2b621f1b`: **approve**, no findings; it re-ran the five refusal rows and their controls, and hashed the TokenBridge selector to the test's value. The loop converged.

**PR CI, first run** (2026-10-16). The network lanes failed on both browsers in `authwit-lifecycle.test.ts` and `scope-refusal.test.ts`: each presses Confirm on a sponsored request whose estimate fails by design (a revoked authorization, an out-of-scope call), and the window waited for a figure on every wallet-picked fee. D38 revised: a sponsor picked in the window does not wait.

**Cross-arc pass** (2026-10-16). Codex `gpt-6.1-sol` high, a fresh read-only session over the net diff from `c5e9c8e8`, arcs 1 and 3 merged under arc 2: **approve with changes**, 2 findings, both verified and accepted, fixed in `a52afd5f`; the same session re-read the fix: **approve**, no findings.

| Finding | Decided |
|---|---|
| Demonstrated: the fee window passed the card no grant decodes, so a held send with a public grant read "Reading arguments…" for good while "Send for" stayed live | the window decodes the question's stored request through a display-only read (`decodeQuestionGrantsForDisplay`), lists the rows and keeps "Send for" off while a grant decodes or cannot be read; estimates, previews and approval still refuse a question's id |
| Plausible: both windows kept the token list they read at open and missed arc 1's `onTokenUpdated` | `followKnownTokens` reads again on an update for the window's profile and drops a superseded read |

## Seeds (draft; the orchestrator finalizes after approval)

- `/goal` Every phase of implementations-plan/harden-security-fixes-2/plan.md marked ✓ in order, each backed by its gate's output in the transcript; `LESSONS_FILE=implementations-plan/harden-security-fixes-2/lessons/phase-N.md` printed per phase; `/code-review` not run; the Codex loop converged per arc and the cross-arc pass converged, each quoted; each arc's PR against `dev` opened after its loop, the close-out's archive-move commit shown by `git show --stat`; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/harden-security-fixes-2 forward per its plan.md and the README's Post-implementation standard at `c5e9c8e8`; never start arc 2 before OA-F1 to OA-F3 are answered, nor arc 3 before #508's PR merges; settle open technical questions with Codex and log each in lessons/; what a person sees waits for the owner's answer in OWNER-ASKS.md.
