/**
 * `AuthwitDiscoverer` plumbing under the default jsdom environment: the callback contract
 * (`buildTxRequest` → `pxe.simulateTx` with the discovery flags), the empty-effects fast path, and
 * error propagation. None of these hash anything, so nothing is mocked. The real decode + hash
 * path (a genuine `CallAuthorizationRequest` preimage through `fromFields` validation and the
 * outer message hash) lives in `authwit-discoverer.real.test.ts` under a node environment — the
 * poseidon binding this needs fails under jsdom.
 */

import { describe, expect, test, vi } from "vitest"

import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { EventHandler } from "@nulo/wallet-core/utils"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { AuthwitDiscoverer, type BuildTxRequestFn } from "./authwit-discoverer"
import type { Action } from "./spec"

function fakeLogger(): LoggerStore {
	const config: IConfig = {
		onUpdate: new EventHandler<ConfigProp>(),
		get: (() => false) as IConfig["get"],
	}
	return new LoggerStore(config)
}

function fakeBuildCtx() {
	// Shape matches what collectOffchainEffects walks:
	//   privateExecutionResult.entrypoint.{offchainEffects, nestedExecutionResults, publicInputs.callContext.contractAddress}
	const simulateTx = vi.fn(async () => ({
		privateExecutionResult: {
			entrypoint: {
				offchainEffects: [],
				nestedExecutionResults: [],
				publicInputs: { callContext: { contractAddress: { toString: () => "0xentry" } } },
			},
		},
	}))
	const getNodeInfo = vi.fn(async () => ({ l1ChainId: 31337, rollupVersion: 1 }))
	return {
		simulateTx,
		getNodeInfo,
		ctx: {
			txRequest: { txContext: {} },
			node: { getNodeInfo },
			pxe: { simulateTx },
			account: { address: { toString: () => "0xacc" } },
			scopes: [{ toString: () => "0xacc" }, { toString: () => "0xsecond" }],
			network: { chainId: 0, l1ChainId: 31337, rollupVersion: 1 },
		},
	}
}

describe("AuthwitDiscoverer.discoverPrivateAuthwits", () => {
	test("invokes buildTxRequest with PREEXISTING_FEE_JUICE and simulates under the build's scopes, stubbing only the account", async () => {
		const disc = new AuthwitDiscoverer(fakeLogger())
		const op = { networkId: "net", accountAddress: "0xabc", actions: [] as Action[] }
		const { ctx, simulateTx } = fakeBuildCtx()
		const buildTxRequest: BuildTxRequestFn = vi.fn(async () => ctx as never)

		const result = await disc.discoverPrivateAuthwits(op, buildTxRequest)

		expect(buildTxRequest).toHaveBeenCalledWith(op, AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE)
		expect(simulateTx).toHaveBeenCalled()
		const [, simulateOpts, stubbed] = (simulateTx as ReturnType<typeof vi.fn>).mock.calls[0]
		expect(simulateOpts).toMatchObject({
			simulatePublic: true,
			skipTxValidation: true,
			skipFeeEnforcement: true,
		})
		expect(stubbed).toEqual(["0xacc"])
		// The build's scopes exactly: a note an additional scope holds must be readable at discovery.
		expect((simulateOpts as { scopes: unknown }).scopes).toBe(ctx.scopes)
		expect(result).toEqual({ actions: [], discovered: [] })
	})

	test("returns [] on empty effects without touching getNodeInfo", async () => {
		const disc = new AuthwitDiscoverer(fakeLogger())
		const { ctx, getNodeInfo } = fakeBuildCtx()
		const result = await disc.discoverPrivateAuthwits(
			{ networkId: "n", accountAddress: "0xa", actions: [] as Action[] },
			async () => ctx as never,
		)
		expect(result).toEqual({ actions: [], discovered: [] })
		expect(getNodeInfo).not.toHaveBeenCalled()
	})

	test("propagates errors from the callback buildTxRequest", async () => {
		const disc = new AuthwitDiscoverer(fakeLogger())
		const buildTxRequest: BuildTxRequestFn = async () => {
			throw new Error("simulation failed")
		}
		await expect(disc.discoverPrivateAuthwits({ networkId: "n", accountAddress: "0xa", actions: [] }, buildTxRequest)).rejects.toThrow(
			/simulation failed/,
		)
	})
})

describe("AuthwitDiscoverer constructor", () => {
	test("can be instantiated with only a logger (no other deps)", () => {
		const disc = new AuthwitDiscoverer(fakeLogger())
		expect(disc).toBeDefined()
		expect(typeof disc.discoverPrivateAuthwits).toBe("function")
		expect(typeof disc.computeCallMessageHash).toBe("function")
		expect(typeof disc.computeEncodedCallMessageHash).toBe("function")
		expect(typeof disc.computeIntentMessageHash).toBe("function")
	})
})
