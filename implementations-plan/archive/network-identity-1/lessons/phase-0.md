# Phase 0: planning consults

Every consult of the planning run, failed ones included. Each entry records the verdict and what changed in the plan, stated as rules.

## Consult 1: Codex plan review (gpt-6.1-sol, high, session `01a14a84`), 2026-10-17

- Verdict: **reject**. The first draft held chain 0 to a loopback host at adoption and promotion only. Codex asked for the rule to hold at use and in every L1 source too, so that it covers every stored row.
- Also adopted:
  - Scope `SECURITY.md` to the steps that build chain metadata (`view-executor.ts:344-378` runs utilities without the check), and drop its PXE-input line.
  - Change the `{3,3}` fixture.
  - Run `e2e:agent` with `NULO_E2E_RETRY=0` (the network config defaults to two retries).
  - Add a refused/accepted pair for `probeIdentityOnce`.
  - Put the promotion check before the already-primary return.
- D1: Codex first preferred a stored rollup version for chain 0. D2: docs.

## Consult 2: Opus Plan leg, 2026-10-17

- Verdict: **conditional approve**, agreeing with D1 (no stored rollup version) and D2 (docs).
- Adopted:
  - Committed files state the rule and the change only.
  - Reuse `ENDPOINT_CHAIN_MISMATCH`: a new prefix would turn a non-zero row's "Wrong chain…" line into "Something went wrong.".
  - Add the `{31337, 31337}` answer to the Local-row test. Without it, an implementation that refuses a computed 0 in `addNetwork` alone would pass.
  - Run `backup-edited-local-network.test.ts`.
  - Fix the facts: 11 sink call sites; `utils/index.ts` already re-exports `rpc-url`; account creation and status see the new throw.
  - Correct the receipt-poll line in `SECURITY.md`: eviction rebuilds the same URL (verified, `transaction/service.ts:485-487`).

## Decision after consults 1 and 2

The plan moved to A′: chain 0 is L1 31337 on a loopback node. The rule holds where the id is decided, in the row constructor, at promotion and at use. It was sent back to Codex in the same session.

## Consult 3: Codex resume on A′, 2026-10-17

- Verdict: **conditional approve**. D1: A′, without a stored rollup version. D2: docs, scoped.
- Adopted:
  - The chain-0 L1 rule in `assertCanonicalStoredL1`, behind both L1 getters.
  - The guarantee scoped to the metadata the wallet builds and the accounts it allocates. Imported keys and raw message hashes are outside it (`SECURITY.md:255-261`).
  - Loopback in the row constructor.
  - A sink success case for two rollup versions on 31337.
  - OA-2 recording both consequences, and the development rollup drift as a known limit.

## Consult 4: final fresh Codex pass (session `01a14a98`), 2026-10-17

- Verdict: **reject**, two blockers, both adopted:
  - The reset's L1 is the third source of a new account's L1, so `validateJournal` takes the chain-0 rule too. A refused journal is kept, and nothing is purged.
  - The committed files were reworded to the rule and the change; the consult detail stays outside the repository.
- Also adopted:
  - Historical verification and export re-derive from an account's own stored L1, so the guarantee covers new allocation and the metadata at use.
  - Fixtures `service.test.ts:344-355` (`{1,1}`, `{2,2}`) and the `BOTH` message change with `{3,4}`.
  - The Local success controls use L1 31337.
  - A constructor test with a remote Local URL, and a promotion test where the remote endpoint is already primary.
  - OA-1 no longer claims a real node never reports 0; 0 is reserved by policy.
- Resumed in the same session to verify: **conditional approve**, with two wording fixes (OA-2's scope sentence, a misplaced change-map bullet). Both applied; resumed again: **approve**.
