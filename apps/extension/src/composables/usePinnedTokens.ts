import type { EventHandler } from "@nulo/wallet-core/utils"
import { createRunFence } from "@/composables/runFence"
import { type ComputedRef, computed, ref } from "vue"
import { pinnedTokensKey } from "@/utils/profile-ui-keys"
import { PINNED_TOKENS_MAX, PINNED_TOKENS_MAX_CHAINS, type PinMap } from "@/utils/pinned-tokens"
import type { TokenDeleted } from "@/wallet/services/token/spec"

export type PinScope = { profileId: string; chainId: number }
export type PinResult = "pinned" | "full" | "already" | "stale"

/** The store's profile and chain as a pin scope, or undefined while either is missing. */
export const pinScopeOf = (profileId: string | undefined, chainId: number | undefined): PinScope | undefined =>
	profileId !== undefined && chainId !== undefined ? { profileId, chainId } : undefined

/** The pin I/O the parent's preference client serves: each map is sanitized by the service. */
export type PinStore = {
	getPinnedTokens(profileId: string): Promise<PinMap>
	setPinnedTokens(profileId: string, map: PinMap): Promise<boolean>
}

/** The chain's list with dangling contracts dropped when the token set is known. */
const liveList = (list: string[], known: ReadonlySet<string> | undefined) => {
	if (!known) return [...list]
	const lower = new Set([...known].map((c) => c.toLowerCase()))
	return list.filter((c) => lower.has(c))
}

/** Evict other chains, in key iteration order, until the map fits — the chain being written survives. */
const withChainBudget = (next: PinMap, keep: string) => {
	for (const key of Object.keys(next)) {
		if (Object.keys(next).length <= PINNED_TOKENS_MAX_CHAINS) break
		if (key !== keep) delete next[key]
	}
	return next
}

const setChain = (next: PinMap, chainKey: string, list: string[]) => {
	if (list.length > 0) next[chainKey] = list
	else delete next[chainKey]
	return next
}

/**
 * Writes are serialised per storage key across every instance in this context: an unmounted
 * page's pending write and a newly mounted page's write to the same profile never interleave.
 */
const queues = new Map<string, Promise<unknown>>()
const enqueue = <T>(key: string, op: () => Promise<T>): Promise<T> => {
	const prev = queues.get(key) ?? Promise.resolve()
	const run = prev.then(op, op)
	const tail = run
		.catch(() => undefined)
		.then(() => {
			// The last op on this key releases its entry; a newer op that has since taken over keeps it.
			if (queues.get(key) === tail) queues.delete(key)
		})
	queues.set(key, tail)
	return run
}

type WriteCtx = {
	scope: PinScope
	read: () => Promise<PinMap>
	live: () => boolean
	known: () => Promise<ReadonlySet<string> | undefined>
	write: (next: PinMap, unless: () => boolean) => Promise<boolean>
}

async function pinOp(ctx: WriteCtx, contract: string): Promise<PinResult> {
	if (!ctx.live()) return "stale"
	const c = contract.toLowerCase()
	const chainKey = String(ctx.scope.chainId)
	const next = await ctx.read()
	if (!ctx.live()) return "stale"
	const stored = next[chainKey] ?? []
	if (stored.includes(c)) return "already"
	const known = await ctx.known()
	if (!ctx.live()) return "stale"
	const list = liveList(stored, known)
	if (list.length >= PINNED_TOKENS_MAX) return "full"
	list.push(c)
	const written = await ctx.write(withChainBudget(setChain(next, chainKey, list), chainKey), () => !ctx.live())
	return written ? "pinned" : "stale"
}

async function unpinOp(ctx: WriteCtx, contract: string): Promise<void> {
	if (!ctx.live()) return
	const c = contract.toLowerCase()
	const chainKey = String(ctx.scope.chainId)
	const next = await ctx.read()
	if (!ctx.live()) return
	const stored = next[chainKey] ?? []
	const known = await ctx.known()
	if (!ctx.live()) return
	const list = liveList(stored, known).filter((x) => x !== c)
	// Nothing removed and nothing pruned: skip the write so no onChanged round-trip fires.
	if (list.length === stored.length) return
	await ctx.write(setChain(next, chainKey, list), () => !ctx.live())
}

export interface UsePinnedTokensDeps {
	/**
	 * The parent's token client, when it has one: the composable only subscribes to deletions, and
	 * one subscriber anywhere is enough — a dangling pin is never displayed and is pruned by the
	 * next write, so read-only surfaces may omit it.
	 */
	tokenService?: { onTokenDeleted: Pick<EventHandler<TokenDeleted>, "add" | "remove"> }
	/** The parent's connected preference client. */
	preferences: PinStore
	getScope: () => PinScope | undefined
	/**
	 * The current chain's token contracts (any case), read at WRITE time so a token added elsewhere
	 * since mount still counts. `undefined` = not loaded: the cap counts stored entries and nothing
	 * is pruned.
	 */
	knownContracts: () => Promise<ReadonlySet<string> | undefined> | ReadonlySet<string> | undefined
}

