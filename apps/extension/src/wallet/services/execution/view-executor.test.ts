/**
 * `ViewExecutor` — facade-parity pins for the transplanted read-only
 * dApp RPC family. Fast-path internals are pinned in `fast-path.test.ts`
 * and resolver behavior in `contract-resolver.test.ts`; these tests pin
 * the executor's routing and the security-relevant call shapes:
 *
 *   - the stub-account msgSender pin on the standard simulate path
 *     (real signing keys never enter PXE during dApp simulateTx)
 *   - the chain-identity rebind on getChainInfo
 *   - fast-path → standard fallback routing (split null / result null)
 *   - the PXE-local-vs-best-effort metadata ladder
 */

import { describe, expect, test, vi } from "vitest"
import {
	ContractNotRegisteredError,
	InvalidWalletArgumentsError,
	ScopeViolationError,
	UnsupportedMethodError,
} from "@nulo/extension-messaging/errors"
import { ContractInitializationStatus } from "@aztec-labs/aztec.js/wallet"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { FunctionSelector, FunctionType } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { UtilityExecutionResult } from "@aztec-labs/stdlib/tx"
import { toAppFacingSimulationResult } from "./app-facing-results"
import { simulationFixture } from "./app-facing-results.fixtures"
import { ContractResolver } from "./contract-resolver"
import { ViewExecutor, type ViewExecutorDeps } from "./view-executor"

const fastPathMocks = vi.hoisted(() => ({
	rehydrateOptimizablePrefix: vi.fn(),
	runFastPath: vi.fn(),
}))
vi.mock("./fast-path", () => fastPathMocks)

// Gas shaping is pinned by the structural fee fixtures; no-op here so
// plain-object txRequest fakes survive.
vi.mock("./fee/fee-strategy", async (importOriginal) => ({
	...(await importOriginal<object>()),
	suggestGasLimits: vi.fn(),
}))
vi.mock("./fee/embedded-fpc-cap", () => ({ applyEmbeddedFpcGasCap: vi.fn(async () => {}) }))

// Mock ONLY `findFunctionBySelector` — the name↔selector bind added to
// executeAztecExecuteUtility. `findFunctionByName` (executeSimulateUtility) and
// everything else in the module stay real.
const contractResolverMocks = vi.hoisted(() => ({ findFunctionBySelector: vi.fn() }))
vi.mock("./contract-resolver", async (importOriginal) => ({
	...(await importOriginal<object>()),
	findFunctionBySelector: contractResolverMocks.findFunctionBySelector,
}))

function addr(hex: string) {
	return { toString: () => hex } as never
}

const FENCE = { profileId: "p1", epoch: 0, session: 1 }

