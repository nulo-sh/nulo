import { test } from "vitest"

let attempt = 0

// Each attempt is silent for 2 s against a 3 s stall: only the retry's own event keeps the run alive.
test("passes on its retry", { retry: 1 }, async () => {
	attempt++
	await new Promise((resolve) => setTimeout(resolve, 2_000))
	if (attempt === 1) throw new Error("first attempt")
})
