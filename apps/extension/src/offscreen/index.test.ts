import { consoleMethods, LogLevel } from "@nulo/wallet-core/logger"
import { beforeAll, expect, test, vi } from "vitest"

const { lines, handed } = vi.hoisted(() => ({
	lines: [] as unknown[][],
	handed: {} as { logger?: { log(source: string, level: number, ...data: unknown[]): void } },
}))
vi.mock("@/wallet/services/logger/client", () => ({
	documentLogger: () => ({ log: (_source: string, _level: number, ...data: unknown[]) => lines.push(data) }),
}))
vi.mock("@/wallet/services/profile/client", () => ({ ProfileServiceClient: class {} }))
vi.mock("@nulo/aztec-runtime/offscreen/entry", () => ({
	createPxeOffscreen: async (opts: typeof handed) => {
		handed.logger = opts.logger
	},
}))
vi.mock("@nulo/aztec-runtime/pxe", () => ({
	ProductionPxeFactory: class {},
	createProvePhaseSink: () => ({ emit: () => {} }),
}))

const HEX32 = `0x${"ab".repeat(32)}`

beforeAll(async () => {
	vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => {} } })
	await import("./index")
})

test("the frame's console hooks and the logger its PXE services receive both scrub 32-byte hex", () => {
	lines.length = 0
	const [method] = consoleMethods[0]
	;(self as unknown as Record<string, (...data: unknown[]) => void>)[`nuloOn${method}`](`id ${HEX32}`)
	handed.logger?.log("pxe", LogLevel.Warn, { classId: HEX32 })
	expect(lines).toEqual([["id [32-byte hex]"], [{ classId: "[32-byte hex]" }]])
})
