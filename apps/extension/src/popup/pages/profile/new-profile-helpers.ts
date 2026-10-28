import type { Router } from "vue-router"
import type { ToastOptions } from "@/composables/toast"
import { ActivationSupersededError, activationFailureReason, awaitProfileActivation } from "@/composables/unlockWait"
import { isActivating, isActivatingOtherThan, supersedeProfileActivations } from "@/composables/useProfileBootstrap"
import { isPopupSubmitKey } from "@/composables/usePopupEntity"
import type { useAppStore } from "@/stores/app.store"
import { initTransactionService, managers } from "@/utils/core"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { AccountServiceClient } from "@/wallet/services/account/client"
import type { ProfileInfo } from "@/wallet/services/profile/client"

type AppStore = ReturnType<typeof useAppStore>

/** How long a created profile may take to start bootstrapping in the shell. Once it has, the
 *  bootstrap ends the wait by itself (`deadlineCovers: "start"`). */
export const CREATE_START_WAIT_MS = 30_000

/** How long a created profile may take to open, counted from when it exists: the person's own
 *  steps before (naming it, the create call, a passkey prompt) are not the start-up. */
export const CREATE_ACTIVATION_LIMIT_MS = 60_000

export interface CreateActivationDeps {
	appStore: AppStore
	router: Router
	openToast: (toast: ToastOptions) => void
	/** The profile selected when the page opened, which only the shell's activations change. */
	selectedOnEntry: string | undefined
	/** False once the shell ended this page's flow (`popup/opening-flow.ts`): its landing owns the window. */
	flowLive: () => boolean
}

/**
 * Popup-only activation of a freshly created profile, whose session the create call opened: it
 * waits for the shell's bootstrap of that profile (`isLogined`), then lands on its home.
 *
 * Another window can open another profile at any await, so nothing is written or routed unless
 * the created profile is still the active, bootstrapped one right after each await. A created
 * profile that does not open hands off instead (`handOffCreatedProfile`) and resolves. It rejects
 * only when the hand-off itself fails, so the caller keeps its latch: the profile exists, and
 * another create would make a second one.
 */
export async function activateCreatedProfile(profile: ProfileInfo, deps: CreateActivationDeps): Promise<void> {
	try {
		await openCreatedProfile(profile, deps)
	} catch (failure) {
		await handOffCreatedProfile(profile, deps, failure)
	}
}

async function openCreatedProfile(profile: ProfileInfo, { appStore, router, flowLive }: CreateActivationDeps): Promise<void> {
	// An ended flow stays ended: the same profile opening again later is the shell's, not this page's.
	const assertActive = () => {
		if (!flowLive() || !appStore.isLogined || appStore.profile?.id !== profile.id) throw new ActivationSupersededError()
	}
	await awaitProfileActivation(appStore, profile.id, CREATE_START_WAIT_MS, {
		deadlineCovers: "start",
		limitMs: CREATE_ACTIVATION_LIMIT_MS,
		activating: () => isActivating(profile.id),
	})
	assertActive()

	// Keep an existing client: replacing it abandoned a connected port, and disconnecting it would
	// reject the calls of any flow still holding it.
	managers.account ??= new AccountServiceClient()

	await setLastActiveProfileId(profile.id)
	assertActive()
	if (!appStore.network) throw new Error("Network not set")
	const accounts = await managers.account.getAccounts(profile.id, appStore.network.chainId, true)
	assertActive()
	appStore.accounts = accounts

	initTransactionService(appStore.onTxAdded, appStore.onTxUpdated)

	if (appStore.account) await managers.uiPreference.setSelectedAccount(profile.id, appStore.account.address)
	assertActive()

	router.push("/popup/general")
}

/**
 * The created profile exists but did not open in this popup. While the page still shows and no
 * profile is open or opening here, the popup goes to the unlock screen with the created profile
 * selected; otherwise it stays on the open profile and goes to its home. Either way the toast
 * says how to reach the new one.
 *
 * Earlier activations are superseded first, so one that finishes later cannot move the screen;
 * the pointer write and the route then re-check, since another profile may open meanwhile. The
 * created profile's session stays open in the background: the unlock screen is not a boundary
 * for an open session.
 */
async function handOffCreatedProfile(profile: ProfileInfo, deps: CreateActivationDeps, failure: unknown): Promise<void> {
	const { appStore, router, openToast, selectedOnEntry, flowLive } = deps
	console.warn("created profile did not open", { reason: activationFailureReason(failure) })
	// A person who left the page meanwhile is not moved: the shell places the activation's outcome.
	// So with a flow the shell ended, whose navigation away may not have committed yet.
	const left = () => router.currentRoute.value.name !== "popup-profile-new"
	if (left() || !flowLive()) return
	const anotherOpens = () =>
		appStore.isLogined ||
		isActivatingOtherThan(profile.id) ||
		(appStore.profile !== undefined && appStore.profile.id !== profile.id && appStore.profile.id !== selectedOnEntry)
	let target = "/popup/general"
	if (!anotherOpens()) {
		supersedeProfileActivations()
		await setLastActiveProfileId(profile.id, { unless: () => left() || anotherOpens() })
		if (left()) return
		if (!anotherOpens()) {
			appStore.profile = profile
			target = "/popup/auth"
		}
	}
	// Awaited: until the page has left, the caller's latch must hold, or Create could run again.
	const leaving = await router.push(target)
	if (!flowLive()) return
	openToast({ kind: "error", label: "Something went wrong", sub: "Open the wallet again to unlock your new profile." })
	if (leaving) throw leaving
}

/** Popup-create's Enter shortcut, bound on the page's root: an Enter in one of its fields submits
 *  unless a child already handled it. */
export function makeCreateKeydownHandler(onSubmit: () => void): (e: KeyboardEvent) => void {
	return (e) => {
		if (!e.defaultPrevented && isPopupSubmitKey(e)) onSubmit()
	}
}
