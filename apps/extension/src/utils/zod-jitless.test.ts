import { beforeAll, expect, test } from "vitest"

let z: typeof import("zod").z

// Loading is not the behaviour under test, so it runs in the hook, not on the test's own budget.
beforeAll(async () => {
	await import("./zod-jitless")
	z = (await import("zod")).z
})

test("zod reads the jitless flag from the global this module sets", () => {
	expect(z.config().jitless).toBe(true)
})
