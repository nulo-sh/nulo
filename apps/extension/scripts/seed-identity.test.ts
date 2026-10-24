import { describe, expect, test } from "vitest"
import { TESTNET_L1_CHAIN_ID, TESTNET_ROLLUP_VERSION } from "../src/utils/chain-ids"
import { seedForKind } from "../src/wallet/services/network/seeds"
import { checkSeed } from "./seed-identity"

const TESTNET = seedForKind("testnet")
if (!TESTNET) throw new Error("this build seeds no Testnet")
const PINNED = `pinned chainId=${TESTNET.chainId} l1ChainId=${TESTNET_L1_CHAIN_ID}`

const node = (getNodeInfo: () => Promise<unknown>) => ({ getNodeInfo }) as Parameters<typeof checkSeed>[1]

describe("checkSeed", () => {
	test("a node on the pins passes with the pair it reported", async () => {
		const result = await checkSeed(
			TESTNET,
			node(async () => ({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: TESTNET_ROLLUP_VERSION })),
		)
		expect(result).toEqual({
			ok: true,
			line: `Testnet: l1ChainId=${TESTNET_L1_CHAIN_ID} rollupVersion=${TESTNET_ROLLUP_VERSION} (${PINNED}) OK`,
		})
	})

	test("a rollup version that aliases the pinned chain id past 2^32 fails", async () => {
		const alias = TESTNET_ROLLUP_VERSION + 2 ** 32
		const result = await checkSeed(
			TESTNET,
			node(async () => ({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: alias })),
		)
		expect(result).toEqual({ ok: false, line: `Testnet: l1ChainId=${TESTNET_L1_CHAIN_ID} rollupVersion=${alias} (${PINNED}) MISMATCH` })
	})

	test("a failed read prints none of the error's words", async () => {
		const result = await checkSeed(
			TESTNET,
			node(async () => {
				throw new Error("https://rpc.example: invalid credential /opaque-key")
			}),
		)
		expect(result).toEqual({ ok: false, line: `Testnet: no node info (${PINNED}) MISMATCH` })
	})
})
