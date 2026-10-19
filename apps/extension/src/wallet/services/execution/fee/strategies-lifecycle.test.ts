/**
 * Per-path lifecycle pins for the four fee strategies: the "Estimating fee"
 * task each path starts and finishes, the exact simulation options of every
 * call, the probe-fold choreography with its cancel checkpoints, and the fees
 * each path commits for an explicit priority multiplier.
 *
 * Every build returns a fresh object (its own `pxe` and account address), so a
 * simulation scoped to a stale build fails an identity assertion. Task state is
 * read from a real `TaskService`, whose finish refusals are part of the contract.
 */

import { describe, expect, test, vi } from "vitest"
import { Gas, GasFees, GasSettings } from "@aztec-labs/stdlib/gas"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { FEE_JUICE_ADDRESS } from "@aztec-labs/constants"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { JobCancelledSentinel } from "@nulo/wallet-core/jobs"
import { DummyLogger } from "@/wallet/logger"
import { FpcType } from "@/wallet/services/fpc/service"
import { StepContent, type Task, TaskService, TaskStatus } from "@/wallet/services/task/service"
import type { Action } from "../spec"
import { EmbeddedStrategy } from "./embedded-strategy"
import { FeeJuiceStrategy } from "./fee-juice-strategy"
import { FeeJuiceWithClaimStrategy } from "./fee-juice-with-claim-strategy"
import type { FeeStrategy, FeeStrategyContext, FeeStrategyDeps } from "./fee-strategy"
import { FpcStrategy } from "./fpc-strategy"

const PREEXISTING = AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE
const EXTERNAL = AccountFeePaymentMethodOptions.EXTERNAL
const ORIGINAL = { kind: "call", contract: "0xtoken", method: "transfer", args: [] } as unknown as Action
const DISCOVERED = { kind: "add_private_authwit", content: { kind: "message_hash", messageHash: "0xd" } } as unknown as Action
const PAYLOAD = { kind: "call", contract: "0xfpc", method: "pay", args: [] } as unknown as Action

type BuildOpts = { initWrapped?: boolean; chainId?: number; txsLimits?: Gas }
type Built = ReturnType<typeof makeBuilt>

let buildSeq = 0
function makeBuilt(opts: BuildOpts) {
	const n = ++buildSeq
	return {
		txRequest: {
			origin: { toString: () => (opts.initWrapped ? "0xentrypoint" : "0xaccount") },
			txContext: {
				gasSettings: new GasSettings(new Gas(11_000, 22_000), new Gas(3_300, 4_400), new GasFees(555n, 666n), new GasFees(7n, 8n)),
			},
		},
		node: { getCurrentMinFees: vi.fn(async () => new GasFees(555n, 666n)) },
		pxe: { build: n },
		account: { address: { toString: () => "0xaccount", build: n } },
		network: { chainId: opts.chainId },
		nonce: { toString: () => `nonce-${n}` },
		txCalls: [],
		txsLimits: opts.txsLimits,
	}
}

function sentinelSim() {
	return { gasUsed: { totalGas: new Gas(31_000, 32_000), teardownGas: new Gas(3_500, 3_600) } }
}

type PathName = "fj" | "fjwc" | "embedded" | "fpc two-pass" | "fpc fast path"
const PATHS: PathName[] = ["fj", "fjwc", "embedded", "fpc two-pass", "fpc fast path"]

/** The two-pass path's row: PrivateFPC unless a test names a sponsor added by hand. */
type TwoPassRow = "private fee juice" | "hand-added sponsor"

function makeFpc(path: PathName, chainId?: number, twoPassRow: TwoPassRow = "private fee juice") {
	const sponsor = path === "fpc fast path" || twoPassRow === "hand-added sponsor"
	const type = sponsor ? FpcType.DefaultSponsoredFpc : FpcType.PrivateFpc
	return {
		infoData: { type, isProtocol: path === "fpc fast path" || !sponsor, chainId },
		getTotalGas: () => new Gas(1_000, 2_000),
		getTeardownGas: () => new Gas(100, 200),
		getFeePayload: vi.fn((_account: string, _maxFee: unknown) => [PAYLOAD]),
	}
}