function makeHarness(overrides: Partial<ViewExecutorDeps> = {}) {
	const network = {
		id: "net-1",
		profileId: "p1",
		// The live pair below matches it: (1 ^ 6) >>> 0 === 7, and the exact L1 is 1.
		chainId: 7,
		l1ChainId: 1,
		endpoints: [{ id: "e1", rpcUrl: "http://primary" }],
		primaryEndpointId: "e1",
	} as never
	const node = {
		getNodeInfo: vi.fn(async () => ({ l1ChainId: 1, rollupVersion: 6 })),
		getContract: vi.fn(async (_address: AztecAddress): Promise<unknown> => undefined),
		getContractClass: vi.fn(async (_id: Fr): Promise<unknown> => undefined),
	}
	const account = {
		address: addr("0xacct"),
		ensureRegistered: vi.fn(async () => {}),
		requiresInitialization: vi.fn(async () => false),
	}
	const simulated = simulationFixture({ tail: "public", publicOutput: true }).result
	const pxe = {
		simulateTx: vi.fn(async () => simulated),
		executeUtility: vi.fn(async () => ({ result: [] })),
		getContracts: vi.fn(async () => []),
		registerContract: vi.fn(async () => {}),
		profileTx: vi.fn(async () => ({ kind: "profile" })),
	}
	const deps: ViewExecutorDeps = {
		planner: { processAztecJsPayload: vi.fn(async () => ({ actions: [], feePaymentMethod: 0, feeOptions: {} })) } as never,
		resolver: {} as never,
		txBuilder: { buildStandard: vi.fn(async () => ({ txRequest: { kind: "txr" }, node, pxe, account, network })) } as never,
		pxeService: {
			getPXE: vi.fn(() => pxe),
			getContractArtifact: vi.fn(async () => undefined),
			getContractInstance: vi.fn(async () => undefined),
			getPrivateEvents: vi.fn(async () => []),
		} as never,
		profileService: {
			getActiveProfile: vi.fn(async () => ({ id: "p1" })),
			captureExecutionFence: vi.fn(async () => FENCE),
		} as never,
		networkService: {
			getNetwork: vi.fn(async () => network),
			getNode: vi.fn(async () => node),
			getNodeForUrl: vi.fn(async () => node),
		} as never,
		accountService: { getAccountContract: vi.fn(async () => account) } as never,
		contactService: { getContacts: vi.fn(async () => []) } as never,
		logDebug: vi.fn(),
		logError: vi.fn(),
		...overrides,
	}
	return { deps, network, node, account, pxe, simulated, executor: new ViewExecutor(deps) }
}

// The fast-path arm wraps accountAddress via the REAL AztecAddress.fromString.
const VALID_ADDR = `0x${"22".repeat(32)}`

function makeSimOp(overrides: Record<string, unknown> = {}) {
	return {
		kind: "aztec_simulateTx",
		networkId: "net-1",
		accountAddress: VALID_ADDR,
		exec: { calls: [] },
		opts: { from: addr(VALID_ADDR), additionalScopes: [] },
		...overrides,
	} as never
}

describe("ViewExecutor.executeSimulateTransaction", () => {
	test("scopes=[account.address], fee enforcement skipped, projected result shape", async () => {
		const { executor, pxe, account, simulated } = makeHarness()
		const result = await executor.executeSimulateTransaction({
			kind: "simulate_transaction",
			networkId: "net-1",
			accountAddress: "0xacct",
			actions: [],
		} as never)

		const simArgs = pxe.simulateTx.mock.calls[0] as unknown[]
		expect(simArgs[1]).toEqual({ simulatePublic: false, skipFeeEnforcement: true, scopes: [account.address] })
		expect(result).toEqual({
			gasUsed: simulated.gasUsed,
			privateReturn: simulated.getPrivateReturnValues(),
			publicReturn: simulated.getPublicReturnValues(),
		})
	})
})

