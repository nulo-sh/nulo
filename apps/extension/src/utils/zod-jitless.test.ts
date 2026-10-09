import { expect, test } from "vitest"

test("zod reads the jitless flag from the global this module sets", async () => {
	await import("./zod-jitless")
	const { z } = await import("zod")
	expect(z.config().jitless).toBe(true)
})
