import "./zod-jitless"
import { z } from "zod"
import { expect, test } from "vitest"

test("zod reads the jitless flag from the global this module sets", () => {
	expect(z.config().jitless).toBe(true)
})
