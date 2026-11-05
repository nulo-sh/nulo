import type { IEventHandler } from "@nulo/wallet-core/utils"
import type { EstimateStarted, TransferFeeQueued } from "@/wallet/services/execution/spec"
import { abortableSleep } from "./abortable-sleep"

/** The wallet's answer while an earlier send holds what the estimate needs. */
type Queued = Pick<TransferFeeQueued, "queued" | "tokenSpent" | "cap">

/** The wallet's report that the estimate asked with `estimateToken` took the slot and runs. */
type StartWatch = {
	events: IEventHandler<EstimateStarted>
	estimateToken: string
	onStarted: () => void
}

const QUEUED_POLL_MS = 2_000

/** The wallet admitted this estimate's token and still answered queued: only a fresh estimate can ask again. */
export class EstimateRequeue extends Error {
	public constructor() {
		super("estimate queued behind an in-flight send")
		this.name = "EstimateRequeue"
	}
}

const isQueued = (answer: unknown): answer is Queued =>
	typeof answer === "object" && answer !== null && (answer as Partial<Queued>).queued === true

/**
 * Asks again, with the same unspent token, until no in-flight send holds what the estimate needs.
 * `onQueued` runs on every queued answer, before a spent token throws; `start.onStarted` runs when
 * the wallet reports this attempt's run, never once `signal` aborted: a superseded call can still
 * be pending.
 */
export async function estimateWhenClear<T extends object>(
	ask: () => Promise<T | Queued>,
	signal: AbortSignal,
	{ onQueued, start, pollMs = QUEUED_POLL_MS }: { onQueued?: (answer: Queued) => void; start?: StartWatch; pollMs?: number } = {},
): Promise<T> {
	const listener = (event: EstimateStarted) => {
		if (event.estimateToken === start?.estimateToken && !signal.aborted) start.onStarted()
	}
	const unwatch = () => start?.events.remove(listener)
	start?.events.add(listener)
	signal.addEventListener("abort", unwatch, { once: true })
	try {
		for (;;) {
			const answer = await ask()
			if (!isQueued(answer)) return answer
			onQueued?.(answer)
			if (answer.tokenSpent) throw new EstimateRequeue()
			await abortableSleep(pollMs, signal)
			signal.throwIfAborted()
		}
	} finally {
		unwatch()
		signal.removeEventListener("abort", unwatch)
	}
}
