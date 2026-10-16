import { ref, watch, type Ref } from "vue"
import type { TokenInfo, TokenServiceClient } from "@/wallet/services/token/client"
import { createRunFence } from "@/composables/runFence"

export type TokenScope = { profileId: string; chainId: number }

export interface UseScopedTokensOptions {
	tokenService: Pick<TokenServiceClient, "getTokens" | "onTokenAdded" | "onTokenUpdated">
	/** The profile and chain whose tokens to hold (what `getTokens` reads by); `undefined` while
	 *  either is unknown. */
	scope: () => TokenScope | undefined
}

export interface UseScopedTokensResult {
	/** The scope's tokens; empty while the scope is unknown or changing. */
	tokens: Ref<TokenInfo[]>
	/** Whether the current scope's first read has settled, landed or failed: until then an empty
	 *  `tokens` says nothing about which tokens exist. False again on a scope change. */
	loaded: Readonly<Ref<boolean>>
	tokenById: (id: number | undefined) => TokenInfo | undefined
	/** Re-read for the current scope. A failed read keeps the current list. */
	reload: () => Promise<void>
	dispose: () => void
}

/**
 * The current profile and chain's tokens, the one lookup Home's and History's activity rows read.
 * The parent owns the client's connect and disconnect, loads once on mount with `reload()`, and
 * calls `dispose()` after disconnecting.
 */
export function useScopedTokens({ tokenService, scope }: UseScopedTokensOptions): UseScopedTokensResult {
	const tokens = ref<TokenInfo[]>([])
	const loaded = ref(false)
	// A read superseded by a later one, or by a scope change, never lands.
	const fence = createRunFence()
	let disposed = false

	const reload = async (): Promise<void> => {
		// A request on a disconnected client would open its port again.
		if (disposed) return
		const isCurrent = fence.begin()
		const s = scope()
		if (!s) return
		let fetched: TokenInfo[]
		try {
			fetched = await tokenService.getTokens(s.profileId, s.chainId)
		} catch (error) {
			// A port that cannot open rejects at once; the list is a label lookup, so keep what it holds.
			console.debug("token lookup failed", { error })
			if (!disposed && isCurrent()) loaded.value = true
			return
		}
		if (disposed || !isCurrent()) return
		tokens.value = fetched
		loaded.value = true
	}

	const scopeKey = () => {
		const s = scope()
		return s ? `${s.profileId} ${s.chainId}` : ""
	}
	// `sync`, so a new scope never paints the previous one's tokens.
	const stopScopeWatch = watch(
		scopeKey,
		() => {
			tokens.value = []
			loaded.value = false
			void reload()
		},
		{ flush: "sync" },
	)
	tokenService.onTokenAdded.add(reload)
	tokenService.onTokenUpdated.add(reload)

	const tokenById = (id: number | undefined) => (id === undefined ? undefined : tokens.value.find((t) => t.id === id))

	const dispose = () => {
		if (disposed) return
		disposed = true
		stopScopeWatch()
		tokenService.onTokenAdded.remove(reload)
		tokenService.onTokenUpdated.remove(reload)
	}

	return { tokens, loaded, tokenById, reload, dispose }
}
