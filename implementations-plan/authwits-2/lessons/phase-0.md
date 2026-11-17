# authwits-2, phase 0: facts, probes, captures, consults

## Sandbox probe (throwaway, kept outside the repo)

- A network spec granted 1, then 3, then 12 public authwits through the playground (proverless), opened Revoke all each time and sampled the popup every 100 ms: first fee figure, Revoke enabled, the stage line, the status line, toasts. Then it confirmed the revoke of 1 and of 12 and read the registry, the rows and the journal.
- Chrome 279.7 s and Firefox 303.9 s per run, both exit 0. Numbers in plan.md § Findings.
- The proven wait cannot be seen on the sandbox: the automine settler proves every block at once, so the revoke's tail ends in about 3 s. The Testnet behaviour rests on the 6.0.0 network constants and the sequencer's sync check, read in the pinned toolchain.

## Captures

- One prototype build with a runtime switch (`window.__aw2opts.option`, `.name`) and a capture hook (`window.__aw2.set`, `failNext`) on the local branch `proto/authwits-2-status`; one network run photographs every frame at 400 px, both themes, through `fixtures/shots.ts`' `shotSend`.
- First run stopped at today's error frame (a 30 s wait on the error text). Second run stopped there too, and its dump showed why: the popup had revoked and closed, because the options commit had moved the forced failure into option B's background path only. Third run, with the failure hook back in the chunk loop: exit 0, 52 frames (23 status states and 3 names, light and dark), 26 captions.

## Consults

- Codex plan round (gpt-6.1-sol, high, read-only), one session: conditional approve (six findings, all checked against the cited 6.0.0 sources and accepted), then conditional approve (three leftovers), then approve. Details in plan.md § Audit verdicts.
- What the round changed most: the revoke popup's hide does not toast a failure, it toasts a false success (the summary reads the emptied chunk list); and the checkpointed tip is not as durable as the first draft said (an L1 reorg or an invalidated checkpoint also undoes it).
