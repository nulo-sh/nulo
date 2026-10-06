import { abortableSleep } from "./abortable-sleep"

/** The wallet's answer while a send sharing the transfer's chain state is in flight. */
type Queued = { queued: true; tokenSpent: boolean }

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
 * Asks again, with the same unspent token, until no in-flight send holds the transfer's chain state.
 * `onQueued` runs on every queued answer, before a spent token throws.
 */
export async function estimateWhenClear<T extends object>(
	ask: () => Promise<T | Queued>,
	signal: AbortSignal,
	{ onQueued, pollMs = QUEUED_POLL_MS }: { onQueued?: () => void; pollMs?: number } = {},
): Promise<T> {
	for (;;) {
		const answer = await ask()
		if (!isQueued(answer)) return answer
		onQueued?.()
		if (answer.tokenSpent) throw new EstimateRequeue()
		await abortableSleep(pollMs, signal)
		signal.throwIfAborted()
	}
}