describe("ViewExecutor.executeAztecSimulateTx", () => {
	test("opts.from mismatch rejected with the frozen message", async () => {
		const { executor } = makeHarness()
		const op = makeSimOp({ opts: { from: addr("0xother") } })
		await expect(executor.executeAztecSimulateTx(op)).rejects.toThrow("Invalid `opts.from`")
	})

	test("split=null routes to the standard path: stub-account msgSender + scopes pin, and the answer comes back reduced", async () => {
		fastPathMocks.rehydrateOptimizablePrefix.mockReturnValue(null)
		const extra = addr("0xextra")
		const { executor, pxe, account, simulated } = makeHarness()
		const result = await executor.executeAztecSimulateTx(makeSimOp({ opts: { from: addr(VALID_ADDR), additionalScopes: [extra] } }))

		expect(result).toEqual(toAppFacingSimulationResult(simulated))
		expect(result).not.toEqual(simulated)

		expect(fastPathMocks.runFastPath).not.toHaveBeenCalled()
		const simArgs = pxe.simulateTx.mock.calls[0] as unknown[]
		// Scopes: account first, then dApp additionalScopes.
		expect((simArgs[1] as { scopes: unknown[] }).scopes).toEqual([account.address, extra])
		// THE PIN (defense-in-depth): third arg = stubAccountAddresses — the
		// simulated account is the stubbed pass-through; real signing keys
		// never enter PXE during a dApp simulateTx.
		expect(simArgs[2]).toEqual(["0xacct"])
	})

	test("fast path result=null falls back to the standard path", async () => {
		fastPathMocks.rehydrateOptimizablePrefix.mockReturnValue({ optimizableCalls: [], remainingRaw: [] })
		fastPathMocks.runFastPath.mockResolvedValue(null)
		const { executor, pxe, deps } = makeHarness()
		const calls = [
			{ name: "balance_of_public", to: "0x01", selector: "0x11" },
			{ name: "transfer", to: "0x01", selector: "0x22" },
		]
		await executor.executeAztecSimulateTx(makeSimOp({ exec: { calls } }))

		expect(fastPathMocks.runFastPath).toHaveBeenCalledTimes(1)
		expect(pxe.simulateTx).toHaveBeenCalledTimes(1)
		// The standard path receives EVERY original call with its wire name intact — that is the
		// evidence `validateEncodedCallFn` re-checks after a fast-path fallback.
		const planned = (deps.planner.processAztecJsPayload as ReturnType<typeof vi.fn>).mock.calls[0][0] as { calls: unknown[] }
		expect(planned.calls).toEqual(calls)
	})

	test("a non-null fast path result comes back reduced; the merge gets the standard arm in full", async () => {
		fastPathMocks.rehydrateOptimizablePrefix.mockReturnValue({ optimizableCalls: [{}], remainingRaw: [] })
		const fastResult = simulationFixture({ tail: "public", publicOutput: true, appCallOffset: 1 }).result
		fastPathMocks.runFastPath.mockResolvedValue(fastResult)
		const { executor, pxe, simulated } = makeHarness()
		const result = await executor.executeAztecSimulateTx(makeSimOp())

		expect(result).toEqual(toAppFacingSimulationResult(fastResult))
		expect(result).not.toEqual(fastResult)
		expect(pxe.simulateTx).not.toHaveBeenCalled()
		const { runStandardArm } = fastPathMocks.runFastPath.mock.calls[0][0] as { runStandardArm: (calls: unknown[]) => Promise<unknown> }
		expect(await runStandardArm([])).toBe(simulated)
	})
})

describe("ViewExecutor builds under a fence captured at entry", () => {
	test("simulate_transaction and the standard aztec_simulateTx arm each hand the builder their capture", async () => {
		fastPathMocks.rehydrateOptimizablePrefix.mockReturnValue(null)
		const { executor, deps } = makeHarness()
		await executor.executeSimulateTransaction({
			kind: "simulate_transaction",
			networkId: "net-1",
			accountAddress: "0xacct",
			actions: [],
		} as never)
		await executor.executeAztecSimulateTx(makeSimOp())
		const builds = (deps.txBuilder.buildStandard as ReturnType<typeof vi.fn>).mock.calls as unknown[][]
		expect(builds.map((call) => call[1])).toEqual([FENCE, FENCE])
		expect(deps.profileService.captureExecutionFence).toHaveBeenCalledTimes(2)
	})

	test("a failed capture (locked) stops before any build", async () => {
		const { executor, deps } = makeHarness({
			profileService: {
				captureExecutionFence: vi.fn(async () => {
					throw new Error("Wallet locked")
				}),
			} as never,
		})
		await expect(
			executor.executeSimulateTransaction({
				kind: "simulate_transaction",
				networkId: "net-1",
				accountAddress: "0xacct",
				actions: [],
			} as never),
		).rejects.toThrow("Wallet locked")
		expect(deps.txBuilder.buildStandard).not.toHaveBeenCalled()
	})
})

