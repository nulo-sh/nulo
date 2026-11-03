# quality-sdk-1 phase 0: planning consults

## Codex r1 (plan audit, gpt-6.1-sol high, read-only)

Verdict: conditional approve (pin exception values, correct timing assumptions, keep site 18). Eight findings, all verified and accepted:

1. Site 17 already has abort and fulfil pins (`execution-lane.test.ts:893`, `:909`); recon was wrong. Phase 3 only adds a listener check.
2. I2's "at most two microtasks" was false. A probe (Node 24.22.1, Bun 1.4.2) counted the turns from `work` resolving to the caller resuming: today's try/await and await-then-clear sites take 3, `.finally` sites 5 on V8 and 3 on Bun, then-arms 2. A helper closing with `.finally` made ten sites 6 (V8); a bare `Promise.race` with the clear on `work.then` kept sites 1-5 and 11-15 equal and made 6-10 resume earlier (2). Plan switched to the bare race.
3. Converting site 18 delays the catch that frees a capped slot (Codex's reduced reproduction); site 18 stays.
4. Exceptions without exact values let a second drift pass; they now record value or absence.
5. Exception notes must not invent reasons where none is documented.
6. `raceAbort` must subscribe to `promise` even when already aborted.
7. D2 is justified; keep object references and `switchEpoch.current()` sampling points.
8. Add `concurrent-sendtx-approve.test.ts`; repeat the build flags for Firefox.

## Opus r1 (Plan agent, opus)

Verdict: conditional approve. Accepted: exact exception values (same as Codex 4); reasons only where a source exists (same as Codex 5); seven more comments that name moved code (`git grep -n "background\.ts"` sweep each phase); a site 8 pin (deadline past, read rejecting later) before the conversion; `raceAbort` as one `new Promise`; corrected facts (site 1's relative import, D2's renames, the root `lint`'s cycle check on `tests/e2e`, the three latent changes stated); the arc split by risk (arc 1 moves code and adds a test, arc 2 holds the timing change). Rejected: "sites 17 and 18 keep their exact tick counts": the `.then` that maps `raceAbort`'s outcome adds one turn (site 17 accepted with that turn, site 18 kept as is). Not added: `concurrency-rapid-fire` (optional; `concurrent-sendtx-approve` covers the FIFO release).

## Codex final r2 and r3 (resumed session)

r2: conditional approve. The Phase 1 `diff` would exit 1 on the permitted `export` (fixed: normalised before comparing); recon's site 17 cell was stale (fixed). It also probed that a timer cannot fire between `work` settling and `work.then(clear)` running (promise reactions drain before the next timer task). r3: approve, no regression.
