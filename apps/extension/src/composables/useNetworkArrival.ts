import { type InjectionKey, type Ref, ref } from "vue"
import { logCallFailure } from "@/wallet/logger/console-forwarding"
import type { Network, NetworkServiceClient } from "@/wallet/services/network/client"

type ArrivalClient = Pick<NetworkServiceClient, "getNetworkArrival" | "answerNetworkArrival">

export interface UseNetworkArrivalOptions {
	/** The shell's current network client: each profile bootstrap replaces it. */
	client: () => ArrivalClient | undefined
	/** The open profile, or undefined while none is. */
	profileId: () => string | undefined
	/** Called when answering fails; the arrival stays. */
	onAnswerFailed: () => void
}

export interface NetworkArrivalState {
	/** The network whose arrival is unanswered, as of the last read. */
	arrived: Ref<Network | null>
	answering: Ref<boolean>
	refresh: () => Promise<void>
	/** Answers the arrival without switching to the network. */
	stay: (networkId: string) => Promise<void>
	dispose: () => void
}

export const NETWORK_ARRIVAL_KEY: InjectionKey<NetworkArrivalState> = Symbol("networkArrival")

/**
 * The unanswered arrival of a default network a later build added. It shows until answered:
 * `stay`, or a switch to that network, which the network service records as the answer.
 */
export function useNetworkArrival(options: UseNetworkArrivalOptions): NetworkArrivalState {
	const arrived = ref<Network | null>(null)
	const answering = ref(false)
	/** Orders the reads: one that returns after a newer read, or after the profile closed, is dropped. */
	let generation = 0

	const refresh = async (): Promise<void> => {
		const mine = ++generation
		const profileId = options.profileId()
		const client = options.client()
		if (!profileId || !client) {
			arrived.value = null
			return
		}
		try {
			const network = await client.getNetworkArrival()
			// The worker's active profile can move before the shell's does.
			if (mine === generation) arrived.value = network?.profileId === profileId ? network : null
		} catch (error) {
			// Nothing reads a superseded read, and the re-read a lock fires supersedes the read it refuses.
			if (mine !== generation) {
				console.debug("network arrival read superseded", { error })
				return
			}
			arrived.value = null
			logCallFailure("network arrival read failed", error)
		}
	}

	const stay = async (networkId: string): Promise<void> => {
		const client = options.client()
		if (!client || answering.value) return
		answering.value = true
		try {
			await client.answerNetworkArrival(networkId)
			generation++
			if (arrived.value?.id === networkId) arrived.value = null
		} catch (error) {
			console.warn("network arrival answer failed", { error })
			options.onAnswerFailed()
		} finally {
			answering.value = false
		}
	}

	const dispose = () => {
		generation++
	}

	return { arrived, answering, refresh, stay, dispose }
}
