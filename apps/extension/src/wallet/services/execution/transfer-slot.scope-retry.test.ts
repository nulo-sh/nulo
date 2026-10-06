/**
 * A send that holds the execution slot and names a scope the PXE has not registered (a fresh import,
 * before any balance projection ran) gets the scope registered on demand, through the production
 * registrar, and its op retried once, without the registration needing the slot: the next send keeps
 * waiting until this one frees it.
 */
import { PxeScopeUnregisteredError } from "@nulo/extension-messaging/errors"
import { ServiceClient } from "@nulo/extension-messaging/offscreen"
import { type NetworkInfo, PxeServiceClientBase } from "@nulo/aztec-runtime/pxe"
import type { IPXE } from "@nulo/aztec-runtime/pxe"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { createScopeRegistrar } from "@/wallet/services/pxe/scope-registrar"
import { ExecutionLane, type ExecutionLaneDeps } from "./execution-lane"

const FENCE = { profileId: "p1", epoch: 0, session: 1 }
const NET: NetworkInfo = { profileId: "p1", chainId: 7, rpcUrl: "http://n/1" }

let wire: string[]
let answers: Record<string, (() => unknown)[]>

beforeEach(() => {
	vi.stubGlobal("self", globalThis)
	vi.stubGlobal("chrome", {
		runtime: {
			onMessage: { addListener: () => {} },
			connect: () => ({ onMessage: { addListener: () => {} }, onDisconnect: { addListener: () => {} }, postMessage: () => {} }),
		},
	})
	wire = []
	answers = {}
	const impl = async (method: unknown) => {
		wire.push(method as string)
		return (answers[method as string]?.shift() ?? (() => undefined))()
	}
	for (const proto of [ServiceClient.prototype, Object.getPrototypeOf(ServiceClient.prototype)]) {
		vi.spyOn(proto as { request: (...a: unknown[]) => Promise<unknown> }, "request").mockImplementation(impl)
	}
})

function makeLane(): ExecutionLane {
	const deps: ExecutionLaneDeps = {
		operationJournal: { touchOperation: vi.fn(async () => {}) } as never,
		getActiveProfile: vi.fn(async () => ({ id: "p1" }) as never),
		assertFence: vi.fn(async () => {}),
		peekLiveSerial: vi.fn(() => FENCE.session),
		getNetwork: vi.fn(async () => ({ chainId: 7 }) as never),
		logDebug: vi.fn(),
		logInfo: vi.fn(),
		logError: vi.fn(),
	}
	return new ExecutionLane(deps)
}

describe("register-on-demand while a send holds the execution slot", () => {
	test("a refused scoped op runs the production registrar and retries once; the next send still waits for the slot", async () => {
		const scope = `0x${"ab".repeat(32)}`
		const lane = makeLane()
		const signal = new AbortController().signal
		const release = await lane.acquireTransferSlot("net-1", "j1", FENCE, signal)
		let nextGranted = false
		const next = lane.acquireTransferSlot("net-1", "j2", FENCE, signal).then((r) => {
			nextGranted = true
			return r
		})
		const slotHeldDuringRegistration: boolean[] = []
		// NuloAccount.ensureRegistered's first PXE op; its registerAccount answer needs bb to parse.
		const ensureRegistered = async (pxe: IPXE) => {
			slotHeldDuringRegistration.push(lane.isSlotBusy("p1", 7))
			await pxe.getRegisteredAccounts()
		}
		const registrar = createScopeRegistrar(
			{ getAccountContract: vi.fn(async () => ({ ensureRegistered }) as never) },
			{ isChainLive: vi.fn(async () => true) },
		)
		const client = new PxeServiceClientBase({ log: () => {} })
		client.setGenerationProvider(async () => "gen-A")
		client.setScopeRegistrar(registrar)
		answers = {
			getNotes: [
				() => {
					throw new PxeScopeUnregisteredError()
				},
				() => [],
			],
			getRegisteredAccounts: [() => []],
		}

		await expect(client.getNotes(NET, { contractAddress: scope, scopes: [scope] } as never)).resolves.toEqual([])
		expect(wire).toEqual(["getNotes", "getRegisteredAccounts", "getNotes"])
		expect(slotHeldDuringRegistration).toEqual([true])
		expect(nextGranted).toBe(false)

		release()
		;(await next)()
		expect(lane.isSlotBusy("p1", 7)).toBe(false)
	})
})
