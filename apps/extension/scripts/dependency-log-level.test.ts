// @vitest-environment node
import { LogLevels } from "@aztec-labs/foundation/log"
import { expect, test } from "vitest"
import { DEPENDENCY_LOG_LEVEL } from "../vite.shared"

test("the bundle's Aztec dependency loggers emit warn and above, a level foundation accepts", () => {
	expect(DEPENDENCY_LOG_LEVEL).toBe("warn")
	expect(LogLevels).toContain(DEPENDENCY_LOG_LEVEL)
})
