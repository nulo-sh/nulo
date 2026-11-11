# Phase 1: the fixtures and the fixture build

- The prototype's decode addresses were not all on the curve: `isValidAztecAddress` refused seven (TST, ROUTER, ESCROW, POOL_B, RECIPIENT_2, APP_FPC); each moved to the nearest valid tail.
- The depth fixture first nested an address under 32 structs: an `AztecAddress` is itself a struct, so its field sits at type depth 33 and the decoder refuses it. The leaf is an integer at depth 32.
- The fixture is loaded by a dynamic import inside the armed branch; the unit test waits on `vi.dynamicImportSettled()` before reading the window.
- Deviation: the fixture's estimates answer through the window's estimate map rather than a skip in the fee-update handler, so Confirm's holds run as for a request; `confirmBlocked` holds Confirm while no request is loaded.
- Gate: lint, typecheck:all, the window and e2e unit tests (499), test:ci-gating (755), lint:actions: all exit 0.
