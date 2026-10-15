import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import type { ProfileServiceClient } from "@/wallet/services/profile/client"

export type LockProfileClient = Pick<
	ProfileServiceClient,
	"getSessionHandle" | "lockActiveProfile" | "onActiveProfileChanged" | "onDisconnected"
>

/** Bounds the worker read, so an unresponsive worker cannot delay Lock indefinitely. */
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

const sendsSentence = (running: number) =>
	running === 1
		? "1 transaction is still running. Locking cancels it."
		: `${running} transactions are still running. Locking cancels them.`

const importsSentence = (imports: number) =>
	imports === 1
		? "A contacts import is still running. Locking stops it."
		: `${imports} contacts imports are still running. Locking stops them.`

function lockConfirmCopy(running: number, imports: number): { pre_title: string; description: string } {
	const sentences: string[] = []
	if (running > 0) sentences.push(sendsSentence(running))
	if (imports > 0) sentences.push(importsSentence(imports))
	return { pre_title: running > 0 ? "Running transactions" : "Contacts import", description: sentences.join(" ") }
}

const namesEvery = (named: ReadonlySet<symbol>, running: ReadonlySet<symbol>) => [...running].every((id) => named.has(id))

/**
 * The wallet lock behind every lock control: it locks at once, or asks first while approved sends
 * or contacts imports run. While a contacts import holds Lock, it does nothing.
 *
 * Pass `managers.profile`: a page's own client rejects its pending read on unmount, which would
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

	// The last check on every path: nothing locks while an import holds Lock.
	const lockWallet = (handle: string | undefined) => {
		if (!appStore.isLogined || appStore.lockHeldByImport) return
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

	// A session change or a dropped worker connection abandons a pending decision; the worker refuses
	// a handle that no longer names the live session.
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
		const named = new Set(appStore.contactImports)
		// Confirming never stops an import the confirm did not name, even if another one ended meanwhile.
		confirmLock = () => {
			if (namesEvery(named, appStore.contactImports)) lockWallet(handle)
		}
		const confirm = confirmSlot()
		const { pre_title, description } = lockConfirmCopy(running, named.size)
		confirm.pre_title = pre_title
		confirm.title = "Lock wallet?"
		confirm.description = description
		confirm.confirm_text = "Lock anyway"
		confirm.confirm_color = "red"
		confirm.callback = confirmLock
		popupStore.open("confirm")
	}

	const decide = ({ answered, handle }: LockRead, changesBefore: number) => {
		if (sessionChanges !== changesBefore || appStore.lockHeldByImport) return
		const running = answered ? appStore.approvedSendsInFlight : 0
		// The window's own count: a failed read counts no sends, never no imports.
		if (running === 0 && appStore.contactImports.size === 0) {
			lockWallet(handle)
			return
		}
		// Disposed: the listeners go once no decision is pending, so nothing would close this
		// confirm on a later session change.
		if (disposed) return
		askBeforeLock(running, handle)
	}

	const lock = async (): Promise<void> => {
		if (disposed || !appStore.isLogined || appStore.lockHeldByImport) return
		const changesBefore = sessionChanges
		pendingDecisions++
		try {
			decide(await readForLock(), changesBefore)
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
