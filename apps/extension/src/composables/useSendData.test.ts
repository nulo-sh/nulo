import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import { effectScope, nextTick, reactive, ref, watch } from "vue"
import type { TokenBalanceSnapshotState } from "@/composables/useTokenBalanceSnapshot"
import type { Contact } from "@/wallet/services/contact/client"
import type { OperationRecord } from "@/wallet/services/operation-journal/client"
import type { TokenInfo } from "@/wallet/services/token/client"
import { useSendData } from "./useSendData"

const token = (id: number) => ({ id, symbol: `T${id}` }) as unknown as TokenInfo
const contact = (id: number) => ({ id, name: `c${id}`, address: `0x${id}` }) as unknown as Contact
const op = (id: string) => ({ id }) as unknown as OperationRecord

function setup() {
	const tokenService = { getTokens: vi.fn<(profileId?: string, chainId?: number) => Promise<TokenInfo[]>>() }
	const contactService = { getContacts: vi.fn<() => Promise<Contact[]>>() }
	const balances = { invalidate: vi.fn(), fetchTokenBalances: vi.fn<() => Promise<boolean>>(async () => true) }
	const tokenBalances = ref<unknown[]>([])
	const balancesState = ref<TokenBalanceSnapshotState>("loaded")
	const live = reactive({
		profile: { id: "p1" } as { id: string } | null,
		network: { id: "n1", chainId: 7 } as { id: string; chainId: number } | null,
		account: { address: "0xa" } as { address: string } | null,
	})
	const readPastSends = vi.fn<(profileId: string, accountAddress: string) => Promise<OperationRecord[]>>(async () => [])
	const onLoaded = vi.fn<(tokens: TokenInfo[]) => void>()
	const data = useSendData({ tokenService, contactService, balances, tokenBalances, balancesState, live, readPastSends, onLoaded })
	return { tokenService, contactService, balances, tokenBalances, balancesState, live, readPastSends, onLoaded, data }
}

function answer(h: ReturnType<typeof setup>, tokens = [token(1)], contacts = [contact(1)], ops = [op("o1")]) {
	h.tokenService.getTokens.mockResolvedValue(tokens)
	h.contactService.getContacts.mockResolvedValue(contacts)
	h.readPastSends.mockResolvedValue(ops)
}

