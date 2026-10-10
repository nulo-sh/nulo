/**
 * `TransferEstimateReuse` — ported characterization pins (every
 * observable exit of `tryConsume`, fingerprint byte-stability, stash
 * sweep). These were written against the facade BEFORE extraction and
 * moved here with the subsystem; the behavior contract is identical.
 */

import { GasFees } from "@aztec-labs/stdlib/gas"
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import { describe, expect, test, vi } from "vitest"
import type { FpcInfo } from "@/wallet/services/fpc/spec"
import { TransferType } from "@/wallet/services/transaction/spec"
import type { Network } from "@/wallet/services/network/service"
import type { FeeSettings } from "./spec"
import { ESTIMATE_REUSE_TTL_MS, fingerprintBaseFee } from "./estimate-reuse-shared"
import {
	TransferEstimateReuse,
	type TransferEstimateReuseDeps,
	type TransferEstimateReuseEntry,
	fingerprintFeeSettings,
} from "./transfer-estimate-reuse"

const FEE_SETTINGS: FeeSettings = { paymentMethod: { kind: "fj" } }
const FENCE = { profileId: "profile-1", epoch: 0, session: 1 }

const INPUTS = {
	networkId: "net-1",
	accountAddress: "0xacc",
	tokenId: 1,
	transferType: TransferType.Public,
	recipientAddress: "0xrecipient",
	amount: 100n,
	feeSettings: FEE_SETTINGS,
}

// Node reports min fees of 50/100; default multiplier 2 → a fresh build
// would finalize 100:200, so a matching entry stores that fingerprint.
const CURRENT_MIN = new GasFees(50n, 100n)
const MATCHING_BASE_FEE_FINGERPRINT = "100:200"

const PRIMARY_ENDPOINT = { id: "ep-1", rpcUrl: "http://localhost:8080" }
const CHAIN = { l1ChainId: 31337, rollupVersion: 31337 }

const SPONSOR_ROW: FpcInfo = { id: "fpc-1", profileId: "profile-1", chainId: 0, type: 1, address: "0xsponsor", isProtocol: true }
const FPC_SETTINGS: FeeSettings = { paymentMethod: { kind: "fpc", fpcId: SPONSOR_ROW.id } }
const FPC_INPUTS = { ...INPUTS, feeSettings: FPC_SETTINGS }
const FPC_ENTRY: Partial<TransferEstimateReuseEntry> = {
	feeSettingsHash: fingerprintFeeSettings(FPC_SETTINGS),
	fpcIdentity: { id: "fpc-1", type: 1, address: "0xsponsor", chainId: 0, isProtocol: true },
}

function makeEntry(overrides: Partial<TransferEstimateReuseEntry> = {}): TransferEstimateReuseEntry {
	return {
		networkId: INPUTS.networkId,
		initializesAccount: false,
		accountAddress: INPUTS.accountAddress,
		tokenId: INPUTS.tokenId,
		transferType: INPUTS.transferType,
		recipientAddress: INPUTS.recipientAddress,
		amount: INPUTS.amount,
		sequenceEpoch: 0,
		feeSettingsHash: fingerprintFeeSettings(FEE_SETTINGS),
		profileId: "profile-1",
		chainIdentity: CHAIN,
		baseFeeFingerprint: MATCHING_BASE_FEE_FINGERPRINT,
		primaryEndpointId: PRIMARY_ENDPOINT.id,
		primaryEndpointUrl: PRIMARY_ENDPOINT.rpcUrl,
		pendingHashes: [],
		txRequest: {} as TransferEstimateReuseEntry["txRequest"],
		nonce: { toString: () => "1" },
		feePaymentMethod: 0 as TransferEstimateReuseEntry["feePaymentMethod"],
		token: { contract: "0xtoken", name: "Token", symbol: "TOK", decimals: 18 },
		fnName: "transfer_in_public",
		args: [],
		builtAt: Date.now(),
		...overrides,
	}
}

function makeReuse(
	overrides: {
		entry?: Partial<TransferEstimateReuseEntry>
		network?: Partial<Network>
		getCurrentMinFees?: () => Promise<GasFees>
		getPredictedMinFees?: () => Promise<GasFees[]>
		pending?: Array<{ hash: string }>
		epoch?: number
		liveChain?: () => Promise<{ l1ChainId: number; rollupVersion: number }>
		fpcRow?: () => Promise<FpcInfo>
	} = {},
) {
	const entry = makeEntry(overrides.entry)
	const logDebug = vi.fn()
	const getFpcInfo = vi.fn(overrides.fpcRow ?? (async () => ({ ...SPONSOR_ROW })))
	const deps: TransferEstimateReuseDeps = {
		sequenceEpoch: () => overrides.epoch ?? 0,
		getNetwork: async () =>
			(overrides.network ?? {
				chainId: 0,
				primaryEndpointId: PRIMARY_ENDPOINT.id,
				endpoints: [PRIMARY_ENDPOINT],
			}) as Network,
		getNode: async () => ({
			getCurrentMinFees: overrides.getCurrentMinFees ?? (async () => CURRENT_MIN),
			getPredictedMinFees: overrides.getPredictedMinFees,
		}),
		getLiveChainIdentity: overrides.liveChain ?? (async () => CHAIN),
		getFpcInfo,
		getPendingForAccount: () => overrides.pending ?? [],
		logDebug,
	}
	const reuse = new TransferEstimateReuse(deps)
	reuse.stash("est-1", entry)
	return { reuse, entry, logDebug, getFpcInfo }
}

