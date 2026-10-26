import { UserRejectedError } from "@nulo/extension-messaging/errors"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { describe, expect, test, vi } from "vitest"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import { createPasskeyProfileInPage } from "./create-passkey-profile"

const answerTo = (req: PasskeyRequest) => ({ id: "Y3JlZA==", prf: "cHJm", prfSalt: req.prfSalt }) as PasskeyCredentialData

function makeDeps(runCeremony: (req: PasskeyRequest) => Promise<PasskeyCredentialData> = async (req) => answerTo(req)) {
	const deps = {
		runCeremony: vi.fn(runCeremony),
		createPasskeyProfile: vi.fn(async (name: string) => ({ id: "abcd1234", name, type: "passkey" }) as ProfileInfo),
	}
	return deps
}

const requestOf = (deps: ReturnType<typeof makeDeps>) => deps.runCeremony.mock.calls[0][0] as Extract<PasskeyRequest, { mode: "create" }>

describe("createPasskeyProfileInPage", () => {
	test("mints a random handle and PRF input, creates the profile from the answer, and returns both", async () => {
		const deps = makeDeps()
		const created = await createPasskeyProfileInPage("My Wallet", deps)
		const req = requestOf(deps)
		expect(req).toMatchObject({ mode: "create", step: "create", profileName: "My Wallet", credentialId: undefined })
		expect(req.userHandle).toMatch(/^[0-9a-f]{32}$/)
		expect(Buffer.from(req.prfSalt, "base64")).toHaveLength(32)
		expect(deps.createPasskeyProfile).toHaveBeenCalledWith("My Wallet", created.credentialData)
		expect(created.credentialData.prfSalt).toBe(req.prfSalt)
		expect(created.profile).toMatchObject({ name: "My Wallet", type: "passkey" })
	})

	test("each attempt mints its own input", async () => {
		const deps = makeDeps()
		await createPasskeyProfileInPage("A", deps)
		await createPasskeyProfileInPage("A", deps)
		const [first, second] = deps.runCeremony.mock.calls.map(([req]) => req as Extract<PasskeyRequest, { mode: "create" }>)
		expect(first.prfSalt).not.toBe(second.prfSalt)
		expect(first.userHandle).not.toBe(second.userHandle)
	})

	// A retry that asked another input would seal the profile under a key its passkey never confirmed.
	test("a retry confirms the saved credential at the input its first attempt asked for", async () => {
		const deps = makeDeps()
		await createPasskeyProfileInPage("My Wallet", deps, { credentialId: "c2F2ZWQ=", prfSalt: "c2F2ZWQtc2FsdA==" })
		expect(requestOf(deps)).toMatchObject({ credentialId: "c2F2ZWQ=", prfSalt: "c2F2ZWQtc2FsdA==" })
	})

	test("a cancelled prompt creates nothing", async () => {
		const deps = makeDeps(async () => {
			throw new UserRejectedError()
		})
		await expect(createPasskeyProfileInPage("X", deps)).rejects.toBeInstanceOf(UserRejectedError)
		expect(deps.createPasskeyProfile).not.toHaveBeenCalled()
	})
})
