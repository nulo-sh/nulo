# Post-implementation: Codex fix loop

## Round 1 (2026-10-11)

- Codex gpt-6.1-sol, high, read-only, session 01a1294d-99ff-7a42-85bf-fccd8b6c43d1, on head 309b60a: approve with changes; three low findings (a release control that missed its race, one long doc comment, two narrating test comments). It ran 226 tests and compared the Send, Clear, retry-debt and scan regressions against the base in memory.
- Opus general-purpose review in parallel: approve with changes; it confirmed the three, added the scan's `_logger` blind spot and a Send add/delete race (rejected, reason in plan § Audit verdicts).
- Proof for the control fix: a mutant that reads the retry subscribers at the trigger instead of at settle fails both in-flight cases; the fix passes them.
- Proof for the scan fix: the self-test fails on the old `\blogger` pattern (`_` is a word character, so `\b` never precedes `logger` in `_logger`).
- After the fixes: stores, JsonViewer and fee-card co-mount 193/193; extension-messaging offscreen 54/54; lint 0 errors.

## Round 2 (2026-10-11)

- First attempt: `resume-codex.sh` given an empty codex-dir has no model record, so it fell back to its default model (`gpt-6-astra`), not the session's `gpt-6.1-sol`. Its verdict (approve) is not counted. Pass the round-1 codex-dir, or name the model as the fifth argument.
- Rerun on `gpt-6.1-sol`, same session, on `309b60a..56ed621`: approve, no new material finding; 93 focused tests passed. It accepted the Send add/delete race rejection as a defensible scope exclusion.
- Loop converged after one fix round.

## After delivery: CodeQL on the pull request (2026-10-11)

- Every required check on #296 passed. The advisory `CodeQL` check failed with one high alert, "Useless regular-expression character escape", on the source scan's self-test fixture `` `logger.log(\`fpc-\${id}\`, …)` ``. Inside a template literal `\$` keeps `${` literal, so the escape is needed and the alert is a false positive in principle. The resolver refuses every source that is not a double-quoted literal through one branch, so the fixture now pins that refusal with a template literal and a concatenation and no escape. The alert is cleared by the change, not dismissed.