type HarnessOpts = {
	build?: BuildOpts
	fpcChainId?: number
	twoPassRow?: TwoPassRow
	effects?: Action[]
	probe?: boolean
	abortOnFirstSim?: boolean
}

function harness(path: PathName, opts: HarnessOpts = {}) {
	const builds: Built[] = []
	const buildStandard = vi.fn(async (...args: unknown[]) => {
		const built = makeBuilt(opts.build ?? {})
		// As the entrypoint completes them: the priority fee the build is given, else the fixture's.
		const priority = (args[4] as { maxPriorityFeesPerGas?: { feePerDaGas: string; feePerL2Gas: string } } | undefined)
			?.maxPriorityFeesPerGas
		if (priority) {
			const gs = built.txRequest.txContext.gasSettings
			built.txRequest.txContext.gasSettings = new GasSettings(
				gs.gasLimits,
				gs.teardownGasLimits,
				gs.maxFeesPerGas,
				new GasFees(BigInt(priority.feePerDaGas), BigInt(priority.feePerL2Gas)),
			)
		}
		builds.push(built)
		return built
	})
	const controller = new AbortController()
	const simulateTxTask = vi.fn(async (..._args: unknown[]) => {
		if (opts.abortOnFirstSim && simulateTxTask.mock.calls.length === 1) controller.abort()
		return sentinelSim()
	})
	const tasks = new TaskService(new DummyLogger())
	const created: Task[] = []
	const log: string[] = []
	tasks.onTaskCreated.add((task) => {
		created.push(task)
		log.push(`created:${task.content.label}`)
	})
	tasks.onTaskUpdated.add((task) => log.push(`${TaskStatus[task.status]}:${task.content.label}`))
	const fpc = makeFpc(path, opts.fpcChainId, opts.twoPassRow)
	const deps = {
		txBuilder: { buildStandard },
		simulateTxTask,
		fpcService: { getFpcImpl: vi.fn(async () => fpc) },
		tasks,
		logger: { log: () => {} },
	} as unknown as FeeStrategyDeps
	const probe = { extractEffects: vi.fn(async () => opts.effects ?? []) }
	const ctx = makeCtx(path, opts.probe ? probe : undefined, controller.signal)
	return { deps, ctx, builds, buildStandard, simulateTxTask, tasks, created, log, fpc, probe, strategy: strategyFor(path, deps) }
}

function makeCtx(path: PathName, probe: unknown, signal: AbortSignal): FeeStrategyContext {
	const feeSettings = {
		fj: { paymentMethod: { kind: "fj" } },
		fjwc: { paymentMethod: { kind: "fjwc", claimAmount: "1", claimSecret: "0x01", messageLeafIndex: "0" } },
		embedded: { paymentMethod: { kind: "embedded" } },
		"fpc two-pass": { paymentMethod: { kind: "fpc", fpcId: "fpc-1" } },
		"fpc fast path": { paymentMethod: { kind: "fpc", fpcId: "fpc-1" } },
	}[path]
	return {
		op: {
			networkId: "net-1",
			accountAddress: "0xacc",
			actions: [ORIGINAL],
			fee: path === "embedded" ? { embeddedFeePayment: "fpc" } : undefined,
		},
		fence: { profileId: "p1", epoch: 0, session: 1 },
		feeSettings,
		gasPadding: 1,
		signal,
		probe,
	} as unknown as FeeStrategyContext
}

function strategyFor(path: PathName, deps: FeeStrategyDeps): FeeStrategy {
	if (path === "fj") return new FeeJuiceStrategy(deps)
	if (path === "fjwc") return new FeeJuiceWithClaimStrategy(deps)
	if (path === "embedded") return new EmbeddedStrategy(deps)
	return new FpcStrategy(deps)
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise
	} catch (error) {
		return error
	}
	throw new Error("expected a rejection")
}

const estimateTasks = (created: Task[]) => created.filter((t) => t.content.label === "Estimating fee")

