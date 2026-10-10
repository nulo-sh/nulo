/**
 * The seven popup RPCs that carry fee settings refuse an unknown speed level at the port: the reply
 * is `INVALID_PARAMS` naming only the method, logged at debug, and the method never runs. Driven
 * through each service's real `handleRequest` with the params wrapped as the client's wire carries
 * them; the method itself is a spy, so a call that passes the port does nothing.
 */
import { describe, expect, test, vi } from "vitest"
import { MessageType } from "@nulo/extension-messaging/messages"
import { wrapParams } from "@nulo/extension-messaging/utils"
import { LogLevel } from "@nulo/wallet-core/logger"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { AuthRegistryService } from "./auth-registry/service"
import { DappInteractionService } from "./dapp-interaction/service"
import { ExecutionService } from "./execution/service"

type Reply = { result?: unknown; errorPayload?: { code: string; message: string } }
type ServiceName = "execution" | "dappInteraction" | "authRegistry"

const fee = (priorityLevel?: unknown) =>
	priorityLevel === undefined ? { paymentMethod: { kind: "fj" } } : { paymentMethod: { kind: "fj" }, priorityLevel }
const sendTx = (feeSettings: unknown) => ({ kind: "aztec_sendTx", networkId: "net-1", accountAddress: "0xacc", feeSettings })
const sendTransaction = (feeSettings: unknown) => ({ kind: "send_transaction", networkId: "net-1", accountAddress: "0xacc", feeSettings })

/** Each guarded method, the service that owns it, and its arguments with `feeSettings` in place.
 *  The multi-entry methods put the tested settings last, behind a well-formed entry. */
const METHODS: Array<{ service: ServiceName; method: string; args: (feeSettings: unknown) => unknown[] }> = [
	{ service: "execution", method: "executeTransfer", args: (f) => ["net-1", "0xacc", 1, 0, "0xrec", "5", f] },
	{ service: "execution", method: "estimateTransferFee", args: (f) => ["net-1", "0xacc", 1, 0, "0xrec", "5", f, "token"] },
	{ service: "execution", method: "estimateOperationFee", args: (f) => ["interaction", 0, f, "token"] },
	{ service: "execution", method: "executeOperations", args: (f) => [[sendTransaction(fee("fast")), sendTx(f)], { type: 0 }] },
	{
		service: "dappInteraction",
		method: "approveInteraction",
		args: (f) => ["interaction", [{ feeSettings: fee() }, { feeSettings: f }]],
	},
	{ service: "authRegistry", method: "revokeAuthwits", args: (f) => ["net-1", "0xacc", [1], f] },
	{ service: "authRegistry", method: "setRegistryEnabled", args: (f) => ["net-1", "0xacc", true, f] },
]
const firstOf = (service: ServiceName) => METHODS.find((m) => m.service === service) as (typeof METHODS)[number]

function harness() {
	const log = vi.fn()
	const logger = { log }
	const services = {
		execution: new ExecutionService(logger),
		dappInteraction: new DappInteractionService(logger, {} as never),
		authRegistry: new AuthRegistryService(logger, new FakeBrowserApi()),
	}
	const port = { name: "test", postMessage: vi.fn(), onMessage: { addListener() {} }, onDisconnect: { addListener() {} } }
	let nextId = 1
	const call = async (service: ServiceName, method: string, params: unknown[]) => {
		const target = services[service] as unknown as Record<string, () => Promise<unknown>>
		const body = vi.spyOn(target, method).mockResolvedValue(undefined)
		const requestId = nextId++
		await (services[service] as unknown as { handleRequest: (c: unknown, p: unknown) => Promise<void> }).handleRequest(
			{ requestId, method, params: wrapParams(params) },
			port,
		)
		const reply: Reply | undefined = port.postMessage.mock.calls
			.map((c) => c[0])
			.find((m) => m.type === MessageType.Response && m.content.requestId === requestId)?.content
		return { reply, ran: body.mock.calls.length > 0 }
	}
	return { call, log }
}

const refusal = (method: string) => ({ code: "INVALID_PARAMS", message: `Invalid arguments for wallet method: ${method}` })

describe("unknown speed levels at the popup RPC boundary", () => {
	test.each(METHODS)("$method refuses a prototype-named level and runs a known one", async ({ service, method, args }) => {
		const { call } = harness()
		const refused = await call(service, method, args(fee("constructor")))
		expect(refused.reply?.errorPayload).toMatchObject(refusal(method))
		expect(refused.ran).toBe(false)
		const known = await call(service, method, args(fee("fast")))
		expect(known.reply?.errorPayload).toBeUndefined()
		expect(known.ran).toBe(true)
	})

	const CLASSES = [
		["an unknown name", "bogus"],
		["a non-string", 2],
		["an empty string", ""],
	] as const
	test.each(
		(["execution", "dappInteraction", "authRegistry"] as const).flatMap((service) =>
			CLASSES.map(([label, level]) => ({ service, label, level })),
		),
	)("$service: $label is refused before the method runs", async ({ service, level }) => {
		const { call } = harness()
		const { method, args } = firstOf(service)
		const { reply, ran } = await call(service, method, args(fee(level)))
		expect(reply?.errorPayload).toMatchObject(refusal(method))
		expect(ran).toBe(false)
	})

	test.each([
		{ label: "an absent level", service: "execution", method: "estimateOperationFee", params: ["interaction", 0, fee(), "token"] },
		{
			label: "an absent level",
			service: "dappInteraction",
			method: "approveInteraction",
			params: ["interaction", [{ feeSettings: fee() }]],
		},
		{ label: "an absent level", service: "authRegistry", method: "setRegistryEnabled", params: ["net-1", "0xacc", true, fee()] },
		{
			label: "fee settings that are not an object",
			service: "authRegistry",
			method: "revokeAuthwits",
			params: ["net-1", "0xacc", [1], "fj"],
		},
		{
			label: "deltas that are not an array",
			service: "dappInteraction",
			method: "approveInteraction",
			params: ["interaction", { feeSettings: fee("bogus") }],
		},
		{
			label: "operations that are not an array",
			service: "execution",
			method: "executeOperations",
			params: [sendTx(fee("bogus")), { type: 0 }],
		},
		{
			label: "a simulate_transaction operation",
			service: "execution",
			method: "executeOperations",
			params: [
				[{ kind: "simulate_transaction", networkId: "net-1", accountAddress: "0xacc", feeSettings: fee("bogus") }],
				{ type: 0 },
			],
		},
	] as const)("$service.$method: $label reaches the method", async ({ service, method, params }) => {
		const { call } = harness()
		const { reply, ran } = await call(service, method, [...params])
		expect(reply?.errorPayload).toBeUndefined()
		expect(ran).toBe(true)
	})

	test("a refusal logs at debug and nothing above it", async () => {
		const { call, log } = harness()
		const { method, args } = firstOf("authRegistry")
		await call("authRegistry", method, args(fee("bogus")))
		const levels = log.mock.calls.map((c) => c[1])
		expect(log.mock.calls.some((c) => c[1] === LogLevel.Debug && c[2] === "Request failed")).toBe(true)
		expect(levels.filter((level) => level > LogLevel.Debug)).toEqual([])
	})
})
