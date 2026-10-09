/**
 * A scope or schema refusal reaches no sink with a request value, and a refused `sendTx` is filed as
 * refused. Each request carries a sentinel in every field it controls, wire-valid where the refusal
 * under test comes after the schema parse, and runs through the arrival check and the real
 * dispatcher; only the connection handler and the wallet services are stubbed.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { type GrantedCapabilityRecord, WalletSdkDispatcher } from "@nulo/wallet-bridge"
import { wireCall, wireInstance, wirePayload } from "@nulo/wallet-bridge/testing"
import { LogLevel } from "@/wallet/logger"

vi.mock("@aztec-labs/wallet-sdk/extension/handlers", () => ({ BackgroundConnectionHandler: class {} }))
vi.mock("./content-message-relay", () => ({ attachContentListener: () => {} }))
vi.mock("./tab-lifecycle", () => ({ wireTabLifecycle: () => {} }))
vi.mock("@nulo/wallet-sdk-schema-patch/register", () => ({}))

import { handleWalletMessage } from "./background"
import { INVALID_PARAMS_MESSAGE, SCOPE_VIOLATION_ENVELOPE } from "./error-envelope"
import { tryCreateQueuedJournal } from "./queued-journal"
import { makeAccountStub, makeDeps, makeSession } from "./queued-journal.fixtures"

const SESSION = makeSession()
const ACCOUNT = `0x${"0a".repeat(32)}`
/** `ACCOUNT` on the chain `SESSION`'s chain info resolves to. */
const SESSION_ACCOUNT = `aztec:1336:${ACCOUNT}`
const A = `0x${"11".repeat(32)}`

const grant = (capability: unknown) => ({ capability, grantedAt: 0 }) as GrantedCapabilityRecord
const listed = (...contracts: string[]) => contracts.map((contract) => ({ contract, function: "transfer" }))
const tx = (scope: unknown) => grant({ type: "transaction", scope })
const contracts = (flags: Record<string, boolean>) => grant({ type: "contracts", contracts: [A], ...flags })
const listedSimulation = (sub: "transactions" | "utilities") => grant({ type: "simulation", [sub]: { scope: listed(A) } })
const authWit = { type: "accounts", canGet: true, canCreateAuthWit: true }
const noAddressBook = grant({ type: "data", addressBook: false, privateEvents: { contracts: [A] } })

/** A field value no wallet account or grant names: its marker digits appear nowhere else. */
const sentinel = (n: number) => `0x${SENTINEL_HEX}${n.toString(16).padStart(56, "0")}`
const SENTINEL_HEX = "2e5e17e1"
const LEAK = new RegExp(`SENTINEL-|${SENTINEL_HEX}`)

const call = wireCall(sentinel(1), "SENTINEL-NAME")
const exec = { ...wirePayload([call]), scopes: [sentinel(2)] }
const opts = { from: sentinel(3), scopes: [sentinel(4)], additionalScopes: [sentinel(5)] }
const callIntent = { caller: sentinel(6), call }
const innerHash = { consumer: sentinel(7), innerHash: sentinel(8) }
const eventQuery = [
	{ eventSelector: "0x00000001", abiType: { kind: "field" }, fieldNames: ["SENTINEL-EVENT"] },
	{ contractAddress: sentinel(9), scopes: [sentinel(10)] },
]
const outsideSession = (field: string) => `Scope violation: ${field} entry not in session's approved accounts`

type Refusal = [name: string, method: string, args: unknown[], grants: GrantedCapabilityRecord[], message: string]

// An authorized sender, so the arrival check files a queued row; every other field is a sentinel.
const JOURNALED: Refusal[] = [
	[
		"a call outside the listed transaction scope",
		"sendTx",
		[exec, { ...opts, from: ACCOUNT }],
		[tx(listed(A))],
		"Scope violation: sendTx call not permitted by granted transaction scope",
	],
	["an exec.scopes account", "sendTx", [exec, { from: ACCOUNT }], [tx("*")], outsideSession("sendTx.exec.scopes")],
	[
		"an opts.scopes account",
		"sendTx",
		[wirePayload([call]), { from: ACCOUNT, scopes: opts.scopes }],
		[tx("*")],
		outsideSession("sendTx.opts.scopes"),
	],
	[
		"an opts.additionalScopes account",
		"sendTx",
		[wirePayload([call]), { from: ACCOUNT, additionalScopes: opts.additionalScopes }],
		[tx("*")],
		outsideSession("sendTx.opts.additionalScopes"),
	],
]

