// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `ViewExecutor` — the read-only dApp RPC family (simulate, utility,
 * profile, metadata/chain-info getters), moved verbatim off the
 * execution facade.
 *
 * No lane deps here by design: these paths take no execution slot, no
 * journal record, and no cancel controller — they are stateless reads
 * (plus PXE-local contract registration as a simulation prerequisite in
 * `executeSimulateUtility`). Service instances are injected directly;
 * there is no seam to swap.
 */

import { type Aliased, ContractInitializationStatus } from "@aztec-labs/aztec.js/wallet"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import type { ChainInfo } from "@aztec-labs/entrypoints/interfaces"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { PackedPrivateEvent } from "@aztec-labs/pxe/client/bundle"
import {
	type AbiDecoded,
	decodeFromAbi,
	encodeArguments,
	FunctionCall,
	FunctionSelector,
	FunctionType,
	getFunctionReturnType,
} from "@aztec-labs/stdlib/abi"
import { AuthWitness } from "@aztec-labs/stdlib/auth-witness"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import type { TxProfileResult, TxSimulationResult, UtilityExecutionResult } from "@aztec-labs/stdlib/tx"
import { liveChainInfo } from "@nulo/aztec-runtime/utils"
import { InvalidWalletArgumentsError, UnsupportedMethodError } from "@nulo/extension-messaging/errors"
import z from "zod"
import type { AccountService } from "@/wallet/services/account/service"
import type { ContactService } from "@/wallet/services/contact/service"
import { type NetworkService, networkInfoFrom } from "@/wallet/services/network/service"
import type { NetworkInfo } from "@/wallet/services/network/spec"
import type { ProfileService } from "@/wallet/services/profile/service"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { toAppFacingSimulationResult, toAppFacingUtilityResult } from "./app-facing-results"
import { assertSelectorBinding, CALL_BINDING, type ContractResolver, findFunctionByName, findFunctionBySelector } from "./contract-resolver"
import { rehydrateOptimizablePrefix, runFastPath } from "./fast-path"
import { applyEmbeddedFpcGasCap } from "./fee/embedded-fpc-cap"
import { suggestGasLimits } from "./fee/fee-strategy"
import type { OperationPlanner } from "./operation-planner"
import type {
	AztecExecuteUtilityOperation,
	AztecGetAddressBookOperation,
	AztecGetChainInfoOperation,
	AztecGetContractClassMetadataOperation,
	AztecGetContractMetadataOperation,
	AztecGetPrivateEventsOperation,
	AztecProfileTxOperation,
	AztecSimulateTxOperation,
	SimulateTransactionOperation,
	SimulateUtilityOperation,
} from "./spec"
import type { TxRequestBuilder } from "./tx-request-builder"

export interface ViewExecutorDeps {
	planner: OperationPlanner
	resolver: ContractResolver
	txBuilder: TxRequestBuilder
	pxeService: PxeServiceClient
	profileService: ProfileService
	networkService: NetworkService
	accountService: AccountService
	contactService: ContactService
	logDebug(msg: string, ...rest: unknown[]): void
	logError(msg: string, ...rest: unknown[]): void
}

/** Whether `address` is one of the profile's accounts that the dApp session does not hold. */
function isWithheldAccount(address: string, accounts: readonly { address: string }[], sessionAccounts: readonly string[]): boolean {
	const key = address.toLowerCase()
	const same = (other: string) => other.toLowerCase() === key
	return accounts.some((account) => same(account.address)) && !sessionAccounts.some(same)
}

export class ViewExecutor {
	public constructor(private readonly deps: ViewExecutorDeps) {}

	public async executeSimulateTransaction(op: SimulateTransactionOperation): Promise<unknown> {
		const fence = await this.deps.profileService.captureExecutionFence()
		const { txRequest, pxe, account } = await this.deps.txBuilder.buildStandard(
			op,
			fence,
			AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE,
		)
		const simulatedTx = await pxe.simulateTx(txRequest, {
			simulatePublic: op.simulatePublic ?? false,
			skipFeeEnforcement: true,
			scopes: [account.address],
		})
		return {
			gasUsed: simulatedTx.gasUsed,
			privateReturn: simulatedTx.getPrivateReturnValues(),
			publicReturn: simulatedTx.getPublicReturnValues(),
		}
	}

