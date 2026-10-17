# Owner asks: harden-quality-fixes-3

## OA-1: the playground's "not connected" message

- **Surface.** `apps/playground`, the test dApp the wallet's e2e suites drive (not a wallet screen). When a button is pressed before `connect()`, the page's error line shows a message. Six sections say `Not connected — call connect() first`; `batch` and `data` say `Not connected`. No test reads either string.
- **Options.**
  - **A.** One guard and one message for all eight: `Not connected — call connect() first`. The `batch` and `data` buttons show the longer text.
  - **B.** One guard, one message: `Not connected`. Six sections show the shorter text.
  - **C.** Keep both texts: `batch` and `data` keep their own guard.
- **Recommendation.** A: six of eight already say it, and it tells the developer what to do.
- **What ships now.** C. The six sections that share the long message use the shared guard; `batch` and `data` keep theirs, and #539 stays open with a comment naming them until this is answered.
- **Answer.** A, decision page 34 (P34-10), signed 2026-10-17; it shipped in the same PR, so #539 closes there.
