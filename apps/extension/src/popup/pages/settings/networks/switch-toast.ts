import { accountStateOf } from "@/components/header-account"
import type { ToastOptions } from "@/composables/toast"
import type { NetworkActivationResult } from "@/utils/guarded-network-activation"

export interface SwitchAnnounceStore {
	isLogined: boolean
	profile?: { id: string } | null
	network?: { id: string; chainId: number; name: string } | null
	staleNetwork?: { networkId: string } | null
	account?: { profileId: string; chainId: number; name: string; address: string } | null
}

export interface SwitchAnnounceDeps<N extends { id: string }> {
	store: SwitchAnnounceStore
	activate: (target: N) => Promise<NetworkActivationResult>
	/** Settles with the switch runs `live` covers; false once `live` ended. */
	settled: (live: () => boolean) => Promise<boolean>
	openToast: (options: ToastOptions) => void
}

/** The header's address, or none while it shows a skeleton or no account group. */
const shownAccount = (store: SwitchAnnounceStore) => (accountStateOf(store) === "shown" ? (store.account ?? undefined) : undefined)

/**
 * Activates `target` and, once its switch runs settle, confirms it; the line names the account
 * whose header address is not the one shown before the switch. A newer switch, a lock or another
 * profile meanwhile announces nothing: the newer action owns the feedback.
 */
export async function switchAndAnnounce<N extends { id: string }>(target: N, deps: SwitchAnnounceDeps<N>): Promise<void> {
	const { store } = deps
	const profileId = store.profile?.id
	// Read before activating: the target's account can land while the network still persists.
	const before = shownAccount(store)?.address
	if ((await deps.activate(target)) !== "activated") return
	const live = () => store.isLogined && store.profile?.id === profileId && store.network?.id === target.id
	if (!(await deps.settled(live))) return
	const network = store.network
	if (!live() || !network) return
	const account = shownAccount(store)
	const moved = before !== undefined && account !== undefined && account.address !== before
	deps.openToast({
		kind: "success",
		label: "Active network updated",
		...(moved ? { sub: `${account.name} has a different address on ${network.name}.` } : {}),
	})
}
