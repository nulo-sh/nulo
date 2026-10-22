import type { TaskService } from "@/wallet/services/task/service"
import { TaskStatus } from "@/wallet/services/task/spec"
import type { TokenBalanceService } from "@/wallet/services/token-balance/service"
import type { IncomingTransferRepository } from "./repository"
import type { IncomingBalanceOutboxRow } from "./spec"

type OutboxRowKey = { profileId: string; networkId: string; accountAddress: string; tokenId: number }
type RefreshRequestResult = { taskId: string } | { busy: true } | { missing: true }

export interface BalanceRefreshOutboxDeps {
	repo: Pick<IncomingTransferRepository, "getOutbox" | "setOutbox" | "deleteOutbox" | "listOutbox">
	activeProfile: () => Promise<{ id: string } | undefined>
	/** The incoming-transfer service lock; `isCurrent` turns false once a watchdog hands it over. */
	withLock: <T>(fn: (isCurrent: () => boolean) => Promise<T>) => Promise<T>
	tokenBalances: Pick<TokenBalanceService, "requestBalanceRefresh">
	tasks: Pick<TaskService, "getTaskSync">
	warn: (...data: unknown[]) => void
}

/** What an anchored outbox row's task state asks of the drain: terminal-success
 *  deletes the row, terminal-failure/missing clears the anchor, pending waits. */
function anchoredRowAction(state: "success" | "failure" | "pending" | "missing"): "delete" | "clear" | "wait" {
	if (state === "success") return "delete"
	if (state === "failure" || state === "missing") return "clear"
	return "wait"
}

/**
 * The balance-refresh outbox: a receipt marks its (account, token) balance dirty, and the drain turns
 * each dirty row into a balance refresh, deleting the row only once a task minted after it succeeds
 * or its balance pair is gone.
 *
 * Every write runs under the service lock: `markDirty`'s callers already hold it, and `drain` takes
 * it once per row. The rows belong to the repository, so scope and token wipes delete them there.
 */
export class BalanceRefreshOutbox {
	public constructor(private readonly deps: BalanceRefreshOutboxDeps) {}

	/**
	 * Write-side: mark a balance dirty (written BEFORE the record). A new receipt OVERWRITES
	 * `dirtyAt` and CLEARS any prior task anchor — the old anchor is stale w.r.t. the newer receipt.
	 * The drain reads these rows and issues the causal refresh.
	 */
	public async markDirty(profileId: string, networkId: string, account: string, tokenId: number): Promise<void> {
		await this.deps.repo.setOutbox(profileId, networkId, account, tokenId, { dirtyAt: Date.now() })
	}

	/**
	 * Causal task-anchored drain of the balance-refresh outbox. Runs on init + every scan
	 * tick. ACTIVE-PROFILE-SCOPED — `TokenBalanceService`'s balance map is active-profile-only, so
	 * draining a background profile's row would look up a missing balance and false-classify it
	 * stale. Per row (re-read under the lock so a concurrent receipt's `dirtyAt` overwrite / anchor
	 * clear wins):
	 *  - anchored + terminal-SUCCESS → the task was minted strictly after this `dirtyAt`, so its
	 *    projection read chain state INCLUDING the receipt → delete the row (causal).
	 *  - anchored + terminal-FAILURE/MISSING → clear the anchor; the next drain re-requests.
	 *  - no anchor → `requestBalanceRefresh`: `{taskId}` (a FRESH task) → anchor it; `{busy}` → keep
	 *    the row unanchored (a later drain, after the in-flight task drains, mints a fresh one);
	 *    `{missing}` (the balance pair is positively gone — token/account removed) → delete the row.
	 *  - `requestBalanceRefresh` THROWS (a transient storage/task failure, NOT a missing pair) → KEEP
	 *    the row and retry next drain; deleting on a transient throw would discard the sole durable
	 *    refresh marker.
	 */
	public async drain(): Promise<void> {
		const profile = await this.deps.activeProfile()
		if (!profile) return
		let rows: Array<[string, IncomingBalanceOutboxRow]>
		try {
			rows = await this.deps.repo.listOutbox()
		} catch (error) {
			this.deps.warn("drainBalanceOutbox: listOutbox failed", error)
			return
		}
		for (const [key] of rows) {
			const parts = key.split("|")
			if (parts.length !== 4) continue
			const [profileId, networkId, accountAddress, tokenIdStr] = parts
			if (profileId !== profile.id) continue // active-profile-scoped
			const tokenId = Number(tokenIdStr)
			if (!Number.isInteger(tokenId)) continue
			const row: OutboxRowKey = { profileId, networkId, accountAddress, tokenId }
			await this.deps.withLock((isCurrent) => this.drainOutboxRow(row, isCurrent))
		}
	}