describe("useSendData", () => {
	test("reads the four lists together, writes them, then hands the token list to onLoaded once", async () => {
		const h = setup()
		answer(h)
		h.onLoaded.mockImplementation(() => {
			expect(h.data.tokens.value).toEqual([token(1)])
			expect(h.data.contacts.value).toEqual([contact(1)])
			expect(h.data.journalOps.value).toEqual([op("o1")])
		})
		await h.data.refetch()
		expect(h.tokenService.getTokens).toHaveBeenCalledWith("p1", 7)
		expect(h.readPastSends).toHaveBeenCalledWith("p1", "0xa")
		expect(h.onLoaded).toHaveBeenCalledOnce()
		expect(h.onLoaded).toHaveBeenCalledWith([token(1)])
		expect(h.data.tokensLoading.value).toBe(false)
		expect(h.data.tokensFailed.value).toBe(false)
	})

	test("starts every read at once and lands nothing until the last one answers", async () => {
		const h = setup()
		answer(h)
		const contacts = deferred<Contact[]>()
		h.contactService.getContacts.mockReturnValue(contacts.promise)
		const run = h.data.refetch()
		expect(h.tokenService.getTokens).toHaveBeenCalledOnce()
		expect(h.balances.fetchTokenBalances).toHaveBeenCalledOnce()
		expect(h.contactService.getContacts).toHaveBeenCalledOnce()
		expect(h.readPastSends).toHaveBeenCalledOnce()
		await nextTick()
		expect(h.data.tokens.value).toEqual([])
		expect(h.onLoaded).not.toHaveBeenCalled()
		contacts.resolve([contact(2)])
		await run
		expect(h.data.contacts.value).toEqual([contact(2)])
		expect(h.onLoaded).toHaveBeenCalledOnce()
	})

	test("onLoaded runs in the commit's task, before a watcher on the tokens sees the commit", async () => {
		const h = setup()
		answer(h)
		const tokens = deferred<TokenInfo[]>()
		h.tokenService.getTokens.mockReturnValue(tokens.promise)
		const order: string[] = []
		h.onLoaded.mockImplementation(() => order.push("onLoaded"))
		const scope = effectScope()
		scope.run(() => watch(h.data.tokens, () => order.push("watcher")))
		const run = h.data.refetch()
		await nextTick()
		order.length = 0
		tokens.resolve([token(1)])
		await run
		await nextTick()
		expect(order).toEqual(["onLoaded", "watcher"])
		scope.stop()
	})

	test("a newer fetch supersedes an older one: the older answer never lands", async () => {
		const h = setup()
		const first = deferred<TokenInfo[]>()
		answer(h)
		h.tokenService.getTokens.mockReturnValueOnce(first.promise).mockResolvedValueOnce([token(2)])
		const older = h.data.refetch()
		await h.data.refetch()
		first.resolve([token(1)])
		await older
		expect(h.data.tokens.value).toEqual([token(2)])
		expect(h.onLoaded).toHaveBeenCalledOnce()
		expect(h.onLoaded).toHaveBeenCalledWith([token(2)])
	})

	test("with no complete identity it reads nothing and empties every list", async () => {
		const h = setup()
		h.data.tokens.value = [token(1)]
		h.data.contacts.value = [contact(1)]
		h.data.journalOps.value = [op("o1")]
		h.tokenBalances.value = [{}]
		h.data.tokensFailed.value = true
		h.live.account = null
		await h.data.refetch()
		expect(h.balances.invalidate).toHaveBeenCalledOnce()
		expect(h.balancesState.value).toBe("loading")
		expect(h.data.tokensFailed.value).toBe(false)
		expect(h.tokenService.getTokens).not.toHaveBeenCalled()
		expect(h.balances.fetchTokenBalances).not.toHaveBeenCalled()
		expect(h.contactService.getContacts).not.toHaveBeenCalled()
		expect(h.readPastSends).not.toHaveBeenCalled()
		expect([h.data.tokens.value, h.data.contacts.value, h.data.journalOps.value, h.tokenBalances.value]).toEqual([[], [], [], []])
		expect(h.data.tokensLoading.value).toBe(false)
		expect(h.onLoaded).not.toHaveBeenCalled()
	})

	test("clears tokens, balances and past sends before reading, marks balances loading, and keeps contacts", () => {
		const h = setup()
		answer(h)
		h.tokenService.getTokens.mockReturnValue(new Promise(() => {}))
		h.data.tokens.value = [token(1)]
		h.data.contacts.value = [contact(1)]
		h.data.journalOps.value = [op("o1")]
		h.tokenBalances.value = [{}]
		void h.data.refetch()
		expect(h.balances.invalidate).toHaveBeenCalledOnce()
		expect(h.balancesState.value).toBe("loading")
		expect([h.data.tokens.value, h.data.journalOps.value, h.tokenBalances.value]).toEqual([[], [], []])
		expect(h.data.contacts.value).toEqual([contact(1)])
		expect(h.data.tokensLoading.value).toBe(true)
	})

	test("a token change during the fetch reads the tokens again before the lists land", async () => {
		const h = setup()
		answer(h)
		const first = deferred<TokenInfo[]>()
		h.tokenService.getTokens.mockReturnValueOnce(first.promise).mockResolvedValueOnce([token(1), token(3)])
		const run = h.data.refetch()
		h.data.onTokensChanged()
		first.resolve([token(1)])
		await run
		expect(h.tokenService.getTokens).toHaveBeenCalledTimes(2)
		expect(h.data.tokens.value).toEqual([token(1), token(3)])
		expect(h.onLoaded).toHaveBeenCalledWith([token(1), token(3)])
	})

	test("a refused read fails the fetch; a refused balance read fails it too", async () => {
		const h = setup()
		answer(h)
		h.contactService.getContacts.mockRejectedValueOnce(new Error("contacts refused"))
		await expect(h.data.refetch()).rejects.toThrow("contacts refused")
		expect(h.data.tokensFailed.value).toBe(true)
		expect(h.data.tokensLoading.value).toBe(false)
		h.balances.fetchTokenBalances.mockResolvedValueOnce(false)
		const again = h.data.refetch()
		expect(h.data.tokensFailed.value).toBe(false)
		await expect(again).rejects.toThrow("token balance read refused")
		expect(h.data.tokensFailed.value).toBe(true)
		expect(h.onLoaded).not.toHaveBeenCalled()
	})

	test("a superseded fetch's refusal marks nothing and ends no loading", async () => {
		const h = setup()
		answer(h)
		const older = deferred<Contact[]>()
		const newer = deferred<Contact[]>()
		h.contactService.getContacts.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
		const first = h.data.refetch()
		const second = h.data.refetch()
		older.reject(new Error("late refusal"))
		await expect(first).rejects.toThrow("late refusal")
		expect(h.data.tokensFailed.value).toBe(false)
		expect(h.data.tokensLoading.value).toBe(true)
		newer.resolve([])
		await second
		expect(h.data.tokensLoading.value).toBe(false)
	})

	test("a token change after a refused fetch runs the whole fetch again; otherwise it re-reads only the tokens", async () => {
		const h = setup()
		answer(h)
		h.contactService.getContacts.mockRejectedValueOnce(new Error("refused"))
		await expect(h.data.refetch()).rejects.toThrow("refused")
		h.data.onTokensChanged()
		await vi.waitFor(() => expect(h.onLoaded).toHaveBeenCalledOnce())
		expect(h.contactService.getContacts).toHaveBeenCalledTimes(2)
		h.tokenService.getTokens.mockResolvedValue([token(4)])
		h.data.onTokensChanged()
		await vi.waitFor(() => expect(h.data.tokens.value).toEqual([token(4)]))
		expect(h.contactService.getContacts).toHaveBeenCalledTimes(2)
		expect(h.onLoaded).toHaveBeenCalledOnce()
	})

	test("a token re-read begun before an identity fetch never lands", async () => {
		const h = setup()
		answer(h, [token(2)])
		const reread = deferred<TokenInfo[]>()
		h.tokenService.getTokens.mockReturnValueOnce(reread.promise)
		const late = h.data.reloadTokens()
		await h.data.refetch()
		reread.resolve([token(9)])
		await late
		expect(h.data.tokens.value).toEqual([token(2)])
	})

	test("dispose ends the fetch in flight: nothing lands, onLoaded never runs, nothing is marked", async () => {
		const h = setup()
		answer(h)
		const tokens = deferred<TokenInfo[]>()
		h.tokenService.getTokens.mockReturnValue(tokens.promise)
		const run = h.data.refetch()
		h.data.dispose()
		tokens.resolve([token(1)])
		await run
		expect(h.data.tokens.value).toEqual([])
		expect(h.data.contacts.value).toEqual([])
		expect(h.onLoaded).not.toHaveBeenCalled()
		expect(h.data.tokensLoading.value).toBe(true)
		expect(h.data.tokensFailed.value).toBe(false)
	})

	test("contact events add and update in place, and a delete swaps the list", () => {
		const h = setup()
		const list = [contact(1)]
		h.data.contacts.value = list
		const before = h.data.contacts.value
		h.data.contactEvents.onAdded(contact(2))
		h.data.contactEvents.onUpdated({ ...contact(1), name: "renamed" } as Contact)
		expect(h.data.contacts.value).toBe(before)
		expect(h.data.contacts.value.map((c) => c.name)).toEqual(["renamed", "c2"])
		h.data.contactEvents.onDeleted(contact(2))
		expect(h.data.contacts.value).not.toBe(before)
		expect(h.data.contacts.value.map((c) => c.id)).toEqual([1])
	})

	test("onReadFailed logs the refusal under a named key at debug", () => {
		const h = setup()
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const error = new Error("refused")
		h.data.onReadFailed(error)
		expect(debug).toHaveBeenCalledWith("send page read failed", { error })
		debug.mockRestore()
	})
})
