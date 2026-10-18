/**
 * F11 pins: `executeRegisterToken` binds the token write to ONE identity chain —
 * the fence captured at dispatch entry, tied to the ownership-checked network
 * row, threaded into `addToken` (no fresh mint at the commit). Prototype-call
 * with a minimal `this`: the method's surface is three service calls, so the
 * full ExecutionService init graph is deliberately not constructed.
 */
import { describe, expect, test, vi } from "vitest"
import { PinMismatchError } from "@/wallet/services/token/seeder"
import { ExecutionService } from "./service"
import type { OperationApprovalEnvelope } from "./models"
import { OriginType, type LocalTxOrigin } from "@/wallet/services/transaction/service"

const previewed = {
	contract: "0xabc",
	chainId: 1,
	getNameFn: { name: "get_name" },
	getSymbolFn: { name: "get_symbol" },
	getDecimalsFn: { name: "get_decimals" },
	balanceOfPublicFn: { name: "balance_of_public" },
}
const op = { networkId: "net1", address: "0xabc", accountAddress: "0xacc" } as never
const origin = { type: OriginType.DAPP, name: "https://dapp.x" } as LocalTxOrigin
const SHOWN = { name: "Test USDC", symbol: "USDC", decimals: 6, classId: `0x${"c1".repeat(32)}` }
const approved: OperationApprovalEnvelope = { interactionId: "i-1", index: 0, tokenMetadata: SHOWN }

function makeSelf(networkProfileId: string) {
	const fence = { profileId: "pA", epoch: 7 }
	const addTokenAuthorized = vi.fn(async () => ({}) as never)
	const self = {
		profileService: { captureExecutionFence: vi.fn(async () => fence) },
		networkService: { getNetwork: vi.fn(async () => ({ id: "net1", profileId: networkProfileId, chainId: 1 })) },
		tokenService: { addTokenAuthorized, parseTokenInterface: vi.fn(async () => previewed) },
		logError: () => {},
	}
	return { self, fence, addTokenAuthorized }
}

const invoke = (self: unknown, authorizedFence?: unknown) => invokeWith(self, approved, origin, authorizedFence)
const invokeWith = (self: unknown, approval: OperationApprovalEnvelope | undefined, from: LocalTxOrigin, authorizedFence?: unknown) =>
	(
		ExecutionService.prototype as unknown as {
			executeRegisterToken: (
				op: never,
				origin: LocalTxOrigin,
				task?: never,
				fence?: unknown,
				approval?: OperationApprovalEnvelope,
			) => Promise<void>
		}
	).executeRegisterToken.call(self, op, from, undefined, authorizedFence, approval)

describe("executeRegisterToken — F11 identity chain", () => {
	test("the write receives the ENTRY fence and its profileId, not a live re-read", async () => {
		const { self, fence, addTokenAuthorized } = makeSelf("pA")
		await invoke(self)
		expect(addTokenAuthorized).toHaveBeenCalledTimes(1)
		const args = addTokenAuthorized.mock.calls[0] as unknown[]
		// Identity, not equality: the SAME capture must reach the commit — a
		// re-minted fence would carry a post-deletion epoch (the F11 ABA).
		expect(args[0]).toBe(fence)
		expect(args[1]).toBe("pA")
	})

	test("a THREADED authorization fence is consumed verbatim — dispatch never re-captures", async () => {
		// The dApp path's capture happens at the interaction's session
		// re-validation, UPSTREAM of the refreshSession park; a re-capture at
		// dispatch would observe a delete + re-import parked across that gap.
		const { self, addTokenAuthorized } = makeSelf("pA")
		const upstream = { profileId: "pA", epoch: 3 }
		await invoke(self, upstream)
		expect(self.profileService.captureExecutionFence).not.toHaveBeenCalled()
		expect((addTokenAuthorized.mock.calls[0] as unknown[])[0]).toBe(upstream)
	})

	test("a network row owned by another profile fails closed before any write", async () => {
		const { self, addTokenAuthorized } = makeSelf("pB")
		await expect(invoke(self)).rejects.toThrow(/unauthorized profile/)
		expect(addTokenAuthorized).not.toHaveBeenCalled()
	})

	test('the locked gate keeps the pinned "Wallet locked" message', async () => {
		const { self, addTokenAuthorized } = makeSelf("pA")
		self.profileService.captureExecutionFence = vi.fn(async () => {
			throw new Error("profile facade internal")
		})
		await expect(invoke(self)).rejects.toThrow("Wallet locked")
		expect(addTokenAuthorized).not.toHaveBeenCalled()
	})
})

describe("executeRegisterToken — the details the window showed", () => {
	test("the parse is pinned to the window's class and the add expects the window's values (control)", async () => {
		const { self, addTokenAuthorized } = makeSelf("pA")
		await invoke(self)
		expect(self.tokenService.parseTokenInterface).toHaveBeenCalledWith("net1", "0xabc", undefined, SHOWN.classId)
		expect((addTokenAuthorized.mock.calls[0] as unknown[])[6]).toEqual({ name: "Test USDC", symbol: "USDC", decimals: 6 })
	})

	test("a contract whose class moved since the window refuses at the parse, before any add", async () => {
		const { self, addTokenAuthorized } = makeSelf("pA")
		self.tokenService.parseTokenInterface = vi.fn(async () => {
			throw new PinMismatchError("class id moved")
		})
		await expect(invoke(self)).rejects.toBeInstanceOf(PinMismatchError)
		expect(addTokenAuthorized).not.toHaveBeenCalled()
	})

	test("a dApp approval that carries no shown details is refused before the parse and the add", async () => {
		const { self, addTokenAuthorized } = makeSelf("pA")
		await expect(invokeWith(self, { interactionId: "i-1", index: 0 }, origin)).rejects.toThrow("Token details were not shown")
		await expect(invokeWith(self, undefined, origin)).rejects.toThrow("Token details were not shown")
		expect(self.tokenService.parseTokenInterface).not.toHaveBeenCalled()
		expect(addTokenAuthorized).not.toHaveBeenCalled()
	})

	test("the wallet's own add, which has no window, is unpinned and expects nothing (control)", async () => {
		const { self, addTokenAuthorized } = makeSelf("pA")
		await invokeWith(self, undefined, { type: OriginType.UI } as LocalTxOrigin)
		expect(self.tokenService.parseTokenInterface).toHaveBeenCalledWith("net1", "0xabc", undefined, undefined)
		expect((addTokenAuthorized.mock.calls[0] as unknown[])[6]).toBeUndefined()
	})
})
