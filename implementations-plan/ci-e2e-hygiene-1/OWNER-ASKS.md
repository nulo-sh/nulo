# Owner asks: ci-e2e-hygiene-1

Two asks. Each has a "what ships now" line, which the arc builds without waiting for the answer. Neither changes a screen.

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
