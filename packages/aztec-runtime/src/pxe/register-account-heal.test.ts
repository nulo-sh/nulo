/**
 * Upstream `PXE.registerAccount` writes the keys and then the complete address in two transactions
 * and returned early once the keys were stored, so a stop between the two hid the account for good.
 * These cases run the installed, patched method on stores with upstream's byte-equality semantics.
 */
import { readFileSync } from "node:fs"
import { PXE } from "@aztec-labs/pxe/client/bundle"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import { describe, expect, test, vi } from "vitest"

interface FakeCompleteAddress {
	address: AztecAddress
	bytes: string
	toReadableString(): string
}

const ADDRESS = `0x${"11".repeat(32)}`
const readable = () => "account"

/** A fresh object per call, as `keyStore.addAccount` derives one on every registration. */
const completeAddress = (bytes = "account-bytes"): FakeCompleteAddress => ({
	address: AztecAddress.fromStringUnsafe(ADDRESS),
	bytes,
	toReadableString: readable,
})

function fakePxe(stored: { keys: boolean; address: boolean }) {
	const keyed = new Set<string>(stored.keys ? [ADDRESS] : [])
	const addresses = new Map<string, FakeCompleteAddress>(stored.address ? [[ADDRESS, completeAddress()]] : [])
	let failNextAddressWrite = false

	const keyStore = {
		getAccounts: async () => [...keyed].map((address) => AztecAddress.fromStringUnsafe(address)),
		addAccount: async () => {
			keyed.add(ADDRESS)
			return completeAddress()
		},
	}
	const addressStore = {
		addCompleteAddress: vi.fn(async (candidate: FakeCompleteAddress) => {
			if (failNextAddressWrite) {
				failNextAddressWrite = false
				throw new Error("worker stopped between the two writes")
			}
			const key = candidate.address.toString()
			const existing = addresses.get(key)
			if (existing === undefined) {
				addresses.set(key, candidate)
				return true
			}
			if (existing.bytes === candidate.bytes) return false
			throw new Error("a different complete address is already stored")
		}),
		getCompleteAddresses: async () => [...addresses.values()],
	}
	const self = { keyStore, addressStore, log: { info: vi.fn(), debug: vi.fn() } }

	const registerAccount = (): Promise<FakeCompleteAddress> => Reflect.apply(PXE.prototype.registerAccount, self, [{}, {}])
	const registered = async (): Promise<string[]> => {
		const accounts: Array<{ address: AztecAddress }> = await Reflect.apply(PXE.prototype.getRegisteredAccounts, self, [])
		return accounts.map((a) => a.address.toString())
	}
	return {
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

		expect(await pxe.registerAccount()).toEqual(completeAddress())

		expect(pxe.addresses.get(ADDRESS)).toEqual(completeAddress())
		expect(await pxe.registered()).toEqual([ADDRESS])
	})

	test("keys and address both stored: the address store keeps its one entry", async () => {
		const pxe = fakePxe({ keys: true, address: true })
		const stored = pxe.addresses.get(ADDRESS)

		await pxe.registerAccount()

		expect(pxe.addressStore.addCompleteAddress).toHaveResolvedWith(false)
		expect(pxe.addresses.size).toBe(1)
		expect(pxe.addresses.get(ADDRESS)).toBe(stored)
		expect(await pxe.registered()).toEqual([ADDRESS])
	})

	test("nothing stored: both the keys and the address are written", async () => {
		const pxe = fakePxe({ keys: false, address: false })

		await pxe.registerAccount()

		expect(pxe.keyed.has(ADDRESS)).toBe(true)
		expect(await pxe.registered()).toEqual([ADDRESS])
	})

	test("an address write that fails after the keys were stored heals on the next call", async () => {
		const pxe = fakePxe({ keys: false, address: false })
		pxe.failNextAddressWrite()

		await expect(pxe.registerAccount()).rejects.toThrow("worker stopped between the two writes")
		expect(pxe.keyed.has(ADDRESS)).toBe(true)
		expect(await pxe.registered()).toEqual([])

		await pxe.registerAccount()

		expect(await pxe.registered()).toEqual([ADDRESS])
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
