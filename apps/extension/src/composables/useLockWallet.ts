import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import type { ProfileServiceClient } from "@/wallet/services/profile/client"

export type LockProfileClient = Pick<
	ProfileServiceClient,
	"getSessionHandle" | "lockActiveProfile" | "onActiveProfileChanged" | "onDisconnected"
>

/** Locking is a security action: a read that answers late or never locks without asking. */
const LOCK_READ_BUDGET_MS = 3_000

type LockRead = { answered: true; handle: string | undefined } | { answered: false; handle?: undefined }

/** The fields of the shared, untyped `cacheStore.confirm` that the lock's confirm writes. */
type LockConfirm = {
	pre_title?: string
	title?: string
	description?: string
	confirm_text?: string
	confirm_color?: string
	callback?: () => void
}

/**
 * The wallet lock behind every lock control: it locks at once, or asks first while approved sends
 * run, deciding on a fresh read of the session handle and the in-flight journal.
 *
 * Pass `managers.profile`. A page's own client rejects its pending read on unmount, which would
 * abandon a lock the person asked for. The caller calls `dispose()` in `onBeforeUnmount`; a decision
 * still pending then finishes: it locks when no confirm is needed, and abandons when one would be.
 */
export function useLockWallet(profile: LockProfileClient): { lock: () => Promise<void>; dispose: () => void } {
	const appStore = useAppStore()
	const cacheStore = useCacheStore()
	const popupStore = usePopupStore()
	// ConfirmPopup replaces the whole object on close, so it is read afresh on every access.
	const confirmSlot = () => cacheStore.confirm as LockConfirm

	let disposed = false
	let pendingDecisions = 0
	let sessionChanges = 0
	let confirmLock: (() => void) | undefined

	const lockWallet = (handle: string | undefined) => {
		if (!appStore.isLogined) return
		appStore.isLogined = false
		void profile.lockActiveProfile(handle)
	}

	const readForLock = (): Promise<LockRead> => {
		let timer: ReturnType<typeof setTimeout> | undefined
		const expired = new Promise<LockRead>((resolve) => {
			timer = setTimeout(() => resolve({ answered: false }), LOCK_READ_BUDGET_MS)
		})
		const read = Promise.all([profile.getSessionHandle(), appStore.refreshInFlight()]).then(
			([handle]): LockRead => ({ answered: true, handle }),
			(): LockRead => ({ answered: false }),
		)
		return Promise.race([read, expired]).finally(() => clearTimeout(timer))
	}

	const closeOwnConfirm = () => {
		if (confirmLock && confirmSlot().callback === confirmLock) popupStore.close("confirm")
	}

	// A lock decided before a session change or a dropped worker connection is abandoned; the worker
	// also refuses to close any session but the one the decision named.
	const onSessionChanged = () => {
		sessionChanges++
		closeOwnConfirm()
	}
	profile.onActiveProfileChanged.add(onSessionChanged)
	profile.onDisconnected.add(onSessionChanged)

	const removeListeners = () => {
		profile.onActiveProfileChanged.remove(onSessionChanged)
		profile.onDisconnected.remove(onSessionChanged)
	}

	const askBeforeLock = (running: number, handle: string | undefined) => {
		confirmLock = () => lockWallet(handle)
		const confirm = confirmSlot()
		confirm.pre_title = "Running transactions"
		confirm.title = "Lock wallet?"
		confirm.description =
			running === 1
				? "1 transaction is still running. Locking cancels it."
				: `${running} transactions are still running. Locking cancels them.`
		confirm.confirm_text = "Lock anyway"
		confirm.confirm_color = "red"
		confirm.callback = confirmLock
		popupStore.open("confirm")
	}

	const lock = async (): Promise<void> => {
		if (disposed || !appStore.isLogined) return
		const changesBefore = sessionChanges
		pendingDecisions++
		try {
			const { answered, handle } = await readForLock()
			if (sessionChanges !== changesBefore) return
			const running = answered ? appStore.approvedSendsInFlight : 0
			if (running === 0) {
				lockWallet(handle)
				return
			}
			// Disposed: the listeners go once no decision is pending, so nothing would close this
			// confirm on a later session change.
			if (disposed) return
			askBeforeLock(running, handle)
		} finally {
			pendingDecisions--
			// The listeners outlive dispose() until the last pending decision ends: a session change
			// before then must still abandon it, or the popup would show locked while the worker
			// refuses the stale handle.
			if (disposed && pendingDecisions === 0) removeListeners()
		}
	}

	const dispose = () => {
		if (disposed) return
		disposed = true
		closeOwnConfirm()
		if (pendingDecisions === 0) removeListeners()
	}

	return { lock, dispose }
}
