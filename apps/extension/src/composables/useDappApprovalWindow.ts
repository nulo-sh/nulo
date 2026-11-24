// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * Lifecycle shell for the dApp approval windows (execute, capabilities, discover): the mounted
 * sequence (eager connects, session-ready wait, auth redirect, init, then the `beforeunload`
 * registration), the unmount teardown, the completion semantics, the active-profile guard, and the
 * strip and error state. What differs per window is injected: the connect and disconnect lists in
 * their per-window order, the `init()` body, and the window-local `reject()`, whose guard clauses
 * differ between windows on purpose.
 *
 * - `closeWindow(true)` removes the `beforeunload` listener, so a decided interaction is never
 *   rejected again on unload; `closeWindow()` with no argument leaves it, so an
 *   overlay dismiss delivers the rejection through the unload event.
 * - Every rejection names the window's end: the unload `close`, the profile guard `lock` or
 *   `switch`, the window's own Reject `reject`.
 * - The listener is added after `init()` resolves, including when init fails internally (every
 *   window's init swallows its errors into `setError`), so a half-loaded window still rejects on
 *   close. A rejecting `init` would skip the registration.
 * - `dispose()` removes the listener last, after every disconnect.
 * - A resolve the service refuses because the app cancelled first is the cancelled state, never an
 *   error banner, even when the cancel broadcast never reached the window (`settleResolveError`).
 *
 * It owns no lifecycle hooks: the window calls `start` from its `onMounted` and `dispose` from its
 * unmount hook.
 */

import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { raceTimeout } from "@nulo/wallet-core/utils"
import { computed, ref, watch, type ComputedRef, type Ref } from "vue"
import { useRouter } from "vue-router"
import { useAppStore } from "@/stores/app.store"
import { closeCurrentWindow } from "@/utils/close-current-window"
import { authRequiredGate } from "@/utils/auth-guard"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import type { WindowEnd } from "@/wallet/services/dapp-interaction/client"

/** How long a window waits for the wallet to take its end: a wedged worker must not hold it open. */
export const END_ACK_TIMEOUT_MS = 3_000

export type DappWindowError = { title: string; tooltip: string; type: string }

export interface UseDappApprovalWindowOptions {
	/** Eager service connects, in the exact per-window order. First thing `start()` runs. */
	connectServices: () => void
	/**
	 * Service disconnects, in the exact per-window order. `dispose()` runs this
	 * first, then removes the `beforeunload` listener — always last.
	 */
	disconnectServices: () => void
	/** The window's payload init. Awaited after the session gate + auth redirect. */
	init: () => Promise<void>
	/** The worker's active profile, through the window's connected client. */
	getActiveProfile: () => Promise<{ id: string } | undefined>
	/**
	 * The window-local reject. Bound to `beforeunload` and to the
	 * active-profile-change guard; guard divergences stay in the window.
	 */
	reject: (end: WindowEnd) => void
	/** The window's active profile (set inside init) — the profile-change guard compares against it. */
	profile: Ref<ProfileInfo | undefined>
	requestId: Ref<string | undefined>
	isInteractionCancelled: Ref<boolean>
	isLoading: Ref<boolean>
}

export interface UseDappApprovalWindowResult {
	/** The mounted-hook body. The window calls this from its own `onMounted`. */
	start: () => Promise<void>
	/** The unmount-hook body. The window calls this from its own unmount hook. */
	dispose: () => void
	closeWindow: (interactionCompleted?: boolean) => void
	/** Sends what the wallet must take before the window goes and closes the window once the wallet
	 *  has taken it, the send failed, or {@link END_ACK_TIMEOUT_MS} passed. No unload repeats the
	 *  window's end. */
	endAndClose: (send: () => Promise<unknown>) => Promise<void>
	/** Register on the profile service's `onActiveProfileChanged` (pre-mount, as before). */
	onActiveProfileChanged: (profile?: ProfileInfo) => void
	/** The wrong-profile notice's OK: ends a live request as the window's close would, through the
	 *  window's `reject` and with its wait, so the window's close cannot reach the request first;
	 *  with no request left to end, closes the window. */
	dismissWrongProfile: () => void
	/** A rejected resolve: a `JobCancelledError` marks the request cancelled; anything else runs `onOther`. */
	settleResolveError: (error: unknown, onOther: () => void) => void
	stripStatus: ComputedRef<"ready" | "loading" | "cancelled">
	processingError: Ref<DappWindowError | undefined>
	setError: (title: string, tooltip?: string, type?: string) => void
	clearError: () => void
}

/**
 * Resolves once `isChecked()` turns true. Call it only while `isChecked()` is false: otherwise the
 * immediate callback reads `stop` before it is initialized.
 */
export function untilSessionChecked(isChecked: () => boolean): Promise<void> {
	return new Promise<void>((resolve) => {
		const stop = watch(
			isChecked,
			(checked) => {
				if (checked) {
					stop()
					resolve()
				}
			},
			{ immediate: true },
		)
	})
}

export function useDappApprovalWindow(options: UseDappApprovalWindowOptions): UseDappApprovalWindowResult {
	const appStore = useAppStore()
	const router = useRouter()

	// One stable identity: every removal must target the exact registered listener.
	const onBeforeUnload = () => options.reject("close")

	const processingError = ref<DappWindowError | undefined>()
	function setError(title: string, tooltip: string = title, type: string = "error") {
		processingError.value = { title, tooltip, type }
	}
	function clearError() {
		processingError.value = undefined
	}

	const stripStatus = computed<"ready" | "loading" | "cancelled">(() => {
		if (options.isInteractionCancelled.value) return "cancelled"
		if (options.isLoading.value) return "loading"
		return "ready"
	})

	const detachUnload = () => window.removeEventListener("beforeunload", onBeforeUnload)

	const closeWindow = (interactionCompleted?: boolean) => {
		if (interactionCompleted) detachUnload()
		closeCurrentWindow()
	}

	const endAndClose = async (send: () => Promise<unknown>) => {
		detachUnload()
		try {
			await raceTimeout(send(), END_ACK_TIMEOUT_MS, () => undefined)
		} catch {
			// A refused send still closes: the close then ends the request.
		}
		closeCurrentWindow()
	}

	const onActiveProfileChanged = (profile?: ProfileInfo) => {
		if (!profile) options.reject("lock")
		else if (profile.id !== options.profile.value?.id) options.reject("switch")
	}

	const dismissWrongProfile = () => {
		if (options.requestId.value && !options.isInteractionCancelled.value) options.reject("close")
		else closeWindow()
	}

	const settleResolveError = (error: unknown, onOther: () => void) => {
		if (error instanceof JobCancelledError) options.isInteractionCancelled.value = true
		else onOther()
	}

	const start = async () => {
		options.connectServices()

		if (!appStore.isSessionChecked) await untilSessionChecked(() => appStore.isSessionChecked)

		// The worker's session decides, as in the route guard: the shell marks an unlock only once its
		// activation ends, and a window handed over before then must not pass the lock screen again.
		if (!appStore.isLogined && (await authRequiredGate(false, appStore.isSessionChecked, options.getActiveProfile)) === "auth") {
			appStore.pageAwaitingAuth = router.currentRoute.value.fullPath
			router.push({ path: "/popup/auth" })
			return
		}

		await options.init()
		window.addEventListener("beforeunload", onBeforeUnload)
	}

	const dispose = () => {
		options.disconnectServices()
		window.removeEventListener("beforeunload", onBeforeUnload)
	}

	return {
		start,
		dispose,
		closeWindow,
		endAndClose,
		onActiveProfileChanged,
		dismissWrongProfile,
		settleResolveError,
		stripStatus,
		processingError,
		setError,
		clearError,
	}
}
