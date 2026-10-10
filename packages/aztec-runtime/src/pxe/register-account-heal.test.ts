/**
 * Upstream `PXE.registerAccount` stores the keys and then the complete address in two transactions,
 * and returned early whenever the keys were already stored, so a kill between the two left an
 * account that `getRegisteredAccounts` hides and no later registration could complete. The patch in
 * `patches/@aztec-labs%2Fpxe@<version>.patch` lets every call reach the idempotent address write.
 * These cases run the shipped method on stores that keep upstream's write semantics. Once upstream
 * heals on its own, delete the patch and the source pin below; the behavioural cases stay.
 */
import { readFileSync } from "node:fs"
import { PXE } from "@aztec-labs/pxe/client/bundle"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import { describe, expect, test, vi } from "vitest"

interface FakeCompleteAddress {
	address: AztecAddress
	toReadableString(): string
}

function fakePxe(stored: { keys: boolean; address: boolean }) {
	const account: FakeCompleteAddress = {
		address: AztecAddress.fromStringUnsafe(`0x${"11".repeat(32)}`),
		toReadableString: () => "account",
	}
	const keyed = new Set<string>(stored.keys ? [account.address.toString()] : [])
	const addresses = new Map<string, FakeCompleteAddress>(stored.address ? [[account.address.toString(), account]] : [])
	let failNextAddressWrite = false

	const keyStore = {
		getAccounts: async () => [...keyed].map((address) => AztecAddress.fromStringUnsafe(address)),
		addAccount: async () => {
			keyed.add(account.address.toString())
			return account
		},
	}
	const addressStore = {
		addCompleteAddress: vi.fn(async (completeAddress: FakeCompleteAddress) => {
			if (failNextAddressWrite) {
				failNextAddressWrite = false
				throw new Error("worker stopped between the two writes")
			}
			const key = completeAddress.address.toString()
			const existing = addresses.get(key)
			if (existing === undefined) {
				addresses.set(key, completeAddress)
				return true
			}
			if (existing === completeAddress) return false
			throw new Error("a different complete address is already stored")
		}),
		getCompleteAddresses: async () => [...addresses.values()],
	}
	const self = { keyStore, addressStore, log: { info: vi.fn(), debug: vi.fn() } }

	const registerAccount = (): Promise<FakeCompleteAddress> => Reflect.apply(PXE.prototype.registerAccount, self, [{}, {}])
	const registered = async (): Promise<string[]> => {
		const accounts: FakeCompleteAddress[] = await Reflect.apply(PXE.prototype.getRegisteredAccounts, self, [])
		return accounts.map((a) => a.address.toString())
	}
	return {
		account,
		addressStore,
		addresses,
		keyed,
		registerAccount,
		registered,
		failNextAddressWrite: () => {
			failNextAddressWrite = true
		},
	}
}

describe("PXE.registerAccount heals an account whose keys were stored without its address", () => {
	test("keys without an address: the next registration writes the address", async () => {
		const pxe = fakePxe({ keys: true, address: false })
		expect(await pxe.registered()).toEqual([])

		expect(await pxe.registerAccount()).toBe(pxe.account)

		expect(pxe.addresses.get(pxe.account.address.toString())).toBe(pxe.account)
		expect(await pxe.registered()).toEqual([pxe.account.address.toString()])
	})

	test("keys and address both stored: the address store keeps its one entry", async () => {
		const pxe = fakePxe({ keys: true, address: true })

		expect(await pxe.registerAccount()).toBe(pxe.account)

		expect(pxe.addressStore.addCompleteAddress).toHaveResolvedWith(false)
		expect([...pxe.addresses.values()]).toEqual([pxe.account])
		expect(await pxe.registered()).toEqual([pxe.account.address.toString()])
	})

	test("nothing stored: both the keys and the address are written", async () => {
		const pxe = fakePxe({ keys: false, address: false })

		await pxe.registerAccount()

		expect(pxe.keyed.has(pxe.account.address.toString())).toBe(true)
		expect(await pxe.registered()).toEqual([pxe.account.address.toString()])
	})

	test("an address write that fails after the keys were stored heals on the next call", async () => {
		const pxe = fakePxe({ keys: false, address: false })
		pxe.failNextAddressWrite()

		await expect(pxe.registerAccount()).rejects.toThrow("worker stopped between the two writes")
		expect(pxe.keyed.has(pxe.account.address.toString())).toBe(true)
		expect(await pxe.registered()).toEqual([])

		await pxe.registerAccount()

		expect(await pxe.registered()).toEqual([pxe.account.address.toString()])
	})
})

describe("@aztec-labs/pxe registerAccount source", () => {
	test("the shipped file carries the patch: the already-registered branch does not return", () => {
		const source = readFileSync(resolvePackageAsset("@aztec-labs/pxe", "dest/pxe.js", { from: import.meta.url }), "utf8")
		const body = source.slice(source.indexOf("async registerAccount(keys, partialAddress) {"))
		const method = body.slice(0, body.indexOf("\n    }\n"))

		expect(method).toMatch(/already registered\.`\);\s*\/\/ Modified by Nulo: /)
		expect(method.match(/\breturn\b/g)).toEqual(["return"])
		expect(method.indexOf("addCompleteAddress")).toBeLessThan(method.indexOf("return"))
	})
})
