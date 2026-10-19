/**
 * Whether the popup shows a new default network's arrival. Pure over a snapshot of the shell's
 * state, like the takeover's gate: the arrival is the least urgent full-screen surface, so every
 * other one, and every route the takeover yields to, keeps it waiting.
 */
import type { Network } from "@/wallet/services/network/client"
import { isUncovered, type TakeoverRoute, yieldsTo } from "./stale-takeover"

export interface NetworkArrivalInput {
	logined: boolean
	route: TakeoverRoute
	/** The active network's id. */
	networkId: string | undefined
	/** The network whose arrival is unanswered, as last read. */
	arrived: Network | null
	/** The profile's networks as the shell lists them: a read can predate a deletion. */
	networkIds: readonly string[]
	takeover: boolean
	/** The Terms sheet's verdict, undefined until it has read the acceptance status: the arrival
	 *  waits for it, so the two never mount together. */
	legalSheet: boolean | undefined
}

/** The network the arrival names, or null while the route or a more urgent surface shows. The
 *  migration and integrity barriers cover the whole popup above it, so they need no gate here. */
export function networkArrivalView(input: NetworkArrivalInput): Network | null {
	const { arrived, route } = input
	if (!input.logined || !arrived || !input.networkIds.includes(arrived.id) || isUncovered(route)) return null
	if (input.takeover || input.legalSheet !== false || arrived.id === input.networkId) return null
	return yieldsTo(route) ? null : arrived
}
