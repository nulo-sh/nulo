/**
 * Home's reminder of a full-backup restore that left networks unrestored: the real record module
 * over a storage stub that announces its writes, as `chrome.storage.onChanged` does.
 */
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { restoreReminderText } from "@/components/composite/import/restore-warning"
import { restoreOutcomeKey } from "@/utils/profile-ui-keys"
import { RESTORE_OUTCOME_LEASE_MS } from "@/utils/restore-outcome"
import { boundAttr, declarationsOf, elementByTestid, parseSource } from "../../../../../scripts/type-roles/source-scan"
import RestoreOutcomeBanner from "./RestoreOutcomeBanner.vue"

type FakeNetwork = { id: string; profileId: string; name: string }

vi.mock("@/stores/app.store", async () => {
	const { reactive } = await import("vue")
	const fake = reactive({
		profile: { id: "p1" } as { id: string } | undefined,
		networks: [] as FakeNetwork[],
	})
	return { useAppStore: () => fake, __mockAppStore: fake }
})
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("vue-router", () => ({ useRouter: () => router }))

async function appStore() {
	return ((await import("@/stores/app.store")) as unknown as { __mockAppStore: { profile?: { id: string }; networks: FakeNetwork[] } })
		.__mockAppStore
}

const CHECKSUM = "ab".repeat(32)
const RUN = "0123456789abcdef0123456789abcdef"
const TESTNET = { id: "3f2a9c1e", profileId: "p1", name: "Testnet" }
const LOCAL = { id: "0badc0de", profileId: "p1", name: "Local Network" }

let store: Map<string, unknown>
let listeners: Array<(changes: Record<string, unknown>, area: string) => void>

function announce(keys: string[]) {
	for (const listener of [...listeners]) listener(Object.fromEntries(keys.map((k) => [k, {}])), "local")
}

function seed(profileId: string, networkIds: string[], leaseUntil = 0) {
	store.set(restoreOutcomeKey(profileId), { run: RUN, backup: CHECKSUM, networkIds, leaseUntil })
}

const stubs = {
	Banner: { template: '<div data-testid="restore-outcome-banner"><slot name="title" /><slot name="description" /></div>' },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
}

const wrappers: VueWrapper[] = []
async function mountBanner() {
	const wrapper = mount(RestoreOutcomeBanner, { global: { stubs } })
	wrappers.push(wrapper)
	await flushPromises()
	return wrapper
}
const shown = (w: VueWrapper) => w.find('[data-testid="restore-outcome-banner"]')

