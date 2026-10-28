# Phase 0: planning consults

## Consult 1: Codex audit (gpt-6.1-sol, high), session 01a17f0d

Verdict: reject. Blocking: D5 changes when the activation settles (a core failure would publish before a lock's supersede could turn it into `false`); D7 misses that `exportPlain` flattens every throw (`profile/service.ts:2126`) and that `PasskeyUnconfirmedError` wraps every confirmation failure; D2's demotion covers every PXE op. Also: a wrong citation (`session-manager.ts:359` is a persistence failure; the open emit is `:336`), and the #1216 diagnostic must not change rejected messages. Each verified against the tree; all accepted (plan.md § Audit verdicts).

## Consult 2: Opus Plan critique (opus)

Verdict: conditional approve. Same blockers as Codex on D5, `exportPlain` and `PasskeyUnconfirmedError`; new: the arc 2 e2e gate was too weak for a 5% flake and missed the armed build's env; the generation fence logs a delete's refusal at error; the gas reader logs a bare error. A scratch Bun run of three `runActivation` variants confirmed the D5 ordering finding (original: `false` with one unhandled rejection; `Promise.all`: throws before the supersede; revised: `false`, none).

## Consult 3: Codex verification (resumed session 01a17f0d)

Verdict: approve. No remaining material defect; the revisions keep settlement order, keep export types, leave unknown confirmation failures at error, scope the PXE demotion to one op, and leave rejected values unchanged in the diagnostic.
