import { computed } from "vue"
import { usePopupStore } from "@/stores/popup.store"

/**
 * A registry popup's place in the open stack: `order` for `Popup` and `FormPopup`, `depth`
 * (`len - order`, 1 on top) for `PopupCard`. While the key is closed `order` is undefined and
 * `depth` NaN.
 */
export function usePopupStack(key: string) {
	const popupStore = usePopupStore()
	return {
		order: computed(() => popupStore.popups[key]?.order),
		depth: computed(() => popupStore.len - (popupStore.popups[key]?.order ?? Number.NaN)),
	}
}
