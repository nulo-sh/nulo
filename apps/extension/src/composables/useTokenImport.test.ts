import { ContractNotFoundError, TokenDecimalsOutOfRangeError } from "@nulo/extension-messaging/errors"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ALREADY_EXISTS, INVALID_ADDRESS } from "@/utils/entity-rules"
import { ContentKind } from "@/wallet/services/task/spec"

const openToast = vi.fn()
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast }) }))
const appState: { profile?: { id: string }; network?: { id: string; chainId: number }; account?: { address: string }; scopeEpoch: number } =
	{
		scopeEpoch: 0,
	}
vi.mock("@/stores/app.store", () => ({ useAppStore: () => appState }))

import { contractVerdict, useTokenImport } from "./useTokenImport"

const CONTRACT = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
const TOKEN = { id: 7, chainId: 1, contract: CONTRACT }

/** An event stream whose listeners a case can count. */
function stream() {
	const listeners = new Set<(payload: unknown) => void>()
	return {
		listeners,
		add: (h: (payload: unknown) => void) => listeners.add(h),
		remove: (h: (payload: unknown) => void) => listeners.delete(h),
		invoke: (payload: unknown) => {
			for (const h of [...listeners]) h(payload)
		},
	}
}

function setup() {
	const balanceAdded = stream()
	const taskUpdated = stream()
	const tokenService = {
		getTokens: vi.fn(async () => [] as { contract: string }[]),
		parseTokenInterface: vi.fn(async () => ({ isComplete: true })),
		addToken: vi.fn(async () => TOKEN),
	}
	const tokenBalanceService = { getTokenBalances: vi.fn(async () => [] as unknown[]), onTokenBalanceAdded: balanceAdded }
	const importer = useTokenImport({ tokenService, tokenBalanceService, taskService: { onTaskUpdated: taskUpdated } } as never)
	/** The worker's first balance row for the added token, then its refresh finishing. */
	const landBalance = (error?: string) => {
		balanceAdded.invoke({ id: 70, token: { id: TOKEN.id }, account: "0xacct" })
		taskUpdated.invoke({ content: { kind: ContentKind.BalanceUpdate, tbId: 70 }, finishedAt: 1, error })
	}
	return { importer, tokenService, tokenBalanceService, balanceAdded, landBalance }
}

beforeEach(() => {
	Object.assign(appState, { profile: { id: "p1" }, network: { id: "net-1", chainId: 1 }, account: { address: "0xacct" }, scopeEpoch: 0 })
})
afterEach(() => {
	vi.clearAllMocks()
	vi.useRealTimers()
})

test("contractVerdict: no verdict while empty, then invalid, listed in any case, or none", () => {
	const listed = [{ contract: CONTRACT }]
	expect(contractVerdict("", listed)).toBeNull()
	expect(contractVerdict("not-hex", listed)).toBe(INVALID_ADDRESS)
	expect(contractVerdict(CONTRACT.toUpperCase().replace("0X", "0x"), listed)).toBe(ALREADY_EXISTS)
	expect(contractVerdict(CONTRACT, [])).toBeNull()
})

