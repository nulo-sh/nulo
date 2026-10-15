/**
 * Characterization pin for the dispatcher's send-account selection.
 *
 * Two rules are pinned, because the queued-journal side (which records which
 * account a dApp send belongs to) must derive the SAME account the dispatcher
 * will actually send from — any divergence files the operation under the wrong
 * account:
 *
 *   1. A NO_FROM `from` resolves to the first WALLET-ordered account that the
 *      session authorizes. Wallet order is `getAccounts`' index sort, NOT the
 *      order the addresses happen to appear in `session.accounts`. An omitted
 *      `from` never reaches selection: the schema parse refuses it.
 *   2. An explicit `from` resolves to exactly that account, and an address
 *      outside the session is refused rather than silently downgraded to the
 *      default.
 *
 * When this rule is extracted into a shared resolver, these expectations must
 * hold unchanged — that is the point of pinning them now.
 */

import { beforeAll, describe, expect, test } from "vitest"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import type { ILogger } from "@nulo/wallet-core/logger"
import type { Capability } from "./capabilities"
import { WalletSdkDispatcher } from "./dispatcher"
import type {
	IAccountProvisioner,
	IAccountReader,
	IDappInteractionRunner,
	IDappSessionWriter,
	IExecutionRunner,
	INetworkReader,
} from "./services-contract"
import type { IDappSessionRef, INetworkRef } from "./session-types"
import { wireAddress, wirePayload } from "./testing/wire"

beforeAll(() => {
	;(globalThis as { __VERSION__?: string }).__VERSION__ = "test"
})

const CHAIN = 0
const ADDR_A = wireAddress("0a")
const ADDR_B = wireAddress("0b")
const caip = (addr: string) => `aztec:${CHAIN}:${addr}`

const ctx = { chainId: CHAIN, profileId: "profile-1", origin: "https://dapp.example", sessionId: "session-1" }

/**
 * Wallet order is [A, B] (index-sorted, as `AccountService.getAccounts` returns),
 * while the session lists [B, A] — so session order and wallet order disagree,
 * which is the only way to tell which one the resolver actually honors.
 */
function makeDispatcher(): { dispatcher: WalletSdkDispatcher; sent: () => string | undefined } {
	let sentAccount: string | undefined

	const session = {
		id: "session-1",
		chainId: String(CHAIN),
		origin: ctx.origin,
		permissions: [],
		accounts: [caip(ADDR_B), caip(ADDR_A)],
		confirmationLevel: 5,
		capabilityGrants: [{ capability: { type: "transaction", scope: [{ contract: "*", function: "*" }] } as Capability, grantedAt: 1 }],
		capabilityRejections: [],
	} as unknown as IDappSessionRef

	const sessionWriter: IDappSessionWriter = {
		tryGetDappSessionByOriginAndChain: async () => session,
		getDappSession: async () => session,
		updateDappSession: async () => session,
		setAccountAliases: async () => session,
		setCapabilityGrants: async () => session,
		setCapabilityRejections: async () => session,
		applyCapabilityDecision: async (_id, decision) => ({
			...session,
			accounts: decision.addAccounts.length > 0 ? [...new Set([...session.accounts, ...decision.addAccounts])] : session.accounts,
		}),
	}
	const network: INetworkRef = { id: "net-0", chainId: CHAIN }
	const networkReader: INetworkReader = { getNetworksRaw: async () => [network] }
	const accountReader: IAccountReader & IAccountProvisioner = {
		provisionDefaultAccount: async () => {},
		getAccounts: async () => [
			{ address: ADDR_A, name: "Account 1", chainId: CHAIN },
			{ address: ADDR_B, name: "Account 2", chainId: CHAIN },
		],
	}
	const execution: IExecutionRunner = { executeOperations: async () => [] }
	const interaction: IDappInteractionRunner = {
		execute: async (params) => {
			sentAccount = (params.operations[0] as { account?: string } | undefined)?.account
			return [{ ok: true, value: "0xtx" }] as never
		},
		requestCapabilities: async () => ({ granted: [] }) as never,
	}
	const logger: ILogger = { log: () => {} }

	return {
		dispatcher: new WalletSdkDispatcher(networkReader, accountReader, execution, interaction, sessionWriter, logger),
		sent: () => sentAccount,
	}
}

describe("dispatcher send-account selection — characterization", () => {
	test("NO_FROM resolves to the first WALLET-ordered session account, not the first session-listed one", async () => {
		const { dispatcher, sent } = makeDispatcher()

		await dispatcher.dispatch("sendTx", [wirePayload([]), { from: "NO_FROM" }], ctx)

		// Session lists B first; wallet order is [A, B] — A must win.
		expect(sent()).toBe(caip(ADDR_A))
	})

	test("an omitted `from` is refused before any account is selected", async () => {
		const { dispatcher, sent } = makeDispatcher()

		await expect(dispatcher.dispatch("sendTx", [wirePayload([]), {}], ctx)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		expect(sent()).toBeUndefined()
	})

	test("an explicit session-authorized `from` wins over the wallet-order default", async () => {
		const { dispatcher, sent } = makeDispatcher()

		await dispatcher.dispatch("sendTx", [wirePayload([]), { from: ADDR_B }], ctx)

		expect(sent()).toBe(caip(ADDR_B))
	})

	test("an explicit `from` outside the session is refused, never downgraded to the default", async () => {
		const { dispatcher, sent } = makeDispatcher()
		const stranger = wireAddress("0c")

		await expect(dispatcher.dispatch("sendTx", [wirePayload([]), { from: stranger }], ctx)).rejects.toThrow(/not authorized/)
		expect(sent()).toBeUndefined()
	})
})
