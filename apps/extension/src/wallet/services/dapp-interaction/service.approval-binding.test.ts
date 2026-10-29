/**
 * Approval authority binds to the STORED request. The popup contributes a
 * per-index delta (fee choice, SW-minted ids) and nothing else: every field
 * the executor receives is re-materialized from the dApp's payload, the fee
 * path is validated against what the dApp asked for, and an id that is not an
 * execution interaction is refused before any claim. The executor stub asserts
 * strict equality with the materialized operation, so a spread merge reds.
 */

import type { ILogger } from "@/wallet/logger"
import type { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { describe, expect, test, vi } from "vitest"
import { OriginType } from "@/wallet/services/transaction/service"
import { DappInteractionService } from "./service"
import type { DappInteraction } from "./spec"

const noopLogger: ILogger = { log: () => {} }
const flush = () => new Promise((r) => setTimeout(r, 0))

const OWNER = "0xowner"
const NETWORK = { id: "net-1", chainId: 1, name: "N" }
const ACCOUNT = { address: OWNER, chainId: 1, name: "Owner" }
const SESSION = { id: "s1", profileId: "p1", dappMetadata: { name: "dapp.example", url: "https://dapp.example" } }

type Internals = {
	storage: Map<string, DappInteraction>
	profileService: unknown
	networkService: unknown
	accountService: unknown
	executionService: { executeOperations: ReturnType<typeof vi.fn>; claimPreviews: ReturnType<typeof vi.fn> }
	dappSessionService: unknown
	windowManager: { cancel: ReturnType<typeof vi.fn>; settle: ReturnType<typeof vi.fn> }
}

function makeService(activeProfile: { id: string } | undefined = { id: "p1" }) {
	const windowManager = { detach: vi.fn(), settle: vi.fn(), cancel: vi.fn(), focus: vi.fn(async () => true) } as unknown as WindowManager
	const svc = new DappInteractionService(noopLogger, windowManager)
	const internals = svc as unknown as Internals
	internals.profileService = {
		refreshSession: vi.fn(async () => {}),
		getActiveProfile: async () => activeProfile,
		captureExecutionFence: async () => {
			if (!activeProfile) throw new Error("Wallet locked")
			return { profileId: activeProfile.id, epoch: 0 }
		},
	}
	internals.networkService = { getNetworks: vi.fn(async () => [NETWORK]) }
	internals.accountService = { getAccount: vi.fn(async () => ACCOUNT) }
	internals.executionService = { executeOperations: vi.fn(async () => []), claimPreviews: vi.fn(() => () => {}) }
	internals.dappSessionService = { tryGetDappSession: async () => ({ profileId: "p1" }) }
	return { svc, internals, windowManager: internals.windowManager }
}

const store = (internals: Internals, id: string, payload: unknown) =>
	internals.storage.set(id, { id, payload: payload as DappInteraction["payload"], handleId: `h-${id}`, cancellationToken: id })

const sendTxRequest = (exec: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
	kind: "aztec_sendTx",
	account: `aztec:1:${OWNER}`,
	exec,
	opts: { from: OWNER },
	...extra,
})
const execPayload = (operations: unknown[]) => ({ params: { operations }, session: SESSION })

const executedOps = (internals: Internals) => (internals.executionService.executeOperations.mock.calls[0] as unknown[])[0] as unknown[]
const executedArgs = (internals: Internals) => internals.executionService.executeOperations.mock.calls[0] as unknown[]

