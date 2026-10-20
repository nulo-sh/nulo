# Phase 0: diagnosis and planning consults

Scratch specs live outside the repo (the lane's cache directory), copied into `apps/extension/tests/e2e/` only for a run and deleted after. Armed Firefox build at f73ce69d6. Host load about 210. Every run was at retry 0.

## Run 1: about:addons toggles vs the row (headless Firefox 153.0.4)

- **Spec**:
  - Run `registeredExtensionPerTest`.
  - Open about:addons through `BrowserAddonUI.openAddonsMgr` (privileged `chromeScript`) and list every permission row.
  - Click the `moz-toggle` whose `permission-key` matches each `127.0.0.1` pattern, as the owner did.
  - Read `getAll()` and `contains` from a scratch page.
  - Open the real toolbar panel (`openActionPopup`) and read the page through a frame script.
- **Install**: `getAll().origins` held `https://passkey.nulo.sh/*`, `https://127.0.0.1/*`, `http://127.0.0.1/*` and `*://*/*`. about:addons listed four origin toggles: "Access your data for all websites" (`*://*/*`, attribute `permission-all-sites`), https://127.0.0.1, http://127.0.0.1 and https://passkey.nulo.sh.
- **Both 127.0.0.1 toggles off**: `getAll` held the passkey origin and `*://*/*`. `contains` answered true for each loopback pattern and for the pair.
- Defect in run 1: the panel's navigation set `content.location.hash` through an X-ray wrapper, which did not route. Fixed in run 2 by clicking `nav-settings`, then `setting-nav-proving`.

## Run 2: the same, with the panel on Settings › Proving

- **Both 127.0.0.1 toggles off**:
  - The panel read `isFirefox: true` and was one `popup` view.
  - `host_permissions` held both loopback entries.
  - In the panel, `contains` answered true for each pattern and the pair.
  - **Row false, card `idle`.** The card was idle because no `prestoReached` flag was set, so no probe ran.
- **"All websites" off too**: `getAll` held the passkey origin alone, and `contains` answered false. **The row showed in the open panel** (through `onRemoved`). A direct `fetch` of `https://127.0.0.1:59834/health` from the panel left with `Origin: moz-extension://…` (seen by an `http-on-modify-request` observer).
- **Both 127.0.0.1 toggles on again**: `contains` was true and the row went. The check ran, and its probes (HTTPS ×2, then the HTTP diagnostic) carried no `Origin`. The card read `offline`, because nothing listens on the Presto ports here.
- **Conclusion**: the row follows the grant. The owner's two toggles do not move the grant while "all websites" is on.

## Run 3: Allow under the real doorhanger (prompts on)

- **Attempt 1**: `windowUtils.sendMouseEvent` does not exist in 153.0.4.
- **Attempt 2**: no `synthesizeMouseEvent` either, only `sendNativeMouseEvent`.
- **Attempt 3**: `windowUtils.setHandlingUserInput(true)` around `click()`. This is the handle Firefox's own extension tests use.
  - The `addon-webext-permissions-notification` doorhanger opened. **The toolbar panel stayed `open`** at about 0.3, 1.3 and 3.8 s after the click (the waits add up).
  - A privileged click on the notification's main button closed the doorhanger. The panel was still open. `contains` turned true, the row went and the card came back.
  - Focus stayed on the panel's `body`, because a script click never focused Allow.
  - **Not shown**: macOS, a real OS click, and focus after a real click (OA-1).

## Before numbers

`presto-host-permission.test.ts` on Firefox, base f73ce69d6, retry 0: green. The test took 15.8 s, and the file 36.1 s (import 16.8 s). Chrome skips the file.

## Consults

(appended per round)

### Consult 1: Codex plan audit (gpt-6.1-sol, high, read-only; session `01a15a1b-b313-7052-aa72-31b73c7dce8a`)

- **Verdict**: CHANGES (findings 1, 2 and 4). The diagnosis holds with high confidence. Codex says the test-and-doc arc is the right size, the about:addons driving and the `Origin` assertion are right to leave out, and no src or unit change is needed.
- **Accepted**:
  - (1) F3 overstated: `idle` also follows a failed first read (`unknown`). Reworded as a temporal settle. The `contains` assertion and the `*://*/*` success control carry the proof.
  - (2) OA-1's warning was too broad: loopback pages still get the content script once Allow re-grants loopback. Reworded.
  - (4) OA-1 did not tell "panel closed" apart from "grant lost". Added steps: write down focus as the prompt closes; if the panel closed, reopen Settings › Proving without Allow.
- **Minor, accepted**:
  - The install cell is marked unmeasured.
  - F6 splits the test time from the file time.
  - The doorhanger times are cumulative (about 0.3, 1.3 and 3.8 s).
  - I2 is marked plausible.
  - (b) is stated as the pre-approval diagnostic benefit the owner already chose.
  - Least privilege now names the permission coupling.
  - The prior plan's three-pattern rule is acknowledged.
  - Option (B) becomes a closed `known-limit` issue.
  - An OA-1 failure goes on #572 with a linked successor before it closes.

### Consult 2: Opus 5.5 plan critique (Plan agent, read-only)

- **Verdict**: CHANGES. All seven blocking items were text fixes; the e2e design stood. All seven accepted:
  - S1: the grant changes the request mode, never whether a request leaves.
  - A1: F3 names all three `onFirstAllowed` paths, and the `*://*/*` step is what rules out `unknown` and empty origins.
  - A2: (b) holds only until Presto approves Nulo.
  - D1: on (B), the PR uses `Refs #572`, and #572 is closed as a `known-limit`.
  - D2: the title was 94 characters; now 90.
  - D3: each browser's CI suite envelope, before and after.
  - O1: OA-1 puts the warning first, unlocks first, and ends by re-enabling all-sites and reloading dApp tabs.
- **Also accepted**:
  - #889's diff leaves the composable and `isFirefox()` alone, so (a) also holds for the owner's build.
  - The red/green proof also runs the base spec on the mutated build, which stays green.
  - One comment at the composable's `contains` call.
  - The clause at `src/manifest.test.ts:208`.
  - The note that the issue said "three toggles" where four exist.
  - The cited line numbers were corrected.
- **Rejected**: none.

### Consult 3: Codex resumed (same session)

- **Verdict: APPROVE.** No new material defect, confidence high.
- The src comment is proportionate. Codex suggested one sentence: "Firefox's all-sites grant covers loopback even when its explicit entries are absent."
- (B) is coherent with README.
- Two wording nits were folded into plan.md.
