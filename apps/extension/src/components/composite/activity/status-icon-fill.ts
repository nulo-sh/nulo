import type { TextColorName } from "@nulo/design"

export type StatusTone = "gray" | "amber" | "red" | "green"

/** An activity card's status icon fills with its state's status text token, which reads 3:1 on the
 *  page in both themes; the raw status colours do not on the light page. */
export const STATUS_ICON_FILL: Readonly<Record<StatusTone, TextColorName>> = {
	gray: "gray",
	amber: "txt-warning",
	red: "txt-danger",
	green: "txt-success",
}
