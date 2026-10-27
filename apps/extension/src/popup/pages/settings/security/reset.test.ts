/**
 * Delete Profile's own client and the page's lifecycle. Deleting the open profile locks the wallet,
 * and the lock routes away from this page before the purge returns: the reset must still finish.
 */
import { createTestingPinia } from "@pinia/testing"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { Flex, Text } from "@nulo/design"

const client = vi.hoisted(() => {
	let reject: ((error: Error) => void) | undefined
	return {
		deleteProfile: vi.fn(),
		// As the real client: a disconnect rejects the call in flight.
		disconnect: vi.fn(() => reject?.(new Error("Client disconnected"))),
		pending(): { resolve: (value: unknown) => void } {
			let resolve: (value: unknown) => void = () => {}
			client.deleteProfile.mockReturnValueOnce(
				new Promise((res, rej) => {
					resolve = res
					reject = rej
				}),
			)
			return { resolve: (value) => resolve(value) }
		},
	}
})
vi.mock("@/wallet/services/profile/client", () => ({ deleteProfileClient: () => client }))
const activation = vi.hoisted(() => ({ running: false }))
vi.mock("@/composables/useProfileBootstrap", () => ({ isAnyActivating: () => activation.running }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => ({ query: {}, meta: {} }) }))
const openToast = vi.hoisted(() => vi.fn())
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast }) }))
const reads = vi.hoisted(() => ({
	getNetworks: vi.fn(),
	getAccounts: vi.fn(),
	getPendingReset: vi.fn(),
	getStaleNetwork: vi.fn(),
	onStaleNetworkChanged: { add: vi.fn(), remove: vi.fn() },
}))
vi.mock("@/utils/core", () => ({
	managers: { networkReset: reads },
	requireNetwork: () => reads,
	requireAccount: () => reads,
}))

import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import { getStartedPhraseSavedKey, profileImportedKey } from "@/utils/profile-ui-keys"
import { type Account, AccountType } from "@/wallet/services/account/client"
import type { ProfileInfo } from "@/wallet/services/profile/spec"
import Reset from "./reset.vue"

const main: ProfileInfo = { id: "p1", name: "Main", type: "password" }
const other: ProfileInfo = { id: "p2", name: "Other", type: "password" }

async function mountReady(app: Record<string, unknown> = {}) {
	const pinia = createTestingPinia({ createSpy: vi.fn, initialState: { app: { profile: main, profiles: [main, other], ...app } } })
	const w = mount(Reset, {
		global: {
			plugins: [pinia],
			components: { Flex, Text },
			stubs: {
				CollapsingHeroLayout: { template: "<div><slot /><slot name='bottom' /></div>" },
				ItemsContainer: { template: "<div><slot /></div>" },
				SettingItem: true,
				Checkbox: {
					emits: ["update:modelValue"],
					template: "<input type='checkbox' @change=\"$emit('update:modelValue', true)\" />",
				},
				Input: { emits: ["update:modelValue"], template: "<input @input=\"$emit('update:modelValue', $event.target.value)\" />" },
				Button: { props: ["link"], template: "<button :data-link='link'><slot /></button>" },
			},
		},
	})
	for (const id of ["reset-checkbox-permanent", "reset-checkbox-undone", "reset-checkbox-sure"]) {
		await w.get(`[data-testid="${id}"]`).trigger("change")
	}
	await w.get('[data-testid="reset-confirm-input"]').setValue("Main")
	return { w, app: useAppStore(pinia) }
}

beforeEach(() => {
	vi.clearAllMocks()
	activation.running = false
	installChromeStorage({ [getStartedPhraseSavedKey(main.id)]: true }, { persist: false })
	reads.getNetworks.mockResolvedValue([])
	reads.getAccounts.mockResolvedValue([])
	reads.getPendingReset.mockResolvedValue(null)
	reads.getStaleNetwork.mockResolvedValue(null)
})

