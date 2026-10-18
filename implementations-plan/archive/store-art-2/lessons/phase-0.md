# Phase 0: planning consults

## Recon

Two Sonnet explorers (spec validity at HEAD; screen changes since the last capture). The first missed `apps/extension/tests/e2e/README.md:104-116`, the one written procedure; found by hand.

## Audit round 1, Codex

`run-codex.sh … high read-only gpt-6.1-sol`, session `01a15077-921f-72f1-8c5d-215d64664aee`. Verdict: conditional approve, seven findings, all accepted (plan § Audit verdicts). Checked by hand: the locked Puppeteer is 25.8.0 (`bun.lock`), and Bun reads `bunfig.toml` (with `auto = "disable"`) from its working directory only, so a run from `apps/extension` needs `--no-install`. A waiter that used `pgrep -f` on the script's path matched its own shell and never ended (the lessons.md `pgrep` entry); poll the output file instead.

## Audit round 1, Opus Plan leg

`Agent`, `model: opus`, `subagent_type: Plan`. Verdict: conditional approve, 16 findings, 15 accepted (plan § Audit verdicts). Checked by hand: `PublishStrip` sits inside `send-footer` (`apps/extension/src/popup/pages/send.vue:851-852`); the captions span `store-art.ts:18-44`; #743's body records OA-16 (an imported profile shows no Get started card); `git tag --contains eb5dc145` lists only nightlies; the title is 71 characters. Rejected #5's both-browser runs of a fixture's importers: D4 keeps shared fixtures out of the lane.

## Audit round 2, Codex (resume)

Same session. Verdict: approve, no new material finding; agrees with D2's flip.