describe("fingerprint byte-stability (cache-compare contract)", () => {
	test("fingerprintBaseFee exact format: '<da>:<l2>'", () => {
		expect(fingerprintBaseFee({ feePerDaGas: 100n, feePerL2Gas: 200n })).toBe("100:200")
		expect(fingerprintBaseFee({ feePerDaGas: 0n, feePerL2Gas: 0n })).toBe("0:0")
	})

	test("fingerprintFeeSettings exact format per payment-method variant", () => {
		expect(fingerprintFeeSettings({ paymentMethod: { kind: "fj" } })).toBe("fj|default")
		expect(fingerprintFeeSettings({ paymentMethod: { kind: "fj" }, priorityLevel: "fast" })).toBe("fj|fast")
		expect(fingerprintFeeSettings({ paymentMethod: { kind: "fpc", fpcId: "abc" }, priorityLevel: "urgent" })).toBe("fpc:abc|urgent")
		expect(
			fingerprintFeeSettings({
				paymentMethod: { kind: "fjwc", claimAmount: "100", claimSecret: "sec", messageLeafIndex: "0" },
			}),
		).toBe("fjwc:100:sec:0|default")
		expect(fingerprintFeeSettings({ paymentMethod: { kind: "embedded" } })).toBe("embedded|default")
	})
})

