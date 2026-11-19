# authwits-2: owner asks

Arc 1 depends on none of these. It ships no new words, rows or layout: a revoke or a registry change that lands on Testnet or Mainnet now ends the way it already ends on the sandbox, and closing either popup while it sends no longer shows a failure the wallet did not have. Every frame below was taken on the sandbox at 400 px, light and dark, from a throwaway prototype branch that is never pushed (`proto/authwits-2-status`); each file is `aw2-status-<today|a|b|c>-<state>-<light|dark>.png` or `aw2-name-<today|n1|n2>-<light|dark>.png`, with its caption in `captions.json`.

## OA-1: how the revoke popup shows its send (Q3)

**Answered: B** (P166-01, decision page 166, signed 2026-11-17 at 15:40 UTC at dev `0dc22a9c5`), with the note *"\"B\" but once revoke is clicked and.. (sent?) should take you to home? Like any other transaction / transfer?"*; asked, the owner answered on 2026-11-18 at about 15:05 UTC: *"Authwit: Ok. Stay there. On authwits page."* Built in arc 2 as drawn, staying on the page. Implementation note: the row chip's source is the revoke task the worker already keeps per revoke, not the journal record, which names no row and turns `succeeded` before the registry confirms (plan.md D7); no new stored shape.

**Surface.** Settings → Developer → Account state → Authwits → Revoke (one authwit or all), the popup from Revoke until it ends.

**Today.** A thin coloured line under each chunk's fee card (grey, a moving blue line, green, red), and under the button the journal's words ("Simulating...", "Generating proof...", "Submitting..."). Once the transaction is sent the words go away while the wallet waits for its block: about 3 s on the sandbox, up to two slots on Testnet. The popup then closes with "Authwit(s) successfully revoked", or stays with "Failed to revoke authwit(s)" and an "An error occurred" line whose tooltip holds the raw error. Send closes at Confirm and lets Activity carry the send; nothing else in the app draws a status line like this one.

**Options.**
- **A, the review-sheet rows.** Each chunk reads as rows ("Authorizations 3", "Status Generating proof..."), the status row says "Waiting for the block..." after the send, and the popup ends on its own panel: "Revoked", "These 3 authorizations can no longer be used.", "Transaction 0x2f1c…9a07", Done; or "Couldn't revoke" with the reason.
- **B, Activity carries it.** Revoke closes the popup at once, as Send does. A line under Revoke says "Revoking continues if you close this. Its progress shows in Activity." Each row being revoked shows a "Revoking" chip until the registry confirms, then leaves the list; a failed one shows "Not revoked". Home's Activity already lists the revoke's transaction today.
- **C, today's layout with the app's words.** The line and the stage words stay, "Waiting for the block..." fills the gap after the send, and the popup stays open at the end on "Revoked." or "Couldn't revoke." with the reason, a "View transaction" link and Close.

**What the code already has.** C needs the least: the stage line already follows the journal; it adds one wait word and an end state. B's Activity half exists today; its row chip needs a source that survives closing and reopening the page, which the in-flight journal record can give without new storage. A rebuilds the chunk card.

**Recommendation: B.** It is the owner's own test ("differs from everything else in the app"): every other send closes at Confirm and reports in Activity. Second choice C.

**What ships now.** B, in arc 2.

## OA-2: naming what an authorization allows (Q5)

