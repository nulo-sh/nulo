/**
 * `DiscoveryAwareEstimator` — the ONE owner of "discover authwits, then
 * estimate" for the dApp send paths. Owned and invoked exclusively by
 * `DappSendExecutor`; the Send-page transfer flow and `executeSendTransaction`
 * use the probe-free validated pipeline and can never reach this class (the
 * split, distinctly-typed deps are the fence).
 *
 * TWO PIPELINES, routed per-op in `estimate`:
 * - CLASSIC (standalone stubbed discovery sim → splice discovered actions →
 *   validated strategy pipeline) — the pre-fold choreography, kept verbatim
 *   for every op the fold rules exclude.
 * - FOLDED (strategy's first sim runs stubbed with a `CollectingDiscoveryProbe`
 *   and doubles as discovery) — measured at 0.00% stub-vs-validated gas delta
 *   on live testnet; any authorization request, signed or not, forces a
 *   validated rebuild so the run's witness checks are verified before any
 *   estimate leaves the pipeline.
 *
 * `DiscoveryProbe` is deliberately CHAIN-BOUND (this exact one-argument
 * "pure extractor" was proven impossible twice — message hashing needs live
 * `nodeInfo` behind `assertLiveChainIdentity`, fetched lazily ONLY when
 * effects exist). Dropping the live-chain assert would weaken authwit-hash
 * derivation against a drifted RPC — it is pinned as preserved.
 */

import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { WrappedTask } from "@/wallet/services/task/service"
import type { AuthwitDiscoverer, BuildTxRequestFn } from "./authwit-discoverer"
import type { AuthwitSend } from "./decode-authwit-effects"
import { CollectingDiscoveryProbe } from "./discovery-probe"
import type { FeeEstimate, FeeStrategyContext, OnBuilt } from "./fee/fee-strategy"
import { throwIfAborted } from "./rpc-cancel"
import type { Action, AddPrivateAuthwitAction, FeeOptions, FeeSettings, Operation } from "./spec"
import type { DiscoveredAuthwit } from "@nulo/wallet-bridge"

/** The simulated build a probe reads: the live node and network the hashing is asserted against,
 *  and the send the decoder reads (its signer, its scopes and the witnesses it carries). */
export type DiscoveryProbeContext = { node: FeeEstimate["node"]; network: FeeEstimate["network"] } & AuthwitSend

/** Chain-bound extraction capability handed to fee strategies: a folded strategy's stubbed first
 *  run, or an app-paid send's one validated run. `requested` is true when the run emitted any
 *  authorization request, signed or not: the stub answered every check of the signer's witness,
 *  so only a validated simulation shows what the run needs. */
export interface DiscoveryProbe {
	extractEffects(sim: unknown, ctx: DiscoveryProbeContext): Promise<{ actions: AddPrivateAuthwitAction[]; requested: boolean }>
}

export interface DiscoveryAwareEstimatorDeps {
	authwit: AuthwitDiscoverer
	/** The probe-free validated pipeline (the service's strategy map). */
	buildAndEstimateValidated(
		inputOp: FeeStrategyContext["op"],
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		parentTask?: WrappedTask,
		signal?: AbortSignal,
		onBuilt?: OnBuilt,
	): Promise<FeeEstimate>
	/** The FOLDED pipeline — same strategy dispatch with `ctx.probe` set, so a
	 *  probe-aware strategy runs its first sim stubbed and discovery collapses
	 *  into it. Reached only through the fold routing below. */
	buildAndEstimateFolded(
		inputOp: FeeStrategyContext["op"],
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		probe: DiscoveryProbe,
		parentTask?: WrappedTask,
		signal?: AbortSignal,
		onBuilt?: OnBuilt,
	): Promise<FeeEstimate>
	/** Discovery's throwaway build (hardcoded PREEXISTING_FEE_JUICE inside),
	 *  run under the same fence as the estimate it serves. */
	buildForDiscovery(
		op: Parameters<BuildTxRequestFn>[0],
		paymentMethod: Parameters<BuildTxRequestFn>[1],
		fence: ExecutionFence,
		onBuilt?: OnBuilt,
	): ReturnType<BuildTxRequestFn>
}