describe("approveInteraction — the popup cannot substitute what executes", () => {
	test("a delta carrying only feeSettings executes the SW-materialized operation, exactly", async () => {
		const { svc, internals } = makeService()
		store(internals, "i-1", execPayload([sendTxRequest({ calls: [{ name: "swap" }] })]))
		await svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } } }])
		await flush()
		expect(executedOps(internals)).toEqual([
			{
				kind: "aztec_sendTx",
				account: `aztec:1:${OWNER}`,
				networkId: "net-1",
				accountAddress: OWNER,
				exec: { calls: [{ name: "swap" }] },
				opts: { from: OWNER },
				feeSettings: { paymentMethod: { kind: "fj" } },
			},
		])
	})

	test("forged fields on the delta never reach the operation", async () => {
		const { svc, internals } = makeService()
		store(internals, "i-1", execPayload([sendTxRequest({ calls: [{ name: "swap" }] })]))
		const forged = {
			feeSettings: { paymentMethod: { kind: "fj" } },
			accountAddress: "0xevil",
			exec: { calls: [{ name: "drain" }] },
			opts: { from: "0xevil" },
			executionMode: "default_entrypoint",
			previewedInterface: { contract: "0x" },
		}
		await svc.approveInteraction("i-1", [forged as never])
		await flush()
		const op = executedOps(internals)[0] as Record<string, unknown>
		expect(op.accountAddress).toBe(OWNER)
		expect(op.exec).toEqual({ calls: [{ name: "swap" }] })
		expect(op.opts).toEqual({ from: OWNER })
		expect("executionMode" in op).toBe(false)
		expect("previewedInterface" in op).toBe(false)
	})

	test("feeSettings on a non-send kind is ignored; embedded + a conflicting delta stays embedded", async () => {
		const { svc, internals } = makeService()
		store(
			internals,
			"i-1",
			execPayload([
				{ kind: "register_token", account: `aztec:1:${OWNER}`, address: "0xtok" },
				sendTxRequest({ calls: [], feePayer: "0xfpc" }),
			]),
		)
		await svc.approveInteraction("i-1", [
			{ feeSettings: { paymentMethod: { kind: "fj" } } },
			{ feeSettings: { paymentMethod: { kind: "fpc", fpcId: "x" } } },
		])
		await flush()
		const [token, send] = executedOps(internals) as Record<string, unknown>[]
		expect("feeSettings" in token!).toBe(false)
		expect(send!.feeSettings).toEqual({ paymentMethod: { kind: "embedded" } })
	})

	test("a requested self-pay rejects an fpc delta and executes with fj", async () => {
		const rejected = makeService()
		store(rejected.internals, "i-1", execPayload([sendTxRequest({ calls: [{ name: "transfer" }], feePayer: OWNER })]))
		await rejected.svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fpc", fpcId: "x" } } }])
		await flush()
		expect(rejected.internals.executionService.executeOperations).not.toHaveBeenCalled()
		expect(rejected.windowManager.cancel).toHaveBeenCalledWith("h-i-1", expect.stringContaining("Fee Juice"))

		const accepted = makeService()
		store(accepted.internals, "i-1", execPayload([sendTxRequest({ calls: [{ name: "transfer" }], feePayer: OWNER })]))
		await accepted.svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } } }])
		await flush()
		expect(accepted.internals.executionService.executeOperations).toHaveBeenCalledTimes(1)
	})

	test("the origin is the session's dApp name and the envelopes carry the SW ids per index", async () => {
		const { svc, internals } = makeService()
		store(
			internals,
			"i-9",
			execPayload([sendTxRequest({ calls: [] }), { kind: "register_token", account: `aztec:1:${OWNER}`, address: "0xt" }]),
		)
		await svc.approveInteraction("i-9", [{ feeSettings: { paymentMethod: { kind: "fj" } }, estimateId: "est", previewId: "prev" }, {}])
		await flush()
		const args = executedArgs(internals)
		expect(args[1]).toEqual({ type: OriginType.DAPP, name: "dapp.example" })
		expect(args[4]).toEqual([
			{ interactionId: "i-9", index: 0, estimateId: "est", previewId: "prev", feeCeiling: undefined },
			{ interactionId: "i-9", index: 1, estimateId: undefined, previewId: undefined, feeCeiling: undefined },
		])
	})

	test("the snapshots an approval names are claimed as its record is taken, before any await, and released once it ends", async () => {
		const { svc, internals } = makeService()
		const release = vi.fn()
		const seen: { stored?: boolean; fenced?: boolean } = {}
		let fenced = false
		const profile = internals.profileService as { captureExecutionFence: () => Promise<unknown> }
		const capture = profile.captureExecutionFence
		profile.captureExecutionFence = async () => {
			fenced = true
			return await capture()
		}
		internals.executionService.claimPreviews.mockImplementation(() => {
			seen.stored = internals.storage.has("i-7")
			seen.fenced = fenced
			return release
		})
		let finish = (_: unknown[]) => {}
		internals.executionService.executeOperations.mockImplementation(() => new Promise<unknown[]>((r) => (finish = r)))
		store(internals, "i-7", execPayload([sendTxRequest({ calls: [] }), sendTxRequest({ calls: [] })]))
		await svc.approveInteraction("i-7", [
			{ feeSettings: { paymentMethod: { kind: "fj" } }, estimateId: "e0", previewId: "e0" },
			{ feeSettings: { paymentMethod: { kind: "fj" } } },
		])
		await flush()
		expect(internals.executionService.claimPreviews).toHaveBeenCalledExactlyOnceWith(["e0", undefined])
		expect(seen).toEqual({ stored: false, fenced: false })
		expect(release).not.toHaveBeenCalled()
		finish([])
		await flush()
		expect(release).toHaveBeenCalledTimes(1)
	})

	test("a null delta claims nothing and executes as an empty one", async () => {
		const { svc, internals } = makeService()
		store(internals, "i-6", execPayload([{ kind: "register_token", account: `aztec:1:${OWNER}`, address: "0xt" }]))
		await svc.approveInteraction("i-6", [null as never])
		await flush()
		expect(internals.executionService.claimPreviews).toHaveBeenCalledExactlyOnceWith([undefined])
		expect(internals.executionService.executeOperations).toHaveBeenCalledTimes(1)
	})

	test("an approval refused after its claim releases what it claimed", async () => {
		const { svc, internals } = makeService()
		const release = vi.fn()
		internals.executionService.claimPreviews.mockImplementation(() => release)
		;(internals.profileService as { captureExecutionFence: () => Promise<unknown> }).captureExecutionFence = async () => {
			throw new Error("Wallet locked")
		}
		store(internals, "i-8", execPayload([sendTxRequest({ calls: [] })]))
		await svc.approveInteraction("i-8", [{ feeSettings: { paymentMethod: { kind: "fj" } }, estimateId: "e0", previewId: "e0" }])
		await flush()
		expect(internals.executionService.executeOperations).not.toHaveBeenCalled()
		expect(internals.windowManager.cancel).toHaveBeenCalledTimes(1)
		expect(release).toHaveBeenCalledTimes(1)
	})

	test("the figure the window showed reaches the envelope; a malformed one is refused before the claim", async () => {
		const { svc, internals } = makeService()
		store(internals, "i-1", execPayload([sendTxRequest({ calls: [] })]))
		for (const figure of ["0.016", "-1", "0x10", ""]) {
			await expect(
				svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } }, feeCeiling: figure }]),
			).rejects.toThrow("Invalid fee figure")
		}
		expect(internals.storage.has("i-1")).toBe(true)
		expect(internals.executionService.executeOperations).not.toHaveBeenCalled()

		await svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } }, feeCeiling: "16000000000000000" }])
		await flush()
		expect((executedArgs(internals)[4] as Array<{ feeCeiling?: string }>)[0]?.feeCeiling).toBe("16000000000000000")
	})

	const SHOWN = { name: "Test USDC", symbol: "USDC", decimals: 6, classId: `0x${"c1".repeat(32)}` }
	test("the token details the window showed reach the envelope", async () => {
		const { svc, internals } = makeService()
		store(internals, "i-1", execPayload([{ kind: "register_token", account: `aztec:1:${OWNER}`, address: "0xt" }]))
		await svc.approveInteraction("i-1", [{ tokenMetadata: SHOWN }])
		await flush()
		expect((executedArgs(internals)[4] as Array<{ tokenMetadata?: unknown }>)[0]?.tokenMetadata).toEqual(SHOWN)
	})

	test.each([
		["not an object", "USDC"],
		["a name that is not a string", { ...SHOWN, name: 1 }],
		["a name past 256 units", { ...SHOWN, name: "n".repeat(257) }],
		["a symbol that is not a string", { ...SHOWN, symbol: null }],
		["a symbol past 256 units", { ...SHOWN, symbol: "s".repeat(257) }],
		["decimals that are not an integer", { ...SHOWN, decimals: 1.5 }],
		["negative decimals", { ...SHOWN, decimals: -1 }],
		["decimals past the safe range", { ...SHOWN, decimals: 2 ** 53 }],
		["a class id that is not a lower-case field", { ...SHOWN, classId: `0x${"C1".repeat(32)}` }],
		["no class id", { name: "Test USDC", symbol: "USDC", decimals: 6 }],
	])("token details with %s are refused before the claim", async (_label, tokenMetadata) => {
		const { svc, internals } = makeService()
		store(internals, "i-1", execPayload([{ kind: "register_token", account: `aztec:1:${OWNER}`, address: "0xt" }]))
		await expect(svc.approveInteraction("i-1", [{ tokenMetadata: tokenMetadata as never }])).rejects.toThrow("Invalid token details")
		expect(internals.storage.has("i-1")).toBe(true)
		expect(internals.executionService.executeOperations).not.toHaveBeenCalled()
	})

	test("a capability- or discovery-shaped id is refused BEFORE the claim; the record survives for resolveInteraction", async () => {
		const { svc, internals } = makeService()
		store(internals, "cap", { params: { capabilities: {} }, session: SESSION })
		store(internals, "disc", { params: { dappMetadata: SESSION.dappMetadata } })
		await expect(svc.approveInteraction("cap", [])).rejects.toThrow("Invalid id")
		await expect(svc.approveInteraction("disc", [])).rejects.toThrow("Invalid id")
		expect(internals.storage.has("cap")).toBe(true)
		expect(internals.storage.has("disc")).toBe(true)
		await expect(svc.resolveInteraction("cap", { approved: true })).resolves.toBeUndefined()
		expect(internals.executionService.executeOperations).not.toHaveBeenCalled()
	})

	test("a delta-length mismatch is refused before the claim", async () => {
		const { svc, internals } = makeService()
		store(internals, "i-1", execPayload([sendTxRequest({ calls: [] })]))
		await expect(svc.approveInteraction("i-1", [])).rejects.toThrow("Invalid id")
		expect(internals.storage.has("i-1")).toBe(true)
	})
})

