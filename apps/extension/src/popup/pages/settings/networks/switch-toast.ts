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
	/** Settles with the switch run the activation started; false once a newer run replaced it. */
	settled: () => Promise<boolean>
	openToast: (options: ToastOptions) => void
}

export async function switchAndAnnounce<N extends { id: string }>(target: N, deps: SwitchAnnounceDeps<N>): Promise<void> {
	if ((await deps.activate(target)) === "activated") deps.openToast({ kind: "success", label: "Active network updated" })
}
