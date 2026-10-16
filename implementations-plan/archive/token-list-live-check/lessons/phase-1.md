# Phase 1: the live check

## Implementation (2026-10-16)

- Live probe before coding confirmed every wire shape in `recon.md`: `aztec_getContract(address, block)` takes the block as a number, `null` for no instance; storage slot 3 of USDC reads `0x0055534443…`.
- Bun's `AbortSignal.timeout` does not keep the process alive (probed: a 240 s timer, exit after 9 ms), so the 4 min deadline cannot stretch a finished run.
- Mutation checks, each red as expected: no `redirect: "error"`, no `nodeVersion` shape check, no transport stop, no NUL strip, no class compare, no block passed.
- First `typecheck:all` red: `const fetch = … as typeof fetch` refers to itself (TS7022); renamed the fake.

## Review loop (2026-10-16)

- Round 1, Codex (gpt-6.1-sol, high, session `01a144cc-5c8d-7451-baf6-75a809ea8e64`): conditional approve, three demonstrated Lows (empty source passed; "`sign` never waits" was false; the deadline test threw its own abort). All fixed in `d64b0502`, each fix proven by a mutation that reds its test. Opus diff review beside it: the same three, plus a u32 test gap and two nits, fixed in `6fcec4f5`; its invalid-UTF-8 note joined K2.
- Round 2, resumed: approve, no new finding.
- The first two prompts paraphrased the README's two review rules and adversarial ask instead of quoting them; round 3 quotes them verbatim over the whole arc diff.
- Round 3, resumed with the rules verbatim: approve, three comment nits applied (`6fc93556`). Converged.
- Close-out: K1 filed as #562, K2 as #563, both closed as not planned.
