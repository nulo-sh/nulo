import { describe, expect, test, vi } from "vitest"
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { AuthRegistryRefusalError, ScopeViolationError } from "@nulo/extension-messaging/errors"
import { type AuthwitDecodeCrypto, decodeAuthwitEffects } from "./decode-authwit-effects"

const CHAIN = { chainId: 7, version: 6 } as never
const TOKEN = AztecAddress.fromNumberUnsafe(0x70c3)
const SENDER = AztecAddress.fromNumberUnsafe(0x5e9d)
const OTHER = AztecAddress.fromNumberUnsafe(0xa11c)

function fakeCrypto() {
	const crypto = {
		fromFields: vi.fn(async (data: unknown[]) => ({
			innerHash: `ih:${data[0]}`,
			onBehalfOf: data[1],
			msgSender: `caller:${data[0]}`,
			functionSelector: "0xsel",
			args: [],
		})),
		computeMessageHash: vi.fn(async (intent: { innerHash: unknown }) => ({ toString: () => `mh:${intent.innerHash}` })),
	}
	return { crypto, seam: crypto as unknown as AuthwitDecodeCrypto }
}

/** A request's tag and the account it names, as the fake decodes them. */
const effect = (tag: string, contractAddress: AztecAddress, onBehalfOf: AztecAddress = SENDER) => ({
	data: [tag, onBehalfOf] as never,
	contractAddress,
})

describe("decodeAuthwitEffects and the authorization registry", () => {
	test("a request from the registry is refused before anything decodes", async () => {
		const { crypto, seam } = fakeCrypto()
		const refused = decodeAuthwitEffects([effect("r", STANDARD_AUTH_REGISTRY_ADDRESS)], CHAIN, SENDER, seam)
		await expect(refused).rejects.toBeInstanceOf(AuthRegistryRefusalError)
		await expect(refused).rejects.toBeInstanceOf(ScopeViolationError)
		expect(crypto.fromFields).not.toHaveBeenCalled()
		expect(crypto.computeMessageHash).not.toHaveBeenCalled()
	})

	test("a valid request ahead of a registry one returns no partial set", async () => {
		const { crypto, seam } = fakeCrypto()
		const effects = [effect("a", TOKEN), effect("r", STANDARD_AUTH_REGISTRY_ADDRESS)]
		await expect(decodeAuthwitEffects(effects, CHAIN, SENDER, seam)).rejects.toBeInstanceOf(AuthRegistryRefusalError)
		expect(crypto.computeMessageHash).not.toHaveBeenCalled()
	})

	test("requests from other contracts decode in effect order", async () => {
		const { seam } = fakeCrypto()
		const decoded = await decodeAuthwitEffects([effect("a", TOKEN), effect("b", TOKEN)], CHAIN, SENDER, seam)
		expect(decoded.signable.map(({ record }) => record.messageHash)).toEqual(["mh:ih:a", "mh:ih:b"])
	})
})

describe("decodeAuthwitEffects and the signing account", () => {
	test("a request on behalf of another account is never hashed; the sender's beside it is", async () => {
		const { crypto, seam } = fakeCrypto()
		const decoded = await decodeAuthwitEffects([effect("theirs", TOKEN, OTHER), effect("ours", TOKEN)], CHAIN, SENDER, seam)
		expect(decoded.signable.map(({ record }) => record.messageHash)).toEqual(["mh:ih:ours"])
		expect(crypto.computeMessageHash).toHaveBeenCalledTimes(1)
		expect(decoded.requested).toBe(true)
	})

	test("a run that asked only another account still reports a request; one whose effects decode as none does not", async () => {
		const { seam } = fakeCrypto()
		expect(await decodeAuthwitEffects([effect("theirs", TOKEN, OTHER)], CHAIN, SENDER, seam)).toEqual({ signable: [], requested: true })
		const notARequest = { fromFields: vi.fn(async () => Promise.reject(new Error("not a request"))), computeMessageHash: vi.fn() }
		expect(await decodeAuthwitEffects([effect("x", TOKEN)], CHAIN, SENDER, notARequest as never)).toEqual({
			signable: [],
			requested: false,
		})
	})
})
