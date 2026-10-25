/**
 * Every password path opens a row's slots through one opener that classifies the row first: a row
 * that is not a password row reaches no decryptor, whatever its `type` field or slots claim.
 */
import { InvalidPasswordError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { PasswordSecretBox } from "@nulo/wallet-crypto"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { svc } from "../composition-harness"
import { ProfileService } from "./service"
import { PROFILE_STORAGE_ROOT } from "./spec"

const PASSWORD = "pass1234"

afterEach(() => vi.restoreAllMocks())

async function lockedPasswordProfile() {
	const api = new FakeBrowserApi()
	api.reset()
	const config = new ConfigStore()
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, {}))
	const service = new ProfileService(config, new LoggerStore(config), api)
	services.add(service)
	await services.start()
	const { id } = await service.createProfile("P", PASSWORD)
	await service.lockActiveProfile()
	const key = `${PROFILE_STORAGE_ROOT}@${id}`
	const stored = JSON.parse((await api.storage.local.get(key))[key] as string) as Record<string, unknown>
	const write = (row: Record<string, unknown>) => api.storage.local.set({ [key]: JSON.stringify(row) })
	return { service, id, stored, write }
}

/** Each password path, with the refusal it gives when the opener returns nothing. */
const PATHS: [string, (s: ProfileService, id: string) => Promise<unknown>, (e: unknown) => void][] = [
	["unlockProfile", (s, id) => s.unlockProfile(id, PASSWORD), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	[
		"exportPlain",
		(s, id) => s.exportPlain(id, PASSWORD),
		(e) => expect(e).toMatchObject({ message: InvalidPasswordError.LEGACY_MESSAGE }),
	],
	["openBackupTransfer", (s, id) => s.openBackupTransfer(id, PASSWORD), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	["exportImportedKeysDek", (s, id) => s.exportImportedKeysDek(id, PASSWORD), (e) => expect(e).toBeInstanceOf(InvalidPasswordError)],
	[
		"exportMnemonic",
		(s, id) => s.exportMnemonic(id, PASSWORD),
		(e) => expect(e).toMatchObject({ message: "Invalid profile old password" }),
	],
	[
		"changeProfilePassword",
		(s, id) => s.changeProfilePassword(id, PASSWORD, "newpass99"),
		(e) => expect(e).toMatchObject({ message: "Invalid profile old password" }),
	],
]

describe("the password slot opener", () => {
	test.each<[string, (row: Record<string, unknown>) => Record<string, unknown>]>([
		["a row typed as neither unlock, its slots intact", (row) => ({ ...row, type: "bogus" })],
		["a password row missing its entropy slot", ({ entropy: _e, ...rest }) => rest],
		["a password row whose guard is not a string", (row) => ({ ...row, guard: 7 })],
	])(
		"%s reaches no decryptor on any password path",
		async (_label, damage) => {
			const { service, id, stored, write } = await lockedPasswordProfile()
			await write(damage(stored))
			const unseal = vi.spyOn(PasswordSecretBox.prototype, "unsealWithPasshash")
			for (const [path, call, refused] of PATHS) {
				const error = await call(service, id).then(
					() => undefined,
					(e: unknown) => e,
				)
				expect(error, path).toBeDefined()
				refused(error)
			}
			expect(unseal).not.toHaveBeenCalled()

			// Success control: the row as stored opens on the same path.
			await write(stored)
			await expect(service.exportMnemonic(id, PASSWORD)).resolves.toHaveLength(24)
			expect(unseal).toHaveBeenCalledOnce()
		},
		60_000,
	)
})