describe("Delete Profile's client", () => {
	test("a page the lock unmounts mid-deletion still finishes the reset, and lets go of its client only then", async () => {
		const call = client.pending()
		const { w, app } = await mountReady()
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		await flushPromises()
		expect(client.deleteProfile).toHaveBeenCalledWith("p1")

		w.unmount()
		expect(client.disconnect).not.toHaveBeenCalled()

		call.resolve(main)
		await flushPromises()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
		expect(app.profiles).toEqual([other])
		// The lock screen picks the profile it opens on.
		expect(app.profile).toBeUndefined()
		expect(openToast).toHaveBeenCalledWith({ kind: "success", label: "Profile deleted" })
		expect(router.push).toHaveBeenCalledWith("/popup/auth")
	})

	test("a profile unlocked while the deletion runs keeps its session and route", async () => {
		const call = client.pending()
		const { w, app } = await mountReady()
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		await flushPromises()
		w.unmount()
		const third: ProfileInfo = { id: "p3", name: "Third", type: "password" }
		app.profiles = [main, other, third]
		app.profile = third
		app.isLogined = true

		call.resolve(main)
		await flushPromises()
		expect(app.profiles).toEqual([other, third])
		expect(app.profile).toEqual(third)
		expect(app.isLogined).toBe(true)
		expect(openToast).toHaveBeenCalledWith({ kind: "success", label: "Profile deleted" })
		expect(router.push).not.toHaveBeenCalled()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
	})

	test("a profile opening while the deletion runs keeps what it set; one only selected on the lock screen stands, and the deleted profile's state is cleared", async () => {
		for (const opening of [true, false]) {
			client.deleteProfile.mockReset()
			const call = client.pending()
			const { w, app } = await mountReady()
			await w.get('[data-testid="reset-submit-btn"]').trigger("click")
			await flushPromises()
			w.unmount()
			const network = { id: "n1", chainId: 1 } as never
			const account = { address: `0x${"1".repeat(64)}` } as never
			app.profile = other
			app.network = network
			app.accounts = [account]
			app.account = account
			activation.running = opening

			call.resolve(main)
			await flushPromises()
			expect(app.profile).toEqual(other)
			if (opening) {
				expect([app.network, app.accounts, app.account]).toEqual([network, [account], account])
				expect(router.push).not.toHaveBeenCalled()
			} else {
				expect([app.network, app.accounts, app.account]).toEqual([null, [], null])
				expect(router.push).toHaveBeenCalledWith("/popup/auth")
			}
			vi.clearAllMocks()
		}
	})

	test("a page left with no deletion running lets go of its client at once", async () => {
		const { w } = await mountReady()
		w.unmount()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
	})
})

describe("Delete Profile asks first when the recovery phrase was never revealed", () => {
	test("a profile whose phrase was never revealed: Delete asks, naming it, and deletes only on Yes", async () => {
		installChromeStorage({}, { persist: false })
		client.deleteProfile.mockResolvedValue(main)
		const { w } = await mountReady()
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		await flushPromises()

		const confirm = useCacheStore().confirm
		expect(confirm).toMatchObject({
			title: "Delete this profile?",
			description: "Its recovery phrase was never saved. Without it, or a backup, its accounts are gone for good.",
			confirm_color: "red",
			irreversible: true,
		})
		expect(client.deleteProfile).not.toHaveBeenCalled()

		confirm.callback?.()
		await flushPromises()
		expect(client.deleteProfile).toHaveBeenCalledWith("p1")
	})

	test("a revealed or imported phrase, or a retired profile with none, deletes at once", async () => {
		for (const [stored, profile] of [
			[{ [getStartedPhraseSavedKey(main.id)]: true }, main],
			[{ [profileImportedKey(main.id)]: true }, main],
			[{}, { ...main, retired: true }],
		] as const) {
			vi.clearAllMocks()
			installChromeStorage(stored, { persist: false })
			client.deleteProfile.mockResolvedValue(main)
			const { w } = await mountReady({ profile })
			await w.get('[data-testid="reset-submit-btn"]').trigger("click")
			await flushPromises()
			expect(useCacheStore().confirm).toEqual({})
			expect(client.deleteProfile).toHaveBeenCalledWith("p1")
			w.unmount()
		}
	})

	test("a flag read that answers after the page was left, or its profile moved, asks nothing and deletes nothing", async () => {
		const leaves = [(w: { unmount: () => void }) => w.unmount(), (_w: unknown, app: { profile?: ProfileInfo }) => (app.profile = other)]
		for (const leave of leaves) {
			const storage = installChromeStorage({}, { persist: false })
			const { w, app } = await mountReady()
			const held = storage.deferNextGet()
			await w.get('[data-testid="reset-submit-btn"]').trigger("click")
			leave(w, app)
			held.release()
			await flushPromises()
			expect(useCacheStore().confirm).toEqual({})
			expect(client.deleteProfile).not.toHaveBeenCalled()
		}
	})

	test("a second press while the first one's flag read runs asks nothing more", async () => {
		const storage = installChromeStorage({}, { persist: false })
		const { w } = await mountReady()
		const held = storage.deferNextGet()
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		held.release()
		await flushPromises()
		expect(vi.mocked(usePopupStore().open).mock.calls.filter(([name]) => name === "confirm")).toHaveLength(1)
	})

	test("a Yes after the page's profile moved deletes nothing", async () => {
		installChromeStorage({}, { persist: false })
		const { w, app } = await mountReady()
		await w.get('[data-testid="reset-submit-btn"]').trigger("click")
		await flushPromises()

		app.profile = other
		useCacheStore().confirm.callback?.()
		await flushPromises()
		expect(client.deleteProfile).not.toHaveBeenCalled()
	})
})