export interface DiscoveryEstimateResult {
	built: FeeEstimate
	/** Actions discovery added — surfaced so the executor keeps its existing
	 *  splice/record bookkeeping unchanged. */
	discoveredActions: AddPrivateAuthwitAction[]
	/** The decoded authorization behind each discovered action, same order, then each one another
	 *  account of the send already gave. */
	discovered: DiscoveredAuthwit[]
}

export class DiscoveryAwareEstimator {
	public constructor(private readonly deps: DiscoveryAwareEstimatorDeps) {}

	/**
	 * Discover-then-estimate for a send-like dApp operation. `actions` is the
	 * post-planner set; the caller keeps its own pre-discovery snapshot (the
	 * reuse-fingerprint normalization point) — this method never mutates the
	 * caller's array.
	 *
	 * Routing: fold-eligible ops take the FOLDED pipeline (the strategy's
	 * first sim runs stubbed and doubles as discovery — one sim saved);
	 * everything else keeps the classic standalone-discovery choreography.
	 * Fold eligibility is deliberately narrow:
	 * - `fpc` and `fj` payment kinds (both measured at 0.00% stub delta).
	 *   `fjwc` (claim-coupled setup phase) and `embedded` (dApp-budget
	 *   semantics) keep the classic choreography.
	 * - NO pre-attached `add_private_authwit` action of ANY content kind (the
	 *   rule): a stubbed sim accepts every witness unconditionally, so it
	 *   would mask a broken pre-supplied witness that the validated pipeline
	 *   fails loudly on — intent-authwit-carrying ops NEVER take a fold.
	 * - NO other account in the send's scopes: discovery stubs every scope
	 *   account so that account's request reaches the decoder, and a stub in
	 *   the fold's run would answer that account's checks in a run that can
	 *   size the fee.
	 */
	public async estimate(
		operation: Operation,
		actions: readonly Action[],
		detectedFee: FeeOptions | undefined,
		feeSettings: FeeSettings,
		fence: ExecutionFence,
		parentTask?: WrappedTask,
		signal?: AbortSignal,
		onBuilt?: OnBuilt,
	): Promise<DiscoveryEstimateResult> {
		const hasPreAttachedAuthwit = actions.some((a) => a.kind === "add_private_authwit")
		const foldableKind = feeSettings.paymentMethod.kind === "fpc" || feeSettings.paymentMethod.kind === "fj"
		const withActions = (acts: readonly Action[]) =>
			({ ...operation, actions: [...acts], ...(detectedFee ? { fee: detectedFee } : {}) }) as FeeStrategyContext["op"]
		if (foldableKind && !hasPreAttachedAuthwit && !readsAnotherAccount(operation)) {
			const probe = new CollectingDiscoveryProbe()
			const built = await this.deps.buildAndEstimateFolded(
				withActions(actions),
				feeSettings,
				fence,
				probe,
				parentTask,
				signal,
				onBuilt,
			)
			return { built, discoveredActions: [...probe.collected], discovered: [...probe.discovered] }
		}

		const { actions: discoveredActions, discovered } = await this.deps.authwit.discoverPrivateAuthwits(
			withActions(actions),
			(op, method) => this.deps.buildForDiscovery(op, method, fence, onBuilt),
		)
		// Stage boundary preserved from the inline shape: a cancel landing
		// during discovery must not start the sizing pipeline.
		throwIfAborted(signal)
		const finalActions = discoveredActions.length ? [...actions, ...discoveredActions] : actions
		const built = await this.deps.buildAndEstimateValidated(withActions(finalActions), feeSettings, fence, parentTask, signal, onBuilt)
		return { built, discoveredActions, discovered }
	}
}

/** Whether the send's scopes name an account other than the sender. A scope spelling the sender
 *  differently reads as another account, which only routes the send to the classic choreography. */
function readsAnotherAccount(operation: Operation): boolean {
	if (operation.kind !== "aztec_sendTx") return false
	const scopes: unknown = operation.opts?.additionalScopes
	const sender = operation.accountAddress.toLowerCase()
	return Array.isArray(scopes) && scopes.some((scope) => String(scope).toLowerCase() !== sender)
}