describe("ViewExecutor.executeAztecGetChainInfo", () => {
	test("returns the live pair checked against the selected network, as two fields in wire order", async () => {
		const { executor } = makeHarness()
		const info = await executor.executeAztecGetChainInfo({ kind: "aztec_getChainInfo", networkId: "net-1" } as never)

		expect(Object.keys(info)).toEqual(["chainId", "version"])
		expect(info.chainId).toBeInstanceOf(Fr)
		expect(info.version).toBeInstanceOf(Fr)
		expect(info.chainId.toString()).toBe(`0x${"0".repeat(63)}1`)
		expect(info.version.toString()).toBe(`0x${"0".repeat(63)}6`)
	})

	test("a drifted live pair is refused, never reported to the dApp", async () => {
		const { executor, node } = makeHarness()
		node.getNodeInfo.mockResolvedValue({ l1ChainId: 1, rollupVersion: 2 })
		let refused: unknown
		try {
			await executor.executeAztecGetChainInfo({ kind: "aztec_getChainInfo", networkId: "net-1" } as never)
		} catch (error) {
			refused = error
		}
		expect((refused as Error).constructor).toBe(Error)
		expect((refused as Error).message).toBe(
			"Chain identity mismatch: selected network has chainId=7 but live node reports composite=3 (l1ChainId=1, rollupVersion=2). Refusing to sign/prove against a drifted endpoint.",
		)
	})
})

describe("ViewExecutor.executeAztecGetContractClassMetadata", () => {
	const CLASS_ID = Fr.random().toString()
	const run = (executor: ViewExecutor) =>
		executor.executeAztecGetContractClassMetadata({ kind: "aztec_getContractClassMetadata", networkId: "net-1", id: CLASS_ID } as never)

	test("publication is the node's answer; the artifact flag is the wallet's own", async () => {
		const { executor, deps, node } = makeHarness()
		node.getContractClass.mockResolvedValueOnce({ id: CLASS_ID })
		expect(await run(executor)).toEqual({ isContractClassPubliclyRegistered: true, isArtifactRegistered: false })
		expect(String(node.getContractClass.mock.calls[0]?.[0])).toBe(CLASS_ID)
		expect(deps.networkService.getNodeForUrl).toHaveBeenCalledWith("http://primary")
		expect(deps.networkService.getNode).not.toHaveBeenCalled()
	})

	test("a class the wallet holds but the node does not know is not published", async () => {
		const { executor } = makeHarness({
			pxeService: { getContractArtifact: vi.fn(async () => ({ kind: "artifact" })) } as never,
		})
		expect(await run(executor)).toEqual({ isContractClassPubliclyRegistered: false, isArtifactRegistered: true })
	})

	test("a node failure fails the call", async () => {
		const { executor, node } = makeHarness()
		node.getContractClass.mockRejectedValueOnce(new Error("node down"))
		await expect(run(executor)).rejects.toThrow("node down")
	})
})

