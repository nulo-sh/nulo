import { z } from "zod"
import type { ProbedEndpoint, ResetCause, ResetNotice } from "@/wallet/services/stale-network/types"

export {
	ERR_NODE_UNREACHABLE,
	ERR_NOT_RESETTABLE,
	ERR_RESET_IN_PROGRESS,
	ERR_STALE_CHANGED,
} from "@/wallet/services/stale-network/types"
export type { ProbedEndpoint, ResetCause, ResetNotice }

export const NETWORK_RESET_SERVICE_NAME = "network-reset"

/** How long a dApp request or discovery waits for a running reset before it is admitted anyway. */
export const RESET_INGRESS_WAIT_MS = 60_000

/** What the popup confirmed on A3; the first run starts only while a fresh view still says it. */
export type ResetConfirmation = {
	networkReset: boolean
	addressesMoved: boolean
	accountCount: number
	unmovableCount: number
	switchToSeedNode: boolean
	probedEndpoint: ProbedEndpoint | null
}

/** One stale network as the takeover renders it. `accounts` are the ones the reset re-creates,
 *  in index order, hidden ones included. */
export type StaleNetworkView = {
	networkId: string
	name: string
	cause: ResetCause
	/** Mainnet: nothing is offered. */
	blocked: boolean
	accounts: Array<{ name: string; address: string }>
	/** Names of imported accounts whose stored key does not open; the reset drops them. */
	unmovable: string[]
	/** The user's node does not serve the new chain, so the reset makes the seed's node primary. */
	switchToSeedNode: boolean
	/** The user's primary endpoint the decision above was probed on; null when it is the seed's. */
	probedEndpoint: ProbedEndpoint | null
	/** Another network of the profile already uses the chain the reset moves to. */
	heldBy?: { name: string }
	/** Another network of the profile has an unfinished reset. */
	otherPending?: { networkId: string; name: string }
	/** Present while this network has a journal or a running reset. `imported` names the imported
	 *  accounts deleting the network would delete, cleaned for a sentence; empty until a run has saved its journal. */
	reset?: { running: boolean; purged: boolean; doneCount: number; imported: string[] }
}

export type PendingReset = { networkId: string; running: boolean }

export type StaleNetworkChanged = {
	profileId: string
	networkId: string
	running?: boolean
	completed?: { addressesMoved: boolean }
	failed?: true
}

export type Methods = {
	getStaleNetwork(networkId: string): StaleNetworkView | null
	getPendingReset(): PendingReset | null
	resetStaleNetwork(networkId: string, confirmed: ResetConfirmation): StaleNetworkView
	takeResetNotice(profileId: string): ResetNotice | null
}

export type Events = {
	onStaleNetworkChanged: StaleNetworkChanged
}

/** What the dApp ingress needs from the run lock. */
export interface ResetRunGate {
	/** Resolves when no reset runs, or after {@link RESET_INGRESS_WAIT_MS}, whichever is first. */
	waitForRunEnd(): Promise<void>
}

const ProbedEndpointParam = z.object({ id: z.string(), url: z.string() }).strict()

export const NetworkResetMethodSchemas = {
	getStaleNetwork: { params: z.tuple([z.string().min(1)]) },
	getPendingReset: { params: z.tuple([]) },
	resetStaleNetwork: {
		params: z.tuple([
			z.string().min(1),
			z
				.object({
					networkReset: z.boolean(),
					addressesMoved: z.boolean(),
					accountCount: z.number().int().nonnegative(),
					unmovableCount: z.number().int().nonnegative(),
					switchToSeedNode: z.boolean(),
					probedEndpoint: ProbedEndpointParam.nullable(),
				})
				.strict(),
		]),
	},
	takeResetNotice: { params: z.tuple([z.string().min(1)]) },
} as const
