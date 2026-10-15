/**
 * What the popup shell does once a reset re-keyed a network row, outside the shell so its fence is
 * unit-testable (app.vue has no harness). Each step runs only while the caller's `live` holds: a
 * lock or a profile change ends it before it writes the networks it read, or routes.
 */
import type { Network } from "@/wallet/services/network/client"

export interface ResetCompletionDeps {
	activeNetworkId: () => string | undefined
	getNetworks: () => Promise<Network[]>
	setNetworks: (networks: Network[]) => void
	/** Assigning the active row starts its account load through the switch handler. */
	setNetwork: (network: Network) => void
	/** Resolves once the account load the assignment started has ended. */
	accountLoaded: () => Promise<void>
	/** False in a document the takeover never covers, such as a dApp window: it keeps its route. */
	ownsRoute: () => boolean
	toHome: () => void
}

export function createResetCompletion(deps: ResetCompletionDeps) {
	/** Re-reads the networks and re-assigns the re-keyed row if it is active. False, with nothing
	 *  written, when `live` ended meanwhile. */
	const reloadNetwork = async (networkId: string, live: () => boolean): Promise<boolean> => {
		const networks = await deps.getNetworks()
		if (!live()) return false
		deps.setNetworks(networks)
		const row = networks.find((n) => n.id === networkId)
		if (row && deps.activeNetworkId() === networkId) deps.setNetwork(row)
		return true
	}

	/** The active network's reset completed: its row, then its account, then Home. */
	const completeReset = async (networkId: string, live: () => boolean): Promise<void> => {
		if (!(await reloadNetwork(networkId, live))) return
		await deps.accountLoaded()
		if (live() && deps.ownsRoute() && deps.activeNetworkId() === networkId) deps.toHome()
	}

	return { reloadNetwork, completeReset }
}