/** Every simulation's options, exactly: `stub` or `valid`, scoped to the account of the build whose `pxe` it ran on. */
function expectSimOpts(h: ReturnType<typeof harness>, kinds: Array<"stub" | "valid">) {
	const calls = h.simulateTxTask.mock.calls as unknown[][]
	expect(calls.map((c) => ((c[2] as { skipTxValidation?: boolean }).skipTxValidation ? "stub" : "valid"))).toEqual(kinds)
	for (const call of calls) {
		const built = h.builds.find((b) => b.pxe === call[0])
		expect(built).toBeDefined()
		const address = built?.account.address
		const expected =
			(call[2] as { skipTxValidation?: boolean }).skipTxValidation === true
				? {
						simulatePublic: true,
						skipFeeEnforcement: true,
						skipTxValidation: true,
						scopes: [address],
						stubAccountAddresses: ["0xaccount"],
					}
				: { simulatePublic: true, skipFeeEnforcement: true, scopes: [address] }
		expect(call[2]).toStrictEqual(expected)
		expect((call[2] as { scopes: unknown[] }).scopes[0]).toBe(address)
	}
}

function feesOf(txRequest: { txContext: { gasSettings: GasSettings } }) {
	const fees = txRequest.txContext.gasSettings.maxFeesPerGas
	return [fees.feePerDaGas, fees.feePerL2Gas]
}

