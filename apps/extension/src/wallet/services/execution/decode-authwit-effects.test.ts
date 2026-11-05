import { describe, expect, test, vi } from "vitest"
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { AuthRegistryRefusalError, ScopeViolationError, UnattachedAuthorizationRefusalError } from "@nulo/extension-messaging/errors"
import { type AuthwitDecodeCrypto, decodeAuthwitEffects } from "./decode-authwit-effects"

const CHAIN = { chainId: 7, version: 6 } as never
const TOKEN = AztecAddress.fromNumberUnsafe(0x70c3)
const SENDER = AztecAddress.fromNumberUnsafe(0x5e9d)
const OTHER = AztecAddress.fromNumberUnsafe(0xa11c)
const OWNER = AztecAddress.fromNumberUnsafe(0x0e1e)
/** A send from SENDER alone; `sendWith` adds OWNER to its scopes and the witness hashes its request carries. */
const SEND = { signer: SENDER, scopes: [SENDER], carried: new Set<string>() }
const sendWith = (carried: string[]) => ({ signer: SENDER, scopes: [SENDER, OWNER], carried: new Set(carried) })

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

const effect = (tag: string, contractAddress: AztecAddress, onBehalfOf: AztecAddress = SENDER) => ({
	data: [tag, onBehalfOf] as never,
	contractAddress,
})

describe("decodeAuthwitEffects and the authorization registry", () => {
	test("a request from the registry is refused before anything decodes", async () => {
		const { crypto, seam } = fakeCrypto()
		const refused = decodeAuthwitEffects([effect("r", STANDARD_AUTH_REGISTRY_ADDRESS)], CHAIN, SEND, seam)
		await expect(refused).rejects.toBeInstanceOf(AuthRegistryRefusalError)
		await expect(refused).rejects.toBeInstanceOf(ScopeViolationError)
		expect(crypto.fromFields).not.toHaveBeenCalled()
		expect(crypto.computeMessageHash).not.toHaveBeenCalled()
	})

	test("a valid request ahead of a registry one returns no partial set", async () => {
		const { crypto, seam } = fakeCrypto()
		const effects = [effect("a", TOKEN), effect("r", STANDARD_AUTH_REGISTRY_ADDRESS)]
		await expect(decodeAuthwitEffects(effects, CHAIN, SEND, seam)).rejects.toBeInstanceOf(AuthRegistryRefusalError)
		expect(crypto.computeMessageHash).not.toHaveBeenCalled()
	})

	test("requests from other contracts decode in effect order", async () => {
		const { seam } = fakeCrypto()
		const decoded = await decodeAuthwitEffects([effect("a", TOKEN), effect("b", TOKEN)], CHAIN, SEND, seam)
		expect(decoded.signable.map(({ record }) => record.messageHash)).toEqual(["mh:ih:a", "mh:ih:b"])
	})
})

describe("decodeAuthwitEffects and the signing account", () => {
	test("a request on behalf of an address outside the send's scopes is never hashed; the sender's beside it is", async () => {
		const { crypto, seam } = fakeCrypto()
		const decoded = await decodeAuthwitEffects([effect("theirs", TOKEN, OTHER), effect("ours", TOKEN)], CHAIN, SEND, seam)
		expect(decoded.signable.map(({ record }) => record.messageHash)).toEqual(["mh:ih:ours"])
		expect(crypto.computeMessageHash).toHaveBeenCalledTimes(1)
		expect(decoded.requested).toBe(true)
	})

	test("a run that asked only another account still reports a request; one whose effects decode as none does not", async () => {
		const { seam } = fakeCrypto()
		expect(await decodeAuthwitEffects([effect("theirs", TOKEN, OTHER)], CHAIN, SEND, seam)).toEqual({
			signable: [],
			consumed: [],
			requested: true,
		})
		const notARequest = { fromFields: vi.fn(async () => Promise.reject(new Error("not a request"))), computeMessageHash: vi.fn() }
		expect(await decodeAuthwitEffects([effect("x", TOKEN)], CHAIN, SEND, notARequest as never)).toEqual({
			signable: [],
			consumed: [],
			requested: false,
		})
	})
})

describe("decodeAuthwitEffects and another approved account", () => {
	test("its request whose witness the transaction carries is listed with its account and never signed", async () => {
		const { seam } = fakeCrypto()
		const effects = [effect("theirs", TOKEN, OWNER), effect("theirs", TOKEN, OWNER), effect("ours", TOKEN)]
		const decoded = await decodeAuthwitEffects(effects, CHAIN, sendWith(["mh:ih:theirs"]), seam)
		expect(decoded.signable.map(({ record }) => record.messageHash)).toEqual(["mh:ih:ours"])
		expect(decoded.consumed).toEqual([
			{
				consumer: TOKEN.toString(),
				caller: "caller:theirs",
				selector: "0xsel",
				args: [],
				innerHash: "ih:theirs",
				messageHash: "mh:ih:theirs",
				onBehalfOf: OWNER.toString(),
			},
		])
	})

	test("its request with no carried witness refuses the send; a registry effect still refuses as the registry", async () => {
		const { seam } = fakeCrypto()
		const unattached = decodeAuthwitEffects([effect("theirs", TOKEN, OWNER), effect("ours", TOKEN)], CHAIN, sendWith([]), seam)
		await expect(unattached).rejects.toBeInstanceOf(UnattachedAuthorizationRefusalError)
		await expect(unattached).rejects.toBeInstanceOf(ScopeViolationError)
		const registry = [effect("theirs", TOKEN, OWNER), effect("r", STANDARD_AUTH_REGISTRY_ADDRESS)]
		await expect(decodeAuthwitEffects(registry, CHAIN, sendWith([]), seam)).rejects.toBeInstanceOf(AuthRegistryRefusalError)
	})
})