describe("tryConsume: every observable exit", () => {
	test("happy path returns the entry", async () => {
		const { reuse, entry } = makeReuse()
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBe(entry)
	})

	test("unknown estimateId → undefined", async () => {
		const { reuse } = makeReuse()
		expect(await reuse.tryConsume("nope", INPUTS, FENCE)).toBeUndefined()
	})

	test("single-shot: second consume of the same id → undefined", async () => {
		const { reuse } = makeReuse()
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeDefined()
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("TTL stale → undefined", async () => {
		const { reuse } = makeReuse({ entry: { builtAt: Date.now() - ESTIMATE_REUSE_TTL_MS - 1 } })
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("input drift (recipient) → undefined", async () => {
		const { reuse } = makeReuse({ entry: { recipientAddress: "0xother" } })
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("fee-settings drift (different payment method hash) → undefined", async () => {
		const { reuse } = makeReuse({
			entry: { feeSettingsHash: fingerprintFeeSettings({ paymentMethod: { kind: "fpc", fpcId: "x" } }) },
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("profile drift (entry under another profile than the fence's) → SessionEndedError, never a miss to rebuild on", async () => {
		const { reuse } = makeReuse({ entry: { profileId: "profile-2" } })
		await expect(reuse.tryConsume("est-1", INPUTS, FENCE)).rejects.toBeInstanceOf(SessionEndedError)
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("no primary endpoint on the network → undefined", async () => {
		const { reuse } = makeReuse({
			network: { chainId: 0, primaryEndpointId: "ep-gone", endpoints: [PRIMARY_ENDPOINT] } as Partial<Network>,
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("primary endpoint URL changed → undefined", async () => {
		const { reuse } = makeReuse({
			network: {
				chainId: 0,
				primaryEndpointId: PRIMARY_ENDPOINT.id,
				endpoints: [{ id: PRIMARY_ENDPOINT.id, rpcUrl: "http://localhost:9999" }],
			} as Partial<Network>,
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("base fee drift → undefined", async () => {
		const { reuse } = makeReuse({
			getCurrentMinFees: async () => new GasFees(51n, 100n),
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("predicted-worst (not current-min) is the consume-time basis", async () => {
		// Current-min alone would finalize 100:200 and match the entry, but a
		// fresh build prices off the worst predicted slot (60/120 → 120:240),
		// so the 100:200 entry must reject.
		const { reuse } = makeReuse({
			getPredictedMinFees: async () => [new GasFees(55n, 110n), new GasFees(60n, 120n)],
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("predicted-worst entry matches when the prediction is stable", async () => {
		const { reuse, entry } = makeReuse({
			entry: { baseFeeFingerprint: "120:240" },
			getPredictedMinFees: async () => [new GasFees(55n, 110n), new GasFees(60n, 120n)],
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBe(entry)
	})

	test("base fee fetch failure → undefined (conservative)", async () => {
		const { reuse } = makeReuse({
			getCurrentMinFees: async () => {
				throw new Error("node down")
			},
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("pending-tx set changed → undefined", async () => {
		const { reuse } = makeReuse({ pending: [{ hash: "0xnew" }] })
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})

	test("a send reached the node since the estimate, even one already mined (same pending set) → undefined", async () => {
		const { reuse } = makeReuse({ entry: { sequenceEpoch: 0 }, epoch: 1 })
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
	})
})

describe("stash: opportunistic TTL sweep", () => {
	test("stale entries are evicted on write; fresh ones survive", async () => {
		const { reuse } = makeReuse() // est-1 fresh
		const stale = makeEntry({ builtAt: Date.now() - ESTIMATE_REUSE_TTL_MS - 1 })
		reuse.stash("est-stale", stale)
		// Writing a THIRD entry sweeps est-stale (past TTL) but not est-1.
		reuse.stash("est-2", makeEntry())
		expect(await reuse.tryConsume("est-stale", INPUTS, FENCE)).toBeUndefined()
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeDefined()
		expect(await reuse.tryConsume("est-2", INPUTS, FENCE)).toBeDefined()
	})

	test("a consumed entry carries the build's initializesAccount provenance verbatim", async () => {
		// The entry retains the EXACT build, so the confirm leg's classification
		// must see the same provenance a fresh build would — a cache hit that
		// dropped the flag would silently downgrade a real init race to generic.
		const { reuse } = makeReuse({ entry: { initializesAccount: true } })
		const consumed = await reuse.tryConsume("est-1", INPUTS, FENCE)
		expect(consumed?.initializesAccount).toBe(true)
	})
})

describe("tryConsume: the request binds the chain it was signed under and the sponsor row it paid with", () => {
	const reason = (logDebug: ReturnType<typeof vi.fn>) => logDebug.mock.calls.map(([msg]) => msg)

	test("an unchanged sponsor and chain hit", async () => {
		const { reuse, entry } = makeReuse({ entry: FPC_ENTRY })
		expect(await reuse.tryConsume("est-1", FPC_INPUTS, FENCE)).toBe(entry)
	})

	test("the sponsor address edited in place misses", async () => {
		const { reuse, logDebug } = makeReuse({ entry: FPC_ENTRY, fpcRow: async () => ({ ...SPONSOR_ROW, address: "0xedited" }) })
		expect(await reuse.tryConsume("est-1", FPC_INPUTS, FENCE)).toBeUndefined()
		expect(reason(logDebug)).toEqual(["tryConsumeTransferEstimate est-1: fpc identity drift"])
	})

	test("the sponsor row deleted misses with the category only", async () => {
		const { reuse, logDebug } = makeReuse({
			entry: FPC_ENTRY,
			fpcRow: async () => {
				throw new Error("Invalid id fpc-1")
			},
		})
		expect(await reuse.tryConsume("est-1", FPC_INPUTS, FENCE)).toBeUndefined()
		expect(reason(logDebug)).toEqual(["tryConsumeTransferEstimate est-1: fpc row unavailable"])
	})

	test("an fpc entry without a sponsor snapshot misses before any row read", async () => {
		const { reuse, logDebug, getFpcInfo } = makeReuse({ entry: { ...FPC_ENTRY, fpcIdentity: undefined } })
		expect(await reuse.tryConsume("est-1", FPC_INPUTS, FENCE)).toBeUndefined()
		expect(getFpcInfo).not.toHaveBeenCalled()
		expect(reason(logDebug)).toEqual(["tryConsumeTransferEstimate est-1: fpc identity missing"])
	})

	test("a drifted chain pair misses", async () => {
		const { reuse, logDebug } = makeReuse({ liveChain: async () => ({ ...CHAIN, rollupVersion: 1 }) })
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
		expect(reason(logDebug)).toEqual(["tryConsumeTransferEstimate est-1: chain identity drift (exact pair mismatch)"])
	})

	test("a live-chain read that throws misses with the category only", async () => {
		const { reuse, logDebug } = makeReuse({
			liveChain: async () => {
				throw new Error("Chain identity mismatch: live node reports l1ChainId=1")
			},
		})
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBeUndefined()
		expect(reason(logDebug)).toEqual(["tryConsumeTransferEstimate est-1: chain identity drift"])
	})

	test("a send's pinned row judges the entry in place of a fresh read: another address misses, the same row hits", async () => {
		const moved = makeReuse({ entry: FPC_ENTRY })
		const pinnedElsewhere = { infoData: { ...SPONSOR_ROW, address: "0xedited" } } as never
		expect(await moved.reuse.tryConsume("est-1", FPC_INPUTS, FENCE, pinnedElsewhere)).toBeUndefined()
		expect(reason(moved.logDebug)).toEqual(["tryConsumeTransferEstimate est-1: fpc identity drift"])
		expect(moved.getFpcInfo).not.toHaveBeenCalled()
		const same = makeReuse({ entry: FPC_ENTRY })
		expect(await same.reuse.tryConsume("est-1", FPC_INPUTS, FENCE, { infoData: { ...SPONSOR_ROW } } as never)).toBe(same.entry)
	})

	test("an fj entry reads no sponsor row", async () => {
		const { reuse, entry, getFpcInfo } = makeReuse()
		expect(await reuse.tryConsume("est-1", INPUTS, FENCE)).toBe(entry)
		expect(getFpcInfo).not.toHaveBeenCalled()
	})
})
