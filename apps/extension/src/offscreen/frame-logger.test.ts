import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { LogLevel } from "@nulo/wallet-core/logger"
import { expect, test } from "vitest"
import { frameLogger } from "./frame-logger"

const HEX32 = `0x${"ab".repeat(32)}`

function recording() {
	const lines: unknown[][] = []
	return { lines, logger: frameLogger({ log: (_source, _level, ...data) => lines.push(data) }) }
}

test("a 32-byte hex value is replaced in a message, a nested value and an error's projected message; the caller's error is unchanged", () => {
	const { lines, logger } = recording()
	const error = new Error(`class ${HEX32} mismatch`)
	logger.log("pxe", LogLevel.Warn, `note ${HEX32}`, { deep: { list: [HEX32] } }, { error })
	expect(lines).toEqual([
		["note [32 bytes]", { deep: { list: ["[32 bytes]"] } }, { error: { name: "Error", message: "class [32 bytes] mismatch" } }],
	])
	expect(error.message).toBe(`class ${HEX32} mismatch`)
})

test("a 32-byte value cut by an error message's length cap, and a field element, are replaced", () => {
	const { lines, logger } = recording()
	logger.log("pxe", LogLevel.Warn, { error: new Error(`${"m".repeat(151)}${HEX32}`), classId: new Fr(2n ** 200n) })
	expect(lines).toEqual([[{ error: { name: "Error", message: `${"m".repeat(151)}[32 bytes]…` }, classId: { asBigInt: "[32 bytes]" } }]])
})

test("a shorter hex value and plain text pass unchanged, and trim still redacts by key (control)", () => {
	const { lines, logger } = recording()
	logger.log("pxe", LogLevel.Info, "selector 0x12345678", { text: "ready", password: "hunter2" })
	expect(lines).toEqual([["selector 0x12345678", { text: "ready", password: "[password]" }]])
})
