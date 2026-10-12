# Phase 3: the declared live spec

`shipped-token-list.test.ts`, as § #317 specifies, with one deviation (D11): the `node_getNodeInfo` probe runs from an extension scratch page, not from the background. Routing is per browser, not per context, so the page proves the same direct route, and an awaited page evaluation returns the JSON-RPC body on both browsers without the storage relay Firefox's background evaluation needs (`backgroundFetch` in the control spec returns only a status).

## Step 2: repeated runs (2026-10-12)

Each on a fresh copy of the release-shaped build at 2cef116, `NULO_E2E_ARTIFACT_RUN=1 … test:e2e -- tests/e2e/shipped-token-list.test.ts --retry=0`:

- Chrome ×5: all exit 0, 1 passed; the test took 10.5-14.4 s (the four seeds landed against the live node well inside the 150 s budget).
- Firefox ×2: both exit 0, 1 passed; 11.2-15.3 s.
- Armed run per browser (the armed build, `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`, no artifact flag): Chrome and Firefox each `1 skipped`, exit 0.

## Step 3: the route proven both ways

One local, uncommitted removal at a time, one run each, the code restored after:

| Removed | Browser | Red at | Message |
|---|---|---|---|
| the live host's `--proxy-bypass-list` entry | Chrome | the probe and the close | `the live Testnet node did not answer: rejected: TypeError: Failed to fetch`; close: `egress guard: shipped-token-list.test.ts: chrome sent lb.drpc.live to the guard: this launch's direct route to it did not hold` |
| the live host's `EXCLUDE` resolver rule | Chrome | the probe | `the live Testnet node did not answer: rejected: TypeError: Failed to fetch` (bypassed, but `MAP * ~NOTFOUND` resolves nothing; the guard saw nothing, so the close passed) |
| the PAC's `DIRECT` line | Firefox | the probe and the close | `rejected: TypeError: NetworkError when attempting to fetch resource.`; close: `firefox sent lb.drpc.live to the guard` |

Gate: lint and typecheck (the extension's `typecheck`, its e2e tsconfig included) exit 0; every artifact run green on its first attempt; both armed runs skipped it; each removal red: **pass**.
