/**
 * An approval window's token vocabulary follows the profile's token list after the window opened:
 * an update to one of that profile's tokens reads the list again, an earlier read never lands over a
 * later one, and a disposed window stops listening.
 */
import { describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import type { TokenInfo, TokenUpdated } from "@/wallet/services/token/client"
import { followKnownTokens } from "./operation-display"
import type { DraftUIOperation } from "./types"

const token = (symbol: string) => ({ id: 1, chainId: 1, contract: `0x${"0c".repeat(32)}`, name: symbol, symbol, decimals: 6 }) as TokenInfo
const OPS = [{ network: { chainId: 1 } }] as DraftUIOperation[]

function fakeTokens() {
	const listeners = new Set<(token: TokenUpdated) => void>()
	const getTokens = vi.fn<(profileId: string, chainId: number) => Promise<TokenInfo[]>>()
	const service = {
		getTokens,
		onTokenUpdated: {
			add: (l: (t: TokenUpdated) => void) => listeners.add(l),
			remove: (l: (t: TokenUpdated) => void) => listeners.delete(l),
		},
	}
	const update = (profileId: string) => {
		for (const l of listeners) l({ ...token("USDC"), profileId })
	}
	return { service: service as never, getTokens, listeners, update }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("followKnownTokens", () => {
	test("an update to the profile's tokens reads the list again; another profile's update does not", async () => {
		const { service, getTokens, update } = fakeTokens()
		const known = ref<TokenInfo[]>([])
		const follow = followKnownTokens(service, known)
		getTokens.mockResolvedValueOnce([])
		await follow.start(OPS, "p1")
		expect(getTokens).toHaveBeenCalledExactlyOnceWith("p1", 1)
		update("p2")
		await tick()
		expect(getTokens).toHaveBeenCalledTimes(1)
		getTokens.mockResolvedValueOnce([token("USDC")])
		update("p1")
		await tick()
		expect(known.value.map((t) => t.symbol)).toEqual(["USDC"])
	})

	test("a read an update superseded never lands, and a failed read keeps the list", async () => {
		const { service, getTokens, update } = fakeTokens()
		const known = ref<TokenInfo[]>([])
		const follow = followKnownTokens(service, known)
		let releaseFirst!: (tokens: TokenInfo[]) => void
		getTokens.mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
		getTokens.mockResolvedValueOnce([token("EURC")])
		const first = follow.start(OPS, "p1")
		update("p1")
		await tick()
		expect(known.value.map((t) => t.symbol)).toEqual(["EURC"])
		releaseFirst([])
		await first
		expect(known.value.map((t) => t.symbol)).toEqual(["EURC"])
		getTokens.mockRejectedValueOnce(new Error("locked"))
		update("p1")
		await tick()
		expect(known.value.map((t) => t.symbol)).toEqual(["EURC"])
	})

	test("dispose stops listening; before dispose the window listens", async () => {
		const { service, listeners } = fakeTokens()
		const follow = followKnownTokens(service, ref([]))
		expect(listeners.size).toBe(1)
		follow.dispose()
		expect(listeners.size).toBe(0)
	})
})
