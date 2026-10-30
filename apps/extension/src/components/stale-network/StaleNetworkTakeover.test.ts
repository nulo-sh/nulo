/**
 * The takeover renders the layout mockups' copy, in their order, per state (§ UI fidelity), and wires
 * each control to its action. The strings here are the normative copy, written out, not read from
 * `copy.ts`, so a copy change fails here first.
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"

const H = vi.hoisted(() => ({
	push: vi.fn(),
	lock: vi.fn(),
	activate: vi.fn(async () => "activated"),
	closeAll: vi.fn(),
	networks: [] as Array<{ id: string; name: string }>,
	profile: { type: "password" } as { type: string } | undefined,
}))

vi.mock("@/utils/core", () => ({ managers: { profile: {}, network: {} } }))
vi.mock("@/composables/useLockWallet", () => ({ useLockWallet: () => ({ lock: H.lock, dispose: vi.fn() }) }))
vi.mock("@/composables/useNetworkActivation", () => ({ useNetworkActivation: () => ({ activate: H.activate }) }))
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({
		networks: H.networks,
		get profile() {
			return H.profile
		},
	}),
}))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ closeAll: H.closeAll }) }))
vi.mock("vue-router", async (importOriginal) => {
	const mod = await importOriginal<typeof import("vue-router")>()
	return { ...mod, useRouter: () => ({ push: H.push }) }
})

import { STALE_NETWORK_KEY } from "@/composables/useStaleNetwork"
import StaleNetworkTakeover from "./StaleNetworkTakeover.vue"

const ADDRESS_1 = `0x${"27fc".padEnd(60, "0")}2ab9`
const ADDRESS_2 = `0x${"9a01".padEnd(60, "0")}c3e2`

const view = (over: Partial<StaleNetworkView> = {}): StaleNetworkView => ({
	networkId: "tn",
	name: "Testnet",
	cause: { networkReset: true, addressesMoved: false },
	blocked: false,
	accounts: [
		{ name: "Account 1", address: ADDRESS_1 },
		{ name: "Account 2", address: ADDRESS_2 },
	],
	unmovable: [],
	switchToSeedNode: false,
	probedEndpoint: null,
	...over,
})

function fakeStale() {
	return {
		running: ref<StaleNetworkView | null>(null),
		nodeDown: ref<string | null>(null),
		starting: ref(false),
		start: vi.fn(async () => {}),
	}
}

function mountTakeover(v: StaleNetworkView, stale = fakeStale()) {
	const wrapper = mount(StaleNetworkTakeover, {
		props: { view: v },
		global: {
			provide: { [STALE_NETWORK_KEY as symbol]: stale },
			stubs: {
				Flex: { template: "<div><slot /></div>" },
				Spinner: { template: '<span data-testid="stub-spinner" />' },
				Icon: { template: '<i :data-icon="name" />', props: ["name"] },
				StaleNetworkConfirm: {
					template: '<div v-if="show" data-testid="stub-confirm" @click="$emit(\'confirm\')" />',
					props: ["show", "view"],
					emits: ["confirm", "onClose"],
				},
			},
		},
	})
	return { wrapper, stale }
}

/** Every text node in document order: the screen as a reader meets it. */
function lines(root: Element): string[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const out: string[] = []
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.textContent?.trim()
		if (text) out.push(text)
	}
	return out
}

const TOP = ["TESTNET"]
const KEEP = "Keep your profile, contacts and other networks."
const REMOVE = "Remove old Testnet tokens and history from this device."
/** The top bar's lock comes first; the eyebrow's mark is the second icon. */
const eyebrowIcon = (root: Element) => root.querySelectorAll("[data-icon]")[1]?.getAttribute("data-icon")

beforeEach(() => {
	H.push.mockClear()
	H.lock.mockClear()
	H.activate.mockClear()
	H.closeAll.mockClear()
	H.profile = { type: "password" }
	H.networks.splice(0, H.networks.length, { id: "tn", name: "Testnet" }, { id: "ln", name: "Local Network" })
})

