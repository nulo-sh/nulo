# Phase 0: recon and consults

## 2026-10-28 · Recon

- Two Explore agents (sonnet): a reuse sweep over the file pick, the health answer, the manifest compare and the pin surface; a sweep of every call Firefox 158 refuses on an extension page. Findings in [recon.md](../recon.md).
- The 158.0 and 153.0.4 builds were already in the shared Puppeteer cache. `unzip` reads their `omni.ja` with warnings about extra leading bytes and still extracts every member.
- Read from 158's sources: classic commands check privilege only without system access (`marionette/driver.sys.mjs:1438-1448`); Element Send Keys and BiDi `setFiles` share the upload body and the `Event.sys.mjs` events; `setResponseOverride` is BiDi's own answer path; a picker is dismissed only on an explicit `unhandledPromptBehavior` (`Session.sys.mjs:478-490`); the schema's new optional `sandbox` CSP key.

## 2026-10-28 · Red at the base on 158 (retry 0)

- `5ef0c119d`, armed Firefox build, `FIREFOX_PATH` at the cached 158.0 binary (no file changed), `NULO_E2E_RETRY=0`: `onboarding-tab`, `settings-proving`, `security`, `account-import-export`, `presto-host-permission`. Every launch printed `[firefox] 158.0`.
- 5 files failed, 10 tests failed and 11 passed, 261 s. Signatures: `Protocol error (input.setFiles): … does not support browsing contexts in privileged scope` (the four `account-import-export` tests); `Protocol error (network.addIntercept): …` at `root/network.sys.mjs:714` (the harness self-test, the three `settings-proving` tests, `presto-host-permission`); `expected { …(2) } to deeply equal { Object (extension_pages) }` (`security`).
- So the red half of the red/green proof needs no second worktree: the base code on the 158 binary is it.

## 2026-10-28 · Codex r1 (gpt-6.1-sol, high, fresh session)

- Verdict `conditional approve`, six findings: an answerer fault turned into a cancel can still pass the "offline" case (high); the self-test proves delivery, not the page filter or the counts (medium); the `null` drop is broader than the evidence (low); the observer's ownership is unstated (medium); the network gate ran with retries (medium, `vitest.e2e.network.config.ts:31`); F1, F3 and F6 overstated (low).
- Verified before acting: `e2eRetry(2)` is the network config's default; BiDi `setFiles` fires `cancel` for an unchanged selection and classic upload appends on `multiple` (`windowglobal/input.sys.mjs:80-99`, `interaction.sys.mjs:566-575`); `files.ts` also reads the content and keeps `lastModified` on decompression; `#shouldDismissFileDialog` keys on the effective `file` handler.

## 2026-10-28 · Opus Plan leg

- Verdict `conditional approve`, eight findings: a missing arm would read as `hits` 0 and pass the zero checks; the fault guard must not wrap the match; #1222 is covered for one merge order only, and a capability swap needs its own gate (geckodriver's capability check, `this.bidi` at `Session.sys.mjs:479-481`); flows after a file pick never ran on 158; the zero-delta case cannot fail alone; F1, F3, F4 and the isolation bullet overclaimed; no `stop()`; Outcome (2), `MIN_MAJOR`'s comment, the Phase 1 env.
- Verified: DevTools filters a tab's requests by `(loadInfo.browsingContext ?? loadInfo.associatedBrowsingContext).browserId` (158 `NetworkUtils.sys.mjs:562-575`), so I1 now reads the channel the same way; `replaced-http-response` and `NavigableManager.getBrowserById` exist on 153 too.
- Taken: all eight (plan.md § Audit verdicts).

## 2026-10-28 · Codex final (resumed)

- Verdict `approve`, no new material finding. I1 and I3 remain runtime inferences that Phase 1's contract test decides.