beforeEach(async () => {
	store = new Map()
	listeners = []
	router.push.mockReset()
	const app = await appStore()
	app.profile = { id: "p1" }
	app.networks = [TESTNET, LOCAL]
	const locks = new Map<string, Promise<unknown>>()
	vi.stubGlobal("navigator", {
		locks: {
			request: (name: string, fn: () => Promise<unknown>) => {
				const run = (locks.get(name) ?? Promise.resolve()).then(fn)
				locks.set(
					name,
					run.catch(() => {}),
				)
				return run
			},
		},
	})
	vi.stubGlobal("chrome", {
		storage: {
			local: {
				get: vi.fn(async (key: string) => (store.has(key) ? { [key]: structuredClone(store.get(key)) } : {})),
				set: vi.fn(async (items: Record<string, unknown>) => {
					for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v))
					announce(Object.keys(items))
				}),
				remove: vi.fn(async (keys: string | string[]) => {
					for (const k of [keys].flat()) store.delete(k)
					announce([keys].flat())
				}),
			},
			onChanged: {
				addListener: (fn: (typeof listeners)[number]) => listeners.push(fn),
				removeListener: (fn: (typeof listeners)[number]) => {
					listeners = listeners.filter((l) => l !== fn)
				},
			},
		},
	})
})

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe("RestoreOutcomeBanner", () => {
	test.each([
		[["3f2a9c1e"], "Testnet didn't finish restoring. Restore the backup again to bring it back."],
		[["0badc0de", "3f2a9c1e"], "Testnet and Local Network didn't finish restoring. Restore the backup again to bring them back."],
	])("names the record's networks %j by their current names", async (ids, sentence) => {
		seed("p1", ids)
		const w = await mountBanner()
		expect(shown(w).text()).toContain("Some networks weren't restored")
		expect(shown(w).text()).toContain(sentence)
	})

	test("a renamed network shows its new name; a deleted one drops out, and none left hides the banner", async () => {
		seed("p1", ["3f2a9c1e", "0badc0de"])
		const app = await appStore()
		const w = await mountBanner()

		app.networks = [{ ...TESTNET, name: "Old Testnet" }, LOCAL]
		await flushPromises()
		expect(shown(w).text()).toContain("Old Testnet and Local Network didn't finish restoring.")

		app.networks = [LOCAL]
		await flushPromises()
		expect(shown(w).text()).toContain("Local Network didn't finish restoring.")

		app.networks = [{ id: "other", profileId: "p1", name: "Other" }]
		await flushPromises()
		expect(shown(w).exists()).toBe(false)
		expect(store.has(restoreOutcomeKey("p1"))).toBe(true)
	})

	test("a typed name of the field's full 25 characters reads whole, in a text that breaks a word wider than itself anywhere", async () => {
		const long = "W".repeat(25)
		seed("p1", ["3f2a9c1e"])
		const app = await appStore()
		app.networks = [{ ...TESTNET, name: long }, LOCAL]
		const w = await mountBanner()
		expect(w.get('[data-testid="restore-outcome-reminder"]').text()).toBe(restoreReminderText([long]))

		const parsed = parseSource("apps/extension/src/popup/components/modules/general/RestoreOutcomeBanner.vue")
		const reminder = elementByTestid(parsed, "restore-outcome-reminder")?.node
		expect(reminder && boundAttr(reminder, "class")).toBe("$style.reminder")
		expect(declarationsOf(parsed, ".reminder")).toMatchObject({ "overflow-wrap": "anywhere" })
	})

	test("Dismiss removes the reminder; Restore again opens its page", async () => {
		seed("p1", ["3f2a9c1e"])
		const w = await mountBanner()

		await w.get('[data-testid="restore-outcome-restore"]').trigger("click")
		expect(router.push).toHaveBeenCalledExactlyOnceWith("/popup/restore-again")

		await w.get('[data-testid="restore-outcome-dismiss"]').trigger("click")
		await flushPromises()
		expect(shown(w).exists()).toBe(false)
		expect(store.has(restoreOutcomeKey("p1"))).toBe(false)
	})

	test("nothing shows with no record", async () => {
		const w = await mountBanner()
		expect(shown(w).exists()).toBe(false)
	})

	test("a list not yet loaded shows nothing and deletes nothing; the loaded list shows the reminder", async () => {
		seed("p1", ["3f2a9c1e"])
		const app = await appStore()
		app.networks = []
		const w = await mountBanner()
		expect(shown(w).exists()).toBe(false)
		expect(store.has(restoreOutcomeKey("p1"))).toBe(true)

		app.networks = [TESTNET, LOCAL]
		await flushPromises()
		expect(shown(w).exists()).toBe(true)
	})

	test("a live lease hides the reminder until it ends, then a re-read shows it", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
		seed("p1", ["3f2a9c1e"], Date.now() + 30_000)
		const w = await mountBanner()
		expect(shown(w).exists()).toBe(false)

		await vi.advanceTimersByTimeAsync(30_000)
		await flushPromises()
		expect(shown(w).exists()).toBe(true)
	})

	test("a lease further ahead than any run reads as ended", async () => {
		seed("p1", ["3f2a9c1e"], Date.now() + RESTORE_OUTCOME_LEASE_MS + 60_000)
		const w = await mountBanner()
		expect(shown(w).exists()).toBe(true)
	})

	test("another profile's record never shows; switching back to its profile shows it", async () => {
		seed("p2", ["3f2a9c1e"])
		const app = await appStore()
		const w = await mountBanner()
		expect(shown(w).exists()).toBe(false)

		app.profile = { id: "p2" }
		await flushPromises()
		expect(shown(w).exists(), "the list still holds the previous profile's networks").toBe(false)

		app.networks = [{ ...TESTNET, profileId: "p2" }]
		await flushPromises()
		expect(shown(w).exists()).toBe(true)

		app.profile = { id: "p1" }
		await flushPromises()
		expect(shown(w).exists()).toBe(false)
	})

	test("a reminder another page writes or removes shows or goes without a remount", async () => {
		const w = await mountBanner()
		expect(shown(w).exists()).toBe(false)

		await chrome.storage.local.set({
			[restoreOutcomeKey("p1")]: { run: RUN, backup: CHECKSUM, networkIds: ["0badc0de"], leaseUntil: 0 },
		})
		await flushPromises()
		expect(shown(w).text()).toContain("Local Network didn't finish restoring.")

		await chrome.storage.local.remove(restoreOutcomeKey("p1"))
		await flushPromises()
		expect(shown(w).exists()).toBe(false)
	})
})
