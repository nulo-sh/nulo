# Arc 3 — implementation log

## Phase 3.1 (#105)

- 2026-10-12 — OA-1 = A (P8-03, signed 2026-10-12). Built on `tokens-and-balances-mint-pin` from origin/dev
  `8d01f9b` (arc 1 merged as #271), a standalone PR against `dev` (D-orch-5).
- `parseTokenInterface` sets `classId` from the instance it fetched; `buildToken` copies it to the row;
  `TokenSchema` names it, or the read codec and restore would strip it (zod drops keys a schema does not name);
  `getTokenInfo` projects it. The builder records the resolved instance's class on the `call` and `encoded_call`
  `TxCall`s; `txAmount` reads a mint only when the token's and the call's classes are the same field element.
- Base-copy runs: the four refused-class cases in `tx-amount.test.ts` (no class on the call, none on the token,
  a different class, the same malformed class on both sides) are red against 8d01f9b's `tx-amount.ts`, the 14
  controls green. Against 8d01f9b's `token/spec.ts`, `token/utils.ts`, `token/service.ts` and
  `tx-request-builder.ts`: the stored-class test, the seeded-class test and the three builder pins are red
  (5 failed, 81 passed).
- Two component fixtures (`TransactionCard.test.ts`, `pages/tx/[id].test.ts`) needed a matching class on the
  listed token and the mint call to keep their figure; their expectations are unchanged.
- Gotcha: a default parameter replaces an explicit `undefined`, so `mint(args, method, contract, undefined)`
  recorded the default class; the no-class case spreads `classId: undefined` over the built call instead.

## Review round 1

- 2026-10-12 — Codex r1 (gpt-6.1-sol, high; the managed `CODEX_ACCOUNT=best` routed it to the alejo-icloud
  login): approve with fixes, 2 Medium, 2 Low, 1 Nit. Opus r1: reject as built on one High.
- The High held and Codex missed it: `pxe/service.ts` `getContractInstance` returns the PXE's preimage hydrated
  with `currentContractClassId := originalContractClassId` (`effective-class.ts`), and the add registers the
  token, so the builder recorded the original class at every build and the comparison could never differ.
  Architecture § Arc 3 had named `resolveInstances` as the source. Fixed by D-arc3-5: a public call's class
  comes from `node.getContract`; a private call keeps the PXE's, because the kernel prover reads the class
  registry for every private contract (`getUpdatedClassIdHints`) and refuses a changed class.
- Lesson: in this wallet an instance from the PXE never shows an upgrade; only a node read does.
- Accepted: canonical field-element fixtures in the producer tests; the `TokenInfo.classId` doc. Rejected with
  reasons (plan § Audit verdicts): transfers on a forged mint record, `.catch` for a non-string class,
  pre-existing debug lines carrying class ids. Left out: exact-string contract matching (pre-existing; an issue).