	public async executeSimulateUtility(op: SimulateUtilityOperation): Promise<AbiDecoded> {
		const profile = await requireActiveProfile(this.deps.profileService, "Wallet locked")
		const network = await this.deps.networkService.getNetwork(op.networkId)
		const account = await this.deps.accountService.getAccountContract(profile.id, network.chainId, op.accountAddress)

		const pxe = this.deps.pxeService.getPXE(networkInfoFrom(network))

		const registeredContracts = new Set<string>((await pxe.getContracts()).map((x) => x.toString()))
		const [_, instance] = await this.deps.resolver.resolveInstance(pxe, op.contract)
		const [__, artifact] = await this.deps.resolver.resolveArtifact(pxe, instance.currentContractClassId.toString())
		if (!registeredContracts.has(op.contract)) {
			this.deps.logDebug("Register contract")
			await pxe.registerContract({ instance, artifact })
		}

		const fn = findFunctionByName(artifact, op.method)
		if (!fn) {
			throw new Error("Method not found")
		}
		const fnSelector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)
		const encodedArgs = encodeArguments(fn, op.args)
		const call = new FunctionCall(
			fn.name,
			AztecAddress.fromStringUnsafe(op.contract),
			fnSelector,
			fn.functionType,
			false,
			fn.isStatic,
			encodedArgs,
			getFunctionReturnType(fn),
		)

		await account.ensureRegistered(pxe)
		const { result } = await pxe.executeUtility(call, {
			scopes: [account.address],
		})

