// @vitest-environment node
import { readFileSync } from "node:fs"
import { LogLevels } from "@aztec-labs/foundation/log"
import { expect, test } from "vitest"
import { processEnvDefine } from "../vite.shared"

test("the build defines the dependency log level as warn, a level foundation accepts", () => {
	const { LOG_LEVEL } = JSON.parse(processEnvDefine) as { LOG_LEVEL: string }
	expect(LOG_LEVEL).toBe("warn")
	expect(LogLevels).toContain(LOG_LEVEL)
	expect(readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8")).toContain('"process.env": processEnvDefine,')
})