const NOT_JOURNALED: Refusal[] = [
	[
		"sendTx, an explicit `from` outside the session (its missing row is a regression control)",
		"sendTx",
		[wirePayload([call]), { from: opts.from }],
		[tx("*")],
		"Scope violation: requested account not authorized for this dApp session",
	],
	[
		"registerContract, the contract",
		"registerContract",
		[wireInstance(sentinel(11))],
		[contracts({ canRegister: true })],
		"Scope violation: registerContract contract not permitted by granted contracts scope",
	],
	[
		"getContractMetadata, the contract",
		"getContractMetadata",
		[sentinel(11)],
		[contracts({ canGetMetadata: true })],
		"Scope violation: getContractMetadata contract not permitted by granted contracts scope",
	],
	[
		"isTokenRegistered, the token",
		"isTokenRegistered",
		[sentinel(12), { scopes: opts.scopes }],
		[contracts({ canGetMetadata: true })],
		"Scope violation: isTokenRegistered contract not permitted by granted contracts scope",
	],
	[
		"getContractClassMetadata, the class",
		"getContractClassMetadata",
		[sentinel(13)],
		[grant({ type: "contractClasses", classes: [A], canGetMetadata: true })],
		"Scope violation: getContractClassMetadata class not permitted by granted contractClasses scope",
	],
	[
		"grantPublicAuthwit, the call",
		"grantPublicAuthwit",
		[opts.from, { caller: "SENTINEL-CALLER", contract: "SENTINEL-CONTRACT", method: "SENTINEL-METHOD", args: ["SENTINEL-ARG"] }],
		[tx(listed(A))],
		"Scope violation: grantPublicAuthwit call not permitted by granted transaction scope",
	],
	[
		"simulateTx, a call",
		"simulateTx",
		[exec, opts],
		[listedSimulation("transactions")],
		"Scope violation: simulateTx call not permitted by granted simulation.transactions scope",
	],
	[
		"profileTx, a call",
		"profileTx",
		[exec, { ...opts, profileMode: "gates" }],
		[listedSimulation("transactions")],
		"Scope violation: profileTx call not permitted by granted simulation.transactions scope",
	],
	[
		"executeUtility, the call",
		"executeUtility",
		[call, opts],
		[listedSimulation("utilities")],
		"Scope violation: executeUtility call not permitted by granted simulation.utilities scope",
	],
	[
		"getPrivateEvents, the contract",
		"getPrivateEvents",
		eventQuery,
		[grant({ type: "data", privateEvents: { contracts: [A] } })],
		"Scope violation: getPrivateEvents contract not permitted by granted data.privateEvents scope",
	],
	[
		"getPrivateEvents, a filter's scopes account",
		"getPrivateEvents",
		eventQuery,
		[grant({ type: "data", privateEvents: { contracts: "*" } })],
		outsideSession("getPrivateEvents.opts.scopes"),
	],
	[
		"createAuthWit, the account",
		"createAuthWit",
		[opts.from, callIntent],
		[grant({ ...authWit, accounts: [{ alias: "a", item: A }] })],
		"Scope violation: createAuthWit account not permitted by granted accounts scope",
	],
	[
		"createAuthWit, the call",
		"createAuthWit",
		[opts.from, callIntent],
		[grant(authWit), tx(listed(A))],
		"Scope violation: createAuthWit call not permitted by granted transaction or simulation scope",
	],
	[
		"createAuthWit, the inner hash's consumer",
		"createAuthWit",
		[opts.from, innerHash],
		[grant(authWit), tx(listed(A))],
		"Scope violation: createAuthWit inner-hash consumer not permitted by granted transaction or simulation scope",
	],
	[
		"getAccounts, the canGet flag",
		"getAccounts",
		[],
		[grant({ type: "accounts", canGet: false })],
		"Scope violation: getAccounts requires accounts.canGet=true",
	],
	[
		"getAddressBook, the addressBook flag",
		"getAddressBook",
		[],
		[noAddressBook],
		"Scope violation: getAddressBook requires data.addressBook=true",
	],
	[
		"registerSender, the addressBook flag",
		"registerSender",
		[sentinel(11), "SENTINEL-ALIAS"],
		[noAddressBook],
		"Scope violation: registerSender requires data.addressBook=true",
	],
]

/** JSON of `value` with every `Error` expanded to its own properties plus `message` and `stack`,
 *  which `JSON.stringify` alone drops. */
function serialize(value: unknown): string {
	return JSON.stringify(value, (_key, v) =>
		v instanceof Error
			? {
					...Object.fromEntries(Object.getOwnPropertyNames(v).map((k) => [k, Reflect.get(v, k)])),
					message: v.message,
					stack: v.stack,
				}
			: v,
	)
}

