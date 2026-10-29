# Phase 0: recon and planning consults

## 2026-10-29 · Recon

- Three Explore agents (sonnet): L1-L11 with L31-L33; L12-L30; the archived plans' candidates. Findings in [recon.md](../recon.md).
- Reproduced by hand: Bun 1.4.2 `--parallel` (failing leg `Exited with code 3`, the other `Signaled: SIGINT`, script exit 3); zsh 5.9's `set -e`, pipe status and word splitting; `schemas.Fr.safeParse("")` and `("abc")` throwing on `@aztec-labs/stdlib` 6.0.0.
- Read at 6.0.0: `stdlib` `l2_block_stream.js:178-183` (a failed run logs and returns); `pxe` `contract_class_service.js:32` (a call reads the node's current class); `aztec-runtime/src/utils/fetch.ts` (the wallet's own retry policy, `NoRetryError` on 4xx).
- Found while tracing: two earlier tightenings dropped evidence links (L11's owner-feedback-1 source; L21's class sources), so the pass restores them.
- Path filters: an edit under `apps/extension/**` trips four e2e lanes, which rules out the e2e README as a home for a routed sentence.

## 2026-10-29 · Codex round 1 (fresh, gpt-6.1-sol, high, read-only)

- Verdict `conditional approve`, five findings, each checked against the tree: L8's homes are e2e and Aztec skills while `pr-quick.yml:240,248` builds `head.sha` too (kept, shortened); L5's exactness clause is its own safeguard (`archive/harden-dedupe/plan.md:37`; kept, and recon's attribution to connect-window corrected); T11 read as stack-only though the index and decision-id collisions bit unstacked arcs (split); D3 ignored portable rule 8's "dates" (months added); L2 and L13 overbroad (`vitest.config.ts:43-48`, `PopupManager.vue:97`; reworded).
- Fact it corrected: dApp sends wait on the send sequencer too (`dapp-send-executor.ts:355-358`), so L28's retirement rests on stronger ground than recon said.

## 2026-10-29 · Opus Plan leg

- Verdict `conditional approve`, seven findings. Accepted: T6 to the e2e README's `passkey` row (fleet agents read only it and their charter, `archive/passkey-chaos-1/CHARTERS.md:3,15`); T19 widened to all the policy never logs (`logger/utils.ts:183-188` keeps 200 characters); L12 keeps its consequence; L2 names the excluded node-only tests; `check-no-local-paths.sh` replaces the grep (it covers `/mnt/<volume>/<user>`); the Firefox stamp names 153.0.4. Rejected: L8 into README step 3, which reaches only plan-driven sessions.
- The two legs disagreed on T6's home (Codex: the skill is fine). The README row wins on who reads it; the PR then runs the e2e lanes.
- Draft after folding: 7574 B, 31 entries.

## 2026-10-29 · Codex round 2 (resumed)

- Verdict `conditional approve`, three local conditions, all applied: T6 said a late fault "meets nothing", but a later press can spend it (`helpers/chaos-session/faults.ts:1-7`), so it now says a fault armed after a press cannot test that press, and to check the order in `actions.jsonl`; L3 stamped after a probe on vue-tsc 3.3.10 (a wrong prop from a JS `<script setup>` passes, from `lang="ts"` fails TS2322; the probe files were removed); recon's stale home for T6 and its `viaPxe` wording corrected.
- It judged the README row the better home for T6, and 7574 B defensible: no further line meets D1.

## 2026-10-29 · Codex round 3 (resumed, verify)

- Verdict `approve`: the three conditions met, no regression, the 7 KiB departure justified. The plan is approved by the panel; auto-continue runs arc 1.
