/**
 * Composition test: a dApp's `registerSender` through the REAL wallet-sdk dispatcher, the REAL
 * ExecutionService and the REAL DappSessionService and its registration counts, over fake storage
 * and a PXE client that only records its writes. No sandbox, PXE, bb or browser
 * (`apps/extension/tests/COMPOSITION-TESTS.md`).
 */
import { describe, expect, test, vi } from "vitest"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { ScopeViolationError } from "@nulo/extension-messaging/errors"
import { type IDappInteractionRunner, WalletSdkDispatcher } from "@nulo/wallet-bridge"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { NOOP_PROOF_GATE } from "@/e2e/proof-gate"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountService } from "@/wallet/services/account/service"
import { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { svc } from "@/wallet/services/composition-harness"
import { ContactService } from "@/wallet/services/contact/service"
import { APP_REGISTRATIONS_PER_CHAIN } from "@/wallet/services/dapp-session/registration-allowance"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { AccessLevel, type GrantedCapabilityRecord } from "@/wallet/services/dapp-session/spec"
import { FpcService } from "@/wallet/services/fpc/service"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import { NetworkService } from "@/wallet/services/network/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { PriceService } from "@/wallet/services/price/service"
import { ProfileDeletionState, type ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { TaskService } from "@/wallet/services/task/service"
import { TokenService } from "@/wallet/services/token/service"
import { TransactionService } from "@/wallet/services/transaction/service"
import { toWalletResponseError } from "@/wallet/services/wallet-sdk/error-envelope"
import { ExecutionService } from "./service"

const NETWORK = {
	id: "net1",
	profileId: "p1",
	chainId: 1,
	l1ChainId: 5,
	primaryEndpointId: "ep1",
	endpoints: [{ id: "ep1", rpcUrl: "http://fake" }],
}
const APP_A = "https://a.example"
const APP_B = "https://b.example"
const SCOPE_ENVELOPE = toWalletResponseError(
	new ScopeViolationError("Scope violation: requested account not authorized for this dApp session"),
)

const addressAt = (i: number) => AztecAddress.fromNumberUnsafe(i + 1).toString()

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const logger = new LoggerStore(new ConfigStore())
	const deletionState = new ProfileDeletionState()
	const captureExecutionFence = async (): Promise<ExecutionFence> => ({ profileId: "p1", epoch: deletionState.capture("p1"), session: 1 })
	const macKey = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const registerSender = vi.fn(async (_network: unknown, address: string) => address)
	const pxeClient = { onProvePhase: { add: () => {} }, registerSender } as unknown as PxeServiceClient

	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: "p1" }),
			getProfiles: async () => [{ id: "p1" }],
			getDeletionState: () => deletionState,
			captureExecutionFence,
			deriveDappSessionMacKey: async () => macKey,
			setExpiryDeferral: () => {},
			onActiveProfileChanged: new EventHandler<unknown>(),
		}),
	)
	collection.add(svc(NetworkService.name, { getNetwork: async () => NETWORK }))
	collection.add(svc(AccountService.name, {}))
	collection.add(svc(TransactionService.name, { onTransactionUpdated: { add: () => {} } }))
	collection.add(svc(TokenService.name, {}))
	collection.add(svc(FpcService.name, { onFpcUpdated: { add: () => {} }, onFpcDeleted: { add: () => {} } }))
	collection.add(svc(ContactService.name, {}))
	collection.add(svc(AuthRegistryService.name, {}))
	collection.add(svc(LegalAcceptanceService.name, { assertCurrent: async () => {} }))
	collection.add(new OperationJournalService(logger, api))
	collection.add(svc(TaskService.name, { startNewTask: () => ({ complete: vi.fn(), fail: vi.fn(), cancel: vi.fn() }) }))
	collection.add(svc(PriceService.name, {}))
	const sessions = new DappSessionService(logger, api)
	collection.add(sessions)
	const execution = new ExecutionService(logger, NOOP_PROOF_GATE, () => pxeClient)
	collection.add(execution)
	await collection.start()

	const dispatcher = new WalletSdkDispatcher(
		{ getNetworksRaw: async () => [NETWORK] } as never,
		{ provisionDefaultAccount: async () => {}, getAccounts: async () => [] } as never,
		execution,
		{} as IDappInteractionRunner,
		sessions,
		logger,
	)
	/** A connected app holding the address-book grant `registerSender` needs. */
	const connect = async (origin: string) => {
		const row = await sessions.addDappSession({ url: origin }, [], [], AccessLevel.Transactions, String(NETWORK.chainId), "p1")
		await sessions.setCapabilityGrants(row.id, [
			{ capability: { type: "data", addressBook: true }, grantedAt: 1 },
		] as unknown as GrantedCapabilityRecord[])
		const ctx = { chainId: NETWORK.chainId, profileId: "p1", origin, sessionId: `wire-${origin}`, fence: await captureExecutionFence() }
		return {
			register: (address: string) => dispatcher.dispatch("registerSender", [address], ctx),
			batch: (address: string) => dispatcher.dispatch("batch", [[{ name: "registerSender", args: [address] }]], ctx),
		}
	}
	const counts = async () => {
		const key = "nulo:core:dappRegistrations@p1"
		return JSON.parse((await api.storage.local.get(key))[key] as string)
	}
	return { connect, registerSender, counts }
}

const refusalOf = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(error: unknown) => toWalletResponseError(error),
	)

describe("a dApp's registrations through the dispatcher spend its app's count", () => {
	test("past one app's share its calls, a batch leg included, are refused; another app is admitted", async () => {
		const { connect, registerSender, counts } = await makeHarness()
		const a = await connect(APP_A)
		for (let i = 0; i < APP_REGISTRATIONS_PER_CHAIN; i++) await a.register(addressAt(i))
		expect(registerSender).toHaveBeenCalledTimes(APP_REGISTRATIONS_PER_CHAIN)

		expect(await refusalOf(a.register(addressAt(0)))).toEqual(SCOPE_ENVELOPE)
		expect(await refusalOf(a.batch(addressAt(500)))).toEqual(SCOPE_ENVELOPE)
		expect(registerSender).toHaveBeenCalledTimes(APP_REGISTRATIONS_PER_CHAIN)

		const b = await connect(APP_B)
		await b.register(addressAt(0))
		expect(registerSender).toHaveBeenCalledTimes(APP_REGISTRATIONS_PER_CHAIN + 1)
		expect(await counts()).toEqual({
			[NETWORK.chainId]: { total: APP_REGISTRATIONS_PER_CHAIN + 1, apps: { [APP_A]: APP_REGISTRATIONS_PER_CHAIN, [APP_B]: 1 } },
		})
	})
})
