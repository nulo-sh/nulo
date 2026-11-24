// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import type { ILogger } from "@/wallet/logger"
import type { ProfileService, ProfileInfo } from "@/wallet/services/profile/service"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import type { TxOrigin } from "@/wallet/services/transaction/service"
import { OriginType } from "@/wallet/services/transaction/spec"
import { randomIdNotIn } from "@/wallet/services/id-allocators"
import { EventHandler } from "@nulo/wallet-core/utils"
import {
	TASK_SERVICE_NAME,
	type Task,
	TaskStatus,
	type ITaskContent,
	EmptyResult,
	type ITaskResult,
	type Methods,
	type Events,
	TASK_RETENTION_PERIOD_MS,
	FINISHED_DAPP_ROOTS_KEPT,
} from "./spec"
import { RefusedTask, WrappedTask } from "./wrapped-task"

export * from "./spec"
export * from "./wrapped-task"

export class TaskService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()("getTask", "getTasks")
	public static name = TASK_SERVICE_NAME

	public readonly dependencies = [PROFILE_SERVICE_NAME] as const

	public readonly onTaskCreated = new EventHandler<Task>()
	public readonly onTaskUpdated = new EventHandler<Task>()
	public readonly onTaskDeleted = new EventHandler<Task>()

	private readonly tasks: Map<string, Task> = new Map()
	private profile?: string = undefined

	private profileService: ProfileService = null!

	public constructor(logger: ILogger) {
		super(TASK_SERVICE_NAME, logger)
	}

	protected async init(services: ServiceCollection) {
		this.profileService = services.get(PROFILE_SERVICE_NAME)
		this.profileService.onActiveProfileChanged.add(this.onActiveProfileChanged)
		// A silent restore emits nothing, so start pulls the profile; a profile emitted during the pull wins.
		const active = await this.profileService.getActiveProfile()
		this.profile ??= active?.id
	}

	/** The registry holds one profile's tasks: a root for another profile, or for none, never enters it. */
	private createRoot(
		owner: string | undefined,
		content: ITaskContent,
		origin: TxOrigin | undefined,
		status: TaskStatus,
		walletTraceId?: string,
	): WrappedTask {
		if (owner === undefined || owner !== this.profile) return new RefusedTask(this, origin)
		return this.createTask(content, undefined, origin, status, walletTraceId)
	}

	private createTask(
		content: ITaskContent,
		parent: Task | undefined,
		origin: TxOrigin | undefined,
		status: TaskStatus,
		walletTraceId?: string,
	): WrappedTask {
		// A stale handle and the incoming-transfer outbox keep ids past a clear, so ids carry 64 random bits.
		const taskId = randomIdNotIn((id) => this.tasks.has(id), 16)

		if (parent?.finishedAt) {
			throw new Error(`Cannot add task to finished parent ${parent.id}`)
		}
		this.cleanupStaleTasks()

		const newTask: Task = {
			id: taskId,
			content,
			status,
			createdAt: Date.now(),
			startedAt: undefined,
			subtasks: [],
			origin,
			parentId: parent?.id,
			finishedAt: undefined,
			result: undefined,
			error: undefined,
			walletTraceId: walletTraceId ?? parent?.walletTraceId,
		}

		if (status !== TaskStatus.Pending) {
			newTask.startedAt = Date.now()
		}

		this.tasks.set(newTask.id, newTask)
		this.emit("onTaskCreated", newTask)

		if (parent) {
			parent.subtasks.push(newTask)
			this.emit("onTaskUpdated", parent)
		}
		return new WrappedTask(newTask.id, this, origin)
	}

	/**
	 * Creates a pending root task.
	 * @param owner - The profile its creator acts for, as the fence, row or network it holds names it. A
	 *   root for any profile but the registry's comes back as a {@link RefusedTask} and emits nothing.
	 */
	public createNewTask(owner: string | undefined, content: ITaskContent, origin?: TxOrigin): WrappedTask {
		return this.createRoot(owner, content, origin, TaskStatus.Pending)
	}

	/**
	 * Creates a processing root task; `owner` as for {@link createNewTask}.
	 * @param walletTraceId - The dApp request it runs for
	 */
	public startNewTask(owner: string | undefined, content: ITaskContent, origin?: TxOrigin, walletTraceId?: string): WrappedTask {
		return this.createRoot(owner, content, origin, TaskStatus.Processing, walletTraceId)
	}

	/** Creates a pending subtask; throws on a parent the registry does not hold. */
	public createSubtask(parentId: string, content: ITaskContent, origin?: TxOrigin): WrappedTask {
		return this.createTask(content, this.getTaskById(parentId), origin, TaskStatus.Pending)
	}

	/** Creates a processing subtask; throws on a parent the registry does not hold. */
	public startSubtask(parentId: string, content: ITaskContent, origin?: TxOrigin): WrappedTask {
		return this.createTask(content, this.getTaskById(parentId), origin, TaskStatus.Processing)
	}

	private validateTaskBeforeFinish(task: Task): void {
		if (task.finishedAt) {
			throw new Error(`Cannot finish already finished task ${task.id}`)
		}
		const unfinishedSubtasks = task.subtasks.filter((t) => !t.finishedAt)
		if (unfinishedSubtasks.length > 0) {
			const unfinishedIds = unfinishedSubtasks.map((t) => t.id).join(", ")
			throw new Error(`Cannot finish task ${task.id} with unfinished subtasks: ${unfinishedIds}`)
		}
	}

	private validateNotPending(task: Task): void {
		if (task.status === TaskStatus.Pending) {
			throw new Error(`Cannot finish pending task ${task.id} since it is not started`)
		}
	}

	/**
	 * Completes task with result.
	 * @param taskId - Task ID to complete
	 * @param result - Completion result (default: EmptyResult)
	 */
	public completeTask(taskId: string, result: ITaskResult = new EmptyResult()): void {
		const task = this.getTaskById(taskId)
		this.validateNotPending(task)
		this.validateTaskBeforeFinish(task)

		task.finishedAt = Date.now()
		task.result = result
		task.status = TaskStatus.Completed
		this.emit("onTaskUpdated", task)
		this.boundFinishedDappRoots(task)
	}

	/**
	 * Fails task with error.
	 * @param taskId - Task ID to fail
	 * @param error - Error message
	 */
	public failTask(taskId: string, error = "Unknown error"): void {
		const task = this.getTaskById(taskId)
		this.validateNotPending(task)
		this.validateTaskBeforeFinish(task)

		task.error = error
		task.finishedAt = Date.now()
		task.status = TaskStatus.Failed
		this.emit("onTaskUpdated", task)
		this.boundFinishedDappRoots(task)
	}

	/**
	 * Cancels task.
	 * @param taskId - Task ID to cancel
	 */
	public cancelTask(taskId: string): void {
		const task = this.getTaskById(taskId)
		this.validateTaskBeforeFinish(task)

		task.finishedAt = Date.now()
		task.status = TaskStatus.Cancelled
		this.emit("onTaskUpdated", task)
		this.boundFinishedDappRoots(task)
	}

	public startTask(taskId: string): void {
		const task = this.getTaskById(taskId)
		if (task.status !== TaskStatus.Pending) {
			throw new Error(`Cannot start task ${taskId} that is not pending`)
		}
		task.status = TaskStatus.Processing
		task.startedAt = Date.now()
		this.emit("onTaskUpdated", task)
	}

	private getTaskById(taskId: string): Task {
		const task = this.tasks.get(taskId)
		if (!task) {
			throw new Error(`Invalid task id: ${taskId}`)
		}
		return task
	}

	/** Non-throwing existence check — unlike `getTaskById`/`startTask`/`getTaskSync`,
	 *  which throw on a missing id. Lets callers distinguish a stale/cleared task id
	 *  (e.g. after a profile switch wipes the map) from a genuine invariant failure. */
	public hasTask(taskId: string): boolean {
		return this.tasks.has(taskId)
	}

	public async getTask(taskId: string): Promise<Task> {
		const task = this.getTaskById(taskId)
		this.cleanupStaleTasks()
		if (!this.tasks.has(taskId)) {
			throw new Error(`Task ${taskId} has been expired`)
		}
		return task
	}

	public getTaskSync(taskId: string): Task {
		const task = this.getTaskById(taskId)
		this.cleanupStaleTasks()
		if (!this.tasks.has(taskId)) {
			throw new Error(`Task ${taskId} has been expired`)
		}
		return task
	}

	public async getTasks(): Promise<Task[]> {
		this.cleanupStaleTasks()
		return this.getRootTasks()
	}

	private getRootTasks(): Task[] {
		return Array.from(this.tasks.values()).filter((t) => !t.parentId)
	}

	private cleanupStaleTasks(): void {
		const now = Date.now()
		const isStale = (task: Task) => task.finishedAt && now - task.finishedAt > TASK_RETENTION_PERIOD_MS
		const staleRoots = this.getRootTasks().filter((task) => isStale(task))

		for (const root of staleRoots) {
			this.deleteTaskTree(root.id)
		}
	}

	/** Runs after a finish is emitted, so its listeners read the task before any drop. */
	private boundFinishedDappRoots(finished: Task): void {
		if (finished.parentId !== undefined || finished.origin?.type !== OriginType.DAPP) return
		const roots = this.getRootTasks().filter((t) => t.finishedAt !== undefined && t.origin?.type === OriginType.DAPP)
		if (roots.length <= FINISHED_DAPP_ROOTS_KEPT) return
		// A stable sort: roots finished in the same millisecond keep their insertion order.
		roots.sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
		for (const root of roots.slice(0, roots.length - FINISHED_DAPP_ROOTS_KEPT)) this.deleteTaskTree(root.id)
	}

	private deleteTaskTree(taskId: string): void {
		const task = this.tasks.get(taskId)
		if (!task) return

		task.subtasks.forEach((child) => this.deleteTaskTree(child.id))
		this.tasks.delete(taskId)
		this.emit("onTaskDeleted", task)
	}

	private readonly onActiveProfileChanged = async (profile?: ProfileInfo) => {
		if (profile) {
			if (this.profile && this.profile !== profile.id) {
				this.tasks.clear()
				this.logDebug(`Tasks cleared for profile #${profile.id}`)
			}
			this.profile = profile.id
		}
	}
}
