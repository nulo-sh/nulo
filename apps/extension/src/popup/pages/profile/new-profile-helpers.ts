import type { Router } from "vue-router"
import { awaitProfileActivation } from "@/composables/unlockWait"
import { isPopupSubmitKey } from "@/composables/usePopupEntity"
import type { useAppStore } from "@/stores/app.store"
import { initTransactionService, managers } from "@/utils/core"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { storageLocalSet } from "@/utils/storage"
import { AccountServiceClient } from "@/wallet/services/account/client"

type AppStore = ReturnType<typeof useAppStore>

/** How long a created profile may take to start bootstrapping in the shell. Once it has, the
 *  bootstrap ends the wait by itself (`deadlineCovers: "start"`). */
export const CREATE_START_WAIT_MS = 30_000

/**
 * Popup-only activation of a freshly created profile.
 *
 * The popup relies on `popup/app.vue`'s `onActiveProfileChanged` listener to
 * run the heavy bootstrap and flip `appStore.isLogined`; this waits for that
 * handshake, then loads accounts, wires the transaction service, persists the
 * active account, and opens the session. This is intentionally DISTINCT from
 * `useProfileBootstrap.bootstrapActiveProfile` (which onboarding uses and which
 * does strictly more) — do NOT merge the two. Extracted from the page so the
 * call ordering is unit-testable.
 *
 * Another window can open another profile at any await, so nothing is written or routed unless
 * the created profile is still the active, bootstrapped one right after each await. Rejects with
 * the wait's typed errors.
 */
export async function activateCreatedProfile(profile: { id: string }, deps: { appStore: AppStore; router: Router }): Promise<void> {
	const { appStore, router } = deps
	const isActive = () => appStore.isLogined && appStore.profile?.id === profile.id
	await awaitProfileActivation(appStore, profile.id, CREATE_START_WAIT_MS, { deadlineCovers: "start" })
	if (!isActive()) return

	// Keep an existing client: replacing it abandoned a connected port, and disconnecting it would
	// reject the calls of any flow still holding it.
	managers.account ??= new AccountServiceClient()

	await setLastActiveProfileId(profile.id)
	if (!isActive()) return
	if (!appStore.network) throw new Error("Network not set")
	const accounts = await managers.account.getAccounts(profile.id, appStore.network.chainId, true)
	if (!isActive()) return
	appStore.accounts = accounts

	initTransactionService(appStore.onTxAdded, appStore.onTxUpdated)

	await storageLocalSet({
		"nulo:ui:activeAccount": appStore.account?.address,
	})
	if (!isActive()) return

	router.push("/popup/general")
}

/** Popup-create's Enter shortcut, bound on the page's root: an Enter in one of its fields submits
 *  unless a child already handled it. */
export function makeCreateKeydownHandler(onSubmit: () => void): (e: KeyboardEvent) => void {
	return (e) => {
		if (!e.defaultPrevented && isPopupSubmitKey(e)) onSubmit()
	}
}
