# history-1: owner asks

## OA1. Which time the transaction page shows

- **Surface**: the transaction detail page (`/popup/tx/<hash>`), the time in its hero line, beside "View on …". The arc does not touch this page.
- **What it shows today**: the time of the send's last status change (`updatedAt`): the moment it was mined, finalized, or reconciled when the wallet next looked. It carries no label. #1394 assumed it showed when the send was made; it does not (`apps/extension/src/popup/pages/tx/[id].vue:98-101`).
- **Why it matters now**: after this arc, History and Home order sends by when they were sent. A send made at 15:08 and finalized at 15:20 sits below one made at 15:13, while its page reads 15:20.
- **Options**:
  - A. Keep the last status change (today). The page and the list can read out of step, as above.
  - B. Show when the send was made (`createdAt`, the moment the node accepted it). The page agrees with the list's order, as the journal page already shows its record's start (`popup/pages/journal/[id].vue:164-167`). The page reads, for the example, "Oct 30, 2026 at 15:08".
- **Recommendation**: B. It is a one-line change with one test, in its own small PR.
- **What ships now**: A, unchanged.
