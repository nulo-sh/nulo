# incoming-2 owner asks

## OA-1: the received page after a read that fails with no reconnect (arc 2)

- **Surface**: the received-transfer page (`/popup/received/<id>`).
- **The state**: the page's read of the receipt fails, and the worker does not restart, so nothing reads again: a request that times out after 60 s, or a storage or profile read the worker refuses. A worker restart is different: the page reads again on its own and shows the receipt.
- **Today**: "RECEIPT NOT FOUND / This receipt isn't in your current account history." That is false: the receipt may exist. #1431 fixes it, and the issue says what shows instead is your call.
- **Options**:
  - **A (recommended)**: the page's loading state stays: the "Received" header over an empty body, until the page is reopened. No new copy. The journal page shows the same on a failed read.
  - **B**: a short line in the body, for example "Couldn't load this receipt." with a Retry button that reads again. New copy and a new control.
- **What ships now**: arc 1 does not touch this page. Arc 2 starts once this is answered and builds the option picked; A needs no code beyond the fix, B adds the line and the button. Its PR shows the state in a capture.
