import { formatSnackAmount } from "@/utils/snack-amount"
import { trimAddress } from "@/utils/string"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"

/** A send's recipient as its snacks shorten it, "0x0c2b…4b5c". */
export function sendRecipient(destination: string): string {
	return trimAddress(destination, 6, 4, "…")
}

/** A send as its snacks name it, "10 TST to 0x0c2b…4b5c". The symbol is contract-controlled. */
export function sendSummary(send: { amount: bigint; decimals: number; symbol: string; destination: string }): string {
	const amount = formatSnackAmount(send.amount, send.decimals)
	return `${amount} ${sanitizeWireString(send.symbol, 32)} to ${sendRecipient(send.destination)}`
}
