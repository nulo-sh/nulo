import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"
import {
	ERR_DUPLICATE_ENDPOINT,
	ERR_ENDPOINT_CHAIN_MISMATCH,
	ERR_RPC_URL_HIDDEN_CHARACTERS,
	ERR_RPC_URL_IPV6_LOOPBACK,
} from "@/wallet/services/network/spec"

/** Finds an RPC URL field line in a serialized validation error, which carries every issue's message. */
export function refusedRpcUrlLine(msg: string): string | undefined {
	return [ERR_RPC_URL_HIDDEN_CHARACTERS, ERR_RPC_URL_IPV6_LOOPBACK].find((line) => msg.includes(line))
}

/** The RPC URL field's copy for a rejected endpoint save. `chainId` is read only for a chain
 *  mismatch, so each popup keeps its own reaction to a network that left the store mid-request. */
export function endpointErrorText(err: unknown, copy: { duplicate: string; chainId: () => number | undefined }): string {
	const msg = errorMessageFromUnknown(err)
	const refused = refusedRpcUrlLine(msg)
	if (refused) return refused
	if (msg.includes(ERR_ENDPOINT_CHAIN_MISMATCH)) return `Wrong chain. This network is chain ${copy.chainId()}.`
	if (msg.includes(ERR_DUPLICATE_ENDPOINT)) return copy.duplicate
	if (msg === "Failed to fetch node info") return "RPC didn't respond. Check the URL."
	return "Something went wrong."
}