**Answered: N1** (P166-02, no note). Built in arc 2 for `call` rows, as drawn. An `encoded_call` row keeps "Encoded Call": its function name is bound to its selector too (the wallet takes it from the contract's ABI before hashing), so titling it "Transfer · " and the chip is a one-line change, not drawn for you; say if you want it (plan.md D10).

**Surface.** The Authwits page's rows.

**Today.** The title is the record kind ("Call", "Encoded Call", "Intent", "Message Hash"), then raw addresses and the function name.

**Options.**
- **N1.** The title names the action and the contract: "Transfer · " and the contract chip the approval window uses (a signed-list token reads its symbol with Nulo's seal; any other contract reads its short address as an unknown contract).
- **N2.** A sentence above the details: "Lets {caller chip} spend up to 25 TST of yours through {contract chip}." where the stored call is a transfer of a token the wallet holds, else "Lets {caller chip} call {function} on {contract chip}.".

**What the decoding needs.** N1 needs nothing the row lacks: the stored call holds the contract and the function name, and chips are local. N2 reads the amount from the stored arguments by position; a correct reading needs the contract's artifact (the service worker's `decodeCallsForDisplay`) and the token's decimals, and it covers only `call` rows. `intent` and `message_hash` rows hold no readable call and keep today's details. The brief's premise does not hold in this tree: no aztecscan reading exists yet (`contract-level.ts:13`), so only listed tokens and the two fee contracts read as verified.

**Recommendation: N1 now, N2 later** once the decoder reads stored calls.

**What ships now.** N1, in arc 2.

## OA-3: check the registry when the Authwits page opens (Q4, would be arc 3)

**Answered: S, on page open** (P166-03, decision page 166, signed 2026-11-17 at 15:40 UTC at dev `0dc22a9c5`), the option as stated below. Built in arc 3, stacked on arc 2, with exactly the two effects it names; no checking line, spinner or error line (a failed check leaves the page as it opened). Implementation note: a revoke popup opened before the check prunes a row now skips that row instead of failing its estimate (plan.md D18); nothing on screen changes for it.

**Surface.** The Authwits page: its "registry disabled" warning and its rows.

**Facts.** The page lists grants this device sent (or a backup restored). The chain cannot list an account's grants: public approvals sit in the AuthRegistry under (account, message hash) with no index of keys; a private authwit is a signature handed to the app and stored nowhere; a node archives no mined transaction bodies by default (`archivedTxLimit: 0`), so only an indexer that stored them could list `set_authorized` calls. What the chain can answer cheaply: the account's registry switch (`reject_all`), and whether each listed hash is still authorized. The wallet already has that read (`syncRegistry`) and nothing calls it, so after an import or a restore the warning reads "enabled" even when the registry is off, and grants an app has consumed stay listed.

**Option.** On opening the page, run `syncRegistry`: one read for the switch plus one per listed row (at most 256). Effects a person sees: the warning matches the chain; consumed grants and grants revoked from another install leave the list.

**Not recoverable (a known limit, #1861).** Grants made from another install with no backup. Reopening condition: an indexer the owner approves as a new dependency, or an Aztec API that lists a contract's storage writes by sender.

**Recommendation: yes, on page open**, not on every account start: the page is where the answer is read.

**What ships now.** S, in arc 3.

## OA-4: where a Not revoked row's reason shows when Activity has none (new, arc 2)

**Answered: R0** (P188-02, decision page 188, signed 2026-11-18 at 19:12 UTC at dev `b22893f42`), approved as the default: the chip alone, as shipped.

**Surface.** The Authwits page's "Not revoked" chip.

**Why it comes up.** B says a failed revoke reads "Not revoked" with the reason in Activity. That holds when the journal records the failure (a simulation, a proof or a send refused: Activity's failed card names it). It does not when the revoke fails outside the journal: a grant not yet in a block (refused before any send), or after the send (the checkpoint wait running out, the registry still reading authorized), where Activity shows the transaction confirmed. Today's popup showed the raw error in an "An error occurred" tooltip; under B the popup is gone by then.

**Options.**
- **R0, as shipped.** The chip alone; the reason shows only where Activity has it.
- **R1.** Pressing a Not revoked row's chip opens a short card with the reason, in plain words ("The revoke's block wasn't on L1 within 2 minutes. Revoke again to check.").
- **R2.** A grey line under the row's title, "Not revoked: <reason>", until the next revoke.

**Recommendation: R0 now.** Each case is rare (a pending grant past its wait, a checkpoint past 120 s on Testnet), and R1 or R2 needs worded reasons for each failure. Revisit with arc 3, whose registry check on page open prunes a row the revoke did land.

**What ships now.** R0. Filed as #1865 (`owner-decision`) at close-out; the owner then approved R0 (P188-02).

## Page 188: one status chip per row (arc 2, a change the owner asked for)

**Answered: change** (P188-01, decision page 188, signed 2026-11-18 at 19:12 UTC at dev `b22893f42`), with the note *"Why does somethinbg have "Pending" + "Revoking"? It's either one or the other? This is looking a bit confusing."*

**Surface.** The Authwits page's rows.

**Before.** A grant whose own transaction was not yet in a block drew Pending, and a revoke of it drew Revoking beside it (the revoke waits for that block), so one row read "Pending" and "Revoking" side by side; a failed revoke of such a row read "Pending" and "Not revoked".

**Built.** A row shows one status chip, by this precedence: Revoking, then Not revoked, then Pending. Revoking covers the wait for the grant's block; the row's accessible name reads the one chip shown. The chips keep their words, look and colours, and the rest of the row is unchanged. Recorded as plan.md D20.