		try {
			return decodeFromAbi(getFunctionReturnType(fn), result)
		} catch (error) {
			// `result` is the decoded return of a call executed under the user's own account scope —
			// live private contract state. The expected types and the arity are what diagnose a
			// decode mismatch; the values are the leak.
			this.deps.logError(
				"Failed to decode simulation results",
				getFunctionReturnType(fn),
				{ returnValueCount: Array.isArray(result) ? result.length : 0 },
				error,
			)
			return result as AbiDecoded
		}
	}

	/** Publication is the node's answer; `isArtifactRegistered` says whether this wallet holds the
	 *  artifact, as upstream answers it. A node failure fails the call: a false "not published" would
	 *  make a deploy publish the class again. */
	public async executeAztecGetContractClassMetadata(
		op: AztecGetContractClassMetadataOperation,
	): Promise<{ isContractClassPubliclyRegistered: boolean; isArtifactRegistered: boolean }> {
		const network = await this.deps.networkService.getNetwork(op.networkId)
		const info = networkInfoFrom(network)
		const node = await this.deps.networkService.getNodeForUrl(info.rpcUrl)
		const [artifact, publicClass] = await Promise.all([
			this.deps.pxeService.getContractArtifact(info, op.id, { pxeOnly: true }),
			node.getContractClass(await Fr.schema.parseAsync(op.id.toString())),
		])
		return {
			isContractClassPubliclyRegistered: !!publicClass,
			isArtifactRegistered: !!artifact,
		}
	}

	/** As upstream answers it: the instance and its initialization from this wallet's store, publication
	 *  and upgrade from the node, read for every address alike. A profile account outside the dApp
	 *  session answers exactly as an address the wallet never registered. */
	public async executeAztecGetContractMetadata(op: AztecGetContractMetadataOperation): Promise<{
		instance?: ContractInstanceWithAddress
		initializationStatus: ContractInitializationStatus
		isContractPublished: boolean
		isContractUpdated: boolean
		updatedContractClassId?: Fr
	}> {
		const network = await this.deps.networkService.getNetwork(op.networkId)
		const info = networkInfoFrom(network)
		// The rows of the profile whose store is read, never the active one: a switch mid-call must not
		// pair one profile's store with another's accounts.
		const [stored, accounts] = await Promise.all([
			this.deps.pxeService.getContractInstance(info, op.address, { pxeOnly: true }),
			this.deps.accountService.getAccounts(network.profileId, network.chainId, true),
		])
		const visible = stored && !isWithheldAccount(op.address.toString(), accounts, op.sessionAccounts) ? stored : undefined
		// Simulation needs both the instance AND the artifact in the PXE.
		const isLocallyRegistered = !!visible && (await this.hasLocalArtifact(info, visible))
		const onChain = await this.nodeInstance(info.rpcUrl, op.address.toString())
		const isContractUpdated = !!onChain && !onChain.currentContractClassId.equals(onChain.originalContractClassId)

		return {
			instance: isLocallyRegistered ? visible : undefined,
			initializationStatus: isLocallyRegistered ? ContractInitializationStatus.INITIALIZED : ContractInitializationStatus.UNKNOWN,
			isContractPublished: !!onChain,
			isContractUpdated,
			updatedContractClassId: isContractUpdated ? onChain.currentContractClassId : undefined,
		}
	}

	private async hasLocalArtifact(network: NetworkInfo, instance: ContractInstanceWithAddress): Promise<boolean> {
		try {
			return !!(await this.deps.pxeService.getContractArtifact(network, instance.currentContractClassId, { pxeOnly: true }))
		} catch {
			return false
		}
	}

	/** Best effort: the flags it feeds are hints, so a node failure answers "not published" rather than
	 *  failing the call. Read from the dApp network's own endpoint, never the active profile's. */
	private async nodeInstance(rpcUrl: string, address: string): Promise<ContractInstanceWithAddress | undefined> {
		try {
			const node = await this.deps.networkService.getNodeForUrl(rpcUrl)
			return await node.getContract(await AztecAddress.schema.parseAsync(address))
		} catch {
			// The category only: a node error message can carry the requested address.
			this.deps.logDebug("getContractMetadata: node lookup failed")
			return undefined
		}
	}

	public async executeAztecGetPrivateEvents(op: AztecGetPrivateEventsOperation): Promise<PackedPrivateEvent[]> {
		const network = await this.deps.networkService.getNetwork(op.networkId)
		return this.deps.pxeService.getPrivateEvents(networkInfoFrom(network), op.eventMetadata.eventSelector, op.eventFilter)
	}

	public async executeAztecGetChainInfo(op: AztecGetChainInfoOperation): Promise<ChainInfo> {
		const network = await this.deps.networkService.getNetwork(op.networkId)
		const node = await this.deps.networkService.getNode(network.chainId)
		const nodeInfo = await node.getNodeInfo()
		// This API reports chain identity to the dApp: a drifted node is refused, never relayed.
		return liveChainInfo(network, nodeInfo)
	}

	public async executeAztecGetAddressBook(_op: AztecGetAddressBookOperation): Promise<Aliased<AztecAddress>[]> {
		// TODO: filter by chainId
		return (await this.deps.contactService.getContacts()).map((x) => ({
			alias: x.name,
			item: AztecAddress.fromStringUnsafe(x.address),
		}))
	}

	/** The dApp gets the app-facing shape; the fast path's merge still reads the full standard arm. */
	public async executeAztecSimulateTx(op: AztecSimulateTxOperation): Promise<TxSimulationResult> {
		return toAppFacingSimulationResult(await this.simulateDappTx(op))
	}

	private async simulateDappTx(op: AztecSimulateTxOperation): Promise<TxSimulationResult> {
		if (op.accountAddress !== op.opts?.from?.toString()) {
			throw new Error("Invalid `opts.from`")
		}

		// Mixed-payload fast path. The public-static *prefix* of
		// `op.exec.calls` runs directly against the node via
		// `simulateViaNode`; the remainder goes through PXE in parallel;
		// upstream's `buildMergedSimulationResult` stitches them back in
		// payload order. Mirrors `BaseWallet.simulateTx`.
		//
		// First-tx multicall init exception: when the user's account
		// hasn't sent its first tx yet, `nulo-account.buildTxExecutionRequest`
		// wraps `[ctor, entrypoint(appCalls)]` via `DefaultMultiCallEntrypoint`,
		// producing a doubly-nested execution tree. Upstream's flat
		// `appCallOffset` model can't express that. For mixed-with-remainder
		// payloads in this state, route entirely to the standard path; pure-
		// prefix is still optimized because `simulateViaNode` bypasses the
		// account entirely.
		const split = rehydrateOptimizablePrefix(op.exec?.calls)
		if (split === null) {
			return this.executeAztecSimulateTxStandard(op)
		}
		const { optimizableCalls, remainingRaw } = split

		const profile = await requireActiveProfile(this.deps.profileService, "Wallet locked")
		const network = await this.deps.networkService.getNetwork(op.networkId)
		const node = await this.deps.networkService.getNode(network.chainId)

		if (remainingRaw.length > 0) {
			const account = await this.deps.accountService.getAccountContract(profile.id, network.chainId, op.accountAddress)
			const needsInit = await account.requiresInitialization(node)
			if (needsInit) {
				// Mixed + first-tx → don't try to merge. The naive "normalize
				// the standard arm's private-execution tree onto the inner
				// entrypoint subtree" approach was considered and rejected
				// because:
				//   • publicInputs.gasUsed IS dApp-visible via
				//     TxSimulationResult.gasUsed and would over-report
				//     (ctor gas leaks into the projected result).
				//   • firstNullifier of the multicall result IS the account
				//     init nullifier; carrying it onto an entrypoint-rooted
				//     tree is semantically wrong.
				return this.executeAztecSimulateTxStandard(op)
			}
		}

		const pxe = this.deps.pxeService.getPXE(networkInfoFrom(network))

		const result = await runFastPath({
			node,
			pxe,
			resolver: this.deps.resolver,
			network,
			fromAddr: AztecAddress.fromStringUnsafe(op.accountAddress),
			opts: op.opts,
			optimizableCalls,
			remainingRaw,
			runStandardArm: async (rawCalls) =>
				this.executeAztecSimulateTxStandard({ ...op, exec: { ...op.exec, calls: rawCalls as never } }),
			// Naive — upstream uses it only for error contextualization;
			// no functional impact on sim correctness.
			getContractName: async () => undefined,
			logError: (msg, err) => this.deps.logError(msg, err),
		})
		if (result === null) {
			return this.executeAztecSimulateTxStandard(op)
		}
		return result
	}

	/** Standard path: full PXE simulation through the account entrypoint
	 *  (with stub-account override). Used when the fast path's
	 *  `tryRehydratePureStaticPayload` returns `null` (any non-public-
	 *  static call disqualifies the fast path), when no node block is
	 *  synced, or when a fast-path-exclusive operation throws and signals
	 *  fallback. */
	private async executeAztecSimulateTxStandard(op: AztecSimulateTxOperation): Promise<TxSimulationResult> {
		const fence = await this.deps.profileService.captureExecutionFence()
		const { actions, feePaymentMethod, feeOptions: fee } = await this.deps.planner.processAztecJsPayload(op.exec, op.opts)
		// Thread the dApp's `opts.fee.gasSettings` (including
		// `maxPriorityFeesPerGas`) so `nulo-account.ts`'s
		// `completeFeeOptions` call uses the dApp-supplied values rather
		// than silently defaulting from `node.getCurrentMinFees() * 1.5`.
		const { txRequest, node, pxe, account } = await this.deps.txBuilder.buildStandard(
			{ ...op, actions },
			fence,
			feePaymentMethod,
			undefined,
			op.opts.fee?.gasSettings,
		)
		suggestGasLimits(txRequest, fee)
		await applyEmbeddedFpcGasCap(txRequest, fee, node)
		const additionalScopes = Array.isArray(op.opts.additionalScopes) ? op.opts.additionalScopes : []
		// Thread `stubAccountAddresses` so the simulated account contract
		// is the stubbed pass-through one (override path at
		// `pxe/service.ts:233-246`). Real signing keys never enter PXE
		// during a dApp `simulateTx` — defense-in-depth for read-heavy
		// dApp flows. The third-arg pattern matches `executeNoFromSendTx`'s
		// kernelless discovery sim, so the override mechanism is exercised
		// identically across all dApp-facing sim paths.
		return pxe.simulateTx(
			txRequest,
			{
				simulatePublic: true,
				skipTxValidation: op.opts.skipTxValidation,
				skipFeeEnforcement: op.opts.skipFeeEnforcement ?? true,
				scopes: [account.address, ...additionalScopes],
			},
			[account.address.toString()],
		)
	}

	public async executeAztecExecuteUtility(op: AztecExecuteUtilityOperation): Promise<UtilityExecutionResult> {
		const profile = await requireActiveProfile(this.deps.profileService, "Wallet locked")
		const network = await this.deps.networkService.getNetwork(op.networkId)
		const account = await this.deps.accountService.getAccountContract(profile.id, network.chainId, op.accountAddress)
		const pxe = this.deps.pxeService.getPXE(networkInfoFrom(network))
		await account.ensureRegistered(pxe)
		// Scope checks authorize `call.name`; PXE runs `call.selector`. Bind the two, and rebuild the
		// call from the ABI, or a dApp scoped for `symbol` could read private state through another
		// selector. Only `undefined` means absent; `""` is a mismatch. The scope checker does not
		// validate `selector`, so a malformed call gets a controlled error, not a TypeError.
		if (op.call.to === undefined || op.call.selector === undefined) {
			throw new Error("Malformed executeUtility: call requires a `to` and a `selector`")
		}
		const [, instance] = await this.deps.resolver.resolveInstance(pxe, op.call.to.toString())
		const [, artifact] = await this.deps.resolver.resolveArtifact(pxe, instance.currentContractClassId.toString())
		const fn = assertSelectorBinding(await findFunctionBySelector(artifact, op.call.selector.toString()), op.call, CALL_BINDING)
		// PXE would run a private or public function's bytecode as a utility and fail opaquely.
		if (fn.functionType !== FunctionType.UTILITY) throw InvalidWalletArgumentsError.forMethod("executeUtility")
		const boundCall = new FunctionCall(
			fn.name,
			op.call.to,
			op.call.selector,
			fn.functionType,
			// hideMsgSender only applies to enqueued public calls; a utility read
			// has no msg_sender to hide. Force `false` (matching executeSimulateUtility)
			// rather than trust the dApp-supplied flag.
			false,
			fn.isStatic,
			op.call.args,
			getFunctionReturnType(fn),
		)
		const result = await pxe.executeUtility(boundCall, {
			authwits: await z.array(AuthWitness.schema).optional().parseAsync(op.opts.authWitnesses),
			scopes: await z.array(AztecAddress.schema).parseAsync(op.opts.scopes),
		})
		return toAppFacingUtilityResult(result)
	}

	/** No profile mode runs without the account's real signature, so a dApp profile never runs. */
	public async executeAztecProfileTx(_op: AztecProfileTxOperation): Promise<TxProfileResult> {
		throw UnsupportedMethodError.forMethod("profileTx")
	}
}
