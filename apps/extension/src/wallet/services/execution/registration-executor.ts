// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `RegistrationExecutor` — the contract, sender and token registrations. None takes an execution
 * slot or cancel controller, or sends, so it has no lane deps; the facade owns dispatch and the
 * guards before it.
 */
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { type ContractArtifact, ContractArtifactSchema } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import {
	CompleteAddress,
	computeContractAddressFromInstance,
	ContractInstanceWithAddressSchema,
	computePartialAddress,
} from "@aztec-labs/stdlib/contract"
import { ContractNotRegisteredError, InvalidWalletArgumentsError, SessionEndedError } from "@nulo/extension-messaging/errors"
import { assertArtifactClassId, assertInstanceArtifactClassId } from "@nulo/aztec-runtime/pxe"
import type { DappSessionService } from "@/wallet/services/dapp-session/service"
import { type NetworkService, networkInfoFrom } from "@/wallet/services/network/service"
import type { Network } from "@/wallet/services/network/spec"
import type { OperationContext } from "@/wallet/services/operation-journal/spec"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import type { ProfileService } from "@/wallet/services/profile/service"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import type { WrappedTask } from "@/wallet/services/task/service"
import type { TokenService } from "@/wallet/services/token/service"
import { OriginType, type LocalTxOrigin } from "@/wallet/services/transaction/service"
import type {
	AztecRegisterContractOperation,
	AztecRegisterSenderOperation,
	OperationApprovalEnvelope,
	RegisterContractOperation,
	RegisterSenderOperation,
	RegisterTokenOperation,
} from "./spec"

/** The app a dApp registration is counted against, and the session it was captured under. */
export type Registrant = { origin: string; fence: ExecutionFence }

export interface RegistrationExecutorDeps {
	networkService: Pick<NetworkService, "getNetwork">
	pxeService: Pick<
		PxeServiceClient,
		"getContractInstance" | "getContractArtifact" | "registerContract" | "registerSender" | "registerAccount"
	>
	tokenService: Pick<TokenService, "parseTokenInterface" | "addTokenAuthorized">
	profileService: Pick<ProfileService, "captureExecutionFence">
	dappSessionService: Pick<DappSessionService, "admitDappRegistration">
}

export class RegistrationExecutor {
	public constructor(private readonly deps: RegistrationExecutorDeps) {}

	// Nulo base:

	public async executeRegisterContract(op: RegisterContractOperation): Promise<void> {
		const addressNum = AztecAddress.fromStringUnsafe(op.address).toBigInt()
		if (addressNum >= 0 && addressNum <= 6) {
			// ignore protocol contracts registration,
			// because we cannot validate it due to hardcoded addresses
			return
		}

		const network = await this.deps.networkService.getNetwork(op.networkId)

		const providedInstance = await ContractInstanceWithAddressSchema.optional().parseAsync(op.instance)
		const instance =
			providedInstance ??
			(await this.deps.pxeService.getContractInstance(networkInfoFrom(network), AztecAddress.fromStringUnsafe(op.address)))
		if (!instance) {
			throw new ContractNotRegisteredError("Contract instance not found")
		}

		const providedArtifact = await ContractArtifactSchema.optional().parseAsync(op.artifact)
		const artifact =
			providedArtifact ?? (await this.deps.pxeService.getContractArtifact(networkInfoFrom(network), instance.currentContractClassId))
		if (!artifact) {
			throw new ContractNotRegisteredError("Contract artifact not found")
		}

		await assertArtifactClassId(artifact, instance.currentContractClassId)

		const contractAddress = await computeContractAddressFromInstance(instance)
		if (contractAddress.toString() !== op.address) {
			throw new Error("Contract address doesn't match instance address")
		}

		await this.deps.pxeService.registerContract(networkInfoFrom(network), { instance, artifact })
	}

	public async executeRegisterSender(op: RegisterSenderOperation): Promise<void> {
		const network = await this.deps.networkService.getNetwork(op.networkId)
		await this.deps.pxeService.registerSender(networkInfoFrom(network), AztecAddress.fromStringUnsafe(op.address))
	}

	public async executeRegisterToken(
		op: RegisterTokenOperation,
		origin: LocalTxOrigin,
		parentTask?: WrappedTask,
		authorizedFence?: ExecutionFence,
		approval?: OperationApprovalEnvelope,
	): Promise<void> {
		// The deletion fence anchors the whole approval→commit chain: the dApp
		// path threads the capture made AT the interaction's session
		// re-validation (upstream of the refreshSession park); popup-origin
		// dispatches capture here, where dispatch IS the authorization. A
		// deletion (or a delete + same-id re-import) landing anywhere after the
		// capture moves the epoch, so the commit's assert against it fails
		// closed. Token ops are not switch-blocked (not a SENDING kind), so
		// every identity below must derive from this one capture plus the
		// ownership-checked network row — never a live re-read. The capture's
		// only throw is the locked gate; re-thrown under the pinned message.
		let fence: ExecutionFence
		if (authorizedFence) {
			fence = authorizedFence
		} else {
			try {
				fence = await this.deps.profileService.captureExecutionFence()
			} catch {
				throw new Error("Wallet locked")
			}
		}
		// A dApp's add stores the details its window showed, so a window that showed none approves nothing.
		const shown = approval?.tokenMetadata
		if (origin.type === OriginType.DAPP && shown === undefined) throw new Error("Token details were not shown for approval")
		const network = await this.deps.networkService.getNetwork(op.networkId)
		// `getNetwork` anchors the row to the ACTIVE profile; tying it to the
		// fence makes the write identity and the commit assert one chain.
		if (network.profileId !== fence.profileId) throw new Error("unauthorized profile")

		// Always parsed here: a popup-supplied interface would carry function
		// mappings nothing authenticated, and they are what gets persisted. Pinned
		// to the class the window read: an interface of another class refuses before any record.
		const ti = await this.deps.tokenService.parseTokenInterface(op.networkId, op.address, parentTask, shown?.classId)

		if (
			ti.getNameFn === undefined ||
			ti.getSymbolFn === undefined ||
			ti.getDecimalsFn === undefined ||
			(ti.balanceOfPrivateFn === undefined && ti.balanceOfPublicFn === undefined)
		) {
			throw new Error("Couldn't find necessary methods in the contract interface. Try to add token manually.")
		}
		// Thread the dApp origin into the journal entry so the tokens-view
		// TokenImportRow can render "Requested by <origin>" for dapp imports.
		// Anonymous-DApp fallback matches the repo convention used in
		// tx-enrichment.ts and tx-detail-helpers.ts.
		const opContext: OperationContext =
			origin.type === OriginType.DAPP ? { origin: "dapp", dappOrigin: origin.name ?? "dApp" } : { origin: "popup" }
		const expected = shown && { name: shown.name, symbol: shown.symbol, decimals: shown.decimals }
		await this.deps.tokenService.addTokenAuthorized(fence, fence.profileId, op.networkId, op.accountAddress, ti, opContext, expected)
	}

