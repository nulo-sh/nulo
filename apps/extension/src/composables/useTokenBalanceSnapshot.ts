import { type Ref, ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import { type LiveTokenScope, forChain, isActiveScopeRow } from "@/utils/token-order"
import type { TokenBalanceInfo, TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"

/** `loading` and `unavailable` both mean "not known yet": only `loaded` may say the list is empty. */
export type TokenBalanceSnapshotState = "loading" | "unavailable" | "loaded"

/** How live events land; each default is the snapshot's own rule. */
interface TokenBalanceEventRules {
	/** An in-scope add for a listed id keeps the listed row (the default) or replaces it; `append`
	 *  lists every add for the active account as it comes, from any chain and for a listed id too. */
	added?: "keep" | "replace" | "append"
	/** An in-scope update for an unseen id is listed at once rather than at the next read. */
	insertUnseenUpdated?: boolean
}

interface TokenBalanceSnapshotDeps<T> extends TokenBalanceEventRules {
	/** Connected and disconnected by the parent; the snapshot only requests and listens. */
	client: Pick<TokenBalanceServiceClient, "getTokenBalances" | "onConnected">
	live: LiveTokenScope
	rows: Ref<T[]>
	/** Omitted by a parent that never reads through the hook. */
	state?: Ref<TokenBalanceSnapshotState>
	/** Captured at run start; a run whose fence goes false lands nothing. For a parent whose scope
	 *  change awaits before refetching, so the run's own generation cannot fence the old scope yet. */
	scopeFence?: () => () => boolean
	/** Applied to each landed or added row, after the chain filter. */
	mapRow?: (row: TokenBalanceInfo) => T
	/** Every run reads `loading`, so a refused one reads `unavailable` over rows already shown. */
	loadingOnRefresh?: boolean
	/** A refused read is retried once on a timer (the default); off, only a reconnect or a scope
	 *  change reads again. */
	retryOnReject?: boolean
	/** An in-scope event during a run makes it read again rather than land (the default). */
	refetchWhenDirty?: boolean
	/** Which connects read again: each after the first, which the first request opened (the
	 *  default), every one, or none. */
	reconnect?: "after-first" | "every" | "off"
	/** Runs on a counted reconnect in place of the read, for a parent that reloads its whole view. */
	onReconnect?: () => void
}

/** A rejected snapshot is retried once on a timer; after that a reconnect or a scope change retries. */
const RETRY_MS = 2_000

function tokenBalanceEvents<T>(
	live: LiveTokenScope,
	rows: Ref<T[]>,
	mapRow: ((row: TokenBalanceInfo) => T) | undefined,
	markDirty: () => void,
	rules: TokenBalanceEventRules,
) {
	const inActiveScope = (tb: TokenBalanceInfo) => isActiveScopeRow(live, tb)
	const indexOf = (id: unknown) => rows.value.findIndex((row) => (row as { id: unknown }).id === id)
	const mapped = (tb: TokenBalanceInfo) => (mapRow ? mapRow(tb) : (tb as T))

	/** An add carries its row as created, so a listed id already holds that row or a newer one. */
	function onBalanceAdded(tb: TokenBalanceInfo) {
		if (rules.added === "append") {
			if (tb.account === live.account?.address) rows.value.push(mapped(tb))
			return
		}
		if (!inActiveScope(tb)) return
		markDirty()
		const idx = indexOf(tb.id)
		if (idx === -1) rows.value.push(mapped(tb))
		else if (rules.added === "replace") rows.value[idx] = mapped(tb)
	}

	function onBalanceUpdated(tb: TokenBalanceInfo) {
		const inScope = inActiveScope(tb)
		if (inScope) markDirty()
		const idx = indexOf(tb.id)
		if (idx !== -1) rows.value[idx] = tb as T
		else if (inScope && rules.insertUnseenUpdated) rows.value.push(mapped(tb))
	}

	function onBalanceDeleted(tb: TokenBalanceInfo) {
		if (inActiveScope(tb)) markDirty()
		rows.value = rows.value.filter((row) => (row as { id: unknown }).id !== tb.id)
	}

	return { inActiveScope, onBalanceAdded, onBalanceUpdated, onBalanceDeleted }
}

/**
 * The active account's token-balance rows on the active chain, fetched latest-wins. A snapshot in
 * flight is older than any in-scope event that lands meanwhile: the event marks it dirty and the
 * run refetches instead of overwriting the event. A rejection never reads as an empty list, and a
 * refetch within a scope keeps the rows already shown; clearing them on a scope change is the
 * parent's. The parent subscribes the returned handlers and calls `dispose()` before it
 * disconnects the client.
 */
export function useTokenBalanceSnapshot<T = TokenBalanceInfo>(deps: TokenBalanceSnapshotDeps<T>) {
	const { client, live, rows, scopeFence, mapRow, reconnect = "after-first" } = deps
	const state = deps.state ?? ref<TokenBalanceSnapshotState>("loading")
	const fence = createRunFence()
	let dirty = false
	let retryTimer: ReturnType<typeof setTimeout> | undefined
	// The first connect is the one the first request opened. A later one is a port drop: events
	// may have been missed and the request in flight was rejected, so resnapshot.
	let connectsSeen = 0

	const markDirty = () => {
		dirty = true
	}

	function settleRejected(isTimedRetry: boolean) {
		if (state.value !== "loaded") state.value = "unavailable"
		if (!isTimedRetry && deps.retryOnReject !== false) retryTimer = setTimeout(() => void fetchTokenBalances(true), RETRY_MS)
	}

	function land(fetched: TokenBalanceInfo[], chainId: number | undefined) {
		const landed = forChain(fetched, chainId)
		rows.value = mapRow ? landed.map(mapRow) : (landed as T[])
		state.value = "loaded"
	}

	async function fetchTokenBalances(isTimedRetry = false): Promise<void> {
		const inScope = scopeFence?.()
		const isCurrent = fence.begin()
		const superseded = () => (inScope && !inScope()) || !isCurrent()
		clearTimeout(retryTimer)
		dirty = false
		if (deps.loadingOnRefresh) state.value = "loading"
		const address = live.account?.address
		const chainId = live.network?.chainId
		if (!address) {
			rows.value = []
			state.value = "loaded"
			return
		}
		let fetched: TokenBalanceInfo[]
		try {
			fetched = await client.getTokenBalances(undefined, address)
		} catch {
			if (!superseded()) settleRejected(isTimedRetry)
			return
		}
		if (superseded()) return
		if (dirty && deps.refetchWhenDirty !== false) return fetchTokenBalances()
		land(fetched, chainId)
	}

	function onReconnected() {
		connectsSeen++
		if (reconnect !== "every" && connectsSeen < 2) return
		if (deps.onReconnect) deps.onReconnect()
		else void fetchTokenBalances()
	}
	if (reconnect !== "off") client.onConnected.add(onReconnected)

	/** Drops the run in flight and the pending retry; the next run starts clean. */
	function invalidate() {
		fence.invalidate()
		clearTimeout(retryTimer)
	}

	/** For a parent mounted once and shown many times: its next show's first connect is again its own. */
	function reset() {
		invalidate()
		connectsSeen = 0
	}

	function dispose() {
		invalidate()
		if (reconnect !== "off") client.onConnected.remove(onReconnected)
	}

	return {
		fetchTokenBalances,
		markDirty,
		...tokenBalanceEvents(live, rows, mapRow, markDirty, deps),
		invalidate,
		reset,
		dispose,
	}
}
