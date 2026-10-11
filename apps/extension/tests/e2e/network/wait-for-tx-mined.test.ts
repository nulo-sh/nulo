import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { TxHash } from "@aztec-labs/stdlib/tx"
import { TokenContract } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest"
import {
	type AztecTestConfig,
	createSponsoredFeeOptions,
	createTestWallet,
	mintPublicTokens,
	randomAztecAddress,
	waitForTxMined,
} from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

describe.skipIf(!aztecConfig)("waitForTxMined", { timeout: 240_000 }, () => {
	const config = aztecConfig as AztecTestConfig
	let script: Awaited<ReturnType<typeof createTestWallet>>
	let fee: Awaited<ReturnType<typeof createSponsoredFeeOptions>>

	beforeAll(async () => {
		script = await createTestWallet(config.nodeUrl)
		fee = await createSponsoredFeeOptions(script.wallet)
	}, 120_000)

	afterAll(async () => {
		await script?.cleanup()
	})

	test("resolves on a successful public mint", async () => {
		const hash = await mintPublicTokens(script.wallet, config.tokenAddress, await randomAztecAddress(), 1n, config.minterAddress, fee)
		await expect(waitForTxMined(config, hash)).resolves.toBeUndefined()
	})

	// More than any balance a run mints: the node includes the transfer, and its public execution reverts.
	test("rejects a transaction whose public execution reverted", async () => {
		const minter = AztecAddress.fromStringUnsafe(config.minterAddress)
		const token = await TokenContract.at(AztecAddress.fromStringUnsafe(config.tokenAddress), script.wallet)
		const payload = await token.methods
			.transfer_public_to_public(minter, AztecAddress.fromStringUnsafe(await randomAztecAddress()), 10n ** 30n, 0)
			.request({ fee: { paymentMethod: fee.paymentMethod } })
		const hash = await script.wallet.sendUnsimulated(payload, minter)
		await expect(waitForTxMined(config, hash.toString())).rejects.toThrow(`Transaction ${hash} reverted: `)
	})

	test("rejects a hash the node never received as dropped", async () => {
		const hash = TxHash.random().toString()
		await expect(waitForTxMined(config, hash)).rejects.toThrow(`Transaction ${hash} was dropped`)
	})
})
