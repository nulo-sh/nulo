import { describe, expect, test, vi } from "vitest"
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { ScopeViolationError } from "@nulo/extension-messaging/errors"
import { AuthRegistryRefusalError } from "@nulo/wallet-bridge"
import { type AuthwitDecodeCrypto, decodeAuthwitEffects } from "./decode-authwit-effects"

const CHAIN = { chainId: 7, version: 6 } as never
const TOKEN = AztecAddress.fromNumberUnsafe(0x70c3)

function fakeCrypto() {
	const crypto = {
		fromFields: vi.fn(async (data: unknown[]) => ({
			innerHash: `ih:${data[0]}`,
			msgSender: `caller:${data[0]}`,
			functionSelector: "0xsel",
			args: [],
		})),
		computeMessageHash: vi.fn(async (intent: { innerHash: unknown }) => ({ toString: () => `mh:${intent.innerHash}` })),
	}
	return { crypto, seam: crypto as unknown as AuthwitDecodeCrypto }
}

const effect = (tag: string, contractAddress: AztecAddress) => ({ data: [tag] as never, contractAddress })

describe("decodeAuthwitEffects and the authorization registry", () => {
	test("a request from the registry is refused before anything decodes", async () => {
		const { crypto, seam } = fakeCrypto()
		const refused = decodeAuthwitEffects([effect("r", STANDARD_AUTH_REGISTRY_ADDRESS)], CHAIN, seam)
		await expect(refused).rejects.toBeInstanceOf(AuthRegistryRefusalError)
		await expect(refused).rejects.toBeInstanceOf(ScopeViolationError)
		expect(crypto.fromFields).not.toHaveBeenCalled()
		expect(crypto.computeMessageHash).not.toHaveBeenCalled()
	})

	test("a valid request ahead of a registry one returns no partial set", async () => {
		const { crypto, seam } = fakeCrypto()
		const effects = [effect("a", TOKEN), effect("r", STANDARD_AUTH_REGISTRY_ADDRESS)]
		await expect(decodeAuthwitEffects(effects, CHAIN, seam)).rejects.toBeInstanceOf(AuthRegistryRefusalError)
		expect(crypto.computeMessageHash).not.toHaveBeenCalled()
	})

	test("requests from other contracts decode in effect order", async () => {
		const { seam } = fakeCrypto()
		const decoded = await decodeAuthwitEffects([effect("a", TOKEN), effect("b", TOKEN)], CHAIN, seam)
		expect(decoded.map(({ record }) => record.messageHash)).toEqual(["mh:ih:a", "mh:ih:b"])
	})
})
