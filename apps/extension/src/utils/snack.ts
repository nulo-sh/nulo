import type { useToast } from "@/composables/toast"

/** A flow's outcome as a value: what its snack says, so the snack can be shown where the flow ends
 *  or carried to the document that shows the result. */
export interface Snack {
	kind: "success" | "error"
	label: string
}

/** Shows `snack`; its kind is decided where the snack was built. */
export function showSnack(openToast: ReturnType<typeof useToast>["openToast"], snack: Snack): void {
	openToast({ kind: snack.kind === "error" ? "error" : "success", label: snack.label })
}
