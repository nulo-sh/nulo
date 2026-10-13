import type { EventHandler } from "@nulo/wallet-core/utils"
import { type Ref, ref } from "vue"
import { stageSubtitle } from "@/utils/card-subtitle"
import type { SendStarted } from "@/wallet/services/auth-registry/spec"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"

export interface SendStageLineDeps {
	sendStarted: Pick<EventHandler<SendStarted>, "add" | "remove">
	journal: { subscribeJob(id: string, handler: (op: OperationRecord | undefined) => void): Promise<() => void> }
}

export interface SendStageLine {
	/** The awaiting card's stage line for the followed send, or null outside its live stages. */
	line: Ref<string | null>
	/** Awaits the send keyed `correlation`; call it before the request that carries the key. */
	follow: (correlation: string) => void
	/** Forgets the followed send. */
	stop: () => void
	dispose: () => void
}

/**
 * The stage line of a send a popup started, read from the journal record the service names for the
 * popup's own key. Each `follow` opens an epoch: a record callback or a subscription that resolves
 * after its epoch ended is dropped, and that subscription is released at once. The parent owns both
 * clients and calls `dispose()` on unmount.
 */
export function useSendStageLine(deps: SendStageLineDeps): SendStageLine {
	const line = ref<string | null>(null)
	let awaited: string | undefined
	let epoch = 0
	let unsubscribe: (() => void) | undefined

	const onStarted = ({ correlation, journalId }: SendStarted) => {
		if (correlation !== awaited) return
		const mine = epoch
		const show = (op: OperationRecord | undefined) => {
			if (mine !== epoch) return
			const live = op !== undefined && op.terminalAt === null
			line.value = live ? stageSubtitle(op.progress.stage, "backend" in op.progress ? op.progress.backend : undefined) : null
		}
		deps.journal.subscribeJob(journalId, show).then(
			(release) => {
				if (mine === epoch) unsubscribe = release
				else release()
			},
			() => {},
		)
	}
	deps.sendStarted.add(onStarted)

	const stop = () => {
		epoch += 1
		awaited = undefined
		unsubscribe?.()
		unsubscribe = undefined
		line.value = null
	}

	const follow = (correlation: string) => {
		stop()
		awaited = correlation
	}

	const dispose = () => {
		stop()
		deps.sendStarted.remove(onStarted)
	}

	return { line, follow, stop, dispose }
}
