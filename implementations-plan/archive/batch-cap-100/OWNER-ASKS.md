# Owner asks: batch-cap-100

None. The change touches no screen, copy or format.

For the orchestrator's open relay (the owner's "uncapped", 2026-11-04): the premise that an uncapped client sends a tick of more than 100 calls as one batch does not hold on `@aztec-labs/foundation` 6.0.0, whose client defaults to 100 entries per request (plan.md, The brief, checked). Today, removing the two entries and setting them to 100 send the same requests. This PR keeps them at 100 (plan.md, D1); it does not need an answer to ship.