describe("ViewExecutor.executeAztecGetContractMetadata", () => {
	const SESSION = `0x${"0a".repeat(32)}`
	const HIDDEN = `0x${"0b".repeat(32)}`
	const FRESH = `0x${"0c".repeat(32)}`
	const CONTRACT = `0x${"0d".repeat(32)}`
	const ids = (original: Fr, current: Fr = original) => ({ originalContractClassId: original, currentContractClassId: current })
	const stored = (address: string) => ({ address, ...ids(new Fr(1n)) })

	/** The store holds SESSION, HIDDEN (a hidden account row) and CONTRACT; FRESH is unknown. */
	function metadataHarness(nodeHas: Record<string, unknown> = {}) {
		const h = makeHarness({
			pxeService: {
				getContractInstance: vi.fn(async (_network: unknown, address: string) =>
					[SESSION, HIDDEN, CONTRACT].includes(address) ? stored(address) : undefined,
				),
				getContractArtifact: vi.fn(async () => ({ kind: "artifact" })),
			} as never,
			accountService: {
				getAccounts: vi.fn(async (_profileId: string, _chainId: number, all?: boolean) =>
					all ? [{ address: SESSION }, { address: HIDDEN }] : [{ address: SESSION }],
				),
			} as never,
		})
		h.node.getContract.mockImplementation(async (address: AztecAddress) => nodeHas[address.toString()])
		const read = (address: string, sessionAccounts: string[] = [SESSION]) =>
			h.executor.executeAztecGetContractMetadata({
				kind: "aztec_getContractMetadata",
				networkId: "net-1",
				address,
				sessionAccounts,
			} as never)
		return { ...h, read }
	}

	test("a profile account outside the session answers as an address the wallet never registered", async () => {
		const { read, deps, node } = metadataHarness()
		expect(await read(HIDDEN)).toEqual(await read(FRESH))
		expect(node.getContract.mock.calls.map(([address]) => address.toString())).toEqual([HIDDEN, FRESH])
		expect(deps.pxeService.getContractArtifact).not.toHaveBeenCalled()
		expect(deps.accountService.getAccounts).toHaveBeenCalledWith("p1", 7, true)
		expect(deps.networkService.getNodeForUrl).toHaveBeenCalledWith("http://primary")
		expect(deps.networkService.getNode).not.toHaveBeenCalled()
	})

	test("with no session account on the chain, every profile account answers as an unknown address", async () => {
		const { read } = metadataHarness()
		expect(await read(SESSION, [])).toEqual(await read(FRESH, []))
	})

	test("a session account returns its stored instance; publication is the node's answer", async () => {
		const { read } = metadataHarness()
		const meta = await read(SESSION)
		expect(meta.instance).toEqual(stored(SESSION))
		expect(meta.initializationStatus).toBe(ContractInitializationStatus.INITIALIZED)
		expect(meta.isContractPublished).toBe(false)
	})

	test("a stored contract the node reports upgraded is published and updated", async () => {
		const current = new Fr(2n)
		const { read } = metadataHarness({ [CONTRACT]: ids(new Fr(1n), current) })
		expect(await read(CONTRACT)).toEqual({
			instance: stored(CONTRACT),
			initializationStatus: ContractInitializationStatus.INITIALIZED,
			isContractPublished: true,
			isContractUpdated: true,
			updatedContractClassId: current,
		})
	})

	test("a node failure answers unpublished alike and logs no address", async () => {
		const { read, deps, node } = metadataHarness()
		node.getContract.mockImplementation(async (address: AztecAddress) => {
			throw new Error(`lookup failed for ${address.toString()}`)
		})
		expect(await read(HIDDEN)).toEqual(await read(FRESH))
		expect((await read(FRESH)).isContractPublished).toBe(false)
		expect(JSON.stringify(vi.mocked(deps.logDebug).mock.calls)).not.toMatch(/0b0b|0c0c/)
		expect(deps.logDebug).toHaveBeenCalled()
	})
})

