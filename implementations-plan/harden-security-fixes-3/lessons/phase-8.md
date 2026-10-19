# Phase 8: Block stops a token's scans (OA-5)

| When (2026-10-19) | Step | Outcome |
|---|---|---|
| 20:0x | Built Block as a deleter-locked section with an epoch bump, the shared scan teardown, a rebuild filter and the commit refusal (HS3-D11) | three scenario pins encoded the old Block (hidden rows kept, a blocked receipt marking the balance, receipts hidden after a successor Reject): moved to the signed behaviour |
| 20:1x | Composition tests, schedulers running, each arm's reads recorded by contract | first run red on stubs (`isChainQuarantined`); then red because the initial public poll was still reading when Block landed, which the signed text allows. The test now waits for both arms to go idle before and after Block: green 3/3 |
| 20:1x | Mutation pass | each change red under its own test: the rebuild filter, the note commit refusal, the Block bump (a rebuild parked in its accounts read and resumed mid-Block), the Allow refusal, the hidden-row delete. The public commit refusal is pinned by the moved scenario test |