describe("estimate task lifecycle", () => {
	test.each(PATHS)("%s: one root task, Completed when the estimate settles", async (path) => {
		const h = harness(path)
		await h.strategy.buildAndEstimate(h.ctx)
		const tasks = estimateTasks(h.created)
		expect(tasks).toHaveLength(1)
		expect(tasks[0]?.parentId).toBeUndefined()
		expect(tasks[0]?.status).toBe(TaskStatus.Completed)
	})

	test.each(PATHS)("%s: under a parent task, a subtask of it", async (path) => {
		const h = harness(path)
		const parent = h.tasks.startNewTask(new StepContent("parent"))
		h.ctx.parentTask = parent
		await h.strategy.buildAndEstimate(h.ctx)
		const tasks = estimateTasks(h.created)
		expect(tasks).toHaveLength(1)
		expect(tasks[0]?.parentId).toBe(parent.id)
		expect(tasks[0]?.status).toBe(TaskStatus.Completed)
	})

	test.each(PATHS)("%s: a build rejection fails the task and rethrows the same object", async (path) => {
		const h = harness(path)
		const boom = new Error("build boom")
		h.buildStandard.mockRejectedValueOnce(boom)
		expect(await rejectionOf(h.strategy.buildAndEstimate(h.ctx))).toBe(boom)
		const tasks = estimateTasks(h.created)
		expect(tasks.map((t) => [t.status, t.error])).toEqual([[TaskStatus.Failed, "build boom"]])
	})

	test.each(PATHS)("%s: a simulation rejection fails the task and rethrows the same object", async (path) => {
		const h = harness(path)
		const boom = new Error("sim boom")
		h.simulateTxTask.mockRejectedValueOnce(boom)
		expect(await rejectionOf(h.strategy.buildAndEstimate(h.ctx))).toBe(boom)
		expect(estimateTasks(h.created).map((t) => [t.status, t.error])).toEqual([[TaskStatus.Failed, "sim boom"]])
	})

	test.each(PATHS)("%s: finalize's admission-cap refusal fails the task with its exact message", async (path) => {
		const h = harness(path, { build: { txsLimits: new Gas(10, 10) } })
		const error = await rejectionOf(h.strategy.buildAndEstimate(h.ctx))
		const message =
			"Simulated gas (da=31000, l2=32000) exceeds the network per-tx admission limit (da=10, l2=10) — this transaction cannot be included."
		expect((error as Error).message).toBe(message)
		expect(estimateTasks(h.created).map((t) => [t.status, t.error])).toEqual([[TaskStatus.Failed, message]])
	})

	test.each([
		{
			name: "fjwc called with another kind",
			run: (deps: FeeStrategyDeps, ctx: FeeStrategyContext) => new FeeJuiceWithClaimStrategy(deps).buildAndEstimate(ctx),
			path: "fj" as PathName,
			message: "FeeJuiceWithClaimStrategy called with non-fjwc payment method",
		},
		{
			name: "embedded without embeddedFeePayment",
			run: (deps: FeeStrategyDeps, ctx: FeeStrategyContext) => new EmbeddedStrategy(deps).buildAndEstimate(ctx),
			path: "fj" as PathName,
			message: "Embedded fee payment not specified",
		},
		{
			name: "fpc called with another kind",
			run: (deps: FeeStrategyDeps, ctx: FeeStrategyContext) => new FpcStrategy(deps).buildAndEstimate(ctx),
			path: "fj" as PathName,
			message: "FpcStrategy called with non-fpc payment method",
		},
	])("pre-task guard: $name rejects with its message and starts no task", async ({ run, path, message }) => {
		const h = harness(path)
		const error = await rejectionOf(run(h.deps, h.ctx))
		expect((error as Error).message).toBe(message)
		expect(h.created).toHaveLength(0)
	})

	test("pre-task guard: an fpc row that cannot be read rejects as-is and starts no task", async () => {
		const h = harness("fpc two-pass")
		const boom = new Error("no row")
		;(h.deps.fpcService.getFpcImpl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(boom)
		expect(await rejectionOf(h.strategy.buildAndEstimate(h.ctx))).toBe(boom)
		expect(h.created).toHaveLength(0)
	})

	test("fast-path cross-chain fallback: the first task completes before the two-pass task starts", async () => {
		const h = harness("fpc fast path", { build: { chainId: 7 }, fpcChainId: 999 })
		await h.strategy.buildAndEstimate(h.ctx)
		expect(h.log).toEqual(["created:Estimating fee", "Completed:Estimating fee", "created:Estimating fee", "Completed:Estimating fee"])
		expect(h.buildStandard.mock.calls.map((c) => c[2])).toEqual([EXTERNAL, PREEXISTING, EXTERNAL])
	})

	test("fast-path cross-chain fallback: a two-pass rejection escapes as-is; the first task stays Completed", async () => {
		const h = harness("fpc fast path", { build: { chainId: 7 }, fpcChainId: 999 })
		const boom = new Error("two-pass boom")
		h.simulateTxTask.mockRejectedValueOnce(boom)
		expect(await rejectionOf(h.strategy.buildAndEstimate(h.ctx))).toBe(boom)
		expect(estimateTasks(h.created).map((t) => [t.status, t.error])).toEqual([
			[TaskStatus.Completed, undefined],
			[TaskStatus.Failed, "two-pass boom"],
		])
	})
})

describe("validated simulation options", () => {
	test.each([
		{ path: "fj" as PathName, kinds: ["valid"] },
		{ path: "fjwc" as PathName, kinds: ["valid"] },
		{ path: "embedded" as PathName, kinds: ["valid"] },
		{ path: "fpc two-pass" as PathName, kinds: ["valid", "valid"] },
		{ path: "fpc fast path" as PathName, kinds: ["valid"] },
	])("$path without a probe: every call is exactly the validated literal, scoped to its own build", async ({ path, kinds }) => {
		const h = harness(path)
		await h.strategy.buildAndEstimate(h.ctx)
		expectSimOpts(h, kinds as Array<"stub" | "valid">)
	})
})

type FoldRow = {
	path: PathName
	cell: "none" | "effects" | "init" | "both"
	methods: AccountFeePaymentMethodOptions[]
	sims: Array<"stub" | "valid">
	actions: Action[]
}

const P = PREEXISTING
const E = EXTERNAL
const FOLD_MATRIX: FoldRow[] = [
	{ path: "fj", cell: "none", methods: [P], sims: ["stub"], actions: [ORIGINAL] },
	{ path: "fj", cell: "effects", methods: [P, P], sims: ["stub", "valid"], actions: [ORIGINAL, DISCOVERED] },
	{ path: "fj", cell: "init", methods: [P, P], sims: ["stub", "valid"], actions: [ORIGINAL] },
	{ path: "fj", cell: "both", methods: [P, P], sims: ["stub", "valid"], actions: [ORIGINAL, DISCOVERED] },
	{ path: "fpc fast path", cell: "none", methods: [E], sims: ["stub"], actions: [PAYLOAD, ORIGINAL] },
	{ path: "fpc fast path", cell: "effects", methods: [E, E], sims: ["stub", "valid"], actions: [PAYLOAD, ORIGINAL, DISCOVERED] },
	{ path: "fpc fast path", cell: "init", methods: [E, E], sims: ["stub", "valid"], actions: [PAYLOAD, ORIGINAL] },
	{ path: "fpc fast path", cell: "both", methods: [E, E], sims: ["stub", "valid"], actions: [PAYLOAD, ORIGINAL, DISCOVERED] },
	{ path: "fpc two-pass", cell: "none", methods: [P, E], sims: ["stub", "valid"], actions: [PAYLOAD, ORIGINAL] },
	{ path: "fpc two-pass", cell: "effects", methods: [P, E], sims: ["stub", "valid"], actions: [PAYLOAD, ORIGINAL, DISCOVERED] },
	{ path: "fpc two-pass", cell: "init", methods: [P, P, E], sims: ["stub", "valid", "valid"], actions: [PAYLOAD, ORIGINAL] },
	{
		path: "fpc two-pass",
		cell: "both",
		methods: [P, P, E],
		sims: ["stub", "valid", "valid"],
		actions: [PAYLOAD, ORIGINAL, DISCOVERED],
	},
]

const foldOpts = (cell: FoldRow["cell"], extra: HarnessOpts = {}): HarnessOpts => ({
	probe: true,
	effects: cell === "effects" || cell === "both" ? [DISCOVERED] : [],
	build: { initWrapped: cell === "init" || cell === "both" },
	...extra,
})

describe("probe fold", () => {
	test.each(FOLD_MATRIX)(
		"$path, $cell: builds, simulations, probe input and final actions",
		async ({ path, cell, methods, sims, actions }) => {
			const h = harness(path, foldOpts(cell))
			await h.strategy.buildAndEstimate(h.ctx)
			expect(h.buildStandard.mock.calls.map((c) => c[2])).toEqual(methods)
			expectSimOpts(h, sims)
			expect(h.probe.extractEffects).toHaveBeenCalledTimes(1)
			const [sim, chain] = h.probe.extractEffects.mock.calls[0] as unknown as [unknown, { node: unknown; network: unknown }]
			expect(sim).toBe(await h.simulateTxTask.mock.results[0]?.value)
			expect(chain.node).toBe(h.builds[0]?.node)
			expect(chain.network).toBe(h.builds[0]?.network)
			expect(h.ctx.op.actions).toEqual(actions)
		},
	)

	test.each(FOLD_MATRIX.filter((row) => row.methods.length > 1 && row.methods[1] === row.methods[0]))(
		"$path, $cell: a cancel during the stubbed sim throws before the second build",
		async ({ path, cell }) => {
			const h = harness(path, foldOpts(cell, { abortOnFirstSim: true }))
			expect(await rejectionOf(h.strategy.buildAndEstimate(h.ctx))).toBeInstanceOf(JobCancelledSentinel)
			expect(h.buildStandard).toHaveBeenCalledTimes(1)
			expect(estimateTasks(h.created).map((t) => t.status)).toEqual([TaskStatus.Failed])
		},
	)

	test("fpc two-pass, effects only: the fold passes; the cancel lands before Pass 2, after one fee read", async () => {
		const h = harness("fpc two-pass", foldOpts("effects", { abortOnFirstSim: true }))
		expect(await rejectionOf(h.strategy.buildAndEstimate(h.ctx))).toBeInstanceOf(JobCancelledSentinel)
		expect(h.buildStandard).toHaveBeenCalledTimes(1)
		expect(h.builds[0]?.node.getCurrentMinFees).toHaveBeenCalledTimes(1)
		expect(h.ctx.op.actions).toEqual([PAYLOAD, ORIGINAL, DISCOVERED])
	})
})

/** Hands `ctx` a hook and returns, in call order, every build, hook call and simulation. */
function hook(h: ReturnType<typeof harness>) {
	const onBuilt = vi.fn(async (_txCalls: unknown) => {})
	h.ctx.onBuilt = onBuilt
	const events = () =>
		[
			...h.buildStandard.mock.invocationCallOrder.map((n) => [n, "build"] as const),
			...onBuilt.mock.invocationCallOrder.map((n) => [n, "hook"] as const),
			...h.simulateTxTask.mock.invocationCallOrder.map((n) => [n, "sim"] as const),
		]
			.sort((a, b) => a[0] - b[0])
			.map(([, tag]) => tag)
	return { onBuilt, events }
}

/** Every build is followed at once by the hook, given that build's own calls. */
function expectEveryBuildHooked(h: ReturnType<typeof harness>, { onBuilt, events }: ReturnType<typeof hook>) {
	const log = events()
	expect(log.flatMap((tag, i) => (tag === "build" ? [log[i + 1]] : []))).toEqual(h.builds.map(() => "hook"))
	expect(onBuilt.mock.calls.length).toBe(h.builds.length)
	for (const [i, [txCalls]] of onBuilt.mock.calls.entries()) expect(txCalls).toBe(h.builds[i]?.txCalls)
}

describe("the build hook", () => {
	test.each(PATHS)("%s: each build's calls reach the hook before anything simulates them", async (path) => {
		const h = harness(path)
		const hooked = hook(h)
		await h.strategy.buildAndEstimate(h.ctx)
		expect(h.builds.length).toBeGreaterThan(0)
		expectEveryBuildHooked(h, hooked)
	})

	test.each(FOLD_MATRIX)(
		"$path, $cell: under a probe, every rebuild is hooked too, the choreography unchanged",
		async ({ path, cell, methods, sims }) => {
			const h = harness(path, foldOpts(cell))
			const hooked = hook(h)
			await h.strategy.buildAndEstimate(h.ctx)
			expect(h.buildStandard.mock.calls.map((c) => c[2])).toEqual(methods)
			expectSimOpts(h, sims)
			expectEveryBuildHooked(h, hooked)
		},
	)

	test.each(PATHS)("%s: a simulation that rejects has already handed its build's calls over", async (path) => {
		const h = harness(path)
		const { onBuilt } = hook(h)
		const boom = new Error("Assertion failed: balance too low")
		h.simulateTxTask.mockRejectedValueOnce(boom)
		expect(await rejectionOf(h.strategy.buildAndEstimate(h.ctx))).toBe(boom)
		expect(onBuilt.mock.calls).toEqual([[h.builds[0]?.txCalls]])
		expect(onBuilt.mock.calls[0]?.[0]).toBe(h.builds[0]?.txCalls)
	})
})

describe("committed fees for an explicit multiplier", () => {
	test.each(["fj", "fjwc"] as PathName[])("%s: finalize commits the node min × 3", async (path) => {
		const h = harness(path)
		h.ctx.feeMultiplier = 3
		const result = await h.strategy.buildAndEstimate(h.ctx)
		expect(feesOf(result.txRequest as never)).toEqual([1_665n, 1_998n])
	})

	test.each(["fpc two-pass", "fpc fast path"] as PathName[])(
		"%s, a sponsor: the fee basis, Pass 2's cap and the payload's maxFee use × 3",
		async (path) => {
			const h = harness(path, { twoPassRow: "hand-added sponsor" })
			h.ctx.feeMultiplier = 3
			const capsAtSim: bigint[][] = []
			h.simulateTxTask.mockImplementation(async (...args: unknown[]) => {
				capsAtSim.push(feesOf(args[1] as never))
				return sentinelSim()
			})
			const result = await h.strategy.buildAndEstimate(h.ctx)
			expect(feesOf(result.txRequest as never)).toEqual([1_665n, 1_998n])
			if (path === "fpc two-pass") expect(capsAtSim[1]).toEqual([1_665n, 1_998n])
			const lastPayload = h.fpc.getFeePayload.mock.calls.at(-1) as unknown as [string, { toBigInt(): bigint }]
			// 31_000 · 1_665 + 32_000 · 1_998: the final sim's gas at padding 1, priced at the committed basis.
			expect(lastPayload[1].toBigInt()).toBe(115_551_000n)
		},
	)

	test("private fee juice: the level never applies; the cap is the basis × 1.2, rounded up", async () => {
		const h = harness("fpc two-pass")
		h.ctx.feeMultiplier = 3
		const capsAtSim: bigint[][] = []
		h.simulateTxTask.mockImplementation(async (...args: unknown[]) => {
			capsAtSim.push(feesOf(args[1] as never))
			return sentinelSim()
		})
		const result = await h.strategy.buildAndEstimate(h.ctx)
		// 555 × 1.2 = 666; 666 × 1.2 = 799.2, rounded up.
		expect(feesOf(result.txRequest as never)).toEqual([666n, 800n])
		expect(capsAtSim[1]).toEqual([666n, 800n])
		const lastPayload = h.fpc.getFeePayload.mock.calls.at(-1) as unknown as [string, { toBigInt(): bigint }]
		// 31_000 · 666 + 32_000 · 800: the charge the PrivateFPC takes.
		expect(lastPayload[1].toBigInt()).toBe(46_246_000n)
	})

	test("embedded: the multiplier never applies; the committed cap stays at the node min", async () => {
		const h = harness("embedded")
		h.ctx.feeMultiplier = 3
		const result = await h.strategy.buildAndEstimate(h.ctx)
		expect(feesOf(result.txRequest as never)).toEqual([555n, 666n])
	})
})

describe("an app's fee settings against the wallet's", () => {
	function withAppFee(h: ReturnType<typeof harness>, fee: Record<string, unknown>) {
		const op = h.ctx.op as { fee?: Record<string, unknown> }
		op.fee = { ...op.fee, ...fee }
	}

	test.each(["fj", "fjwc"] as PathName[])("%s: the app's cap is committed verbatim, even below the node min", async (path) => {
		const h = harness(path)
		h.ctx.feeMultiplier = 3
		withAppFee(h, { maxFeesPerGas: { feePerDaGas: "5", feePerL2Gas: "6" } })
		const result = await h.strategy.buildAndEstimate(h.ctx)
		expect(feesOf(result.txRequest as never)).toEqual([5n, 6n])
	})

	test.each<[PathName, TwoPassRow]>([
		["fpc two-pass", "hand-added sponsor"],
		["fpc fast path", "hand-added sponsor"],
		["fpc two-pass", "private fee juice"],
	])("%s, %s: the app's cap is committed verbatim, in the cap and in the payload's maxFee", async (path, twoPassRow) => {
		const h = harness(path, { twoPassRow })
		h.ctx.feeMultiplier = 3
		withAppFee(h, { maxFeesPerGas: { feePerDaGas: "99999", feePerL2Gas: "99999" } })
		const capsAtSim: bigint[][] = []
		h.simulateTxTask.mockImplementation(async (...args: unknown[]) => {
			capsAtSim.push(feesOf(args[1] as never))
			return sentinelSim()
		})
		const result = await h.strategy.buildAndEstimate(h.ctx)
		expect(feesOf(result.txRequest as never)).toEqual([99_999n, 99_999n])
		if (path === "fpc two-pass") expect(capsAtSim[1]).toEqual([99_999n, 99_999n])
		const lastPayload = h.fpc.getFeePayload.mock.calls.at(-1) as unknown as [string, { toBigInt(): bigint }]
		// (31_000 + 32_000) · 99_999: the final sim's gas at padding 1, priced at the app's cap.
		expect(lastPayload[1].toBigInt()).toBe(6_299_937_000n)
	})

	// The fixture's build priority is (7, 8); the app's is (70, 80). Without an app cap, the payer's
	// basis rises by the priority: × 2 for the account and a sponsor, × 1.2 for private fee juice,
	// × 1 for the app's own payment.
	test.each<[PathName, [bigint, bigint]]>([
		["fj", [1_180n, 1_412n]],
		["fjwc", [1_180n, 1_412n]],
		["embedded", [625n, 746n]],
		["fpc two-pass", [736n, 880n]],
		["fpc fast path", [1_180n, 1_412n]],
	])("%s: every build commits the app's priority fee, and the cap makes room for it", async (path, cap) => {
		const h = harness(path)
		withAppFee(h, { maxPriorityFeesPerGas: { feePerDaGas: "70", feePerL2Gas: "80" } })
		const result = await h.strategy.buildAndEstimate(h.ctx)
		expect(h.buildStandard.mock.calls.length).toBeGreaterThan(0)
		for (const call of h.buildStandard.mock.calls) {
			expect(call[4]).toEqual({ maxPriorityFeesPerGas: { feePerDaGas: "70", feePerL2Gas: "80" } })
		}
		const { maxPriorityFeesPerGas } = (result.txRequest as unknown as { txContext: { gasSettings: GasSettings } }).txContext.gasSettings
		expect([maxPriorityFeesPerGas.feePerDaGas, maxPriorityFeesPerGas.feePerL2Gas]).toEqual([70n, 80n])
		expect(feesOf(result.txRequest as never)).toEqual(cap)
	})

	test.each(PATHS)("%s: with no app fee settings, no build is given a priority fee", async (path) => {
		const h = harness(path)
		await h.strategy.buildAndEstimate(h.ctx)
		for (const call of h.buildStandard.mock.calls) expect(call[4]).toBeUndefined()
	})
})

describe("account reads at V2 and V3", () => {
	const ORDER: Record<"fjwc" | "embedded", string[]> = {
		fjwc: ["built.account", "gasSettings set", "account.address", "simulate"],
		embedded: ["built.account", "gasSettings set", "getCurrentMinFees", "gasSettings set", "account.address", "simulate"],
	}

	test.each(["fjwc", "embedded"] as const)(
		"%s: the account is taken before the gas limits, its address at the simulation",
		async (path) => {
			const h = harness(path)
			const order: string[] = []
			const built = makeBuilt({})
			const { address } = built.account
			const txContext = built.txRequest.txContext
			let gasSettings = txContext.gasSettings
			Object.defineProperty(txContext, "gasSettings", {
				get: () => gasSettings,
				set: (next: GasSettings) => {
					order.push("gasSettings set")
					gasSettings = next
				},
			})
			const account = {
				get address() {
					order.push("account.address")
					return address
				},
			}
			Object.defineProperty(built, "account", {
				enumerable: true,
				get: () => {
					order.push("built.account")
					return account
				},
			})
			built.node.getCurrentMinFees.mockImplementation(async () => {
				order.push("getCurrentMinFees")
				return new GasFees(555n, 666n)
			})
			h.buildStandard.mockResolvedValueOnce(built)
			h.simulateTxTask.mockImplementationOnce(async () => {
				order.push("simulate")
				return sentinelSim()
			})
			const op = h.ctx.op as { fee?: Record<string, unknown> }
			op.fee = { ...op.fee, gasLimits: { daGas: 9, l2Gas: 9 } }
			await h.strategy.buildAndEstimate(h.ctx)
			expect(order.slice(0, order.indexOf("simulate") + 1)).toEqual(ORDER[path])
		},
	)
})

describe("embedded: the app's own fee contract", () => {
	const APP_PAYER = AztecAddress.fromNumberUnsafe(0xa9)
	const FEE_JUICE = AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS)
	const call = (contract: AztecAddress, nested: unknown[] = []) => ({
		publicInputs: { callContext: { contractAddress: contract } },
		nestedExecutionResults: nested,
	})

	function withKernel(route: "fpc" | "fjwc", entrypoint: unknown) {
		const h = harness("embedded")
		h.simulateTxTask.mockImplementation(async () => ({
			...sentinelSim(),
			publicInputs: { feePayer: APP_PAYER },
			privateExecutionResult: { entrypoint },
		}))
		;(h.ctx.op.fee as { embeddedFeePayment: string }).embeddedFeePayment = route
		return h
	}

	test.each([
		["calls nothing of Fee Juice", call(APP_PAYER), false],
		["claims Fee Juice in a nested call", call(APP_PAYER, [call(FEE_JUICE)]), true],
	])("an app contract pays, and its transaction %s: the kernel's payer is named", async (_case, entrypoint, callsFeeJuice) => {
		const { strategy, ctx } = withKernel("fpc", entrypoint)
		const built = await strategy.buildAndEstimate(ctx)
		expect(built.appPayer?.address.equals(APP_PAYER)).toBe(true)
		expect(built.appPayer?.callsFeeJuice).toBe(callsFeeJuice)
	})

	test("a claim to the sender names no app payer: the sender pays itself", async () => {
		const { strategy, ctx } = withKernel("fjwc", call(APP_PAYER))
		expect((await strategy.buildAndEstimate(ctx)).appPayer).toBeUndefined()
	})
})
