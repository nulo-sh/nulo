import { test } from "vitest"

// A blocked event loop cannot answer vitest's cancel, so only the watchdog's kill ends this fork.
test("spins", () => {
	for (;;) {}
})
