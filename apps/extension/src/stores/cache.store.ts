// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { defineStore } from "pinia"
import type { Ref } from "vue"

/** What ConfirmPopup renders. `toggle.model` is a caller-owned ref the dialog's switch binds. */
export interface ConfirmRequest {
	pre_title?: string
	title?: string
	description?: string
	confirm_text?: string
	/** The action cannot be undone: the pre-title says so unless `pre_title` is set. */
	irreversible?: boolean
	/** `"red"` paints the confirm button red; its look is `confirm_variant`. */
	confirm_color?: string
	confirm_variant?: string
	/** One button, no Cancel, no callback required. */
	single?: boolean
	/** The term the person must type before Confirm enables. */
	confirmation_text?: string
	toggle?: { label: string; description?: string; model: Ref<boolean> }
	/** Runs on Confirm, before the dialog closes; Cancel and dismiss run nothing. */
	callback?: () => void
}

export const useCacheStore = defineStore("cache", () => {
	// Replaced whole by every request and cleared on close, so it is a ref: replacing a
	// `reactive` store property would leave `pinia.state` holding the old object.
	const confirm = ref<ConfirmRequest>({})
	/** First-receive friction popup payload. Holds the closures that
	 *  IncomingTrustPopup invokes for Allow / Reject. Populated by the
	 *  PopupManager-level subscriber on `onIncomingTransferPending`. */
	const incomingTrust = reactive({})

	const networkToEditIdx = ref()
	/** Per-`Network` detail page → endpoint popups context. */
	const endpointEditNetworkId = ref<string | null>(null)
	const endpointEditId = ref<string | null>(null)
	const accountToEditIdx = ref()
	const contactToEditIdx = ref()
	const fpcToEditIdx = ref()

	const activeTokenIdx = ref()
	const preselectedBalanceType = ref("private")
	const preselectedAuthwits = ref([])

	const importType = ref("")

	const importContacts = ref([])
	const importPromise = ref(null)

	const failureLog = ref()

	const viewerData = ref()

	return {
		confirm,
		incomingTrust,
		networkToEditIdx,
		endpointEditNetworkId,
		endpointEditId,
		accountToEditIdx,
		contactToEditIdx,
		fpcToEditIdx,
		activeTokenIdx,
		preselectedBalanceType,
		preselectedAuthwits,
		importType,
		importContacts,
		importPromise,
		failureLog,
		viewerData,
	}
})
