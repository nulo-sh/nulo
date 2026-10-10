/**
 * Account RPC arguments are checked at the port: a bad tuple is refused as `INVALID_PARAMS`, with a
 * message that names only the method, before the method runs. Driven through the real
 * `handleRequest` with the params wrapped as the client's wire carries them.
 */
import { describe, expect, test, vi } from "vitest"
import { MessageType } from "@nulo/extension-messaging/messages"
import { wrapParams } from "@nulo/extension-messaging/utils"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { svc } from "../composition-harness"
import { AccountService } from "./service"
import { AccountMethodSchemas } from "./spec"

type Port = {
	name: string
	postMessage: ReturnType<typeof vi.fn>
	onMessage: { addListener(): void }
	onDisconnect: { addListener(): void }
}
type Reply = { result?: unknown; error?: string; errorPayload?: { code: string; message: string } }

async function started() {
	const api = new FakeBrowserApi()
	api.reset()
	const services = new ServiceCollection()
	services.add(svc(PROFILE_SERVICE_NAME, { onProfileDeleted: new EventHandler(), getDeletionState: () => new ProfileDeletionState() }))
	services.add(svc(NETWORK_SERVICE_NAME, { registerChainPurgeSubscriber: () => {}, isChainLive: async () => true }))
	const service = new AccountService(new LoggerStore(new ConfigStore()), api)
	services.add(service)
	await services.start()
	const port: Port = { name: "account", postMessage: vi.fn(), onMessage: { addListener() {} }, onDisconnect: { addListener() {} } }
	let nextId = 1
	const send = async (method: string, params: unknown): Promise<Reply | undefined> => {
		const requestId = nextId++
		await (service as unknown as { handleRequest: (c: unknown, p: Port) => Promise<void> }).handleRequest(
			{ requestId, method, params },
			port,
		)
		return port.postMessage.mock.calls
			.map((c) => c[0])
			.find((m) => m.type === MessageType.Response && m.content.requestId === requestId)?.content
	}
	const call = (method: string, ...params: unknown[]) => send(method, wrapParams(params))
	return { service, call, send }
}

describe("account RPC params", () => {
	test("every account RPC has a params schema, and nothing else does", async () => {
		const { service } = await started()
		const rpcMethods = (service as unknown as { rpcMethods: ReadonlySet<string> }).rpcMethods
		expect(Object.keys(AccountMethodSchemas).sort()).toEqual([...rpcMethods].sort())
	})

	test.each([
		["a missing required argument", "getAccounts", [undefined, 1]],
		["a wrong primitive", "getAccounts", ["p1", "1"]],
		["an out-of-range enum", "createAccount", ["p1", 1, 2, "Account 1"]],
		["an extra argument", "getAccount", ["p1", 1, "0xA", "extra"]],
	] as const)("%s is refused as INVALID_PARAMS before the method runs", async (_label, method, params) => {
		const { service, call } = await started()
		const body = vi.spyOn(service, method)
		const reply = await call(method, ...params)
		expect(reply?.errorPayload).toMatchObject({ code: "INVALID_PARAMS", message: `Invalid arguments for wallet method: ${method}` })
		expect(body).not.toHaveBeenCalled()
	})

	test("a valid tuple reaches the method, with a trailing optional omitted or passed as undefined", async () => {
		const { service, call } = await started()
		const body = vi.spyOn(service, "getAccounts")
		expect((await call("getAccounts", "p1", 1))?.result).toEqual([])
		expect((await call("getAccounts", "p1", 1, undefined))?.result).toEqual([])
		expect(body.mock.calls).toEqual([
			["p1", 1],
			["p1", 1, undefined],
		])
	})

	test("the method gets the caller's own argument objects, not a parsed copy", async () => {
		const { service, call } = await started()
		const body = vi.spyOn(service, "exportFullBackupKeys").mockRejectedValue(new Error("stop"))
		const fence = { profileId: "p1", epoch: 0, session: 1, incarnation: "i", extra: true }
		await call("exportFullBackupKeys", fence, "pw")
		expect(body.mock.calls[0]?.[0]).toBe(fence)
	})

	test("backup and restore have no schema and still run; a malformed params object is still VALIDATION", async () => {
		const { service, call, send } = await started()
		const backup = vi.spyOn(service, "backup").mockResolvedValue([])
		const restore = vi.spyOn(service, "restore").mockResolvedValue([])
		expect((await call("backup"))?.result).toEqual([])
		expect((await call("restore", []))?.result).toEqual([])
		expect(backup).toHaveBeenCalledOnce()
		expect(restore).toHaveBeenCalledWith([])
		expect((await send("getAccounts", null))?.errorPayload).toMatchObject({ code: "VALIDATION" })
	})
})
