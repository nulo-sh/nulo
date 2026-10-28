/**
 * Network-switch orchestration, extracted from the popup shell's watcher so
 * the identity fence is unit-testable (app.vue has no test harness — an
 * unpinned inline fence is silently revertible). The factory owns ALL the
 * glue: the per-component fence, entry invalidation, scope capture, and the
 * compound run guard.
 *
 * The hazard this closes: the watcher's RPCs enjoy pre-registration
 * immunity (a request parked before the transport registers it survives
 * `disconnect()`), so a superseded run used to land a cross-chain account
 * list after the user had already switched again. Every await boundary now
 * re-checks BOTH the generation (a newer run started) AND the live scope (a
 * profile/network drift the watcher hasn't re-fired for yet), and results
 * are committed only after the check — never in the same statement as the
 * await.
 */
import { ensureDefaultAccountOrWait } from "@/composables/internal/default-account"
import { createRunFence } from "@/composables/runFence"
import { runsUnattended } from "@/composables/useStaleNetwork"
import type { AccountType } from "@/wallet/services/account/client"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"

export interface NetworkSwitchScope {
	profileId: string
	networkId: string
	chainId: number
}

export interface NetworkSwitchAccountClient {
	getAccounts(profileId: string, chainId: number, includeHidden: boolean): Promise<unknown[]>
	ensureDefaultAccount(profileId: string, chainId: number, type: AccountType, name: string): Promise<unknown>
}

export interface NetworkSwitchDeps {
	/** Captured ONCE per run; undefined = not ready (no network/profile yet). */
	getScope: () => NetworkSwitchScope | undefined
	/** Live compare — a drift the watcher hasn't re-fired for must stop the run. */
	liveScopeMatches: (scope: NetworkSwitchScope) => boolean
	syncNetworkStatus: () => void
	/** The run's own read of the network's node just failed. */
	markNetworkInactive: (networkId: string) => void
	/** Disconnect the old client, install + return the new one. The run holds
	 *  the RETURNED reference locally — the shared slot is mutable. */
	replaceAccountClient: () => NetworkSwitchAccountClient
	setAccounts: (accounts: unknown[]) => void
	setupActiveAccount: () => Promise<void>
	syncTransactions: () => Promise<void>
	/** Reads the target's stale view into the store; null when it is live. */
	syncStaleNetwork: (networkId: string) => Promise<StaleNetworkView | null>
	/** Empties the account list and the active account; the durable pointer stays. */
	clearAccounts: () => void
	/** Resets a network the profile never opened, then re-assigns the re-keyed row (A2) while
	 *  `live` holds. */
	resetUnattended: (view: StaleNetworkView, live: () => boolean) => Promise<void>
}

/**
 * Re-fetch accounts for the new chain, and auto-create a default if the chain has NO accounts
 * yet. Auto-create otherwise lives ONLY in `initAccount()` (duplicate-account race during initial
 * profile load); the empty-list guard preserves that property — when `initAccount()` already
 * created the default for this chain, `getAccounts()` returns non-empty and the second
 * `ensureDefaultAccount` is skipped. Without the auto-create, a freshly-switched chain strands the
 * popup with `account = undefined` and every reader of `appStore.account.address` silently fails.
 */
async function loadAccounts(deps: NetworkSwitchDeps, scope: NetworkSwitchScope, guard: () => boolean): Promise<void> {
	const client = deps.replaceAccountClient()
	let accounts = await client.getAccounts(scope.profileId, scope.chainId, true)
	if (!guard()) return
	deps.setAccounts(accounts)
	if (accounts.length === 0) {
		await ensureDefaultAccountOrWait(client, scope.profileId, scope.chainId, () => {
			if (guard()) deps.markNetworkInactive(scope.networkId)
		})
		if (!guard()) return
		accounts = await client.getAccounts(scope.profileId, scope.chainId, true)
		if (!guard()) return
		deps.setAccounts(accounts)
	}
	await deps.setupActiveAccount()
	// Belt before the tail — syncTransactions is internally scope-fenced
	// (compare-and-commit in the store), but a superseded run should not
	// even start it.
	if (!guard()) return
	await deps.syncTransactions()
}

export type NetworkSwitchHandler = (() => Promise<void>) & {
	/** Ends the run in flight: it writes nothing past its next guard, and a failure it meets resolves at debug. */
	supersede: () => void
}

/** A live run's failure rejects; a superseded or drifted run's failure resolves, logged at debug. */
export function createNetworkSwitchHandler(deps: NetworkSwitchDeps): NetworkSwitchHandler {
	const fence = createRunFence()
	const run = async () => {
		// begin() BEFORE the not-ready return: bootstrap's transitional
		// `network = undefined` write must supersede an in-flight run even
		// though this invocation itself does nothing.
		const isCurrent = fence.begin()
		const scope = deps.getScope()
		if (!scope) return
		const guard = () => isCurrent() && deps.liveScopeMatches(scope)
		try {
			deps.syncNetworkStatus()

			// A quarantined chain's accounts are never loaded: the Header empties and the takeover shows.
			const stale = await deps.syncStaleNetwork(scope.networkId)
			if (!guard()) return
			if (stale) {
				deps.clearAccounts()
				if (runsUnattended(stale)) await deps.resetUnattended(stale, guard)
				return
			}

			await loadAccounts(deps, scope, guard)
		} catch (error) {
			// The worker refuses a read whose session a lock ended, and nothing reads a superseded run.
			if (guard()) throw error
			console.debug("network switch superseded", { error })
		}
	}
	return Object.assign(run, { supersede: () => fence.invalidate() })
}
