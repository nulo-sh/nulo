import { beforeAll, expect, test } from "vitest"

let z: typeof import("zod").z

// The cold imports run on the hook's budget, not the test's; the flag module must load before zod.
beforeAll(async () => {
	await import("./zod-jitless")
	z = (await import("zod")).z
})

test("zod reads the jitless flag from the global this module sets", () => {
	expect(z.config().jitless).toBe(true)
})
