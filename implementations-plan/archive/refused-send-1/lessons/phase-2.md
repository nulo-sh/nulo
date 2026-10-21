# Phase 2: the send check

- `firstAnswer` reads the clock again after its receipt read: a Dropped answer that settles past the window refuses nothing.
- A failed read, a missing node and an unparseable status are never Dropped (`receiptOf` returns `undefined`; `isDropped` catches a status that does not parse).
- Mutations checked: dropping the `checkSince` guard or the fresh-clock guard turns its test red; the source was restored.
- Gate: lint 0, typecheck:all 0, test 0 (14658 passed).
