import { parseSide } from "@/utils/token-amount"

export type SendSide = "private" | "public"

/** The capability flags a token row carries; an absent flag reads as no capability. */
type SideCaps = {
	hasPrivateTransfers?: boolean
	hasPublicTransfers?: boolean
	hasPrivateBalances?: boolean
	hasPublicBalances?: boolean
}

/**
 * The side Send opens a token on: public only when that is the one side holding a balance, so the
 * amount can be typed at once; private otherwise, since a public origin names the sender on chain.
 * A missing or malformed balance row reads private.
 */
export function openingSendSide(row: { publicBalance?: string; privateBalance?: string } | null | undefined): SendSide {
	if (!row) return "private"
	const pub = parseSide(row.publicBalance)
	const priv = parseSide(row.privateBalance)
	return pub !== undefined && pub > 0n && priv === 0n ? "public" : "private"
}

/**
 * The side a token's transfers force on both Send sides, or `null` when it has both kinds. A
 * token with neither reads private, a token Send refuses to send anyway.
 */
export function forcedSide(token: SideCaps): SendSide | null {
	if (!token.hasPublicTransfers) return "private"
	if (!token.hasPrivateTransfers) return "public"
	return null
}

/** Whether the origin may switch sides. It reads the transfer kinds, while the destination reads the
 *  balance kinds and its forced side the transfer kinds: the table test pins that asymmetry. */
export function canSwitchSender(token: SideCaps): boolean {
	return Boolean(token.hasPrivateTransfers && token.hasPublicTransfers)
}

/** Whether the destination may switch sides. */
export function canSwitchReceiver(token: SideCaps): boolean {
	return Boolean(token.hasPrivateBalances && token.hasPublicBalances)
}
