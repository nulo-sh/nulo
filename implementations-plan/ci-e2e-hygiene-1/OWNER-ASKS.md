# Owner asks: ci-e2e-hygiene-1

Three asks. Each has a "what ships now" line, which the arc builds without waiting for the answer. No "what ships now" line changes a screen.

## OA-1. #630 and #553: a reset started from Home waits for FPC discovery while the node is down

**Surface:** Settings → Reset (and Delete profile from the lock view), with the Testnet node down, on a profile whose protocol FPCs were never discovered (the node was down when the profile was made, or ever since).

**Today** (measured on Chrome and Firefox, with the node refusing connections): Home starts FPC discovery on every popup open while the two protocol rows are missing. A reset submitted then waits 9.1 to 9.2 s for discovery's retries before its purge goes on. The button reads "Deleting…", and the "still working" hint shows after 10 s. If the node accepts connections and never answers, each retried call can wait its 60 s request timeout, so the wait can be minutes. Known limit #553 (closed) describes this wait, but it assumes Send or the fee settings are open. Home is enough.

`security-reset`'s refused-node test (#630) goes red when this wait plus host load passes its 15 s budget. The test exists to prove that the PXE's own retries stop when the purge begins. It does not exist to measure discovery.

| Option | The test | The product |
|---|---|---|
| **A. Narrow the test; #553 stays closed** | it seeds both protocol rows, so it measures the PXE drain alone (0.5 to 1.5 s measured) | as today; #553 gets a comment that corrects its premise with these numbers |
| **B. Narrow the test; reopen #553 for a later lane** | as A | as today until that lane ships. Its fix moves the registration outside the FPC lock, as #553 says, and must keep the deletion fence and concurrent discovery working |
| **C. Hold #630 for the product fix** | unchanged, still red under load | as B, in this lane or the next |

**Recommendation: B.** The test is wrong to measure a known limit it does not name. The known limit was closed on a premise that did not hold: every reset from Home with the node down pays this wait, and a silent node makes it minutes.

**What ships now: A.** Arc 1 narrows the test, and #630 closes with the measured cause. #553 gets the evidence comment and stays closed until you answer.

## OA-2. #643: which import-matrix rows run in CI

**Surface:** none (CI time only). The lane brief says to un-skip `import-handshake-note-matrix` in CI once it is green on both browsers.

The repository's e2e rule says each scenario added to CI names a failure mode no other test proves.
- **The passkey row** is the only PR-lane run that restores a passkey backup the wallet made, through the real ceremony and into the PXE. Smoke imports a synthetic one, and the real round trip on Firefox runs only in nightly and release smokes.
- **The settings row** reaches the same purge and the same import as `import-handshake-note`, which already runs in CI. Only its entry differs: it deletes from Settings, not from the lock view.

| Option | CI time added (estimate, per browser lane) |
|---|---|
| **A. Both rows** (the brief, as written) | about 8 min |
| **B. The passkey row only** | about 4 min |

A third option, neither row with only a check of the export's MAC in smoke, was rejected: a valid MAC does not prove the file restores.

**Recommendation: B.** The settings row proves nothing in CI that another test does not.

**What ships now: B.** The settings row keeps its CI skip, and the header says why. A is a one-line change on your word.

## OA-3. #616: the logs view at its end loses a selection or an open search when a line arrives

**Surface:** the logs window, with the view resting at its end, while a person selects text or has the search panel open.

**Today** (#616, measured again here on both browsers): the first new line shows the scroll-to-end button, and about 5 ms later CodeMirror scrolls the view back to its end on its own. The viewer reads that scroll as the person returning to the end and follows again, so every later line moves the selection or the search match up. On Firefox, opening the search panel can do the same before any line arrives.

**Why it is asked now:** `viewers-csp.test.ts`'s "focusing the search panel stops the follow" goes red on Firefox when the panel's own scroll comes first (1 in 11 runs here). That test runs in the Firefox smoke lane, a required check, so the race can block a merge until the viewer's behaviour is decided.

| Option | What a person sees |
|---|---|
| **A. A selection or an open search holds the view** | the view stays where it is while the selection or the search panel is active; the button shows; following resumes on the button, a scroll to the end, or the 30 s timeout |
| **B. Follow as today** | the view keeps following; the test's claim changes to the button only, and the search case is rewritten to match |

**Recommendation: A.** The viewer already means to stop (its 30 s timer); CodeMirror's own scroll defeats it.

**What ships now:** the test-side fixes only. The search row stays as it is, so the defect stays visible.
