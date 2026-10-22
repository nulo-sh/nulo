/**
 * Every account surface that creates, imports or loads a key refuses a quarantined chain before it
 * touches a secret, a DEK or a node; reads stay open. Each case fails without its own guard line.
 */
import { ChainNotSupportedError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { describe, expect, test } from "vitest"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { svc } from "../composition-harness"
import { AccountService } from "./service"
import { AccountType, accountRowId } from "./spec"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

/** One key for every profile, as the profile fakes hold it. */
const ROW_KEY_FAKE = await rowKeysForEveryProfile()

const STALE = 1
const LIVE = 2

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const touched: string[] = []
	const touch =
		(name: string, value?: unknown) =>
		async (..._args: unknown[]) => {
			touched.push(name)
			if (value instanceof Error) throw value
			return value
		}
	const rows = [
		{ chainId: STALE, address: "0xN", index: 0, type: AccountType.Nulo_v1 },
		{ chainId: STALE, address: "0xI", index: 0, type: AccountType.Imported },
		{ chainId: LIVE, address: "0xL", index: 0, type: AccountType.Nulo_v1 },
	]
	for (const r of rows) {
		const key = accountRowId("p1", r.chainId, r.address)
		await api.storage.local.set({
			[`nulo:core:accounts@${key}`]: JSON.stringify({ profileId: "p1", l1ChainId: 5, name: "A", visible: true, ...r }),
		})
	}
	const key = accountRowId("p1", STALE, "0xI")
	await api.storage.local.set({
		[`nulo:core:imported-account-keys@${key}`]: JSON.stringify({
			profileId: "p1",
			chainId: STALE,
			address: "0xI",
			encryptedSigningKey: "s",
		}),
	})
	const services = new ServiceCollection()
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			...ROW_KEY_FAKE,
			onProfileDeleted: new EventHandler(),
			getDeletionState: () => new ProfileDeletionState(),
			getProfileDek: touch("getProfileDek", new Uint8Array(32)),
			getProfileSecret: touch("getProfileSecret", new Error("no secret in this harness")),
		}),
	)
	services.add(
		svc(NETWORK_SERVICE_NAME, {
			registerChainPurgeSubscriber: () => {},
			isChainQuarantined: async (_p: string, chainId: number) => chainId === STALE,
			isChainLive: touch("isChainLive", true),
			getL1ChainIdStored: touch("getL1ChainIdStored", 5),
			resolveVerifiedL1ChainId: touch("resolveVerifiedL1ChainId", 5),
		}),
	)
	const service = new AccountService(new LoggerStore(new ConfigStore()), api)
	services.add(service)
	await services.start()
	const keys = async () => Object.keys(await api.storage.local.get(null)).sort()
	return { service, touched, keys }
}

describe("AccountService refuses a quarantined chain", () => {
	test("createAccount refuses before any secret or write", async () => {
		const { service, touched, keys } = await makeHarness()
		const before = await keys()
		await expect(service.createAccount("p1", STALE, AccountType.Nulo_v1, "New")).rejects.toBeInstanceOf(ChainNotSupportedError)
		expect(touched).toEqual([])
		expect(await keys()).toEqual(before)
	})

	test("ensureDefaultAccount refuses even when the chain already holds a default", async () => {
		const { service } = await makeHarness()
		await expect(service.ensureDefaultAccount("p1", STALE, AccountType.Nulo_v1, "Account 1")).rejects.toBeInstanceOf(
			ChainNotSupportedError,
		)
		await expect(service.ensureDefaultAccount("p1", LIVE, AccountType.Nulo_v1, "Account 1")).resolves.toMatchObject({ address: "0xL" })
	})

	test("provisionDefaultAccount refuses instead of answering as a no-op", async () => {
		const { service } = await makeHarness()
		await expect(service.provisionDefaultAccount("p1", STALE)).rejects.toBeInstanceOf(ChainNotSupportedError)
		await expect(service.provisionDefaultAccount("p1", LIVE)).resolves.toBeUndefined()
	})

	test("importAccount refuses before the DEK is read", async () => {
		const { service, touched } = await makeHarness()
		await expect(service.importAccount("p1", STALE, "{}", "0xX", "pw")).rejects.toBeInstanceOf(ChainNotSupportedError)
		expect(touched).toEqual([])
	})

	test("a derived account's signing load refuses before the derivation", async () => {
		const { service, touched } = await makeHarness()
		await expect(service.getAccountContract("p1", STALE, "0xN")).rejects.toBeInstanceOf(ChainNotSupportedError)
		expect(touched).toEqual([])
	})

	test("an imported account's signing load refuses before its key is opened", async () => {
		const { service, touched } = await makeHarness()
		await expect(service.getAccountContract("p1", STALE, "0xI")).rejects.toBeInstanceOf(ChainNotSupportedError)
		expect(touched).toEqual([])
	})

	test("reads stay open on a quarantined chain", async () => {
		const { service } = await makeHarness()
		expect((await service.getAccounts("p1", STALE, true)).map((a) => a.address).sort()).toEqual(["0xI", "0xN"])
		expect(await service.getAccount("p1", STALE, "0xN")).toBeDefined()
	})
})