describe("ViewExecutor.executeSimulateUtility / executeAztecExecuteUtility", () => {
	test("wallet locked → frozen error before any network access", async () => {
		const { executor, deps } = makeHarness({ profileService: { getActiveProfile: vi.fn(async () => undefined) } as never })
		await expect(executor.executeSimulateUtility({ kind: "simulate_utility", networkId: "net-1" } as never)).rejects.toThrow(
			"Wallet locked",
		)
		await expect(executor.executeAztecExecuteUtility({ kind: "aztec_executeUtility", networkId: "net-1" } as never)).rejects.toThrow(
			"Wallet locked",
		)
		expect(deps.networkService.getNetwork).not.toHaveBeenCalled()
	})

	function utilityHarness() {
		return makeHarness({
			resolver: {
				resolveInstance: vi.fn(async () => [null, { currentContractClassId: { toString: () => "class-1" } }]),
				resolveArtifact: vi.fn(async () => [null, {}]),
			} as never,
		})
	}

	function utilityOp(name: string) {
		return {
			kind: "aztec_executeUtility",
			networkId: "net-1",
			accountAddress: VALID_ADDR,
			// Every ABI-derived field lies, the stale `returnTypes` included: the bound call must ignore them all.
			call: {
				to: addr("0xtoken"),
				selector: addr("0xsel"),
				name,
				args: [],
				hideMsgSender: true,
				type: FunctionType.PUBLIC,
				isStatic: false,
				returnType: { kind: "boolean" },
				returnTypes: [{ kind: "field" }],
			},
			opts: { scopes: [] },
		} as never
	}

	test("rejects when call.name does not match the selector's real function — before PXE runs it", async () => {
		// dApp scoped for `symbol` sends the balance_of_private selector under
		// name "symbol". The bind must reject; the private read never happens.
		contractResolverMocks.findFunctionBySelector.mockResolvedValue({
			name: "balance_of_private",
			functionType: FunctionType.UTILITY,
			isStatic: true,
		})
		const { executor, pxe } = utilityHarness()
		await expect(executor.executeAztecExecuteUtility(utilityOp("symbol"))).rejects.toThrow(/Scope violation/)
		expect(pxe.executeUtility).not.toHaveBeenCalled()
	})

	test("executes the SELECTOR's function rebuilt from ABI truth when the name matches", async () => {
		const returnType = { kind: "integer", sign: "unsigned", width: 8 }
		contractResolverMocks.findFunctionBySelector.mockResolvedValue({
			name: "symbol",
			functionType: FunctionType.UTILITY,
			isStatic: true,
			returnType,
		})
		const { executor, pxe } = utilityHarness()
		await executor.executeAztecExecuteUtility(utilityOp("symbol"))
		expect(pxe.executeUtility).toHaveBeenCalledTimes(1)
		const boundCall = (pxe.executeUtility as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(boundCall).toMatchObject({ name: "symbol", type: FunctionType.UTILITY, isStatic: true, hideMsgSender: false, returnType })
		expect(boundCall).not.toHaveProperty("returnTypes")
	})

	test("an empty call.name is REJECTED — NOT treated as absent (closes the {function:''} silent-authwit bypass)", async () => {
		contractResolverMocks.findFunctionBySelector.mockResolvedValue({
			name: "transfer",
			functionType: FunctionType.PRIVATE,
			isStatic: false,
		})
		const { executor, pxe } = utilityHarness()
		// name "" !== "transfer" → reject. Treating "" as "no name" would let a dApp
		// scope `{function:""}` and run any selector without a per-call popup.
		await expect(executor.executeAztecExecuteUtility(utilityOp(""))).rejects.toThrow(/Scope violation/)
		expect(pxe.executeUtility).not.toHaveBeenCalled()
	})

	test.each([
		["a scalar", { kind: "integer", sign: "unsigned", width: 128 }, [new Fr(42n)], 42n],
		["a tuple", { kind: "tuple", fields: [{ kind: "field" }, { kind: "boolean" }] }, [new Fr(5n), new Fr(1n)], [5n, true]],
		["nothing", undefined, [], undefined],
	])("simulate_utility decodes %s through the ABI's returnType", async (_label, returnType, result, decoded) => {
		// bb.js's poseidon2 cannot run under jsdom (see vitest.config.ts); this is `view()`'s real selector.
		vi.spyOn(FunctionSelector, "fromNameAndParameters").mockResolvedValue(FunctionSelector.fromString("0x0f8efe19"))
		const fn = { name: "view", functionType: FunctionType.UTILITY, isStatic: true, parameters: [], returnType }
		const { executor, pxe } = makeHarness({
			resolver: {
				resolveInstance: vi.fn(async () => [null, { currentContractClassId: { toString: () => "class-1" } }]),
				resolveArtifact: vi.fn(async () => [null, { functions: [fn], nonDispatchPublicFunctions: [] }]),
			} as never,
		})
		pxe.executeUtility.mockResolvedValueOnce({ result } as never)
		const op = {
			kind: "simulate_utility",
			networkId: "net-1",
			accountAddress: VALID_ADDR,
			contract: VALID_ADDR,
			method: "view",
			args: [],
		}

		await expect(executor.executeSimulateUtility(op as never)).resolves.toEqual(decoded)
	})
})

describe("ViewExecutor.executeAztecProfileTx", () => {
	test("every mode is refused as an unsupported method before the fence, a build or PXE; a simulate in the same harness builds", async () => {
		const { executor, deps, pxe } = makeHarness()
		for (const profileMode of ["gates", "execution-steps", "full"]) {
			const op = makeSimOp({ kind: "aztec_profileTx", opts: { from: addr(VALID_ADDR), additionalScopes: [], profileMode } })
			await expect(executor.executeAztecProfileTx(op)).rejects.toMatchObject({
				code: UnsupportedMethodError.CODE,
				message: "Unsupported wallet method: profileTx",
			})
		}
		expect(deps.profileService.captureExecutionFence).not.toHaveBeenCalled()
		expect(deps.txBuilder.buildStandard).not.toHaveBeenCalled()
		expect(pxe.profileTx).not.toHaveBeenCalled()

		fastPathMocks.rehydrateOptimizablePrefix.mockReturnValue(null)
		await executor.executeAztecSimulateTx(makeSimOp())
		expect(deps.txBuilder.buildStandard).toHaveBeenCalledTimes(1)
	})
})

describe("ViewExecutor.executeAztecExecuteUtility — the selector binding and the answer, with the call as the dispatcher parses it", () => {
	const TO = AztecAddress.fromBigIntUnsafe(0x70c3n)
	const SYMBOL = { name: "symbol", functionType: FunctionType.UTILITY, isStatic: true }

	function harness() {
		return makeHarness({
			resolver: {
				resolveInstance: vi.fn(async () => [null, { currentContractClassId: { toString: () => "class-1" } }]),
				resolveArtifact: vi.fn(async () => [null, {}]),
			} as never,
		})
	}
	const op = (name: string | undefined) =>
		({
			kind: "aztec_executeUtility",
			networkId: "net-1",
			accountAddress: VALID_ADDR,
			call: {
				to: TO,
				selector: FunctionSelector.fromString("0x0f8efe19"),
				name,
				args: [],
				hideMsgSender: false,
				type: FunctionType.UTILITY,
				isStatic: true,
			},
			opts: { scopes: [] },
		}) as never
	async function rejectionOf(run: Promise<unknown>): Promise<Error> {
		try {
			await run
		} catch (error) {
			return error as Error
		}
		throw new Error("expected a rejection")
	}

	test("an unknown selector, a wrong name and an empty name are refused before PXE runs anything", async () => {
		const { executor, pxe } = harness()
		contractResolverMocks.findFunctionBySelector.mockResolvedValueOnce(undefined)
		const unknown = await rejectionOf(executor.executeAztecExecuteUtility(op("symbol")))
		expect(unknown.constructor).toBe(Error)
		expect(unknown.message).toBe("Method not found")
		for (const name of ["balance_of_private", ""]) {
			contractResolverMocks.findFunctionBySelector.mockResolvedValueOnce(SYMBOL)
			const refused = await rejectionOf(executor.executeAztecExecuteUtility(op(name)))
			expect(refused.constructor).toBe(ScopeViolationError)
			expect(refused.message).toBe("Scope violation: call name does not match selector's function")
		}
		expect(pxe.executeUtility).not.toHaveBeenCalled()
	})

	test.each([
		["a public", FunctionType.PUBLIC],
		["a private", FunctionType.PRIVATE],
	])("%s function bound to its name is refused as invalid arguments before PXE runs anything", async (_label, functionType) => {
		const { executor, pxe } = harness()
		contractResolverMocks.findFunctionBySelector.mockResolvedValueOnce({ name: "symbol", functionType, isStatic: false })
		const refused = await rejectionOf(executor.executeAztecExecuteUtility(op("symbol")))
		expect(refused).toBeInstanceOf(InvalidWalletArgumentsError)
		expect(refused.message).toBe("Invalid arguments for wallet method: executeUtility")
		expect(pxe.executeUtility).not.toHaveBeenCalled()
	})

	test("a utility function bound to its name runs", async () => {
		const { executor, pxe } = harness()
		contractResolverMocks.findFunctionBySelector.mockResolvedValueOnce(SYMBOL)
		await executor.executeAztecExecuteUtility(op("symbol"))
		expect(pxe.executeUtility).toHaveBeenCalledTimes(1)
	})

	test("the dApp's answer keeps the call's result and drops the stats", async () => {
		const { executor, pxe } = harness()
		contractResolverMocks.findFunctionBySelector.mockResolvedValueOnce(SYMBOL)
		const full = new UtilityExecutionResult(
			[new Fr(7)],
			[{ data: [new Fr(8)], contractAddress: TO }],
			9n,
			UtilityExecutionResult.random().stats,
		)
		pxe.executeUtility.mockResolvedValueOnce(full as never)

		const answer = await executor.executeAztecExecuteUtility(op("symbol"))

		expect(full.stats).toBeDefined()
		expect(answer.stats).toBeUndefined()
		expect([answer.result, answer.offchainEffects, answer.anchorBlockTimestamp]).toEqual([
			full.result,
			full.offchainEffects,
			full.anchorBlockTimestamp,
		])
	})

	test("an absent name (a direct call; the wire schema requires one) runs the selector's function", async () => {
		const { executor, pxe } = harness()
		contractResolverMocks.findFunctionBySelector.mockResolvedValueOnce(SYMBOL)
		await executor.executeAztecExecuteUtility(op(undefined))
		expect(pxe.executeUtility).toHaveBeenCalledTimes(1)
		expect((pxe.executeUtility as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ name: "symbol" })
	})
})

describe("ViewExecutor.executeAztecExecuteUtility — the target's registration", () => {
	test("an own account the PXE does not hold is refused, and the read registers no contract; once registered, it runs", async () => {
		const own = AztecAddress.fromBigIntUnsafe(0xacc0n)
		const held = new Set<string>()
		const pxe = {
			getContractInstance: vi.fn(async (a: AztecAddress) =>
				held.has(a.toString()) ? { address: a, currentContractClassId: Fr.fromString("0x0c1a55") } : undefined,
			),
			getContractArtifact: vi.fn(async () => ({})),
			registerContract: vi.fn(async () => {}),
			executeUtility: vi.fn(async () => ({ result: [] })),
		}
		const { executor, account, deps } = makeHarness({ resolver: new ContractResolver({ log: vi.fn() } as never) })
		const ensureContractRegistered = vi.fn(async () => {})
		Object.assign(account, { address: own, ensureContractRegistered })
		// `undefined` stands for the whole PXE, node and known-bundle lookup: the account contract is
		// never published, so only a registration can make it resolve.
		;(deps.pxeService.getPXE as ReturnType<typeof vi.fn>).mockReturnValue(pxe)
		const lookupValidity = {
			kind: "aztec_executeUtility",
			networkId: "net-1",
			accountAddress: own.toString(),
			call: { to: own, selector: FunctionSelector.fromString("0x0f8efe19"), name: "lookup_validity", args: [], hideMsgSender: false },
			opts: { scopes: [own.toString()] },
		} as never

		await expect(executor.executeAztecExecuteUtility(lookupValidity)).rejects.toThrow(
			new ContractNotRegisteredError("Contract instance not found"),
		)
		expect(account.ensureRegistered).toHaveBeenCalledTimes(1)
		expect(ensureContractRegistered).not.toHaveBeenCalled()
		expect(pxe.registerContract).not.toHaveBeenCalled()
		expect(pxe.executeUtility).not.toHaveBeenCalled()

		held.add(own.toString())
		contractResolverMocks.findFunctionBySelector.mockResolvedValueOnce({ name: "lookup_validity", functionType: FunctionType.UTILITY })
		await executor.executeAztecExecuteUtility(lookupValidity)
		expect(pxe.executeUtility).toHaveBeenCalledTimes(1)
	})
})
