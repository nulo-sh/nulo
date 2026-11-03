import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { describe, expect, test, vi } from "vitest"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"
import { askProfilePasskey } from "./profile-passkey"

const ANSWER = { id: "Y3JlZA==", prf: "cHJm", prfSalt: "c2FsdA==" } as PasskeyCredentialData

/** A client whose method reads `this`, as the real passthrough does: called unbound, it throws. */
class Profiles {
	readonly params = { credentialId: "Y3JlZA==", prfSalt: "c2FsdA==" }
	readonly lookups: string[] = []
	async getPasskeyUnlockParams(id: string) {
		this.lookups.push(id)
		return this.params
	}
}

describe("askProfilePasskey", () => {
	test("asks the profile's own credential at its own input, named for the step and the profile", async () => {
		const profiles = new Profiles()
		const runCeremony = vi.fn(async (_request: PasskeyRequest) => ANSWER)
		const answer = await askProfilePasskey(
			runCeremony,
			profiles,
			{ profileId: "p1", step: "reveal", profileName: () => "Main" },
			() => true,
		)
		expect(profiles.lookups).toEqual(["p1"])
		expect(runCeremony).toHaveBeenCalledExactlyOnceWith({
			mode: "get",
			credentialId: "Y3JlZA==",
			prfSalt: "c2FsdA==",
			step: "reveal",
			profileName: "Main",
		})
		expect(answer).toBe(ANSWER)
	})

	test("a run gone stale during the lookup shows no prompt, reads no name and answers undefined", async () => {
		const runCeremony = vi.fn(async (_request: PasskeyRequest) => ANSWER)
		const profileName = vi.fn(() => "Main")
		let current = true
		const profiles = {
			getPasskeyUnlockParams: async (_id: string) => {
				current = false
				return { credentialId: "Y3JlZA==", prfSalt: "c2FsdA==" }
			},
		}
		const answer = await askProfilePasskey(runCeremony, profiles, { profileId: "p1", step: "unlock", profileName }, () => current)
		expect(answer).toBeUndefined()
		expect(runCeremony).not.toHaveBeenCalled()
		expect(profileName).not.toHaveBeenCalled()
	})

	test("a refused lookup rejects with its error and shows no prompt", async () => {
		const refusal = new Error("Invalid profile id")
		const runCeremony = vi.fn(async (_request: PasskeyRequest) => ANSWER)
		const profiles = { getPasskeyUnlockParams: async (_id: string) => Promise.reject(refusal) }
		await expect(
			askProfilePasskey(runCeremony, profiles, { profileId: "p1", step: "export", profileName: () => "Main" }, () => true),
		).rejects.toBe(refusal)
		expect(runCeremony).not.toHaveBeenCalled()
	})
})
