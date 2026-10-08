# Owner asks: supply-chain-release

## #22: how to stop web pages detecting the install through the content-script chunks

**Surface.** No screen changes under any option. What changes is what a web page can learn: today, on Chrome, any page can fetch the content script's chunks at `chrome-extension://<store id>/assets/<chunk>.js` and so tell that Nulo is installed (measured: `200` from a page at `https://dapp.example/`). Firefox is not exposed, since its extension origin is random per install.

**What was tried (Phase 5).**
1. *Drop the web-accessible entry.* Not possible as built: the content chunk imports `handlers-*.js`, which imports `crypto-*.js` (wallet-sdk code the background shares), and crxjs's loader `import()`s the chunk, so all three must be web-accessible.
2. *`use_dynamic_url: true` on the entry* (a post `renderCrxManifest` hook). Chrome 152 returns the dynamic URL from `chrome.runtime.getURL`, and a page's fetch at the fixed URL is then refused. But the content script stops working: the chunk's relative import resolves against the **fixed** origin, which `use_dynamic_url` refuses (`Denying load of chrome-extension://<id>/assets/handlers-*.js`), so wallet discovery never reaches the extension (`cold-wake-discovery` red on all three attempts). Reverted; nothing of it ships.

**Options.**

| Option | What it takes | Effect |
|---|---|---|
| A. A self-contained content script | Build `src/content-script/content.ts` as one classic file in its own Vite pass (as the worker builds are), with the third-party-notices plugin registered on that pass, and list it in the manifest directly. No loader, no `import()`, no web-accessible entry. A plan of its own: crxjs integration, the notices registration, the smoke and network proofs on both browsers. | Closes #22 on Chrome and removes the entry on Firefox too. No policy change. |
| B. crxjs `contentScripts.standaloneFiles` | crxjs emits the IIFE as an asset from a plugin-less sub-build, which the notices generator refuses as unclaimed code. Shipping it means a `VENDORED` claim or a policy exception for that asset. | Same effect as A, but it loosens the notices gate (CLAUDE.md treats that as weakening a quality gate). |
| C. Accept and document | SECURITY.md § Content script injection now states the exposure and why `use_dynamic_url` cannot close it. #22 stays open. | Pages on Chrome can keep detecting the install. |

**Recommendation: A**, as its own plan. It is the only option that closes the exposure without loosening a gate; it is not a quick change, which is why this arc does not attempt it.
