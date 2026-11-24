import { type Ref, ref, type ShallowRef, shallowRef } from "vue"
import { createRunFence, type RunFence } from "@/composables/runFence"
import type { TokenBalanceSnapshotState, useTokenBalanceSnapshot } from "@/composables/useTokenBalanceSnapshot"
import { entityListReducers } from "@/utils/entity-list"
import type { Contact, ContactServiceClient } from "@/wallet/services/contact/client"
import type { OperationRecord } from "@/wallet/services/operation-journal/client"
import type { TokenInfo, TokenServiceClient } from "@/wallet/services/token/client"

interface SendIdentity {
	profile?: { id: string } | null
	network?: { id: string; chainId: number } | null
	account?: { address: string } | null
}

interface SendDataDeps {
	/** Connected and disconnected by the page; the hook only reads. */
	tokenService: Pick<TokenServiceClient, "getTokens">
	contactService: Pick<ContactServiceClient, "getContacts">
	/** The page's balance snapshot, and the rows and state it writes. */
	balances: Pick<ReturnType<typeof useTokenBalanceSnapshot>, "invalidate" | "fetchTokenBalances">
	tokenBalances: Ref<unknown[]>
	balancesState: Ref<TokenBalanceSnapshotState>
	live: SendIdentity
	/** This account's succeeded transfers; it opens and closes its own client. */
	readPastSends: (profileId: string, accountAddress: string) => Promise<OperationRecord[]>
	/** Runs in the task that commits a current fetch, before any watcher sees the new lists. */
	onLoaded: (tokens: TokenInfo[]) => void
}

interface SendDataState {
	tokens: Ref<TokenInfo[]>
	tokensLoading: Ref<boolean>
	tokensFailed: Ref<boolean>
	contacts: Ref<Contact[]>
	journalOps: ShallowRef<OperationRecord[]>
	identityFetches: RunFence
	/** A re-read lands only if no re-read or identity fetch began after it. */
	tokenReads: RunFence
	/** A token event while a fetch reads makes that fetch read the tokens again. */
	tokensChangedDuringLoad: boolean
}

const onReadFailed = (error: unknown) => console.debug("send page read failed", { error })

/** Through the snapshot, so an event that outlives the read is never overwritten by it. A refused
 *  read fails the identity fetch at once, as a refused token or contact read does. */
async function readBalances(balances: SendDataDeps["balances"]) {
	if (!(await balances.fetchTokenBalances())) throw new Error("token balance read refused")
}

/** One identity fetch: a newer one supersedes it, and only the current one ends `tokensLoading` or
 *  marks the fetch failed. */
async function fetchIdentity(s: SendDataState, deps: SendDataDeps) {
	const { tokens, tokensLoading, tokensFailed, contacts, journalOps } = s
	const { tokenService, contactService, balances, tokenBalances, balancesState, live } = deps
	const isCurrent = s.identityFetches.begin()
	// A reconnect's re-read or retry begun for the previous identity must not land after this.
	balances.invalidate()
	balancesState.value = "loading"
	s.tokenReads.invalidate()
	tokensFailed.value = false
	if (!live.profile?.id || !live.network?.id || !live.account?.address) {
		if (isCurrent()) {
			tokens.value = []
			tokenBalances.value = []
			contacts.value = []
			journalOps.value = []
			tokensLoading.value = false
		}
		return
	}
	const profileId = live.profile.id
	const chainId = live.network.chainId
	// Cleared before the read, so a switch never shows the previous identity's token or balance.
	tokens.value = []
	tokenBalances.value = []
	journalOps.value = []
	tokensLoading.value = true
	s.tokensChangedDuringLoad = false
	try {
		const [first, , c, ops] = await Promise.all([
			tokenService.getTokens(profileId, chainId),
			readBalances(balances),
			contactService.getContacts(),
			deps.readPastSends(profileId, live.account.address),
		])
		let t = first
		while (s.tokensChangedDuringLoad && isCurrent()) {
			s.tokensChangedDuringLoad = false
			t = await tokenService.getTokens(profileId, chainId)
		}
		if (!isCurrent()) return
		tokens.value = t
		contacts.value = c
		journalOps.value = ops
		deps.onLoaded(t)
	} catch (error) {
		if (isCurrent()) tokensFailed.value = true
		throw error
	} finally {
		if (isCurrent()) tokensLoading.value = false
	}
}

/**
 * Send's identity-scoped lists: the current profile's tokens on the current chain, the account's
 * balances through the page's snapshot, the profile's contacts and the account's past sends, read
 * together behind one barrier. The page constructs and disconnects the clients, subscribes the
 * returned handlers, and calls `dispose()` in its unmount slot.
 */
export function useSendData(deps: SendDataDeps) {
	const { tokenService, live } = deps
	const state: SendDataState = {
		tokens: ref([]),
		/** True while the current identity's tokens are being read; the token card waits on it. */
		tokensLoading: ref(true),
		/** The current identity's fetch was refused; the token card offers a Retry. */
		tokensFailed: ref(false),
		contacts: ref([]),
		/** This account's journal, read with each identity load. */
		journalOps: shallowRef([]),
		identityFetches: createRunFence(),
		tokenReads: createRunFence(),
		tokensChangedDuringLoad: false,
	}
	const { tokens, tokensLoading, tokensFailed } = state

	/** Fires for any profile's or chain's add or update, so it re-reads the current identity's tokens
	 *  rather than patching one: an amount integerizes with the decimals the list holds. A change during
	 *  an identity fetch makes that fetch read them again, and one after a refused fetch retries it,
	 *  since its balances and contacts are missing too. */
	function onTokensChanged() {
		if (tokensLoading.value) {
			state.tokensChangedDuringLoad = true
			return
		}
		if (tokensFailed.value) return retry()
		reloadTokens().catch(onReadFailed)
	}

	async function reloadTokens() {
		if (!live.profile?.id || !live.network?.id || !live.account?.address) return
		const isCurrent = state.tokenReads.begin()
		const list = await tokenService.getTokens(live.profile.id, live.network.chainId)
		if (!isCurrent()) return
		tokens.value = list
	}

	const refetch = () => fetchIdentity(state, deps)

	/** The token card's Retry: every read again, since the page cannot send without any of them. */
	function retry() {
		refetch().catch(onReadFailed)
	}

	return {
		tokens,
		tokensLoading,
		tokensFailed,
		contacts: state.contacts,
		contactEvents: entityListReducers(state.contacts),
		journalOps: state.journalOps,
		onTokensChanged,
		onReadFailed,
		reloadTokens,
		refetch,
		retry,
		/** Ends the fetch in flight, so its late reads write nothing, the shared token selection included.
		 *  Not terminal: a later call starts a new read, as the page's unmount always allowed. */
		dispose: state.identityFetches.invalidate,
	}
}
