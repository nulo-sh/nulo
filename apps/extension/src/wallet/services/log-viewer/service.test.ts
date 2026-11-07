import { describe, expect, test } from "vitest"
import { ValidationError } from "@nulo/extension-messaging/errors"
import { DummyLogger, type ILoggerStore } from "@/wallet/logger"
import { RequestLog } from "@/wallet/logger/request-log"
import { LogViewerService } from "./service"

const JOURNAL = "0123456789abcdef"

function harness(developerMode: boolean) {
	const state = { on: true }
	const requests = new RequestLog(() => state.on)
	requests.begin("1a2b3c4d", { method: "sendTx", originHost: "app.example", chainId: 31337 })
	requests.alias("1a2b3c4d", { journalId: JOURNAL })
	state.on = developerMode
	const store = Object.assign(new DummyLogger(), { onLog: { add: () => {} } }) as unknown as ILoggerStore
	const service = new LogViewerService(store, requests)
	Object.assign(service, { networkService: { getNetworks: async () => [{ name: "Local network" }] } })
	return { service, set: (on: boolean) => (state.on = on) }
}

describe("LogViewerService request reports", () => {
	test("finds the request and builds its report while developer mode is on", async () => {
		const { service } = harness(true)
		expect(await service.findRequestTrace({ journalId: JOURNAL })).toBe("1a2b3c4d")
		const report = await service.getRequestReport("1a2b3c4d")
		expect(report?.fileName).toBe("nulo-request-1a2b3c4d.txt")
		expect(report?.text).toContain("Network: Local network\nTrace id: 1a2b3c4d\ndApp origin host: app.example\n")
	})

	test("answers nothing with developer mode off, the capture still held", async () => {
		const { service } = harness(false)
		expect(await service.findRequestTrace({ journalId: JOURNAL })).toBeUndefined()
		expect(await service.getRequestReport("1a2b3c4d")).toBeUndefined()
	})

	test.each([
		["findRequestTrace", [{ journalId: "not-hex" }]],
		["findRequestTrace", [{ journalId: JOURNAL, interactionId: JOURNAL }]],
		["getRequestReport", ["1A2B3C4D"]],
		["getRequestReport", [{ walletTraceId: "1a2b3c4d" }]],
	] as const)("%s refuses a malformed argument", async (method, args) => {
		const { service } = harness(true)
		const call = (service[method] as (...a: unknown[]) => Promise<unknown>).bind(service)
		await expect(call(...args)).rejects.toBeInstanceOf(ValidationError)
	})
})
