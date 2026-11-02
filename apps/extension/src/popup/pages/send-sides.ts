import { parseSide } from "@/utils/token-amount"

export type SendSide = "private" | "public"

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