describe("materializeStoredOperation — estimate and preview read the stored request", () => {
	test("returns the materialized operation completed with the validated fee choice", async () => {
		const { svc, internals } = makeService()
		store(internals, "i-1", execPayload([sendTxRequest({ calls: [{ name: "swap" }] })]))
		const op = await svc.materializeStoredOperation("i-1", 0, { paymentMethod: { kind: "fj" } })
		expect(op).toMatchObject({
			kind: "aztec_sendTx",
			accountAddress: OWNER,
			networkId: "net-1",
			feeSettings: { paymentMethod: { kind: "fj" } },
		})
		await expect(svc.materializeStoredOperation("i-1", 0, { paymentMethod: { kind: "embedded" } })).rejects.toThrow("not selectable")
	})

	test("an unknown id, a non-execution id or an out-of-range index is 'Invalid id'; another profile is 'Wallet locked'", async () => {
		const { svc, internals } = makeService({ id: "p2" })
		store(internals, "i-1", execPayload([sendTxRequest({ calls: [] })]))
		store(internals, "cap", { params: { capabilities: {} }, session: SESSION })
		await expect(svc.materializeStoredOperation("nope", 0)).rejects.toThrow("Invalid id")
		await expect(svc.materializeStoredOperation("cap", 0)).rejects.toThrow("Invalid id")
		await expect(svc.materializeStoredOperation("i-1", 3)).rejects.toThrow("Invalid id")
		await expect(svc.materializeStoredOperation("i-1", 0, { paymentMethod: { kind: "fj" } })).rejects.toThrow("Wallet locked")
	})
})