async function refuse(method: string, args: unknown[], grants: GrantedCapabilityRecord[]) {
	const stored = {
		tryGetDappSessionByOriginAndChain: async () => ({
			id: "row-1",
			origin: SESSION.origin,
			accounts: [SESSION_ACCOUNT],
			capabilityGrants: grants,
			capabilityRejections: [],
			dappMetadata: { name: "Example Dapp" },
		}),
	}
	const account = makeAccountStub([ACCOUNT])
	const { deps, journal, networkSvc } = makeDeps({ dappSession: stored as never, account: account as never })
	// One logger serves the handler, the dispatcher, the arrival check and the journal, and the
	// console reaches the same buffer in the extension.
	const log = vi.spyOn(deps.logger, "log")
	const consoleLines = (["debug", "warn", "error"] as const).map((level) => vi.spyOn(console, level))
	const execution = { executeOperations: vi.fn() }
	const interaction = { execute: vi.fn(), requestCapabilities: vi.fn() }
	const dispatcher = new WalletSdkDispatcher(
		networkSvc as never,
		account as never,
		execution,
		interaction as never,
		stored as never,
		deps.logger,
	)
	const dispatch = vi.spyOn(dispatcher, "dispatch")
	const sendResponse = vi.fn(async (_sessionId: string, _response: unknown) => {})
	const message = { messageId: "m1", type: method, args } as never
	// The background files a queued row at arrival for a `sendTx` only.
	const queuedJournalId = method === "sendTx" ? await tryCreateQueuedJournal(message, SESSION, deps) : undefined

	await handleWalletMessage(
		SESSION,
		message,
		{ sendResponse, terminateSession: vi.fn() } as never,
		dispatcher,
		{ captureExecutionFence: async () => ({ profileId: "profile-1", epoch: 0, session: 1 }) } as never,
		journal,
		new Map([[SESSION.sessionId, "profile-1"]]),
		{ current: () => 0 } as never,
		deps.logger,
		{ assertCurrent: async () => {} },
		{ queuedJournalId },
	)

	const refusal = await Promise.resolve(dispatch.mock.results[0]?.value).then(
		() => undefined,
		(error: unknown) => error as Error,
	)
	const failureLine = log.mock.calls.find(([, , text]) => String(text).startsWith("Method "))
	const lines = [log, ...consoleLines].flatMap((spy) => spy.mock.calls as unknown[][])
	const row = queuedJournalId === undefined ? undefined : await journal.getOperation(queuedJournalId)
	return {
		refusal: refusal?.message,
		level: failureLine?.[1],
		envelope: (sendResponse.mock.calls[0]?.[1] as { error?: unknown } | undefined)?.error,
		leakingLines: lines.map(serialize).filter((line) => LEAK.test(line)),
		responseLeaks: LEAK.test(serialize(sendResponse.mock.calls)),
		ran: [execution.executeOperations, interaction.execute, interaction.requestCapabilities].flatMap((fn) => fn.mock.calls),
		rows: await journal.countOperations({ sessionId: SESSION.sessionId }),
		row: row && {
			stage: row.progress.stage,
			kind: row.error?.kind,
			message: row.error?.message,
			leaks: LEAK.test(serialize(row.error)),
			title: row.title,
		},
	}
}

const refusedCleanly = (message: string) => ({
	refusal: message,
	level: LogLevel.Debug,
	envelope: SCOPE_VIOLATION_ENVELOPE,
	leakingLines: [],
	responseLeaks: false,
	ran: [],
})

describe("handleWalletMessage — a scope refusal", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	test("the serializer sees a nested Error's message", () => {
		expect(serialize([{ error: new Error("SENTINEL-PROBE") }])).toMatch(/SENTINEL-PROBE/)
	})

	test.each(JOURNALED)("of a sendTx, %s, fails its queued row as refused", async (_name, method, args, grants, message) => {
		expect(await refuse(method, args, grants)).toEqual({
			...refusedCleanly(message),
			rows: 1,
			row: { stage: "failed", kind: "scope_refused", message, leaks: false, title: "SENTINEL-NAME" },
		})
	})

	test.each(NOT_JOURNALED)("of %s leaves no row", async (_name, method, args, grants, message) => {
		expect(await refuse(method, args, grants)).toEqual({ ...refusedCleanly(message), rows: 0, row: undefined })
	})
})

describe("handleWalletMessage — a schema refusal", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	const refusedByParse = (method: string) => ({
		...refusedCleanly(`Invalid arguments for wallet method: ${method}`),
		envelope: { code: -32602, message: INVALID_PARAMS_MESSAGE, data: { walletErrorCode: "INVALID_PARAMS" } },
	})

	test("of a sendTx whose call argument is above the field modulus fails its queued row as unreadable", async () => {
		const overModulus = `0xffffffff${SENTINEL_HEX}${"0".repeat(48)}`
		const malformed = wirePayload([{ ...call, args: [overModulus] }])
		expect(await refuse("sendTx", [malformed, { from: ACCOUNT }], [tx("*")])).toEqual({
			...refusedByParse("sendTx"),
			rows: 1,
			row: {
				stage: "failed",
				kind: "malformed_request",
				message: "Invalid arguments for wallet method: sendTx",
				leaks: false,
				title: "SENTINEL-NAME",
			},
		})
	})

	test("of a createAuthWit for a raw message hash, which no grant can admit, leaves no row", async () => {
		expect(await refuse("createAuthWit", [opts.from, "SENTINEL-HASH"], [grant(authWit)])).toEqual({
			...refusedByParse("createAuthWit"),
			rows: 0,
			row: undefined,
		})
	})
})
