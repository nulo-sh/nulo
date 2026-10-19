# Recon: egress-flake-1

One Explore agent (sonnet), read-only, on `origin/dev` at 691e69eb, plus the planner's own reads and the probe ([lessons/phase-0.md](lessons/phase-0.md)).

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Decide whether a CDP error means "gone" | `failUnlessGone`, `apps/extension/tests/e2e/fixtures/browser/chrome-rpc-intercept.ts:60-63`, the only classifier for the interception's arm, resume and reply | adapt (one regex alternative, one comment clause) |
| A unit seam for `cdpInterceptRpc` | `apps/extension/scripts/e2e/chrome-rpc-intercept.test.ts`: a fake root and child session, `@vitest-environment node`, run by `bun run test` (`apps/extension/vitest.config.ts` includes `scripts/**/*.test.ts`) | adapt (the fake's child delivers a pause and rejects its reply) |
| Puppeteer's CDP error type | `ProtocolError` from `puppeteer` 25.8.0, the class the CI log names | reuse-as-is |
| Other "target gone" classifiers | `fixtures/dom.ts:112`, `:315` (`isTargetGone`), `fixtures/popups.ts:81`, `:115`, `firefoxDriver.targetGone`: page and frame errors, none about `Fetch` | none fits: they classify page navigation, not a paused request; searched `Invalid InterceptionId`, `No target`, `target closed` under `tests/` |
| The Firefox counterpart | `observeAndIntercept`, `fixtures/browser/firefox-rpc-intercept.ts`: decides inside `http-on-modify-request`, no pause | unchanged (the probe shows nothing to classify) |
| Where a flake root-cause is recorded | `.claude/skills/e2e-testing/SKILL.md` § 5 Flake ledger (rows 1-56 on `dev`) | reuse (one row) |

## Callers and the guard

- `cdpInterceptRpc` is called by `chromeDriver.interceptRpc` (`fixtures/browser/chrome.ts:254-255`); `standingInterceptions` wraps it for the launch's stand-in and a spec's own (`standing-interception.ts:89-145`).
- The egress guard reads the stand-in's `failures()`, which carry a spec's interception's drained failures, and throws `egress guard: <file>: the stand-in node's interception reported: …` (`fixtures/egress-guard.ts:364-385`).
- About 16 specs assert a spec interception's `failures()` is empty (`restore-outcome`, `import-dead-rpc`, `send-fee-privacy`, …); `rows.test.ts` relies on the guard alone.

## Collisions

- test-infra-1 arc 4 (test helpers, held behind #743) touches no browser fixture; if it lands first, merge `origin/dev`.
- **A1, the ledger row number.** `dev` ends at row 56; #743 (open) appends 57, and e2e-flakes-2's plan reserves 58 and 59 after it. Working assumption: at close-out, after merging `origin/dev`, take the next number above every row on `dev` and every row those two reserve (60 if nothing else lands), and name it in the PR body so the orchestrator can renumber at merge.
- Closed known limits in this area: #846 (the held count cannot order a node request against an arm), #837 (detaching a page's session clears WebAuthn authenticators). Neither covers a reply to a cancelled request.
