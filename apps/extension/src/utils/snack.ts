import type { ToastOptions } from "@/composables/toast"

/** A flow's outcome as a value: what its snack says, so the snack can be shown where the flow ends
 *  or carried to the document that shows the result. */
export interface Snack {
	kind: "success" | "error"
	label: string
}

/** How a flow ended: its snack, and the profile whose run produced it, which alone may see it. */
export interface Outcome {
	snack: Snack
	profileId: string
}

/** Shows `snack`; its kind is decided where the snack was built. */
export function showSnack(openToast: (toast: ToastOptions) => unknown, snack: Snack): void {
	openToast({ kind: snack.kind === "error" ? "error" : "success", label: snack.label })
}
