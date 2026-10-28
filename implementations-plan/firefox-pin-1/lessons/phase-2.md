# Phase 2: the pin on 158

- Pin `stable_158.0`; `install-firefox.ts` installed it. The driver test plants `stable_999.0` beside the pin in place of Puppeteer's own revision, now equal to it; its `puppeteer` import became type-only (Biome `useImportType`).
- Green on 158 at retry 0: the Phase 1 five-file list 21/21 (231 s, 20 launches `[firefox] 158.0`), presto-host-permission + toolbar-panel 6/6 (130 s, 6 launches). The contract test passing there is I1's and I3's proof.
- Static gates at `4901ab3a4`: lint, typecheck:all, test (947 files, 16166 tests), test:all (every workspace green, 177 s), test:ci-gating (691 pass), check:plans (0 findings).
- Full smoke pass 1 started at `4901ab3a4` (shard 1/6: 50 passed, 4 skipped, 435 s, 30 launches `[firefox] 158.0`), then stopped to fold the code review; the three passes rerun at the final head.

## Fix loop round 1

- Codex `approve` with one low (a doc comment split from `PxeHostState`); Opus `conditional approve` with that and three more (plan.md § Audit verdicts).
- Firefox's `nsIReplacedHttpResponse.responseBody` is a byte string; assigning JSON text truncated each UTF-16 unit, so `✓` became a control byte. Red first: the contract test with `note: "präsent ✓"` in the second page's body failed `JSON.parse: bad control character` on 158; encoded as UTF-8 it passed on 158 and Chrome.
- An override set outside BiDi skips `prepareResponseStart` (`NetworkRequest.sys.mjs:346-355`), so Puppeteer never sees `responseCompleted` for an answered request; no spec waits on network idle. Recorded in FIREFOX.md.
- The Firefox stderr line `InternalError: unsafe filename: data:application/javascript…` (the page-error relay's frame script) prints on every green launch too; it is not a failure.
