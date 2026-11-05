import { getCurrentScope, onScopeDispose, type UnwrapRef, watch } from "vue"
import { type ConfirmRequest, useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"

/**
 * The one way to open the shared confirm dialog. Each request replaces the whole previous one, so
 * no field an earlier request set (`single`, `pre_title`, a colour) reaches a later dialog; a
 * request made while the dialog is open replaces what it shows and keeps it on top.
 *
 * `askConfirm` asks and answers: true once on Confirm; false when the dialog closes any other way,
 * when a later request replaces this one, or when the scope that called `useConfirm` ends, which
 * also closes the dialog if it still shows this request.
 */
export function useConfirm(): {
	requestConfirm: (request: ConfirmRequest) => void
	askConfirm: (request: Omit<ConfirmRequest, "callback" | "single">) => Promise<boolean>
} {
	const cacheStore = useCacheStore()
	const popupStore = usePopupStore()
	const asking = new Set<() => void>()
	let ended = false
	if (getCurrentScope()) {
		onScopeDispose(() => {
			ended = true
			for (const end of [...asking]) end()
		})
	}

	function requestConfirm(request: ConfirmRequest): void {
		// The store stores `toggle.model` as the caller's ref; only its read type is unwrapped.
		cacheStore.confirm = { ...request } as UnwrapRef<ConfirmRequest>
		popupStore.open("confirm")
	}

	function askConfirm(request: Omit<ConfirmRequest, "callback" | "single">): Promise<boolean> {
		if (ended) return Promise.resolve(false)
		return new Promise((resolve) => {
			let stop = () => {}
			const settle = (answer: boolean) => {
				if (!asking.delete(end)) return
				stop()
				resolve(answer)
			}
			const end = () => {
				const ownsDialog = cacheStore.confirm === shown
				settle(false)
				if (ownsDialog) popupStore.close("confirm")
			}
			asking.add(end)
			requestConfirm({ ...request, callback: () => settle(true) })
			const shown = cacheStore.confirm
			// The dialog clears its request on every close and a later request replaces it, so the slot
			// leaving this request is a no; Confirm settles first, before the dialog closes.
			stop = watch(
				() => cacheStore.confirm,
				(current) => {
					if (current !== shown) settle(false)
				},
				{ flush: "sync" },
			)
		})
	}

	return { requestConfirm, askConfirm }
}
