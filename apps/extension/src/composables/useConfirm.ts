import type { UnwrapRef } from "vue"
import { type ConfirmRequest, useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"

/**
 * The one way to open the shared confirm dialog. Each request replaces the whole previous one, so
 * no field an earlier request set (`single`, `pre_title`, a colour) reaches a later dialog; a
 * request made while the dialog is open replaces what it shows and keeps it on top.
 */
export function useConfirm(): { requestConfirm: (request: ConfirmRequest) => void } {
	const cacheStore = useCacheStore()
	const popupStore = usePopupStore()
	return {
		requestConfirm(request) {
			// The store stores `toggle.model` as the caller's ref; only its read type is unwrapped.
			cacheStore.confirm = { ...request } as UnwrapRef<ConfirmRequest>
			popupStore.open("confirm")
		},
	}
}
