import { InvalidPasswordError, PasskeyNotOpenedError, SameUnlockMethodError } from "@nulo/extension-messaging/errors"
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import { logCredentialFailure } from "./credential-refusal"

const unconfirmed = (cause: unknown) => new PasskeyUnconfirmedError("cred", "salt", cause)
/** The import flow's wrap: the page's copy as the message, the refusal as the cause. */
const wrapped = (cause: unknown) => new Error("This passkey can't unlock Nulo.", { cause })

const refusals: Array<[string, () => unknown]> = [
	["a wrong password", () => new InvalidPasswordError()],
	["another passkey", () => new PasskeyNotOpenedError()],
	["the unlock method the profile has", () => new SameUnlockMethodError()],
	["a passkey with no PRF", () => new PasskeyPrfError("Passkey PRF not available")],
	["an unconfirmed prompt", () => new DOMException("not allowed", "NotAllowedError")],
	["a cancelled prompt", () => new DOMException("cancelled", "AbortError")],
	["a minted passkey whose confirmation was not allowed", () => unconfirmed(new DOMException("not allowed", "NotAllowedError"))],
]
const failures: Array<[string, () => unknown]> = [
	["an unknown error", () => new Error("boom")],
	["a minted passkey whose confirmation broke", () => unconfirmed(new TypeError("bad response"))],
]

describe("logCredentialFailure", () => {
	let debug: MockInstance
	let error: MockInstance
	beforeEach(() => {
		debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
		error = vi.spyOn(console, "error").mockImplementation(() => undefined)
	})
	afterEach(() => {
		debug.mockRestore()
		error.mockRestore()
	})

	test.each(refusals)("%s logs at debug, bare or wrapped", (_name, make) => {
		for (const refusal of [make(), wrapped(make())]) logCredentialFailure("[page] step failed", refusal)
		expect(debug).toHaveBeenCalledTimes(2)
		expect(debug).toHaveBeenLastCalledWith("[page] step failed", { error: expect.any(Error) })
		expect(error).not.toHaveBeenCalled()
	})

	test.each(failures)("%s logs at error, bare or wrapped", (_name, make) => {
		const failure = make()
		logCredentialFailure("[page] step failed", failure)
		logCredentialFailure("[page] step failed", wrapped(make()))
		expect(error).toHaveBeenCalledTimes(2)
		expect(error).toHaveBeenNthCalledWith(1, "[page] step failed", { error: failure })
		expect(debug).not.toHaveBeenCalled()
	})
})
