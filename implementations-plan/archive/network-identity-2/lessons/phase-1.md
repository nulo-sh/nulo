# Phase 1: the request loop pins no cache validator (red on the base build)

2026-10-20, at `ab98e3bfa` (the base fetch code), host load1 about 141-150.

- The loopback list host sends a content `ETag` (SHA-256 of the envelope) and records `if-none-match`; the scenario's request loop asserts it is absent.
- Chrome, armed build of this tree: `token-list.test.ts` scenario 1 fails only at `a list request carried a cache validator` (the second request sent the first answer's `ETag`); scenario 2 passes. File duration 29.6 s.
- Firefox, armed build of this tree: the same single failure at the same assertion; scenario 2 passes. File duration 51.3 s.
- Result: under `cache: "no-cache"` both engines store the answer and send its validator on the next request, so the assertion can fail on both browsers. D3 stays, and Excellent 2 is claimed for both.