describe("Delete Profile names the imported accounts the recovery phrase cannot restore", () => {
	const TESTNET = 11155111
	const LOCAL = 31337
	/** Wire-shaped: `0x` + 64 hex, as the account service stores them. */
	const SAVINGS = `0x04c0${"0".repeat(56)}03b4`
	const COLD = `0x1d7a${"0".repeat(56)}4d19`
	const row = (chainId: number, address: string, name: string, type: AccountType): Account =>
		({ profileId: "p1", chainId, address, name, type, index: 0, l1ChainId: 1, visible: true }) as Account
	const twoChains = () => {
		reads.getNetworks.mockResolvedValue([
			{ id: "tn", chainId: TESTNET },
			{ id: "ln", chainId: LOCAL },
		])
		reads.getAccounts.mockImplementation(async (_p: string, chainId: number) =>
			chainId === TESTNET
				? [
						row(TESTNET, `0x${"2e".repeat(32)}`, "Account 1", AccountType.Nulo_v1),
						row(TESTNET, SAVINGS, "Savings", AccountType.Imported),
					]
				: [row(LOCAL, COLD, "Cold", AccountType.Imported)],
		)
	}
	const listed = (w: Awaited<ReturnType<typeof mountReady>>["w"]) =>
		w.findAll('[data-testid="reset-imported-account"]').map((item) => [item.attributes("title"), item.attributes("description")])
	const deleteButton = (w: Awaited<ReturnType<typeof mountReady>>["w"]) => w.get('[data-testid="reset-submit-btn"]')

	test("the sentence promises back only the accounts the phrase derives", async () => {
		const { w } = await mountReady()
		expect(w.text()).toContain("You will be able to recover the accounts created from your recovery phrase later if you have saved it")
	})

	test("unlocked, it lists each chain's imported accounts and sends Export first to the full backup", async () => {
		twoChains()
		const { w } = await mountReady({ isLogined: true })
		await flushPromises()
		expect(listed(w)).toEqual([
			["Savings", "0x04c0…03b4"],
			["Cold", "0x1d7a…4d19"],
		])
		expect(w.get('[data-testid="reset-imported"]').text()).toContain("Your recovery phrase can't bring these back.")
		expect(w.get('[data-testid="reset-export-first"]').attributes("data-link")).toBe("/popup/settings/security/export/full")
	})

	test("with no imported account there is no section, and Delete goes", async () => {
		const { w } = await mountReady({ isLogined: true })
		await flushPromises()
		expect(w.find('[data-testid="reset-imported"]').exists()).toBe(false)
		await deleteButton(w).trigger("click")
		await flushPromises()
		expect(client.deleteProfile).toHaveBeenCalledWith("p1")
	})

	test("a press reads the list again: an account imported since refuses it until the page shows it, then Delete goes", async () => {
		reads.getNetworks.mockResolvedValue([{ id: "tn", chainId: TESTNET }])
		reads.getAccounts.mockResolvedValue([row(TESTNET, SAVINGS, "Savings", AccountType.Imported)])
		const { w } = await mountReady({ isLogined: true })
		await flushPromises()
		expect(listed(w)).toEqual([["Savings", "0x04c0…03b4"]])

		reads.getAccounts.mockResolvedValue([
			row(TESTNET, SAVINGS, "Savings", AccountType.Imported),
			row(TESTNET, COLD, "Cold", AccountType.Imported),
		])
		await deleteButton(w).trigger("click")
		await flushPromises()
		expect(client.deleteProfile).not.toHaveBeenCalled()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Couldn't delete profile. Try again" })
		expect(listed(w)).toEqual([
			["Savings", "0x04c0…03b4"],
			["Cold", "0x1d7a…4d19"],
		])

		await deleteButton(w).trigger("click")
		await flushPromises()
		expect(client.deleteProfile).toHaveBeenCalledWith("p1")
	})

	test("a reset event reads the list again, and an older read answering last never replaces the newer one", async () => {
		const { w } = await mountReady({ isLogined: true })
		await flushPromises()
		const onChanged = reads.onStaleNetworkChanged.add.mock.calls[0]?.[0] as () => Promise<void>
		const answers: Array<(networks: unknown[]) => void> = []
		reads.getNetworks.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
		reads.getAccounts.mockResolvedValue([row(TESTNET, SAVINGS, "Savings", AccountType.Imported)])
		void onChanged()
		void onChanged()
		await flushPromises()
		expect(deleteButton(w).attributes("disabled")).toBeDefined()

		answers[1]?.([{ id: "tn", chainId: TESTNET }])
		await flushPromises()
		answers[0]?.([])
		await flushPromises()
		expect(listed(w)).toEqual([["Savings", "0x04c0…03b4"]])
		expect(deleteButton(w).attributes("disabled")).toBeUndefined()
	})

	test("a lock during the read stops it before any account read", async () => {
		let answer: (networks: unknown[]) => void = () => {}
		reads.getNetworks.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
		const { w, app } = await mountReady({ isLogined: true })
		app.isLogined = false
		answer([{ id: "tn", chainId: TESTNET }])
		await flushPromises()
		expect(reads.getAccounts).not.toHaveBeenCalled()
		expect(w.find('[data-testid="reset-imported"]').exists()).toBe(false)
	})

	test("while a reset is pending, Export first goes to the account export page, which a passkey profile cannot use", async () => {
		reads.getNetworks.mockResolvedValue([{ id: "tn", chainId: TESTNET }])
		reads.getPendingReset.mockResolvedValue({ networkId: "tn", running: false })
		reads.getStaleNetwork.mockResolvedValue({
			reset: { running: false, purged: true, doneCount: 0, imported: [], heldImported: [{ name: "Savings", address: SAVINGS }] },
		})
		const { w } = await mountReady({ isLogined: true })
		await flushPromises()
		expect(listed(w)).toEqual([["Savings", "0x04c0…03b4"]])
		expect(w.get('[data-testid="reset-export-first"]').attributes("data-link")).toBe("/popup/settings/security/export/account")

		const passkey = await mountReady({ isLogined: true, profile: { ...main, type: "passkey" } })
		await flushPromises()
		expect(listed(passkey.w)).toHaveLength(1)
		expect(passkey.w.find('[data-testid="reset-export-first"]').exists()).toBe(false)
	})

	test("Delete waits for the list: held while it reads, refused and read again after a failure, then it goes", async () => {
		let answer: (networks: unknown[]) => void = () => {}
		reads.getNetworks.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
		const { w } = await mountReady({ isLogined: true })
		expect(deleteButton(w).attributes("disabled")).toBeDefined()
		await deleteButton(w).trigger("click")
		expect(client.deleteProfile).not.toHaveBeenCalled()
		answer([])
		await flushPromises()
		expect(deleteButton(w).attributes("disabled")).toBeUndefined()

		reads.getNetworks.mockRejectedValueOnce(new Error("worker gone"))
		const failed = await mountReady({ isLogined: true })
		await flushPromises()
		await deleteButton(failed.w).trigger("click")
		await flushPromises()
		expect(client.deleteProfile).not.toHaveBeenCalled()
		expect(openToast).toHaveBeenCalledWith({ kind: "error", label: "Couldn't delete profile. Try again" })
		await deleteButton(failed.w).trigger("click")
		await flushPromises()
		expect(client.deleteProfile).toHaveBeenCalledWith("p1")
	})

	test("locked, nothing is read and no section shows, and Delete does not wait", async () => {
		twoChains()
		const { w } = await mountReady()
		await flushPromises()
		expect(reads.getNetworks).not.toHaveBeenCalled()
		expect(reads.getAccounts).not.toHaveBeenCalled()
		expect(reads.getPendingReset).not.toHaveBeenCalled()
		expect(w.find('[data-testid="reset-imported"]').exists()).toBe(false)
		await deleteButton(w).trigger("click")
		await flushPromises()
		expect(client.deleteProfile).toHaveBeenCalledWith("p1")
	})
})
