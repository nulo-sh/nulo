import type { ConfigProp } from "@/wallet/services/config/client"

export const DETAIL_TIME_FORMAT = "MMM dd, yyyy 'at' HH:mm"

/** The characters a detail page's hero gives its token amount. Named apart from `ROW_AMOUNT_LENGTH`:
 *  the hero and the row agree today, not by rule. */
export const DETAIL_AMOUNT_LENGTH = 8

/** Whether a detail page shows its developer fields: either flag turns them on, so a contributor who
 *  only flips `developerMode` sees them, and so does one who only flips `debugMode`. */
export function showsDeveloperFields(props: readonly ConfigProp[]): boolean {
	const on = (key: string) => Boolean(props.find((p) => p.key === key)?.value)
	return on("debugMode") || on("developerMode")
}