describe("useTokenImport", () => {
	test("an import parses, adds, waits for the first balance, then toasts once and reports the token", async () => {
		const { importer, tokenService, landBalance } = setup()
		const run = importer.importToken(CONTRACT)
		expect(importer.phase.value).toBe("adding")
		await vi.waitFor(() => expect(importer.phase.value).toBe("loading-balance"))
		expect(tokenService.addToken).toHaveBeenCalledWith("p1", "net-1", "0xacct", { isComplete: true }, { origin: "popup" })
		landBalance()

		expect(await run).toEqual({ kind: "added", token: TOKEN, inScope: true })
		expect(openToast.mock.calls).toEqual([[{ kind: "success", label: "Token added" }]])
		expect(importer.phase.value).toBe("idle")
	})

	test.each([
		["error", "Token added. Couldn't load balance. We'll retry automatically."],
		["timeout", "Token added. Balance will appear in a moment"],
	])("a balance %s still reports the add, with its own toast", async (end, label) => {
		vi.useFakeTimers()
		const { importer, balanceAdded, landBalance } = setup()
		const run = importer.importToken(CONTRACT)
		await vi.waitFor(() => expect(importer.phase.value).toBe("loading-balance"))
		if (end === "error") landBalance("node refused")
		else {
			balanceAdded.invoke({ id: 70, token: { id: TOKEN.id }, account: "0xacct" })
			await vi.advanceTimersByTimeAsync(30_000)
		}
		expect(await run).toEqual({ kind: "added", token: TOKEN, inScope: true })
		expect(openToast).toHaveBeenCalledWith({ kind: "success", label })
	})

	test("a token already synced for the account is reported at once, with no wait", async () => {
		const { importer, tokenBalanceService } = setup()
		tokenBalanceService.getTokenBalances.mockResolvedValueOnce([{ id: 70, updatedAt: 5 }])
		expect(await importer.importToken(CONTRACT)).toEqual({ kind: "added", token: TOKEN, inScope: true })
	})

	test("a token added on another chain is reported out of scope", async () => {
		const { importer, tokenService } = setup()
		tokenService.addToken.mockResolvedValueOnce({ ...TOKEN, chainId: 2 })
		expect(await importer.importToken(CONTRACT)).toEqual({ kind: "added", token: { ...TOKEN, chainId: 2 }, inScope: false })
		expect(openToast).toHaveBeenCalledWith({ kind: "success", label: "Token added" })
	})

	test.each([
		[
			"an incomplete interface",
			() => ({ isComplete: false }),
			"Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard.",
		],
		[
			"no contract at the address",
			() => Promise.reject(new ContractNotFoundError()),
			"There is no token at this address on this network.",
		],
		["any other throw", () => Promise.reject(new Error("pxe down")), "Something went wrong. Try again."],
	])("%s is refused with the popup's sentence, no add and no toast", async (_case, parse, message) => {
		const { importer, tokenService } = setup()
		tokenService.parseTokenInterface.mockImplementationOnce(parse as never)
		expect(await importer.importToken(CONTRACT)).toEqual({ kind: "refused", message, inScope: true })
		expect(tokenService.addToken).not.toHaveBeenCalled()
		expect(openToast).not.toHaveBeenCalled()
		expect(importer.phase.value).toBe("idle")
	})

	test("a token past the decimals bound is refused with the interface sentence, and no toast", async () => {
		const { importer, tokenService } = setup()
		tokenService.addToken.mockRejectedValueOnce(new TokenDecimalsOutOfRangeError())
		expect(await importer.importToken(CONTRACT)).toEqual({
			kind: "refused",
			message: "Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard.",
			inScope: true,
		})
		expect(openToast).not.toHaveBeenCalled()
		expect(importer.phase.value).toBe("idle")
	})

	test("with no account yet the import is refused before any call", async () => {
		const { importer, tokenService } = setup()
		appState.account = undefined
		expect(await importer.importPasted(CONTRACT)).toEqual({
			kind: "refused",
			message: "Account is still loading. Please wait a moment and try again.",
			inScope: true,
		})
		expect(tokenService.getTokens).not.toHaveBeenCalled()
		expect(tokenService.parseTokenInterface).not.toHaveBeenCalled()
	})

	test("importPasted refuses a listed contract in any case before parsing; an unlisted one goes on", async () => {
		const { importer, tokenService } = setup()
		tokenService.getTokens.mockResolvedValue([{ contract: CONTRACT.toUpperCase().replace("0X", "0x") }])
		expect(await importer.importPasted(CONTRACT)).toEqual({ kind: "refused", message: ALREADY_EXISTS, inScope: true })
		expect(tokenService.getTokens).toHaveBeenCalledWith("p1", 1)
		expect(tokenService.parseTokenInterface).not.toHaveBeenCalled()

		tokenService.getTokens.mockResolvedValue([])
		tokenService.parseTokenInterface.mockResolvedValueOnce({ isComplete: false })
		await importer.importPasted(CONTRACT)
		expect(tokenService.parseTokenInterface).toHaveBeenCalledTimes(1)
	})

	test("a second import while one runs reports nothing and sends nothing", async () => {
		const { importer, tokenService } = setup()
		tokenService.parseTokenInterface.mockResolvedValueOnce({ isComplete: false })
		const first = importer.importPasted(CONTRACT)
		expect(await importer.importPasted(CONTRACT)).toEqual({ kind: "aborted" })
		expect(await first).toMatchObject({ kind: "refused" })
		expect(tokenService.getTokens).toHaveBeenCalledTimes(1)
	})

	test("a scope that moves mid-import leaves the add and the refusal out of scope", async () => {
		const { importer, tokenService, landBalance } = setup()
		const run = importer.importToken(CONTRACT)
		await vi.waitFor(() => expect(importer.phase.value).toBe("loading-balance"))
		appState.scopeEpoch = 1
		landBalance()
		expect(await run).toEqual({ kind: "added", token: TOKEN, inScope: false })

		tokenService.parseTokenInterface.mockImplementationOnce(async () => {
			appState.scopeEpoch = 2
			return { isComplete: false }
		})
		expect(await importer.importToken(CONTRACT)).toMatchObject({ kind: "refused", inScope: false })
	})

	test("abort mid-wait reports nothing, toasts nothing and drops its listeners", async () => {
		const { importer, balanceAdded } = setup()
		const run = importer.importToken(CONTRACT)
		await vi.waitFor(() => expect(importer.phase.value).toBe("loading-balance"))
		importer.abort()
		expect(importer.phase.value).toBe("idle")
		expect(await run).toEqual({ kind: "aborted" })
		expect(openToast).not.toHaveBeenCalled()
		expect(balanceAdded.listeners.size).toBe(0)
	})

	test("(BUG PIN) abort is not dispose: a parse refused after it still reports, which the popup clears on its next show", async () => {
		const { importer, tokenService } = setup()
		let reject!: (e: unknown) => void
		tokenService.parseTokenInterface.mockImplementationOnce(() => new Promise((_, r) => (reject = r)) as never)
		const run = importer.importToken(CONTRACT)
		importer.abort()
		reject(new Error("client disconnected"))
		expect(await run).toEqual({ kind: "refused", message: "Something went wrong. Try again.", inScope: true })
	})

	test("dispose is terminal: a parse answered or refused after it sends no add and reports nothing; without it the add goes", async () => {
		const { importer, tokenService } = setup()
		let parsed!: (v: unknown) => void
		tokenService.parseTokenInterface.mockImplementationOnce(() => new Promise((resolve) => (parsed = resolve)) as never)
		const run = importer.importToken(CONTRACT)
		importer.dispose()
		parsed({ isComplete: true })
		expect(await run).toEqual({ kind: "aborted" })
		expect(tokenService.addToken).not.toHaveBeenCalled()
		expect(await importer.importToken(CONTRACT)).toEqual({ kind: "aborted" })

		// The caller's disconnect rejects the call in flight.
		const dropped = setup()
		let reject!: (e: unknown) => void
		dropped.tokenService.parseTokenInterface.mockImplementationOnce(() => new Promise((_, r) => (reject = r)) as never)
		const droppedRun = dropped.importer.importToken(CONTRACT)
		dropped.importer.dispose()
		reject(new Error("client disconnected"))
		expect(await droppedRun).toEqual({ kind: "aborted" })

		// Disposed in the turn between the listed check and the parse.
		const preflight = setup()
		const pasted = preflight.importer.importPasted(CONTRACT)
		queueMicrotask(() => preflight.importer.dispose())
		expect(await pasted).toEqual({ kind: "aborted" })
		expect(preflight.tokenService.getTokens).toHaveBeenCalledTimes(1)
		expect(preflight.tokenService.parseTokenInterface).not.toHaveBeenCalled()

		const control = setup()
		control.tokenBalanceService.getTokenBalances.mockResolvedValueOnce([{ id: 70, updatedAt: 5 }])
		await control.importer.importToken(CONTRACT)
		expect(control.tokenService.addToken).toHaveBeenCalledTimes(1)
	})
})