	/** The per-row locked drain. Every write is guarded by `isCurrent()`, read
	 *  fresh immediately before the write dispatch: a watchdog handoff admits a
	 *  receipt writer whose fresher dirtyAt this displaced section must not
	 *  clobber (an anchor overwrite here launders the new receipt into a
	 *  PRE-receipt task's causality; the next drain's success-delete then drops
	 *  the sole refresh marker — permanent until an unrelated refresh). The
	 *  ticket flips on ANY successor acquisition, so a displaced drain stands
	 *  down at the first write. */
	private async drainOutboxRow(row: OutboxRowKey, isCurrent: () => boolean): Promise<void> {
		const { profileId, networkId, accountAddress, tokenId } = row
		const current = await this.deps.repo.getOutbox(profileId, networkId, accountAddress, tokenId)
		if (!current) return
		if (current.pendingTaskId) {
			const action = anchoredRowAction(this.readTaskState(current.pendingTaskId))
			// pending → keep waiting for the anchored task.
			if (action !== "wait" && isCurrent()) await this.settleAnchoredRow(row, current, action, isCurrent)
			return
		}
		const result = await this.requestRefreshOrKeep(tokenId, accountAddress)
		if (!result) return
		if ("missing" in result) {
			// The (token, account) balance pair is positively gone (removed) → delete the stale row.
			await this.deps.repo.deleteOutbox(profileId, networkId, accountAddress, tokenId, isCurrent)
			return
		}
		if ("taskId" in result) await this.anchorFreshTask(row, current, result.taskId, isCurrent)
		// busy → keep the row unanchored; a later drain mints a fresh post-`dirtyAt` task.
	}

	/** Terminal-success → delete the row; terminal-failure/missing → clear the
	 *  anchor so the next drain re-requests. Entered only after `isCurrent()`, read again once the
	 *  delete's keys are resolved or the clear's row is sealed. */
	private async settleAnchoredRow(
		row: OutboxRowKey,
		current: IncomingBalanceOutboxRow,
		action: "delete" | "clear",
		isCurrent: () => boolean,
	): Promise<void> {
		const { profileId, networkId, accountAddress, tokenId } = row
		if (action === "delete") {
			await this.deps.repo.deleteOutbox(profileId, networkId, accountAddress, tokenId, isCurrent)
		} else {
			await this.deps.repo.setOutbox(profileId, networkId, accountAddress, tokenId, { dirtyAt: current.dirtyAt }, isCurrent)
		}
	}

	/** `requestBalanceRefresh` with a TRANSIENT throw (storage/task, NOT a
	 *  missing pair) mapped to undefined = keep the row + retry next drain.
	 *  Deleting on a throw would lose the only durable refresh marker. */
	private async requestRefreshOrKeep(tokenId: number, accountAddress: string): Promise<RefreshRequestResult | undefined> {
		try {
			return await this.deps.tokenBalances.requestBalanceRefresh(tokenId, accountAddress)
		} catch (error) {
			this.deps.warn("drainBalanceOutbox: refresh request failed transiently, keeping row", error)
			return undefined
		}
	}

	/** Re-read at commit: a wipe (row gone) or a fresh markDirty bump
	 *  (dirtyAt moved) during the refresh await must not be overwritten with
	 *  this older snapshot — stand down and let the next drain see the row's new
	 *  state. Writing anyway would anchor stale dirt to the minted task. The
	 *  receipt writer can only interleave by ACQUIRING the lock (a watchdog
	 *  handoff), which flips the ticket — so the `isCurrent()` check is a true
	 *  guard, not a smaller race window: either the receipt landed before it
	 *  (ticket flipped → stand down) or its write is dispatched after this set
	 *  and last-writer-wins is the receipt. One atomic span: re-read → compare
	 *  → ticket → write. */
	private async anchorFreshTask(
		row: OutboxRowKey,
		current: IncomingBalanceOutboxRow,
		taskId: string,
		isCurrent: () => boolean,
	): Promise<void> {
		const { profileId, networkId, accountAddress, tokenId } = row
		const fresh = await this.deps.repo.getOutbox(profileId, networkId, accountAddress, tokenId)
		if (!fresh || fresh.dirtyAt !== current.dirtyAt) return
		if (!isCurrent()) return
		await this.deps.repo.setOutbox(
			profileId,
			networkId,
			accountAddress,
			tokenId,
			{ dirtyAt: current.dirtyAt, pendingTaskId: taskId },
			isCurrent,
		)
	}

	/** Terminal state of an anchored refresh task via the TaskService ledger (`missing` = expired/gone). */
	private readTaskState(taskId: string): "success" | "failure" | "pending" | "missing" {
		let status: TaskStatus
		let finished: boolean
		try {
			const task = this.deps.tasks.getTaskSync(taskId)
			status = task.status
			finished = task.finishedAt !== undefined
		} catch {
			return "missing"
		}
		if (!finished) return "pending"
		return status === TaskStatus.Completed ? "success" : "failure"
	}
}