/**
 * Per-profile "Pin to Home" state, kept by the worker's preference service. Every write captures
 * its scope and requires it to equal the store's at each checkpoint after an await (so a scope that
 * changed and changed back still lands, on the scope it captured); after `dispose()` an ordinary
 * write stops at its next checkpoint, while a queued deletion cleanup may still finish. Two contexts
 * writing at once are last-writer-wins on the whole map (accepted). The parent calls `refresh()` on
 * a profile switch and `dispose()` on unmount.
 */
export function usePinnedTokens(deps: UsePinnedTokensDeps) {
	const map = ref<PinMap>({})
	const loadedProfile = ref<string | undefined>()
	const fence = createRunFence()
	let disposed = false

	const scopeStillIs = (scope: PinScope | undefined): scope is PinScope => {
		const now = deps.getScope()
		return scope !== undefined && now !== undefined && now.profileId === scope.profileId && now.chainId === scope.chainId
	}

	/** `unless` is read right before the call; `false` = skipped or refused. */
	const writeMap = async (profileId: string, next: PinMap, unless?: () => boolean) => {
		if (unless?.()) return false
		const written = await deps.preferences.setPinnedTokens(profileId, next)
		if (written && !disposed && loadedProfile.value === profileId) map.value = next
		return written
	}

	const pinnedContracts: ComputedRef<ReadonlySet<string>> = computed(() => {
		const scope = deps.getScope()
		if (!scope || loadedProfile.value !== scope.profileId) return new Set<string>()
		return new Set(map.value[String(scope.chainId)] ?? [])
	})

	const isPinned = (contract: string) => pinnedContracts.value.has(contract.toLowerCase())

	/** Only the latest refresh may land; an older read resolving late, or one after dispose, is dropped. */
	const refresh = async () => {
		const isCurrent = fence.begin()
		const scope = deps.getScope()
		if (!scope) {
			map.value = {}
			loadedProfile.value = undefined
			return
		}
		const next = await deps.preferences.getPinnedTokens(scope.profileId)
		if (disposed || !isCurrent() || deps.getScope()?.profileId !== scope.profileId) return
		map.value = next
		loadedProfile.value = scope.profileId
	}

	const writeCtx = (scope: PinScope): WriteCtx => ({
		scope,
		read: () => deps.preferences.getPinnedTokens(scope.profileId),
		live: () => !disposed && scopeStillIs(scope),
		known: async () => deps.knownContracts(),
		write: (next, unless) => writeMap(scope.profileId, next, unless),
	})

	const pin = (contract: string): Promise<PinResult> => {
		const scope = deps.getScope()
		if (!scope) return Promise.resolve("stale")
		return enqueue(pinnedTokensKey(scope.profileId), () => pinOp(writeCtx(scope), contract))
	}

	const unpin = (contract: string): Promise<void> => {
		const scope = deps.getScope()
		if (!scope) return Promise.resolve()
		return enqueue(pinnedTokensKey(scope.profileId), () => unpinOp(writeCtx(scope), contract))
	}

	/** Deletion cleanup touches ONLY the event's own profile + chain entry, and never prunes. */
	const onTokenDeleted = (token: TokenDeleted) => {
		void enqueue(pinnedTokensKey(token.profileId), async () => {
			const c = token.contract.toLowerCase()
			const chainKey = String(token.chainId)
			const next = await deps.preferences.getPinnedTokens(token.profileId)
			const list = next[chainKey]
			if (!list?.includes(c)) return
			await writeMap(
				token.profileId,
				setChain(
					next,
					chainKey,
					list.filter((x) => x !== c),
				),
			)
		})
	}
	deps.tokenService?.onTokenDeleted.add(onTokenDeleted)

	/** Another context wrote this profile's key: re-read rather than trust the event's value. */
	const onChanged = (changes: Record<string, unknown>, area: string) => {
		const profileId = loadedProfile.value ?? deps.getScope()?.profileId
		if (area !== "local" || !profileId || !(pinnedTokensKey(profileId) in changes)) return
		void refresh()
	}
	chrome.storage.onChanged.addListener(onChanged)

	const dispose = () => {
		disposed = true
		chrome.storage.onChanged.removeListener(onChanged)
		deps.tokenService?.onTokenDeleted.remove(onTokenDeleted)
	}

	return { pinnedContracts, isPinned, pin, unpin, refresh, dispose }
}