	// Aztec.js interface:

	/** The app a dApp registration is counted against, and the session it runs under, captured before
	 *  the executor's first await. The app is the origin the wallet-sdk dispatcher stamps, the only
	 *  builder of the two registration kinds; the person's own registrations are not counted. */
	public async registrant(origin: LocalTxOrigin, authorizedFence?: ExecutionFence): Promise<Registrant | undefined> {
		if (origin.type !== OriginType.DAPP) return undefined
		if (!origin.name) throw new Error("a dApp registration needs the app's origin")
		return { origin: origin.name, fence: authorizedFence ?? (await this.deps.profileService.captureExecutionFence()) }
	}

	/** Before anything is written (`dapp-session/registration-allowance.ts`). */
	private async admitDappRegistration(registrant: Registrant | undefined, network: Network): Promise<void> {
		if (!registrant) return
		if (registrant.fence.profileId !== network.profileId) throw new SessionEndedError()
		await this.deps.dappSessionService.admitDappRegistration(registrant.origin, registrant.fence, network.chainId)
	}

	public async executeAztecRegisterSender(op: AztecRegisterSenderOperation, registrant?: Registrant): Promise<AztecAddress> {
		const network = await this.deps.networkService.getNetwork(op.networkId)
		await this.admitDappRegistration(registrant, network)
		return this.deps.pxeService.registerSender(networkInfoFrom(network), op.address)
	}

	// Resolves to void: the 5.0.1 wallet-sdk WalletSchema declares
	// `registerContract(): Promise<void>`, and the dApp-side proxy validates the
	// response with z.void() — any non-undefined result rejects the whole call
	// on the dApp even though registration succeeded wallet-side.
	public async executeAztecRegisterContract(op: AztecRegisterContractOperation, registrant?: Registrant): Promise<void> {
		const instance = await ContractInstanceWithAddressSchema.parseAsync(op.instance)
		const network = await this.deps.networkService.getNetwork(op.networkId)

		const addressNum = instance.address.toBigInt()
		if (addressNum >= 0 && addressNum <= 6) {
			return
		}

		let providedArtifact: ContractArtifact | undefined
		try {
			providedArtifact = await ContractArtifactSchema.optional().parseAsync(op.artifact)
		} catch {
			// artifact parse failed — will fall back to lookup below
		}

		// Smart-tighten: if the dApp didn't pass an artifact, the wallet can
		// still resolve it via the chain's PXE (already-registered) or the
		// compiled-in known bundle (Aztec/Wonderland tokens, FPCs, NFTs,
		// etc.). When neither has it, fail loudly with a message telling
		// the dApp to pass `artifact` — there is no remote registry fallback.
		const classId = instance.originalContractClassId
		const artifact = providedArtifact ?? (await this.deps.pxeService.getContractArtifact(networkInfoFrom(network), classId))
		if (!artifact) {
			throw new ContractNotRegisteredError(
				`Contract artifact not found for class ${classId}. ` +
					"The wallet only ships artifacts for the standard bundled contracts; " +
					"pass the artifact in aztec_registerContract({ instance, artifact }) for custom contracts.",
			)
		}

		await assertInstanceArtifactClassId(instance, artifact)

		// A secret key registers the instance's own account or nothing: one that derives another
		// address or other keys would add an account the dApp's contract grant never named, or one
		// whose contract the PXE then refuses.
		const account = op.secretKey
			? await CompleteAddress.fromSecretKeyAndPartialAddress(
					await Fr.schema.parseAsync(op.secretKey),
					await computePartialAddress(instance),
				)
			: undefined
		if (account && !(account.address.equals(instance.address) && account.publicKeys.equals(instance.publicKeys))) {
			throw InvalidWalletArgumentsError.forMethod("registerContract")
		}

		// Admitted before the account, so a refused keyed call registers neither the account nor the contract.
		if (op.secretKey && account) {
			await this.admitDappRegistration(registrant, network)
			await this.deps.pxeService.registerAccount(networkInfoFrom(network), op.secretKey, account.partialAddress)
		}

		await this.deps.pxeService.registerContract(networkInfoFrom(network), { instance, artifact })
	}
}
