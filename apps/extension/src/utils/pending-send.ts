import type { ToastOptions } from "@/composables/toast"

export const PENDING_SEND_REFUSAL = "Finish or cancel your pending transaction first"

export function toastPendingSendRefusal(openToast: (toast: ToastOptions) => void): void {
	openToast({ kind: "error", label: PENDING_SEND_REFUSAL })
}
