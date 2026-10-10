import { writeFileSync } from "node:fs"
import path from "node:path"
import { test } from "vitest"

test("runs after the stalled file", () => {
	writeFileSync(path.join(process.env.STALL_STATE_DIR ?? ".", "after-ran"), "")
})