describe("StaleNetworkTakeover — copy and order", () => {
	test("A1: Testnet was reset", () => {
		const { wrapper } = mountTakeover(view())
		expect(lines(wrapper.element)).toEqual([
			...TOP,
			"NETWORK RESET",
			"Testnet was reset",
			"Aztec restarted Testnet. Tokens and history from before the restart no longer exist on it.",
			"RESETTING TESTNET IN NULO WILL",
			"Move your 2 accounts to the new Testnet. Their addresses stay the same.",
			KEEP,
			REMOVE,
			"You do not need your recovery phrase.",
			"RESET TESTNET",
			"SWITCH NETWORK",
		])
	})

	test("A1 with one account, a renamed network, and the node line after the account line", () => {
		const { wrapper } = mountTakeover(view({ name: "My Test", accounts: [view().accounts[0]!], switchToSeedNode: true }))
		const text = lines(wrapper.element)
		expect(text.slice(0, 1)).toEqual(["MY TEST"])
		expect(text.slice(4, 8)).toEqual([
			"RESETTING MY TEST IN NULO WILL",
			"Move your account to the new My Test. Its address stays the same.",
			"Use Nulo’s node for My Test. Yours is not serving the new My Test.",
			KEEP,
		])
		expect(wrapper.find('[data-testid="stale-network-node-line"]').exists()).toBe(true)
	})

	test("A2: new account addresses, under A1's reset mark, with the notice after the body and no note", () => {
		const { wrapper } = mountTakeover(view({ cause: { networkReset: false, addressesMoved: true } }))
		expect(eyebrowIcon(wrapper.element)).toBe("refresh")
		expect(lines(wrapper.element)).toEqual([
			...TOP,
			"NETWORK UPGRADE",
			"New account addresses",
			"This version of Nulo gives Testnet accounts new addresses. Your current Testnet accounts do not work with it.",
			"Tokens at your old addresses stay there. This version cannot reach them.",
			"RESETTING TESTNET IN NULO WILL",
			"Create your 2 accounts again, with the same names, at new addresses.",
			KEEP,
			REMOVE,
			"RESET TESTNET",
			"SWITCH NETWORK",
		])
	})

	test("both causes: A1 with the address line and no notice; one account reads singular", () => {
		const { wrapper } = mountTakeover(view({ cause: { networkReset: true, addressesMoved: true }, accounts: [view().accounts[0]!] }))
		const text = lines(wrapper.element)
		expect(text[1]).toBe("NETWORK RESET")
		expect(text[5]).toBe("Create your account again, with the same name, at a new address.")
		expect(wrapper.find('[data-testid="stale-network-notice"]').exists()).toBe(false)
		expect(text).toContain("You do not need your recovery phrase.")
	})

	test("A1 on a network never opened, with the user's own node: only the node changes", () => {
		const { wrapper } = mountTakeover(view({ accounts: [], switchToSeedNode: true }))
		expect(lines(wrapper.element)).toEqual([
			...TOP,
			"NETWORK RESET",
			"Testnet was reset",
			"Aztec restarted Testnet. Tokens and history from before the restart no longer exist on it.",
			"RESETTING TESTNET IN NULO WILL",
			"Use Nulo’s node for Testnet. Yours is not serving the new Testnet.",
			KEEP,
			"You do not need your recovery phrase.",
			"RESET TESTNET",
			"SWITCH NETWORK",
		])
		// An imported account whose key does not open is a row: the reset removes it and its history.
		const unmovable = mountTakeover(view({ accounts: [], unmovable: ["Imported 1"], switchToSeedNode: true })).wrapper
		expect(lines(unmovable.element)).toContain(REMOVE)
	})

	test("A6: Mainnet blocked, one filled button and no reset", () => {
		const { wrapper } = mountTakeover(view({ name: "Mainnet", blocked: true, cause: { networkReset: false, addressesMoved: true } }))
		expect(lines(wrapper.element)).toEqual([
			"MAINNET",
			"NEEDS A NULO UPDATE",
			"Mainnet accounts paused",
			"This version of Nulo cannot match your Mainnet accounts to their addresses, so it stopped using them. That is a fault in Nulo, not in your wallet, and a Nulo update fixes it.",
			"Your funds are safe at your current addresses.",
			"Nulo changed nothing on this device, so the update reopens your accounts as they were.",
			"Your other networks keep working.",
			"Nulo never needs your recovery phrase to fix this. Do not enter it anywhere in response to this message.",
			"SWITCH NETWORK",
		])
		expect(wrapper.find('[data-testid="stale-network-reset"]').exists()).toBe(false)
	})

	test("R1: the reset paused, with no imported account to name", () => {
		const { wrapper } = mountTakeover(view({ reset: { running: false, purged: true, doneCount: 1, imported: [] } }))
		expect(wrapper.find('[data-testid="stale-network-notice"]').exists()).toBe(false)
		expect(lines(wrapper.element)).toEqual([
			...TOP,
			"RESET PAUSED",
			"Testnet reset did not finish",
			"Something stopped the reset part-way. Nulo saved your accounts before it removed anything.",
			"TRYING AGAIN WILL",
			"Pick up where the reset stopped.",
			"Move your 2 accounts to the new Testnet. Their addresses stay the same.",
			KEEP,
			"Nulo also tries again each time you open it.",
			"TRY AGAIN",
			"SWITCH NETWORK",
		])
	})

	test("R1: the reset paused names the imported accounts deleting the network deletes", () => {
		const two = mountTakeover(view({ reset: { running: false, purged: true, doneCount: 1, imported: ["Savings", "Trading"] } }))
		expect(two.wrapper.get('[data-testid="stale-network-notice"]').text()).toBe(
			"“Savings” and “Trading” are imported accounts. Deleting Testnet deletes them.",
		)
		expect(lines(two.wrapper.element).slice(TOP.length, TOP.length + 4)).toEqual([
			"RESET PAUSED",
			"Testnet reset did not finish",
			"Something stopped the reset part-way. Nulo saved your accounts before it removed anything.",
			"“Savings” and “Trading” are imported accounts. Deleting Testnet deletes them.",
		])
		const one = mountTakeover(view({ reset: { running: false, purged: true, doneCount: 1, imported: ["Savings"] } }))
		expect(one.wrapper.get('[data-testid="stale-network-notice"]').text()).toBe(
			"“Savings” is an imported account. Deleting Testnet deletes it.",
		)
	})

	const HELD = {
		running: false,
		purged: true,
		doneCount: 1,
		imported: ["Savings", "Trading"],
		heldImported: [
			{ name: "Savings", address: ADDRESS_1 },
			{ name: "Trading", address: ADDRESS_2 },
		],
	}

	test("R1 with held imported accounts: EXPORT leads, TRY AGAIN keeps its guard below it, SWITCH NETWORK last", async () => {
		const { wrapper, stale } = mountTakeover(view({ reset: HELD }))
		expect(wrapper.get('[data-testid="stale-network-notice"]').text()).toBe(
			"“Savings” and “Trading” are imported accounts. Deleting Testnet deletes them. Export them first.",
		)
		expect(lines(wrapper.element).slice(-3)).toEqual(["EXPORT IMPORTED ACCOUNTS", "TRY AGAIN", "SWITCH NETWORK"])
		await wrapper.get('[data-testid="stale-network-export"]').trigger("click")
		expect(H.push).toHaveBeenCalledWith("/popup/settings/security/export/account")

		const retry = wrapper.get('[data-testid="stale-network-retry"]')
		await retry.trigger("click")
		expect(stale.start).toHaveBeenCalledWith(expect.objectContaining({ networkId: "tn" }))
		const repeat = new KeyboardEvent("keydown", { key: "Enter", repeat: true, cancelable: true, bubbles: true })
		retry.element.dispatchEvent(repeat)
		expect(repeat.defaultPrevented).toBe(true)
		stale.starting.value = true
		await flushPromises()
		expect(retry.attributes("disabled")).toBeDefined()
		expect(wrapper.get('[data-testid="stale-network-switch"]').attributes("disabled")).toBeUndefined()

		const one = mountTakeover(view({ reset: { ...HELD, imported: ["Savings"], heldImported: HELD.heldImported.slice(0, 1) } }))
		expect(one.wrapper.get('[data-testid="stale-network-notice"]').text()).toBe(
			"“Savings” is an imported account. Deleting Testnet deletes it. Export it first.",
		)
	})

	test("R1 keeps today's screen for a passkey profile, and when the journal holds no key", () => {
		H.profile = { type: "passkey" }
		const passkey = mountTakeover(view({ reset: HELD })).wrapper
		H.profile = { type: "password" }
		const keyless = mountTakeover(view({ reset: { ...HELD, heldImported: [] } })).wrapper
		for (const wrapper of [passkey, keyless]) {
			expect(wrapper.get('[data-testid="stale-network-notice"]').text()).toBe(
				"“Savings” and “Trading” are imported accounts. Deleting Testnet deletes them.",
			)
			expect(wrapper.find('[data-testid="stale-network-export"]').exists()).toBe(false)
			expect(lines(wrapper.element).slice(-2)).toEqual(["TRY AGAIN", "SWITCH NETWORK"])
		}
	})

	test("R2: the new chain is already added", () => {
		const { wrapper } = mountTakeover(view({ heldBy: { name: "My Testnet" } }))
		expect(lines(wrapper.element)).toEqual([
			...TOP,
			"NETWORK RESET",
			"Testnet cannot be reset yet",
			"Aztec restarted Testnet, and you already added the new one as “My Testnet”. Two networks cannot use the same chain.",
			"TO RESET TESTNET",
			"1",
			"Open Networks and delete “My Testnet”.",
			"2",
			"Come back here and reset Testnet. Your accounts move to the new Testnet.",
			"Deleting it removes its data from this device. Funds on the chain stay where they are.",
			"OPEN NETWORKS",
		])
	})

	test("R3: one network at a time, with the active network's eyebrow", () => {
		const local = view({
			networkId: "ln",
			name: "Local Network",
			cause: { networkReset: false, addressesMoved: true },
			otherPending: { networkId: "tn", name: "Testnet" },
		})
		const { wrapper } = mountTakeover(local)
		expect(lines(wrapper.element)).toEqual([
			"LOCAL NETWORK",
			"NETWORK UPGRADE",
			"Finish the Testnet reset first",
			"Nulo resets one network at a time, and the Testnet reset has not finished.",
			"Nothing on Local Network has changed.",
			"Open Testnet to finish its reset. Then come back here to reset Local Network.",
			"GO TO TESTNET",
			"SWITCH NETWORK",
		])
	})

	test("R4: a custom node that did not answer, its eyebrow naming the cause", () => {
		const stale = fakeStale()
		stale.nodeDown.value = "md"
		const upgrade = mountTakeover(
			view({ networkId: "md", name: "My Devnet", cause: { networkReset: false, addressesMoved: true } }),
			stale,
		)
		expect(eyebrowIcon(upgrade.wrapper.element)).toBe("no-signal")
		expect(lines(upgrade.wrapper.element)[1]).toBe("NETWORK UPGRADE")
		const { wrapper } = mountTakeover(view({ networkId: "md", name: "My Devnet" }), stale)
		expect(eyebrowIcon(wrapper.element)).toBe("no-signal")
		expect(lines(wrapper.element)).toEqual([
			"MY DEVNET",
			"NETWORK RESET",
			"Cannot reach My Devnet",
			"Nulo checks the network’s node before it removes anything. The node did not answer, so nothing was removed.",
			"Check that the node is running, then try again.",
			"TRY AGAIN",
			"SWITCH NETWORK",
		])
	})

	test("A4: no top bar; removing, then removed and each account moved or created", () => {
		const running = view({ reset: { running: true, purged: false, doneCount: 0, imported: [] } })
		const { wrapper } = mountTakeover(running)
		expect(lines(wrapper.element)).toEqual([
			"TESTNET",
			"Resetting Testnet",
			"Keep this window open. This takes a few seconds.",
			"Removing old data",
			"If you close the window, Nulo finishes the reset the next time you open it.",
		])
		expect(wrapper.find('[data-testid="stale-network-lock"]').exists()).toBe(false)

		const moving = mountTakeover(view({ reset: { running: true, purged: true, doneCount: 1, imported: [] } })).wrapper
		expect(lines(moving.element).slice(3, 6)).toEqual(["Removed old data", "Moved Account 1", "Moving Account 2"])
		const creating = mountTakeover(
			view({
				cause: { networkReset: false, addressesMoved: true },
				reset: { running: true, purged: true, doneCount: 1, imported: [] },
			}),
		).wrapper
		expect(lines(creating.element).slice(3, 6)).toEqual(["Removed old data", "Created Account 1", "Creating Account 2"])
	})

	test("A4c: a run on a network never opened reads as its first open, with no step and no control", () => {
		const { wrapper } = mountTakeover(view({ accounts: [], reset: { running: true, purged: true, doneCount: 0, imported: [] } }))
		const root = wrapper.find('[data-testid="stale-network-takeover"]')
		expect(root.attributes("data-screen")).toBe("loading")
		expect(root.find('[data-testid="stub-spinner"]').exists()).toBe(true)
		expect(lines(wrapper.element)).toEqual(["TESTNET", "Opening Testnet", "This takes a few seconds."])
		expect(wrapper.findAll("button").length).toBe(0)
	})
})

