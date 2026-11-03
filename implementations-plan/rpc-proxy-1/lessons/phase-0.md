# rpc-proxy-1 phase 0: planning consults

## Plan audit round 1, Codex (gpt-6.1-sol, high), session 01a1a1f6

Verdict: conditional approve. Findings and dispositions:
1. `failed-send-check` is `@requires-proverless` (`agent.sh` refuses it unflagged) and `grep -c` exits 1 at a zero count: accepted; the gate uses `tx-sendTx-default` and reads the printed count.
2. "The next unlock retries" is false: a later unlock in the same worker announces nothing (`seal-on-unlock.ts:6-9`): accepted; the retry is the next worker start.
3. A 503 kill switch is retried by the client: accepted as documented behaviour (the switch reaches no upstream, so a retry costs nothing); the outcome line now says only malformed requests are refused without retry.
4. Fact 1 counts UTF-16 units, not bytes: accepted as a wording fix; the cap is the proxy's budget for the ASCII bodies the wallet sends.
5. OS-6 cannot show provider-visible headers: accepted; OS-6 first points a secret at a header-echo endpoint and reads what arrives.
6. A scripted caller can spend the shared quota up to the CU cap: accepted as a known limit (filed at close-out); OS-4 must precede the secrets.
7. D5's merge removes a Settings row: accepted; the rewrite now skips an endpoint whose network already holds the replacement (no row removed, no duplicate), a known limit.
8. OA-1 misses § 2's "I do not operate a backend for the wallet": accepted; OA-1 now names it.
Also: OS-6 checks that an upstream error body echoes no part of the key.

## Plan audit round 1, Opus 5.5 (Plan leg)

Verdict: conditional approve (it read the plan before round 1's Codex fixes landed; finding 1 was that gap). Accepted: the production digest checked against the committed v0.31.0 recording as a boolean; the four factory parameters required (D17) instead of a wiring test; `BATCH_CAPS` keyed by literal origin, since a lookup derived from the current seeds drops the cap from rows seeded on a host a later seed leaves; the Worker's stdlib pin tied to `apps/extension`'s and the aztec-update sweep glob widened; OS-1 (other Workers' build tokens), OS-3 (new per-network keys), OS-4 as Inference I5, OS-10 (narrow the shipped key now); Fact 3 restated (the reset compares a primary with the seed URL); transaction and journal rows keep the old URL (known limit); a distinct limiter namespace; `Origin: null`; the 1 MiB timing test dropped (no assertion, no Workers meaning); `test:ci-gating` in Phase 2; the rewrite's own `runSealing` message; I6 (parallel batches of 3 on the free plan).
Rejected: a service test of the reset-then-rewrite sequence (both halves are covered; the reset's added keyless endpoint falls into D5's known limit).
Considered and rejected by the driver: moving `BATCH_CAPS` into `aztec-runtime`'s adapter, which would remove the injection; both reviewers placed provider data at the extension boundary, as Presto's host is.

## Final pass 1, Codex (gpt-6.1-sol, high, fresh), session 01a1a20c

Verdict: conditional approve. Accepted, all verified in the tree: `tests/e2e/egress-guard.test.ts:265` hardcodes the retired host in the Chrome close's expected message (now derived from `LIVE_NODE_HOST`); `global-setup-smoke.ts` refuses a tree without the armed build, and `e2e:agent` overwrites `dist/<browser>` (the gate now orders network runs, then the armed build and smoke per browser); `runtime.ts:307-317`'s heartbeat keeps the worker alive, so a skipped rewrite waits for a background restart, not an idle stop (known limit; a guaranteed retry would be a recovery policy); a malformed UTF-8 refusal case; the Outcome qualifies D5's exceptions. It verified D2/D3/D17, D4 (the recording matches the digest), D5, the 503, D13, OA-1, and I2 (Cloudflare documents multilevel certificates for Custom Domains).

Final pass 2 (resumed): **approve**; the four conditions verified, no regression.
