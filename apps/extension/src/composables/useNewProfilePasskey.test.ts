import { UserRejectedError } from "@nulo/extension-messaging/errors"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { describe, expect, test, vi } from "vitest"
import { effectScope, getCurrentInstance } from "vue"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import { useNewProfilePasskey } from "./useNewProfilePasskey"

type Create = Extract<PasskeyRequest, { mode: "create" }>
const SAVED = { credentialId: "c2F2ZWQ=", prfSalt: "c2F2ZWQtc2FsdA==" }
const notConfirmed = () => new PasskeyUnconfirmedError(SAVED.credentialId, SAVED.prfSalt, new DOMException("no", "NotAllowedError"))
const answerTo = (req: PasskeyRequest) => ({ id: "Y3JlZA==", prf: "cHJm", prfSalt: req.prfSalt }) as PasskeyCredentialData

function setup() {
	const runCeremony = vi.fn(async (req: PasskeyRequest) => answerTo(req))
	const passkey = useNewProfilePasskey(runCeremony)
	const last = () => runCeremony.mock.calls.at(-1)?.[0] as PasskeyRequest
	return { runCeremony, passkey, last }
}

const display = (profileName = "Main") => ({ step: "import" as const, profileName })

async function failOnce(s: ReturnType<typeof setup>, error: Error, name = "Main") {
	s.runCeremony.mockRejectedValueOnce(error)
	await expect(s.passkey.ask(display(name))).rejects.toBe(error)
}

describe("useNewProfilePasskey", () => {
	test("asks a create at an input minted for the profile, and returns its answer", async () => {
		const s = setup()
		const answer = await s.passkey.ask(display())
		const req = s.last() as Create
		expect(req).toMatchObject({ mode: "create", step: "import", profileName: "Main", credentialId: undefined })
		expect(Buffer.from(req.prfSalt, "base64")).toHaveLength(32)
		expect(answer.prfSalt).toBe(req.prfSalt)
	})

	test("each ask mints its own input", async () => {
		const s = setup()
		await s.passkey.ask(display())
		const first = s.last().prfSalt
		await s.passkey.ask(display())
		expect(s.last().prfSalt).not.toBe(first)
	})

	test("with `existing`, a discovery get naming no credential", async () => {
		const s = setup()
		await s.passkey.ask(display(), true)
		expect(s.last()).toMatchObject({ mode: "discover", profileName: "Main" })
		expect("credentialId" in s.last()).toBe(false)
	})

	// Asking a second create would leave the first passkey on the device, sealing nothing.
	test("after a create the authenticator could not confirm, the next ask for that name confirms it", async () => {
		const s = setup()
		await failOnce(s, notConfirmed())
		await s.passkey.ask(display())
		expect(s.last()).toMatchObject({ mode: "create", ...SAVED })
	})

	test("a second unconfirmed answer keeps the credential for the next ask", async () => {
		const s = setup()
		await failOnce(s, notConfirmed())
		await failOnce(s, notConfirmed())
		await s.passkey.ask(display())
		expect(s.last()).toMatchObject(SAVED)
	})

	test("a cancel during the confirmation keeps the credential", async () => {
		const s = setup()
		await failOnce(s, notConfirmed())
		await failOnce(s, new PasskeyUnconfirmedError(SAVED.credentialId, SAVED.prfSalt, new UserRejectedError()))
		await s.passkey.ask(display())
		expect(s.last()).toMatchObject(SAVED)
	})

	test("a passkey with no PRF is not confirmed again: the next ask creates afresh", async () => {
		const s = setup()
		await failOnce(s, notConfirmed())
		await failOnce(s, new PasskeyUnconfirmedError(SAVED.credentialId, SAVED.prfSalt, new PasskeyPrfError("no prf")))
		await s.passkey.ask(display())
		expect((s.last() as Create).credentialId).toBeUndefined()
	})

	test("another profile name creates afresh", async () => {
		const s = setup()
		await failOnce(s, notConfirmed())
		await s.passkey.ask(display("Other"))
		expect((s.last() as Create).credentialId).toBeUndefined()
	})

	test("a discovery never confirms the saved credential, and keeps it for a later create", async () => {
		const s = setup()
		await failOnce(s, notConfirmed())
		await s.passkey.ask(display(), true)
		expect(s.last().mode).toBe("discover")
		expect(s.last().prfSalt).not.toBe(SAVED.prfSalt)
		await s.passkey.ask(display())
		expect(s.last()).toMatchObject(SAVED)
	})

	test("forget() drops the saved credential", async () => {
		const s = setup()
		await failOnce(s, notConfirmed())
		s.passkey.forget()
		await s.passkey.ask(display())
		expect((s.last() as Create).credentialId).toBeUndefined()
	})

	test("a plain cancel or failure saves nothing and passes through as it was", async () => {
		const s = setup()
		const cancel = new UserRejectedError()
		await failOnce(s, cancel)
		await failOnce(s, new Error("boom"))
		await s.passkey.ask(display())
		expect((s.last() as Create).credentialId).toBeUndefined()
	})

	test("holds no lifecycle hook: callable outside a component", () => {
		const scope = effectScope()
		scope.run(() => {
			expect(getCurrentInstance()).toBeNull()
			expect(() => useNewProfilePasskey(vi.fn())).not.toThrow()
		})
		scope.stop()
	})
})