describe("StaleNetworkTakeover — actions", () => {
	test("appearing closes every popup open over the route it replaces; a new view on screen does not", async () => {
		const { wrapper } = mountTakeover(view())
		expect(H.closeAll).toHaveBeenCalledTimes(1)
		await wrapper.setProps({ view: view({ reset: { running: true, purged: false, doneCount: 0, imported: [] } }) })
		expect(H.closeAll).toHaveBeenCalledTimes(1)
	})

	test("RESET opens the confirmation, whose confirm starts the reset of this view", async () => {
		const { wrapper, stale } = mountTakeover(view())
		expect(wrapper.find('[data-testid="stub-confirm"]').exists()).toBe(false)
		await wrapper.find('[data-testid="stale-network-reset"]').trigger("click")
		await wrapper.find('[data-testid="stub-confirm"]').trigger("click")
		await flushPromises()
		expect(stale.start).toHaveBeenCalledWith(expect.objectContaining({ networkId: "tn" }))
	})

	test("the chip, SWITCH NETWORK and OPEN NETWORKS go to Networks; the padlock locks", async () => {
		const { wrapper } = mountTakeover(view())
		await wrapper.find('[data-testid="stale-network-chip"]').trigger("click")
		await wrapper.find('[data-testid="stale-network-switch"]').trigger("click")
		await wrapper.find('[data-testid="stale-network-lock"]').trigger("click")
		const r2 = mountTakeover(view({ heldBy: { name: "My Testnet" } })).wrapper
		await r2.find('[data-testid="stale-network-open-networks"]').trigger("click")
		expect(H.push.mock.calls).toEqual([["/popup/settings/networks"], ["/popup/settings/networks"], ["/popup/settings/networks"]])
		expect(H.lock).toHaveBeenCalledTimes(1)
	})

	test("TRY AGAIN starts the same view (R1, R4); GO TO activates the pending network (R3)", async () => {
		const r1 = mountTakeover(view({ reset: { running: false, purged: true, doneCount: 0, imported: [] } }))
		await r1.wrapper.find('[data-testid="stale-network-retry"]').trigger("click")
		expect(r1.stale.start).toHaveBeenCalledWith(expect.objectContaining({ networkId: "tn" }))
		const r3 = mountTakeover(view({ networkId: "ln", name: "Local Network", otherPending: { networkId: "tn", name: "Testnet" } }))
		await r3.wrapper.find('[data-testid="stale-network-go-to"]').trigger("click")
		expect(H.activate).toHaveBeenCalledWith({ id: "tn", name: "Testnet" })
	})

	test("the primary control ignores a repeated Enter, so a held key starts no second run", () => {
		const { wrapper } = mountTakeover(view({ reset: { running: false, purged: true, doneCount: 0, imported: [] } }))
		const repeat = new KeyboardEvent("keydown", { key: "Enter", repeat: true, cancelable: true, bubbles: true })
		wrapper.find('[data-testid="stale-network-retry"]').element.dispatchEvent(repeat)
		expect(repeat.defaultPrevented).toBe(true)
	})

	test("the primary control is disabled while a start is in flight", async () => {
		const stale = fakeStale()
		stale.starting.value = true
		const { wrapper } = mountTakeover(view({ reset: { running: false, purged: false, doneCount: 0, imported: [] } }), stale)
		expect(wrapper.find('[data-testid="stale-network-retry"]').attributes("disabled")).toBeDefined()
	})

	test("no state asks for a secret or leaves the wallet: no field and no external link", () => {
		const states = [
			view(),
			view({ cause: { networkReset: false, addressesMoved: true } }),
			view({ blocked: true }),
			view({ reset: { running: false, purged: true, doneCount: 0, imported: [] } }),
			view({ heldBy: { name: "X" } }),
			view({ otherPending: { networkId: "x", name: "X" } }),
			view({ reset: { running: true, purged: true, doneCount: 0, imported: [] } }),
		]
		for (const state of states) {
			const { wrapper } = mountTakeover(state)
			expect(wrapper.findAll("input, textarea, [contenteditable], a").length).toBe(0)
			expect(wrapper.text()).not.toMatch(/enter your recovery phrase(?! anywhere)/i)
		}
	})
})
