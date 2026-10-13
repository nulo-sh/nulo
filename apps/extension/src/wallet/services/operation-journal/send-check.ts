import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { TxHash, type TxReceipt } from "@aztec-labs/stdlib/tx"
import type { SendCheckOutcome, SendExpiry } from "@nulo/wallet-core/jobs"
import { LogLevel } from "@nulo/wallet-core/logger"
import type { ClockPort, TimerHandle } from "@nulo/wallet-core/ports"
import type { ILogger } from "@/wallet/logger"
import type { NetworkService } from "@/wallet/services/network/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { ProfileService } from "@/wallet/services/profile/service"
import type { TokenBalanceService } from "@/wallet/services/token-balance/service"
import { proveExpired } from "@/wallet/services/transaction/inclusion"
import { executionResultFromReceipt, txStatusFromReceipt } from "@/wallet/services/transaction/receipt-status"
import { DROPPED_RECHECK_INTERVAL_MS, DROPPED_RESURRECTION_WINDOW_MS } from "@/wallet/services/transaction/service"
import { TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import { isSendCheckable, type OperationJournalService, type OperationRecord } from "./service"
import { OPERATION_JOURNAL_SERVICE_NAME } from "./spec"

export const SEND_CHECK_TICK_MS = 5_000
/** How long after the failure a row is read on every tick; after it, every `DROPPED_RECHECK_INTERVAL_MS`. */
export const SEND_CHECK_FAST_WINDOW_MS = 2 * 60_000

const LOG_SOURCE = OPERATION_JOURNAL_SERVICE_NAME
const MINED: ReadonlySet<TxStatus> = new Set([TxStatus.Proposed, TxStatus.Checkpointed, TxStatus.Proven, TxStatus.Finalized])

export type SendCheckDeps = {
	journal: Pick<OperationJournalService, "getOperation" | "getOperations" | "setSendCheck" | "onOperationUpdated" | "onOperationDeleted">
	network: Pick<NetworkService, "getSingleAttemptNodeForUrl">
	profile: Pick<ProfileService, "captureExecutionFence" | "isFenceLive">
	balances: Pick<TokenBalanceService, "refreshAccountBalances">
	logger: ILogger
	clock: ClockPort
}

type Watch = {
	id: string
	profileId: string
	nextAt: number
	inFlight: boolean
}

/** A row whose answer can still change: one with none yet, read against the window that starts at
 *  `since`, or an `unconfirmed` one whose expiry can still prove it will never go through. */
type OpenRow =
	| { kind: "unanswered"; txHash: string; url: string | undefined; since: number }
	| { kind: "expiring"; txHash: string; url: string; expiry: SendExpiry }

/**
 * Asks the network what became of a failed send that may have reached it, and records the answer
 * on the journal row. A row is read only on the endpoint it was sent through, only while its
 * profile is the unlocked one, and one read at a time; nothing is persisted but the answer, so a
 * restart resumes every open row. Each read acts on the row as it loads it, so a write that the
 * row's own update re-announces never leaves it unwatched.
 */
export class SendCheck {
	private readonly deps: SendCheckDeps
	private readonly watches = new Map<string, Watch>()
	/** Bumped by `stop()`: a read begun under an older value writes nothing. */
	private generation = 0
	private timer: TimerHandle | undefined

	public constructor(deps: SendCheckDeps) {
		this.deps = deps
	}

	public async start(): Promise<void> {
		const { journal, clock } = this.deps
		const generation = this.generation
		journal.onOperationUpdated.add(this.onUpdated)
		journal.onOperationDeleted.add(this.onDeleted)
		this.timer = clock.setInterval(() => void this.tick(), SEND_CHECK_TICK_MS)
		const failed = await journal.getOperations({ stage: "failed" })
		if (generation !== this.generation) return
		for (const op of failed) this.watch(op)
	}

	public stop(): void {
		const { journal, clock } = this.deps
		this.generation += 1
		if (this.timer !== undefined) clock.clearInterval(this.timer)
		this.timer = undefined
		journal.onOperationUpdated.remove(this.onUpdated)
		journal.onOperationDeleted.remove(this.onDeleted)
		this.watches.clear()
	}

	private readonly onUpdated = (op: OperationRecord): void => this.watch(op)

	private readonly onDeleted = (op: OperationRecord): void => {
		this.watches.delete(op.id)
	}

	/** Keeps an existing watch, so the guard of a read in flight outlives the row's next update. */
	private watch(op: OperationRecord): void {
		if (!openRow(op) || this.watches.has(op.id)) return
		this.watches.set(op.id, { id: op.id, profileId: op.profileId, nextAt: this.deps.clock.now(), inFlight: false })
	}

	private unwatch(watch: Watch): void {
		if (this.watches.get(watch.id) === watch) this.watches.delete(watch.id)
	}

	private async tick(): Promise<void> {
		const generation = this.generation
		let fence: ExecutionFence
		try {
			fence = await this.deps.profile.captureExecutionFence()
		} catch {
			return
		}
		const now = this.deps.clock.now()
		for (const watch of this.watches.values()) {
			if (watch.inFlight || now < watch.nextAt || watch.profileId !== fence.profileId) continue
			void this.read(watch, fence, generation, now)
		}
	}

	private async read(watch: Watch, fence: ExecutionFence, generation: number, now: number): Promise<void> {
		// The one guard on every dial and write. A lock, a switch, a begun deletion, `stop()` or the
		// row's deletion makes it false for good, so a check before each step is enough.
		const live = () => this.deps.profile.isFenceLive(fence) && generation === this.generation && this.watches.get(watch.id) === watch
		watch.inFlight = true
		try {
			await this.readOnce(watch, live, now)
		} catch {
			watch.nextAt = now + DROPPED_RECHECK_INTERVAL_MS
			this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check read failed", { journalId: watch.id, stage: "read-error" })
		} finally {
			watch.inFlight = false
		}
	}

	/** A due watch stays due after a write, refused or not: the next tick's read of the row decides
	 *  what is left to ask. */
	private async readOnce(watch: Watch, live: () => boolean, now: number): Promise<void> {
		const op = await this.deps.journal.getOperation(watch.id)
		const row = op ? openRow(op) : undefined
		if (!op || !row) {
			this.unwatch(watch)
			return
		}
		const check =
			row.kind === "unanswered" ? await this.firstAnswer(watch, row, live, now) : await this.expiryAnswer(watch, row, live, now)
		if (check === undefined || !live()) return
		const expected = row.kind === "unanswered" ? undefined : "unconfirmed"
		if (!(await this.deps.journal.setSendCheck(watch.id, row.txHash, { check: expected }, { check }, live))) return
		this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check answered", { journalId: watch.id, outcome: check })
		const paid = check === "sent" || check === "reverted" ? op.accountAddress : undefined
		if (paid !== undefined && live()) await this.deps.balances.refreshAccountBalances(paid)
	}

	private async firstAnswer(
		watch: Watch,
		row: Extract<OpenRow, { kind: "unanswered" }>,
		live: () => boolean,
		now: number,
	): Promise<SendCheckOutcome | undefined> {
		const verdict = row.url === undefined ? undefined : await this.minedVerdict(watch, row.txHash, row.url, live)
		const last = row.url === undefined || now - row.since >= DROPPED_RESURRECTION_WINDOW_MS
		const check = verdict ?? (last ? "unconfirmed" : undefined)
		if (check === undefined) watch.nextAt = nextReadAt(row.since, now)
		return check
	}

	/** Starts once the device clock passes the expiry and reads until the finalized chain's time
	 *  does. A nullifier that chain holds ends the watch for this run; nothing records it, so a
	 *  restart asks once more. */
	private async expiryAnswer(
		watch: Watch,
		row: Extract<OpenRow, { kind: "expiring" }>,
		live: () => boolean,
		now: number,
	): Promise<SendCheckOutcome | undefined> {
		const expiresAt = row.expiry.timestamp * 1_000
		if (now < expiresAt) {
			watch.nextAt = expiresAt
			return undefined
		}
		watch.nextAt = now + DROPPED_RECHECK_INTERVAL_MS
		const node = await this.nodeFor(row.url, live)
		if (!node) return undefined
		const proof = await proveExpired(node, row.expiry).catch(() => undefined)
		if (proof === undefined) {
			this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check expiry read failed", {
				journalId: watch.id,
				stage: "expiry-error",
			})
			return undefined
		}
		if (proof === "expired") return "expired"
		if (proof === "present") this.unwatch(watch)
		else watch.nextAt = now + Math.max(DROPPED_RECHECK_INTERVAL_MS, proof * 1_000)
		return undefined
	}

	/** `sent` or `reverted` once the node reports the transaction in a block; `undefined` otherwise. */
	private async minedVerdict(watch: Watch, txHash: string, url: string, live: () => boolean): Promise<SendCheckOutcome | undefined> {
		const node = await this.nodeFor(url, live)
		if (!node) return undefined
		try {
			return verdictOf(await node.getTxReceipt(TxHash.fromString(txHash)))
		} catch {
			this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check receipt failed", { journalId: watch.id, stage: "receipt-error" })
			return undefined
		}
	}

	/** One attempt per read: a transport retry would dial after `live()` turned false. */
	private async nodeFor(url: string, live: () => boolean): Promise<AztecNode | undefined> {
		if (!live()) return undefined
		const node = await this.deps.network.getSingleAttemptNodeForUrl(url)
		return live() ? node : undefined
	}
}

function openRow(op: OperationRecord): OpenRow | undefined {
	const { progress } = op
	if (progress.stage !== "failed" || !progress.txHash || !isSendCheckable(op)) return undefined
	const { txHash, submittedEndpointUrl: url, check, expiry } = progress
	if (check === undefined) return { kind: "unanswered", txHash, url, since: op.terminalAt ?? op.updatedAt }
	if (check === "unconfirmed" && expiry !== undefined && url !== undefined) return { kind: "expiring", txHash, url, expiry }
	return undefined
}

function verdictOf(receipt: Pick<TxReceipt, "status" | "executionResult">): SendCheckOutcome | undefined {
	let status: TxStatus
	try {
		status = txStatusFromReceipt(receipt.status)
	} catch {
		return undefined
	}
	if (!MINED.has(status)) return undefined
	// Decided at inclusion, as `waitForTx` decides a send: a block pruned later is not caught.
	return executionResultFromReceipt(receipt.executionResult) === TxExecutionResult.Success ? "sent" : "reverted"
}

function nextReadAt(terminalAt: number, now: number): number {
	return now + (now - terminalAt < SEND_CHECK_FAST_WINDOW_MS ? SEND_CHECK_TICK_MS : DROPPED_RECHECK_INTERVAL_MS)
}
