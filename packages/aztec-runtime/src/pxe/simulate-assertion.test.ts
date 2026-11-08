// @vitest-environment node
/**
 * `PxeService.simulateTx` hands a contract assertion on as a typed `ContractAssertionError` with the
 * failing call path, which the offscreen hop would otherwise reduce to a message; every other error
 * leaves unchanged, and the stale-anchor retry still reads the simulator's own error.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))

import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import { FunctionSelector } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { type FailingFunction, SimulationError } from "@aztec-labs/stdlib/errors"
import { GasSettings } from "@aztec-labs/stdlib/gas"
import { TxContext, TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import { ContractAssertionError, PxeStaleAnchorError } from "@nulo/extension-messaging/errors"
import type { ILogger } from "@nulo/wallet-core/logger"
import { ChainRuntime, endpointsKey, type NetworkInfo, type PxeFactory } from "./chain-runtime"
import { NO_ROUTE } from "./pxe-factory.testing"
import { type IProfileReader, PxeService } from "./service"

const noopLogger: ILogger = { log: () => {} }
const noopProfiles: IProfileReader = { connect: async () => {}, getProfiles: async () => [] }
const network: NetworkInfo = {
	profileId: "p1",
	chainId: 31337,
	l1ChainId: 31337,
	endpoints: [{ id: "primary", rpcUrl: "http://localhost:8080" }],
}
const account = "0x000000000000000000000000000000000000000000000000000000000000ab12"

// Hand-built fields: `TxExecutionRequest.random()` walks Barretenberg WASM.
function wireTxRequest() {
	const req = new TxExecutionRequest(
		AztecAddress.fromBigIntUnsafe(0xab12n),
		FunctionSelector.fromField(new Fr(1)),
		Fr.ZERO,
		new TxContext(1, 2, GasSettings.empty()),
		[],
		[],
		[],
		Fr.ZERO,
	)
	return JSON.parse(jsonStringify(req))
}

/** A service whose PXE throws each of `errors` in turn, one per `simulateTx`. */
function harness(errors: unknown[]) {
	const calls = { simulate: 0, sync: 0 }
	const factory: PxeFactory = {
		createChainRuntime: async (n) => {
			const pxe = {
				getRegisteredAccounts: async () => [{ address: { toString: () => account } }],
				sync: async () => {
					calls.sync++
				},
				simulateTx: async () => {
					throw errors[calls.simulate++]
				},
			} as unknown as PXE
			return new ChainRuntime(n.chainId, {} as never, pxe, endpointsKey(n.endpoints))
		},
		createRoute: NO_ROUTE,
	}
	const service = new PxeService(noopProfiles, noopLogger, factory)
	;(service as unknown as { initialized: boolean }).initialized = true
	const simulate = () =>
		service.simulateTx(network, wireTxRequest(), { simulatePublic: true, scopes: [account as unknown as AztecAddress] } as never).then(
			() => undefined,
			(e: unknown) => e,
		)
	return { simulate, calls }
}

const entrypoint: FailingFunction = {
	contractAddress: AztecAddress.fromBigIntUnsafe(0xab12n),
	functionSelector: FunctionSelector.fromString("0x27e740b2"),
}
const token: FailingFunction = {
	contractAddress: AztecAddress.fromBigIntUnsafe(0x7e57n),
	functionSelector: FunctionSelector.fromString("0x0a0b0c0d"),
}
const unnamed: FailingFunction = { contractAddress: AztecAddress.fromBigIntUnsafe(0x99n) }

/** An assertion failure as the PXE leaves it: the simulator's location, then the queue's context. */
function assertionFailure(original: string): SimulationError {
	const err = new SimulationError(
		original,
		[entrypoint, token, unnamed],
		[],
		[{ filePath: "main.nr", line: 1, column: 1, fileSource: "", locationText: "assert(balance >= amount)" }],
	)
	err.setAztecContext("\nContext:\nsimulateTx")
	return err
}

describe("PxeService.simulateTx: a contract assertion leaves typed", () => {
	beforeEach(() => {
		vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} } })
	})
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test("the assertion's text and its frames, outermost first and projected to strings; the message unchanged", async () => {
		const thrown = assertionFailure("Assertion failed: Balance too low")
		const err = await harness([thrown]).simulate()
		expect(err).toBeInstanceOf(ContractAssertionError)
		expect((err as ContractAssertionError).message).toBe(thrown.message)
		expect((err as ContractAssertionError).message).toContain("\nContext:\nsimulateTx")
		expect((err as ContractAssertionError).details).toStrictEqual({
			assertion: "Balance too low",
			frames: [
				{ contract: entrypoint.contractAddress.toString(), selector: "0x27e740b2" },
				{ contract: token.contractAddress.toString(), selector: "0x0a0b0c0d" },
				{ contract: unnamed.contractAddress.toString() },
			],
		})
	})

	test("a simulation error that is not an assertion, and a plain error, leave as they came", async () => {
		const other = new SimulationError("Invalid tx: insufficient fee payer balance", [token])
		const plain = new Error("Assertion failed: Balance too low")
		expect(await harness([other]).simulate()).toBe(other)
		expect(await harness([plain]).simulate()).toBe(plain)
	})

	test("a stale-anchor assertion is retried on the simulator's own error, and a second ends as PxeStaleAnchorError", async () => {
		const stale = () => assertionFailure("Assertion failed: RewindableRegister write originates behind the anchor")
		const { simulate, calls } = harness([stale(), stale()])
		const err = await simulate()
		expect(err).toBeInstanceOf(PxeStaleAnchorError)
		expect(err).not.toBeInstanceOf(ContractAssertionError)
		expect(calls).toStrictEqual({ simulate: 2, sync: 1 })
	})

	test("after a stale-anchor retry, the retry's own assertion still leaves typed", async () => {
		const { simulate, calls } = harness([
			assertionFailure("Assertion failed: RewindableRegister write originates behind the anchor"),
			assertionFailure("Assertion failed: Balance too low"),
		])
		const err = await simulate()
		expect(err).toBeInstanceOf(ContractAssertionError)
		expect((err as ContractAssertionError).details.assertion).toBe("Balance too low")
		expect(calls).toStrictEqual({ simulate: 2, sync: 1 })
	})
})
