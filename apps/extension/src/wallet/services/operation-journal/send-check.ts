import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { TxHash, type TxReceipt } from "@aztec-labs/stdlib/tx"
import type { SendExpiry, SendInclusion } from "@nulo/wallet-core/jobs"
import { LogLevel } from "@nulo/wallet-core/logger"
import type { ClockPort, TimerHandle } from "@nulo/wallet-core/ports"
import type { ILogger } from "@/wallet/logger"
import type { NetworkService } from "@/wallet/services/network/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { ProfileService } from "@/wallet/services/profile/service"
import type { TokenBalanceService } from "@/wallet/services/token-balance/service"
import { FINALITY_READ_INTERVAL_MS, proveExpired, proveFinal } from "@/wallet/services/transaction/inclusion"
import { MINED_STATUSES, executionResultFromReceipt, txStatusFromReceipt } from "@/wallet/services/transaction/receipt-status"
import { DROPPED_RECHECK_INTERVAL_MS, DROPPED_RESURRECTION_WINDOW_MS } from "@/wallet/services/transaction/service"
import { TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import { isFinalRefusal } from "./final-refusal"
import { isSendCheckable, type OperationJournalService, type OperationRecord, type SendCheckState } from "./service"
import { OPERATION_JOURNAL_SERVICE_NAME } from "./spec"

export const SEND_CHECK_TICK_MS = 5_000
/** How long after the failure a row is read on every tick; after it, every `DROPPED_RECHECK_INTERVAL_MS`. */
export const SEND_CHECK_FAST_WINDOW_MS = 2 * 60_000

const LOG_SOURCE = OPERATION_JOURNAL_SERVICE_NAME

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
 *  `since` (`refusal`: the node refused it for a reason a later block rarely lifts); a `refused`
 *  one, read in that window for a send that landed after all; an `unconfirmed` one whose expiry
 *  can still prove it went through or never will; or a mined one whose block is not yet final. */
type OpenRow =
	| { kind: "unanswered"; txHash: string; url: string | undefined; since: number; refusal: boolean }
	| { kind: "refused"; txHash: string; url: string; since: number }
	| { kind: "expiring"; txHash: string; url: string; expiry: SendExpiry }
	| { kind: "including"; txHash: string; url: string; check: "sent" | "reverted"; inclusion: SendInclusion }

/** What a read proves, and whether recording it can move a balance. */
type Answer = { next: SendCheckState; refresh: boolean }

/**
 * Records on a failed send's journal row what became of it: mined or not, then whether a mined
 * block became final or was pruned, and whether an unconfirmed send's expiry passed. A row is read
 * one read at a time, only on the endpoint it was sent through and only while its profile is
 * unlocked; only the answer is persisted, so a restart resumes every open row.
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
		// The one guard on every read and write. A lock, a switch, a begun deletion, `stop()` or the
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

	/** After a write, refused or not, the next tick reads the row again to learn what is left. */
	private async readOnce(watch: Watch, live: () => boolean, now: number): Promise<void> {
		const op = await this.deps.journal.getOperation(watch.id)
		const row = op ? openRow(op) : undefined
		if (!op || !row) {
			this.unwatch(watch)
			return
		}
		const answer = await this.answer(watch, row, live, now)
		if (answer === undefined || !live()) return
		const written = await this.deps.journal.setSendCheck(watch.id, row.txHash, expectedOf(row), answer.next, live)
		watch.nextAt = now
		if (!written) return
		this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check answered", {
			journalId: watch.id,
			outcome: answer.next.check ?? "pruned",
		})
		if (answer.refresh && op.accountAddress !== undefined && live()) await this.deps.balances.refreshAccountBalances(op.accountAddress)
	}

	private answer(watch: Watch, row: OpenRow, live: () => boolean, now: number): Promise<Answer | undefined> {
		switch (row.kind) {
			case "unanswered":
				return this.firstAnswer(watch, row, live, now)
			case "refused":
				return this.refusedAnswer(watch, row, live, now)
			case "expiring":
				return this.expiryAnswer(watch, row, live, now)
			default:
				return this.finalityAnswer(watch, row, live, now)
		}
	}

	private async firstAnswer(
		watch: Watch,
		row: Extract<OpenRow, { kind: "unanswered" }>,
		live: () => boolean,
		now: number,
	): Promise<Answer | undefined> {
		const receipt = row.url === undefined ? undefined : await this.receiptOf(watch, row.txHash, row.url, live)
		const verdict = receipt === undefined ? undefined : verdictOf(receipt)
		if (verdict !== undefined) return { next: verdict, refresh: true }
		if (row.url === undefined || now - row.since >= DROPPED_RESURRECTION_WINDOW_MS)
			return { next: { check: "unconfirmed" }, refresh: false }
		// The clock is read again: a read that settles past the window's end refuses nothing.
		if (
			row.refusal &&
			receipt !== undefined &&
			isDropped(receipt) &&
			this.deps.clock.now() - row.since < DROPPED_RESURRECTION_WINDOW_MS
		)
			return { next: { check: "refused" }, refresh: false }
		watch.nextAt = nextReadAt(row.since, now)
		return undefined
	}

	/** Read as an unanswered row is, so a send that landed after all is still found; the window's
	 *  end ends the watch with no further read. */
	private async refusedAnswer(
		watch: Watch,
		row: Extract<OpenRow, { kind: "refused" }>,
		live: () => boolean,
		now: number,
	): Promise<Answer | undefined> {
		if (now - row.since >= DROPPED_RESURRECTION_WINDOW_MS) {
			this.unwatch(watch)
			return undefined
		}
		const receipt = await this.receiptOf(watch, row.txHash, row.url, live)
		const verdict = receipt === undefined ? undefined : verdictOf(receipt)
		if (verdict !== undefined) return { next: verdict, refresh: true }
		watch.nextAt = nextReadAt(row.since, now)
		return undefined
	}

	/** Starts once the device clock passes the expiry and reads until the finalized chain's time
	 *  does. A nullifier that chain holds sends the read on to the row's own receipt. */
	private async expiryAnswer(
		watch: Watch,
		row: Extract<OpenRow, { kind: "expiring" }>,
		live: () => boolean,
		now: number,
	): Promise<Answer | undefined> {
		const expiresAt = row.expiry.timestamp * 1_000
		if (now < expiresAt) {
			watch.nextAt = expiresAt
			return undefined
		}
		watch.nextAt = now + DROPPED_RECHECK_INTERVAL_MS
		const node = await this.nodeFor(row.url, live)
		if (!node) return undefined
		const proof = await proveExpired(node, row.expiry, live).catch(() => undefined)
		if (proof === undefined) {
			this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check expiry read failed", {
				journalId: watch.id,
				stage: "expiry-error",
			})
			return undefined
		}
		if (proof === "expired") return { next: { check: "expired" }, refresh: false }
		if (proof === "present") return this.presentAnswer(watch, row.txHash, node, live)
		watch.nextAt = now + Math.max(DROPPED_RECHECK_INTERVAL_MS, proof * 1_000)
		return undefined
	}

	/** A spent expiry nullifier proves only that some transaction spent it, a replacement included,
	 *  so the row's own receipt decides: a mined success is `sent`. Any other receipt ends the watch
	 *  for this run, unrecorded, so a restart asks once more; a read that fails keeps the slow
	 *  watch, as a failed expiry read does. Read through `node` itself: `receiptOf` folds a
	 *  failed read into no answer. */
	private async presentAnswer(watch: Watch, txHash: string, node: AztecNode, live: () => boolean): Promise<Answer | undefined> {
		if (!live()) return undefined
		let receipt: TxReceipt
		try {
			receipt = await node.getTxReceipt(TxHash.fromString(txHash))
		} catch {
			this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check receipt failed", { journalId: watch.id, stage: "receipt-error" })
			return undefined
		}
		const verdict = verdictOf(receipt)
		if (verdict?.check === "sent") return { next: verdict, refresh: true }
		this.unwatch(watch)
		return undefined
	}

	/** A pruned block returns the row to its first question, with the window restarted now. */
	private async finalityAnswer(
		watch: Watch,
		row: Extract<OpenRow, { kind: "including" }>,
		live: () => boolean,
		now: number,
	): Promise<Answer | undefined> {
		watch.nextAt = now + FINALITY_READ_INTERVAL_MS
		const node = await this.nodeFor(row.url, live)
		if (!node) return undefined
		const proof = await proveFinal(node, row.txHash, row.inclusion, live).catch(() => undefined)
		if (proof === undefined) {
			this.deps.logger.log(LOG_SOURCE, LogLevel.Debug, "send check finality read failed", {
				journalId: watch.id,
				stage: "finality-error",
			})
			return undefined
		}
		if (proof.kind === "final") return { next: { check: row.check }, refresh: false }
		if (proof.kind === "pruned") return { next: { checkSince: now }, refresh: true }
		const moved = proof.kind === "moved" ? verdictOf(proof.receipt) : undefined
		return moved === undefined ? undefined : { next: moved, refresh: true }
	}

	private async receiptOf(watch: Watch, txHash: string, url: string, live: () => boolean): Promise<TxReceipt | undefined> {
		const node = await this.nodeFor(url, live)
		if (!node) return undefined
		try {
			return await node.getTxReceipt(TxHash.fromString(txHash))
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
	const { txHash, submittedEndpointUrl: url, check, expiry, inclusion, checkSince } = progress
	const since = checkSince ?? op.terminalAt ?? op.updatedAt
	if (check === undefined) {
		// Mirrors `isSendCheckMove`: a write it refuses would re-read the row every tick.
		const refusal = checkSince === undefined && isFinalRefusal(op.error?.message)
		return { kind: "unanswered", txHash, url, since, refusal }
	}
	if (url === undefined) return undefined
	if (check === "refused") return { kind: "refused", txHash, url, since }
	if (check === "unconfirmed" && expiry !== undefined) return { kind: "expiring", txHash, url, expiry }
	if ((check === "sent" || check === "reverted") && inclusion !== undefined) return { kind: "including", txHash, url, check, inclusion }
	return undefined
}

function expectedOf(row: OpenRow): SendCheckState {
	if (row.kind === "unanswered") return {}
	if (row.kind === "refused") return { check: "refused" }
	if (row.kind === "expiring") return { check: "unconfirmed" }
	return { check: row.check, inclusion: row.inclusion }
}

/** The result is decided at inclusion, as `waitForTx` decides a send's; the block is kept until it
 *  is final. A mined receipt that names no block is no answer. */
function verdictOf(receipt: Pick<TxReceipt, "status" | "executionResult" | "blockNumber" | "blockHash">): SendCheckState | undefined {
	let status: TxStatus
	try {
		status = txStatusFromReceipt(receipt.status)
	} catch {
		return undefined
	}
	if (!MINED_STATUSES.has(status)) return undefined
	const check = executionResultFromReceipt(receipt.executionResult) === TxExecutionResult.Success ? "sent" : "reverted"
	if (status === TxStatus.Finalized) return { check }
	const { blockNumber, blockHash } = receipt
	if (blockNumber === undefined || blockHash === undefined) return undefined
	return { check, inclusion: { block: blockNumber, hash: blockHash.toString() } }
}

function isDropped(receipt: Pick<TxReceipt, "status">): boolean {
	try {
		return txStatusFromReceipt(receipt.status) === TxStatus.Dropped
	} catch {
		return false
	}
}

function nextReadAt(since: number, now: number): number {
	return now + (now - since < SEND_CHECK_FAST_WINDOW_MS ? SEND_CHECK_TICK_MS : DROPPED_RECHECK_INTERVAL_MS)
}
