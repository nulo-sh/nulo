# Owner asks: firefox-pin-1

1. **Approve D7, a plan amendment for a fourth Firefox 158 difference** (plan.md § Decision ledger). The full Firefox smoke on 158 failed one test of 290, `import-errors-scroll.test.ts:230`, every run (3 of 3; 153.0.4 and Chrome pass). Firefox 158 keeps a scroller's fractional end (content 398.8 px in a 297 px view ends at 101.8), where 153 and Chrome snap it to 102; the test's end, `scrollHeight - clientHeight`, is built from whole pixels, so it reads 102 while the open has landed at the true end. The product is right. The plan stops the arc on a fourth difference, so the fix waits for this approval. Recommendation (Codex agrees): approve; test file only, no product file, no UI change, no tolerance. **Answered 2026-10-28 by the orchestrator: approved as proposed.**

No screen, copy or behaviour a person would notice changes, and no product file is touched.