describe("askFeeAgain — the question a held send asks in its own window", () => {
	const REASK = { fee: "21000000000000000", cap: "16000000000000000", payer: { type: "fj", isProtocol: false } } as const
	const LISTED = [{ consumer: "0xc", caller: "0xd", selector: "0xsel", args: [], innerHash: "0xih", messageHash: "0xmh" }]
	const question = (over: Record<string, unknown> = {}) => ({
		interactionId: "i-1",
		index: 0,
		journalId: "j-1",
		reask: REASK,
		discoveredAuthwits: LISTED,
		deadline: Date.now() + 60_000,
		...over,
	})

	/** An approval whose execution asks `ask` and holds until the test lets it finish. */
	function asking() {
		vi.mocked(chrome.runtime.getURL).mockImplementation((path) => `chrome-extension://nulo/${path}`)
		const h = makeService()
		const window = { settle: (_: unknown) => {}, fail: (_: unknown) => {} }
		const openAndAwait = vi.fn(() => ({
			handleId: "h-fee",
			promise: new Promise((resolve, reject) => Object.assign(window, { settle: resolve, fail: reject })),
		}))
		Object.assign(h.windowManager, { openAndAwait })
		Object.assign(h.internals, { operationJournal: { getOperation: async () => ({ progress: { stage: "queued" } }) } })
		let finish!: () => void
		const asked: Array<Promise<boolean>> = []
		h.internals.executionService.executeOperations.mockImplementation(async () => {
			asked.push(h.svc.askFeeAgain(question() as never))
			await new Promise<void>((resolve) => {
				finish = resolve
			})
			return []
		})
		const feeId = () => [...h.internals.storage.keys()].find((id) => id !== "i-1") as string
		return { ...h, window, openAndAwait, asked, feeId, finish: () => finish() }
	}

	test("opens a window over the approved request, the two figures, its payer and the fee choice, and an accept answers yes", async () => {
		const h = asking()
		const request = sendTxRequest({ calls: [{ name: "swap" }] })
		store(h.internals, "i-1", execPayload([request]))
		await h.svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } }, feeCeiling: REASK.cap }])
		await vi.waitFor(() => expect(h.openAndAwait).toHaveBeenCalledTimes(1))

		const opened = (h.openAndAwait.mock.calls[0] as unknown[])[0] as { url: string; kind: string; timeoutMs: number }
		expect(opened.kind).toBe("fee")
		expect(opened.url).toContain("/windows/fee")
		expect(opened.timeoutMs).toBeGreaterThan(59_000)
		expect(opened.timeoutMs).toBeLessThanOrEqual(60_000)
		const stored = h.internals.storage.get(h.feeId())!
		expect(stored.payload).toEqual({
			feeQuestion: {
				fee: REASK.fee,
				approved: REASK.cap,
				payer: REASK.payer,
				feeSettings: { paymentMethod: { kind: "fj" } },
				discoveredAuthwits: LISTED,
			},
			operation: request,
			session: SESSION,
		})
		expect(stored.hooks).toEqual({ queuedJournalId: "j-1" })

		await h.svc.resolveInteraction(h.feeId(), { accepted: true })
		h.window.settle({ accepted: true })
		expect(await h.asked[0]).toBe(true)
		h.finish()
	})

	test("is no execution request: neither approvable nor materializable", async () => {
		const h = asking()
		store(h.internals, "i-1", execPayload([sendTxRequest({ calls: [] })]))
		await h.svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } }, feeCeiling: REASK.cap }])
		await vi.waitFor(() => expect(h.openAndAwait).toHaveBeenCalledTimes(1))
		await expect(h.svc.approveInteraction(h.feeId(), [])).rejects.toThrow("Invalid id")
		await expect(h.svc.materializeStoredOperation(h.feeId(), 0)).rejects.toThrow("Invalid id")
		expect(h.internals.executionService.executeOperations).toHaveBeenCalledTimes(1)
		h.finish()
	})

	test("any answer but an accept is a no", async () => {
		const h = asking()
		store(h.internals, "i-1", execPayload([sendTxRequest({ calls: [] })]))
		await h.svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } }, feeCeiling: REASK.cap }])
		await vi.waitFor(() => expect(h.openAndAwait).toHaveBeenCalledTimes(1))
		h.window.settle({ accepted: "yes" })
		expect(await h.asked[0]).toBe(false)
		h.finish()
	})

	test("once the approval has finished executing, nothing is asked and the answer is no", async () => {
		const h = asking()
		h.internals.executionService.executeOperations.mockImplementation(async () => [])
		store(h.internals, "i-1", execPayload([sendTxRequest({ calls: [] })]))
		await h.svc.approveInteraction("i-1", [{ feeSettings: { paymentMethod: { kind: "fj" } }, feeCeiling: REASK.cap }])
		await flush()
		expect(await h.svc.askFeeAgain(question() as never)).toBe(false)
		expect(await h.svc.askFeeAgain(question({ interactionId: "nope" }) as never)).toBe(false)
		expect(h.openAndAwait).not.toHaveBeenCalled()
	})
})
