# Phase 0: planning consults and proofs

## Proof on the current parser (2026-10-15, base 116974dc)

A scratch script signed `{format, sequence: 1792100000, issuedAt, tokens: [1 entry], flagged: [{chainId: 7, address}]}` with a fresh Ed25519 key and ran the base `readTokenList` over it with that key pinned. Output: `{"sequence":1792100000,"entries":1,"keys":["keyId","sequence","issuedAt","entries"]}`, exit 0. Today's wallet verifies the list, parses it in wallet mode and drops `flagged`.

## Panel round 1 (2026-10-15)

- **Codex** (`gpt-6.1-sol`, high, read-only, fresh session): **conditional approve**. Six findings; dispositions in `plan.md` § Audit verdicts. Finding 2 verified by trace: `infra/token-list/test/publish.test.ts`'s resolver appends `.ts` to every relative specifier, so `./floor.json` would resolve to `floor.json.ts` and fail. Finding 4 rejected with a trace: `publish-token-list.yml`'s `concurrency: publish-token-list` (no cancel) serializes runs, so no second run signs while one awaits approval, and a stale publish PR conflicts with `dev` on `public/v1/list.json`.
- **Opus 5.5 Plan lens** (parallel, same packet): **conditional approve**, ten findings, all accepted or noted; it reversed D5 over Codex (the snapshot waits for the warning PR) and moved `raisesFloor` into `infra/token-list/scripts`.
- **Planner change after round 1:** `list.source.json` stays untouched, because any edit to it triggers `publish-token-list.yml` on merge (its `push` path filter) and asks the owner for a no-op approval.

## Panel round 2 (2026-10-15)

- **Codex** (same session, resumed): **approve**, "No new material findings. Confidence: high." Finding 4 withdrawn on the concurrency and conflict trace.
