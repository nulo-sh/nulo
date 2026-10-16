// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `FeeStrategy` — fee-payment strategy family. Replaces the 4-way
 * switch inside `buildAndEstimateTxRequest` with a polymorphic strategy
 * interface. Each impl owns its own fee-payload injection +
 * simulate-and-finalize sequence:
 *
 *   - `FeeJuiceStrategy` (kind "fj") — plain FeeJuice, single-pass
 *   - `FeeJuiceWithClaimStrategy` (kind "fjwc") — prepend claim payload
 *   - `FpcStrategy` (kind "fpc") — two-pass: estimate with FJ first, then
 *     compute maxFee, prepend FPC fee payload, re-simulate with External
 *   - `EmbeddedStrategy` (kind "embedded") — dApp's own FPC; maxFeesPerGas
 *     is capped before simulation and committed as is, within its budget
 *
 * Shared helpers + the dispatch map live here. Per-strategy impls live
 * in `./{fee-juice,fee-juice-with-claim,fpc,embedded}-strategy.ts`.
 *
 * ## Return shape
 *
 * Strategies return a `FeeEstimate` — the `BuiltStandardTx` bundle plus
 * the `feePaymentMethod` the strategy resolved. Named fields are the
 * contract; the old positional 8-tuple was a silent-transposition hazard.
 *
 * ## Action array mutation (preserved)
 *
 * FJWC and FPC both mutate `ctx.op.actions` via `unshift` / `splice`.
 * That was intentional in the original code — the op passed in is
 * already a defensive clone done by the facade right before dispatch.
 * Strategies operate on the cloned array; caller-side state stays
 * untouched.
 *
 * ## Priority multiplier
 *
 * `feeSettings.priorityLevel` ("normal" / "fast" / "urgent") maps to
 * a numeric multiplier via `FEE_MULTIPLIERS` (`feeMultiplierFor`).
 * All strategies get the pre-computed `feeMultiplier` in the context.
 * FJ / FJWC pass it to `finalizeGasLimits`; Embedded commits its capped
 * fee instead, so no multiplier applies there. A sponsor row applies it to
 * `baseFees` BEFORE computing maxFee for the fee-payload actions; private
 * fee juice ignores it. Every cap comes from `feeCapFor` (`./fee-cap`).
 *
 * ## The app's priority fee
 *
 * Every build commits the app's `maxPriorityFeesPerGas` (`appPriorityOf`); every later rewrite of the
 * gas settings copies the build's priority through, and `feeCapFor` makes room for it in the cap.
 */

import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from "@aztec-labs/constants"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { Gas, type GasFees, GasSettings } from "@aztec-labs/stdlib/gas"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { TxExecutionRequest, TxSimulationResult } from "@aztec-labs/stdlib/tx"
import type { ILogger } from "@/wallet/logger"
import type { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import type { Fpc } from "@/wallet/services/fpc/fpc"
import type { FpcService } from "@/wallet/services/fpc/service"
import type { FpcIdentitySnapshot } from "@/wallet/services/fpc/spec"
import type { IPXE } from "@/wallet/services/pxe/client"
import { StepContent, type TaskService, type WrappedTask } from "@/wallet/services/task/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { DiscoveryProbe } from "../discovery-aware-estimator"
import type { Action, FeeOptions, FeeSettings } from "../spec"
import type { BuiltStandardTx, TxRequestBuilder } from "../tx-request-builder"
import type { PartialGasSettingsRPC } from "@nulo/aztec-runtime/account"
import { PRIORITY_MULTIPLIERS, type PriorityLevel } from "@nulo/wallet-bridge"
import { feeCapFor } from "./fee-cap"

const VITE_FEE_MULTIPLIER_RAW = (import.meta.env?.VITE_NULO_FEE_MULTIPLIER ?? "") as string
const VITE_FEE_MULTIPLIER_PARSED = Number.parseFloat(VITE_FEE_MULTIPLIER_RAW)
const FEE_LADDER_SCALE =
	Number.isFinite(VITE_FEE_MULTIPLIER_PARSED) && VITE_FEE_MULTIPLIER_PARSED >= 1
		? VITE_FEE_MULTIPLIER_PARSED / PRIORITY_MULTIPLIERS.normal
		: 1
/** The `maxFeesPerGas` multiplier per speed: `PRIORITY_MULTIPLIERS` in production. A build may set
 *  Normal's with `VITE_NULO_FEE_MULTIPLIER`, so e2e CI can widen the envelope when devnet base fees
 *  drift on loaded runners; Fast and Urgent scale with it, so the ladder keeps its order. Parsed once
 *  at module load; unset, invalid or below 1 leaves the ladder as it is. */
export const FEE_MULTIPLIERS: Record<PriorityLevel, number> = {
	normal: PRIORITY_MULTIPLIERS.normal * FEE_LADDER_SCALE,
	fast: PRIORITY_MULTIPLIERS.fast * FEE_LADDER_SCALE,
	urgent: PRIORITY_MULTIPLIERS.urgent * FEE_LADDER_SCALE,
}
/** The multiplier when no speed is named, which is how the Send page asks for Normal. */
export const DEFAULT_FEE_MULTIPLIER: number = FEE_MULTIPLIERS.normal

/** Result returned by every strategy: the built tx plus the payment
 *  method the strategy resolved. Field names — not positions — are the
 *  contract; same-typed slots (gas/teardown/fee) made the old tuple a
 *  silent-transposition hazard. */
export interface FeeEstimate extends BuiltStandardTx {
	feePaymentMethod: AccountFeePaymentMethodOptions
	/** Set only when a sponsor row pays and the final simulation's kernel names that row's own
	 *  address as fee payer: the account whose Fee Juice the node's admission check reads. */
	sponsor?: { fpcId: string; address: AztecAddress }
	/** The sponsor row this build paid with, as it read it: a reuse entry binds to this, never to a
	 *  later read, which an edit during the build would have moved. Set by every `fpc` build. */
	fpcIdentity?: FpcIdentitySnapshot
	/** Set only when the app's own fee contract pays: the address the final simulation's kernel names
	 *  as fee payer, and whether the transaction calls Fee Juice, which alone could credit it. */
	appPayer?: { address: AztecAddress; callsFeeJuice: boolean }
}

/** Simulate callback — facade owns the TaskService wrapping so that
 *  strategies stay decoupled from task bookkeeping.
 *  `stubAccountAddresses` swaps those accounts for the stub artifact so
 *  unverifiable authwits surface as offchain effects instead of hard
 *  asserts; a stubbed sim MUST also pass `skipTxValidation: true` (the
 *  node's tx validator rejects the substituted class). Used only by
 *  probed (folded) strategy runs. */
export type SimulateTxFn = (
	pxe: IPXE,
	txRequest: TxExecutionRequest,
	opts: {
		simulatePublic: boolean
		skipFeeEnforcement: boolean
		skipTxValidation?: boolean
		scopes: AztecAddress[]
		stubAccountAddresses?: string[]
	},
	parentTask?: WrappedTask,
) => Promise<TxSimulationResult>

/** Everything a strategy needs to do its job. Packed as a struct for
 *  forward-compat — new fields land without re-signing every impl. */
export type FeeStrategyContext = {
	/** Op already cloned by the caller (actions[] is safe to mutate). */
	op: {
		networkId: string
		accountAddress: string
		actions: Action[]
		fee?: FeeOptions
	}
	/** The authorization every build in the strategy runs under. */
	fence: ExecutionFence
	feeSettings: FeeSettings
	/** `feeMultiplierFor(feeSettings.priorityLevel)`; unset falls back to `DEFAULT_FEE_MULTIPLIER`. */
	feeMultiplier?: number
	/** From op.fee?.gasPadding, defaulted to 1.05 by caller. */
	gasPadding: number
	parentTask?: WrappedTask
	/** Estimate-cancellation signal. Multi-pass strategies check it between
	 *  passes and bail with `JobCancelledSentinel` — a sim already in flight
	 *  cannot be preempted, but the next pass must not start. */
	signal?: AbortSignal
	/** Discovery probe for FOLDED runs (dApp estimate paths only; set
	 *  exclusively by the `DiscoveryAwareEstimator` routing). When present, a
	 *  probe-aware strategy runs its first sim STUBBED (+ skipTxValidation)
	 *  and feeds it to `probe.extractEffects` — discovery and sizing collapse
	 *  into one sim. Absent on every non-dApp path (transfer, send,
	 *  embedded), which therefore keep byte-identical sim options. */
	probe?: DiscoveryProbe
	/** The validated `fpc` row a caller ordered the send against: the build pays with it, never with a
	 *  later read an edit may have moved. Absent, the strategy resolves the row itself. */
	fpc?: Fpc
}

/** Dependencies injected once at construction. */
export type FeeStrategyDeps = {
	txBuilder: TxRequestBuilder
	simulateTxTask: SimulateTxFn
	fpcService: FpcService
	tasks: TaskService
	logger: ILogger
}

/** Strategy contract. Each impl owns one fee kind end-to-end. */
export interface FeeStrategy {
	readonly kind: FeeSettings["paymentMethod"]["kind"]
	buildAndEstimate(ctx: FeeStrategyContext): Promise<FeeEstimate>
}

/** First-sim options shared by every probed (folded) strategy: stubbed
 *  (+`skipTxValidation` — the validator rejects the substituted class) under a
 *  probe, the shipped validated options byte-for-byte without one.
 *
 *  Stubbing is safe for DISCOVERY even on an initialization-wrapped build:
 *  the discovered authwit's inner hash is about the DELEGATED call (token /
 *  consumer), not the deploying account's constructor, so the classic
 *  standalone discovery has always stubbed undeployed accounts. What is NOT
 *  trustworthy for an init-wrapped build is the stub's GAS (stub constructor
 *  ≠ real constructor) — so `isInitWrapped` forces a
 *  validated sizing re-sim there regardless of discovered effects. */
export function probedFirstSimOpts(
	probe: DiscoveryProbe | undefined,
	built: { account: { address: AztecAddress } },
): Parameters<SimulateTxFn>[2] {
	const address = built.account.address
	if (!probe) return validatedSimOpts(address)
	return {
		simulatePublic: true,
		skipFeeEnforcement: true,
		skipTxValidation: true,
		scopes: [address],
		stubAccountAddresses: [address.toString()],
	}
}

/** Verifies witnesses and transaction validity while skipping fee enforcement; scope must match the simulated build. */
export function validatedSimOpts(scope: AztecAddress): Parameters<SimulateTxFn>[2] {
	return { simulatePublic: true, skipFeeEnforcement: true, scopes: [scope] }
}

/** True when the build wraps the account's own deployment (first tx): the
 *  request's `origin` is the multicall entrypoint, not the account. The
 *  stubbed first sim can still DISCOVER, but its gas reflects the STUB
 *  constructor — so a folded run must always take a validated sizing re-sim
 *  here. RPC-free. */
export function isInitWrapped(built: { txRequest: TxExecutionRequest; account: { address: AztecAddress } }): boolean {
	return built.txRequest.origin?.toString() !== built.account.address.toString()
}

/** The gas settings a build starts from: the app's priority fee when it set one. The cap stays the
 *  build's placeholder until a strategy sets it (`feeCapFor`). */
export function appPriorityOf(fee?: FeeOptions): PartialGasSettingsRPC | undefined {
	return fee?.maxPriorityFeesPerGas ? { maxPriorityFeesPerGas: fee.maxPriorityFeesPerGas } : undefined
}

/** Override gas limits on a pre-built tx request from a pending FeeOptions
 *  input. Used by FJ + FJWC + Embedded before simulation. Shared helper
 *  because all three need identical behavior.
 *
 *  Mutates `txRequest.txContext.gasSettings`. */
export function suggestGasLimits(txRequest: TxExecutionRequest, options?: FeeOptions): void {
	if (options?.gasLimits && options.teardownGasLimits) {
		txRequest.txContext.gasSettings = new GasSettings(
			new Gas(options.gasLimits.daGas, options.gasLimits.l2Gas),
			new Gas(options.teardownGasLimits.daGas, options.teardownGasLimits.l2Gas),
			txRequest.txContext.gasSettings.maxFeesPerGas,
			txRequest.txContext.gasSettings.maxPriorityFeesPerGas,
		)
	} else if (options?.gasLimits) {
		txRequest.txContext.gasSettings = new GasSettings(
			new Gas(options.gasLimits.daGas, options.gasLimits.l2Gas),
			txRequest.txContext.gasSettings.teardownGasLimits,
			txRequest.txContext.gasSettings.maxFeesPerGas,
			txRequest.txContext.gasSettings.maxPriorityFeesPerGas,
		)
	} else if (options?.teardownGasLimits) {
		txRequest.txContext.gasSettings = new GasSettings(
			txRequest.txContext.gasSettings.gasLimits,
			new Gas(options.teardownGasLimits.daGas, options.teardownGasLimits.l2Gas),
			txRequest.txContext.gasSettings.maxFeesPerGas,
			txRequest.txContext.gasSettings.maxPriorityFeesPerGas,
		)
	}
}

/** Effective per-tx admission cap: the node-advertised `txsLimits` further
 *  bounded by the protocol maxima on BOTH axes (mirrors upstream
 *  `get_gas_limits.ts` — a node advertising inflated limits must not widen
 *  what the protocol can process). */
export function admissionCap(txsLimits?: Gas): Gas | undefined {
	return txsLimits ? new Gas(Math.min(txsLimits.daGas, MAX_TX_DA_GAS), Math.min(txsLimits.l2Gas, MAX_PROCESSABLE_L2_GAS)) : undefined
}

/** Assert-and-throw for dApp-supplied custom limits against the admission
 *  cap, WITHOUT honoring them — for paths (FPC) whose finalize deliberately
 *  ignores custom limits in the committed gasSettings but still simulates
 *  under them via `suggestGasLimits`. Keeps the clamp contract uniform:
 *  over-cap custom limits throw everywhere, never silently vanish. */
export function assertCustomGasLimitsWithinCap(fee: FeeOptions | undefined, txsLimits?: Gas): void {
	const cap = admissionCap(txsLimits)
	if (!cap || !fee) {
		return
	}
	if (fee.gasLimits && (fee.gasLimits.daGas > cap.daGas || fee.gasLimits.l2Gas > cap.l2Gas)) {
		throw new Error(
			`Requested gasLimits (da=${fee.gasLimits.daGas}, l2=${fee.gasLimits.l2Gas}) exceed the network per-tx admission ` +
				`limit (da=${cap.daGas}, l2=${cap.l2Gas}).`,
		)
	}
	if (fee.teardownGasLimits && (fee.teardownGasLimits.daGas > cap.daGas || fee.teardownGasLimits.l2Gas > cap.l2Gas)) {
		throw new Error(
			`Requested teardownGasLimits (da=${fee.teardownGasLimits.daGas}, l2=${fee.teardownGasLimits.l2Gas}) exceed the ` +
				`network per-tx admission limit (da=${cap.daGas}, l2=${cap.l2Gas}).`,
		)
	}
}

/** Final gas-limit + maxFee calculation after a simulation. FJ / FJWC /
 *  Embedded call this; FPC has a custom post-simulation path.
 *
 *  `feeMultiplier` — when unset, falls back to `DEFAULT_FEE_MULTIPLIER`. It
 *  prices only the refetch below, which an embedded payment never reaches.
 *
 *  `txsLimits` — the build-time-retained per-tx admission cap (further bounded
 *  by the protocol's `MAX_TX_DA_GAS` / `MAX_PROCESSABLE_L2_GAS`). When present:
 *  - measured usage already over the cap ⇒ THROW (the tx can never be
 *    admitted; an uncapped estimate would fail later, at the node, with a
 *    worse error);
 *  - auto-derived limits (measured × padding) are clamped to the cap — the
 *    padding is headroom, not a claim the tx needs that much;
 *  - dApp `customLimits` over the cap ⇒ THROW, never silently capped (a
 *    dApp-visible behavior contract; capping silently would commit different
 *    bytes than the dApp signed off on).
 *  Absent (defensive), behavior is unchanged. */
export async function finalizeGasLimits(
	node: AztecNode,
	txRequest: TxExecutionRequest,
	simulatedTx: TxSimulationResult,
	gasPadding: number,
	maxFeesPerGas?: GasFees,
	customLimits?: FeeOptions,
	feeMultiplier?: number,
	txsLimits?: Gas,
): Promise<void> {
	const multiplier = feeMultiplier ?? DEFAULT_FEE_MULTIPLIER
	if (!maxFeesPerGas) {
		// An embedded payment's own cap was set before the simulation, and an app's fee contract may
		// have checked a budget against it there: a refetch would commit a different cap than the one
		// it simulated under.
		maxFeesPerGas =
			customLimits?.embeddedFeePayment !== undefined
				? txRequest.txContext.gasSettings.maxFeesPerGas
				: await feeCapFor(node, {
						payer: "account",
						multiplier,
						appCap: customLimits?.maxFeesPerGas,
						appPriority: customLimits?.maxPriorityFeesPerGas,
					})
	}

	const cap = admissionCap(txsLimits)
	if (cap) {
		const measured = simulatedTx.gasUsed.totalGas
		if (measured.daGas > cap.daGas || measured.l2Gas > cap.l2Gas) {
			throw new Error(
				`Simulated gas (da=${measured.daGas}, l2=${measured.l2Gas}) exceeds the network per-tx admission limit ` +
					`(da=${cap.daGas}, l2=${cap.l2Gas}) — this transaction cannot be included.`,
			)
		}
	}

	const gasLimits = resolveLimitLimb("gasLimits", customLimits?.gasLimits, simulatedTx.gasUsed.totalGas, gasPadding, cap)
	const teardownGasLimits = resolveLimitLimb(
		"teardownGasLimits",
		customLimits?.teardownGasLimits,
		simulatedTx.gasUsed.teardownGas,
		gasPadding,
		cap,
	)

	txRequest.txContext.gasSettings = new GasSettings(
		gasLimits,
		teardownGasLimits,
		maxFeesPerGas,
		txRequest.txContext.gasSettings.maxPriorityFeesPerGas,
	)
}

/** One limit limb (gasLimits / teardownGasLimits): a dApp custom limit over
 *  the cap THROWS — never silently capped (a dApp-visible behavior contract;
 *  capping silently would commit different bytes than the dApp signed off
 *  on) — while auto-derived limits (measured × padding) clamp to the cap
 *  (the padding is headroom, not a claim the tx needs that much). */
function resolveLimitLimb(
	label: "gasLimits" | "teardownGasLimits",
	custom: { daGas: number; l2Gas: number } | undefined,
	measured: Gas,
	gasPadding: number,
	cap: Gas | undefined,
): Gas {
	if (custom) {
		const limits = new Gas(custom.daGas, custom.l2Gas)
		if (cap && (limits.daGas > cap.daGas || limits.l2Gas > cap.l2Gas)) {
			throw new Error(
				`Requested ${label} (da=${limits.daGas}, l2=${limits.l2Gas}) exceed the network per-tx admission ` +
					`limit (da=${cap.daGas}, l2=${cap.l2Gas}).`,
			)
		}
		return limits
	}
	const padded = measured.mul(gasPadding)
	return cap ? new Gas(Math.min(padded.daGas, cap.daGas), Math.min(padded.l2Gas, cap.l2Gas)) : padded
}

/** Wrap an estimate-fee block in a TaskService step for UI bookkeeping.
 *  Shared because every strategy does identical wrapping. */
export function startEstimateTask(tasks: TaskService, parentTask?: WrappedTask): WrappedTask {
	const step = new StepContent("Estimating fee")
	return parentTask ? parentTask.startSubtask(step) : tasks.startNewTask(step)
}
