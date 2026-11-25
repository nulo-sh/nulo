import { createTestingPinia } from "@pinia/testing"
import { Icon, RowAction, Toggle, Tooltip } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { isClientDisconnectRejection } from "@nulo/extension-messaging/errors"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import DetailsTable from "@/components/composite/capabilities/DetailsTable.vue"
import PermissionRow from "@/components/composite/capabilities/PermissionRow.vue"
import { useAppStore } from "@/stores/app.store"
import { CHAIN_IDS } from "@/utils/chain-ids"
import ConnectedApp from "./[id].vue"

const mocks = vi.hoisted(() => ({
	openToast: vi.fn(),
	getDappSession: vi.fn(),
	getKnownContracts: vi.fn(),
	setAuthorizationsWithoutAsking: vi.fn(),
	getNetworks: vi.fn(),
	getAccount: vi.fn(),
	updated: [] as Array<(session: unknown) => void>,
	deleted: [] as Array<(session: unknown) => void>,
	routerGo: vi.fn(),
	routerPush: vi.fn(),
}))

/** Each client the page builds, as the real one behaves: `disconnect()` rejects its unsettled calls
 *  and drops a later answer, and a call after it goes through, as production opens a new port. An
 *  answer of `HOLD` waits in `held` until the test settles it, at once, as a response does. */
const clients = await vi.hoisted(async () => {
	const { CLIENT_DISCONNECTED_MESSAGE } = await import("@nulo/extension-messaging/errors")
	type Call = { resolve: (value: unknown) => void; reject: (error: unknown) => void }
	const HOLD = Symbol("hold")
	const built: Array<{ kind: string; disconnect: () => void }> = []
	const calls: string[] = []
	const held: Call[] = []
	const build = (kind: string, methods: Record<string, (...args: unknown[]) => unknown>, extra: object = {}) => {
		const unsettled = new Set<Call>()
		const client = {
			kind,
			disconnect: vi.fn(() => {
				for (const call of [...unsettled]) call.reject(new Error(CLIENT_DISCONNECTED_MESSAGE))
			}),
			...extra,
		}
		const wired = Object.entries(methods).map(([name, answer]) => [
			name,
			(...args: unknown[]) =>
				new Promise((resolve, reject) => {
					calls.push(`${kind}.${name}`)
					const call: Call = {
						resolve: (value) => unsettled.delete(call) && resolve(value),
						reject: (error) => unsettled.delete(call) && reject(error),
					}
					unsettled.add(call)
					const answered = answer(...args)
					if (answered === HOLD) held.push(call)
					else Promise.resolve(answered).then(call.resolve, call.reject)
				}),
		])
		built.push(client)
		return Object.assign(client, Object.fromEntries(wired))
	}
	return { HOLD, built, calls, held, build }
})

vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: mocks.openToast }) }))
vi.mock("vue-router", () => ({
	useRoute: () => ({ params: { id: "s1" } }),
	useRouter: () => ({ push: mocks.routerPush, go: mocks.routerGo }),
}))
vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return clients.build("account", { getAccount: mocks.getAccount })
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return clients.build("network", { getNetworks: mocks.getNetworks })
	}),
}))
vi.mock("@/wallet/services/dapp-interaction/client", () => ({
	DappInteractionServiceClient: vi.fn(function () {
		return clients.build("interaction", { getKnownContracts: mocks.getKnownContracts })
	}),
}))
vi.mock("@/wallet/services/dapp-session/client", () => ({
	DappSessionServiceClient: vi.fn(function () {
		return clients.build(
			"session",
			{ getDappSession: mocks.getDappSession, setAuthorizationsWithoutAsking: mocks.setAuthorizationsWithoutAsking },
			{
				onDappSessionUpdated: { add: (fn: (session: unknown) => void) => mocks.updated.push(fn) },
				onDappSessionDeleted: { add: (fn: (session: unknown) => void) => mocks.deleted.push(fn) },
			},
		)
	}),
}))

// The stores read `chrome.storage.local` through the migration-aware facade on setup.
beforeEach(() => {
	vi.stubGlobal("chrome", {
		storage: {},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
	installChromeStorage({}, { persist: false })
	mocks.getKnownContracts.mockResolvedValue([])
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
	mocks.updated.length = 0
	mocks.deleted.length = 0
	clients.built.length = 0
	clients.calls.length = 0
	clients.held.length = 0
})

// Wire-shaped: 0x + 64 hex, below the field modulus.
const TOKEN = `0x${"1b".repeat(32)}`
const accounts = (canCreateAuthWit: boolean) => ({ type: "accounts", canGet: true, canCreateAuthWit })
const txListed = { type: "transaction", scope: [{ contract: TOKEN, function: "transfer_public_to_public" }] }
const txAny = { type: "transaction", scope: "*" }
const contracts = { type: "contracts", contracts: [TOKEN], canRegister: true, canGetMetadata: true }

const session = (grants: unknown[], consent?: { broad: boolean }) => ({
	id: "s1",
	dappMetadata: { name: "nulo-playground", url: "http://localhost:5173" },
	accounts: [] as string[],
	permissions: [{ methods: [] }],
	chainId: 1,
	capabilityGrants: grants.map((capability) => ({ capability, grantedAt: 1 })),
	...(consent ? { authorizationsWithoutAsking: consent } : {}),
})

type StoredSession = ReturnType<typeof session> & { verificationHash?: string; expiry?: number }

async function mountPage(initial: StoredSession, errorHandler?: (error: unknown) => void) {
	mocks.getDappSession.mockResolvedValue(initial)
	const w = mount(ConnectedApp, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { app: { profile: { id: "p1" } } } })],
			config: errorHandler ? { errorHandler } : {},
			components: { Icon, RowAction, Toggle, Tooltip },
			mocks: { confirmationPolicies: [] },
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				Dropdown: true,
				Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				SectionLabel: { props: ["label"], template: "<h2>{{ label }}</h2>" },
				ItemsContainer: { template: "<div><slot /></div>" },
			},
		},
	})
	await flushPromises()
	return w
}

const row = (w: Awaited<ReturnType<typeof mountPage>>) => w.find('[data-testid="connected-app-authorizations"]')
const toggle = (w: Awaited<ReturnType<typeof mountPage>>) => w.find('[data-testid="connected-app-authorizations-toggle"]')
/** The switch row's line as read: the dotted term's always-mounted definition copy is `hidden`. */
const line = (w: Awaited<ReturnType<typeof mountPage>>) => {
	const copy = row(w).find('[data-testid="cap-row-sub"]').element.cloneNode(true) as HTMLElement
	for (const hidden of copy.querySelectorAll("[hidden]")) hidden.remove()
	return copy.textContent?.replace(/\s+/g, " ").trim()
}
const FLAGGED = (PermissionRow as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style.flagged

describe("Settings › Connected app › the act-for-you switch", () => {
	test("the row shows the consent, with the dotted term, and its switch writes it", async () => {
		const w = await mountPage(session([accounts(true), txListed], { broad: false }))
		expect(w.text()).not.toContain("If you allow, it can")
		expect(row(w).text()).toContain("Act for you in transactions you approve")
		expect(toggle(w).attributes("aria-checked")).toBe("true")
		expect(toggle(w).attributes("aria-label")).toBe("Authorizations without asking")
		expect(line(w)).toBe("Nulo signs its authorizations without asking.")
		expect(w.find('[data-testid="cap-auth-term"]').text()).toBe("authorizations")

		mocks.setAuthorizationsWithoutAsking.mockResolvedValueOnce(session([accounts(true), txListed]))
		await toggle(w).trigger("click")
		await flushPromises()
		expect(mocks.setAuthorizationsWithoutAsking).toHaveBeenCalledWith("s1", false, false)
		expect(toggle(w).attributes("aria-checked")).toBe("false")
		expect(line(w)).toBe("You confirm each authorization first.")
		expect(w.find('[data-testid="cap-auth-term"]').text()).toBe("authorization")
	})

	test("an On given against listed scopes carries the narrow breadth the row showed", async () => {
		const w = await mountPage(session([accounts(true), txListed]))
		expect(toggle(w).attributes("aria-checked")).toBe("false")
		mocks.setAuthorizationsWithoutAsking.mockResolvedValueOnce(session([accounts(true), txListed], { broad: false }))
		await toggle(w).trigger("click")
		await flushPromises()
		expect(mocks.setAuthorizationsWithoutAsking).toHaveBeenCalledWith("s1", true, false)
	})

	test("absent when the app cannot ask for authorizations", async () => {
		const w = await mountPage(session([accounts(false), txListed]))
		expect(row(w).exists()).toBe(false)
	})

	test("with no transaction or simulation scope: no switch, and the off line", async () => {
		const w = await mountPage(session([accounts(true), contracts]))
		expect(row(w).exists()).toBe(true)
		expect(toggle(w).exists()).toBe(false)
		expect(line(w)).toBe("You confirm each authorization first.")
	})

	test("a widening to any contract refreshes the row: Off, flagged, the broad lines, still a switch", async () => {
		const w = await mountPage(session([accounts(true), txListed], { broad: false }))
		expect(toggle(w).attributes("aria-checked")).toBe("true")
		for (const notify of mocks.updated) notify(session([accounts(true), txAny], { broad: false }))
		await flushPromises()
		expect(toggle(w).attributes("aria-checked")).toBe("false")
		expect(row(w).classes()).toContain(FLAGGED)
		expect(line(w)).toBe("You confirm each authorization first. Off because it listed any contract.")

		mocks.setAuthorizationsWithoutAsking.mockResolvedValueOnce(session([accounts(true), txAny], { broad: true }))
		await toggle(w).trigger("click")
		await flushPromises()
		expect(mocks.setAuthorizationsWithoutAsking).toHaveBeenCalledWith("s1", true, true)
		expect(line(w)).toBe("For any call, on any contract.")
	})

	test("a failed write puts the switch back and says so", async () => {
		const w = await mountPage(session([accounts(true), txListed], { broad: false }))
		mocks.setAuthorizationsWithoutAsking.mockRejectedValueOnce(new Error("storage unavailable"))
		await toggle(w).trigger("click")
		await flushPromises()
		expect(toggle(w).attributes("aria-checked")).toBe("true")
		expect(line(w)).toBe("Nulo signs its authorizations without asking.")
		expect(mocks.openToast).toHaveBeenCalledWith({ kind: "error", label: "Couldn't save this setting" })
	})
})

const TABLE = (DetailsTable as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style
const ROW_STYLE = (PermissionRow as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style

describe("Settings › Connected app › Permissions", () => {
	const SPONSORED = `0x${"0c".repeat(32)}`
	const CLASS_ID = `0x${"2e".repeat(32)}`
	const NAMES = [{ address: SPONSORED, name: "Sponsored fee payer" }]
	const many = [
		accounts(true),
		txListed,
		{
			type: "simulation",
			transactions: {
				scope: [
					{ contract: TOKEN, function: "*" },
					{ contract: SPONSORED, function: "sponsor_unconditionally" },
				],
			},
			utilities: { scope: "*" },
		},
		contracts,
		{ type: "contractClasses", classes: [CLASS_ID], canGetMetadata: true },
		{ type: "data", addressBook: true, privateEvents: { contracts: [TOKEN] } },
	]
	const readOnly = { type: "contracts", contracts: "*", canRegister: false, canGetMetadata: true }

	type Page = Awaited<ReturnType<typeof mountPage>>
	const section = (w: Page) => w.find('[data-testid="connected-app-permissions"]')
	const kindTitles = (w: Page) =>
		section(w)
			.findAll(`.${ROW_STYLE.title}`)
			.map((title) => title.text())
	const tableRows = (w: Page) => w.findAll('[data-testid="cap-details-row"]').map((target) => target.attributes("data-details-key"))
	const legend = (w: Page) => {
		const line = section(w).find('[data-testid="cap-details-legend"]')
		const glyphs = w.findAllComponents(Icon).filter((glyph) => line.element.contains(glyph.element))
		return glyphs.map((glyph) => [glyph.props("name"), glyph.element.parentElement?.textContent])
	}
	const LEGEND = [
		["play", "Simulate"],
		["add", "Add"],
		["send", "Transact"],
		["search", "Details"],
		["mail-lock", "Events"],
		["code", "Code"],
	]
	const shownNames = (w: Page) =>
		w
			.findAll('[data-testid="cap-details-row"]')
			.map((target) => target.element.parentElement?.querySelector(`.${TABLE.name}, .${TABLE.address_text}`)?.textContent)

	test("the many-permission grant: three kind rows, then the window's table under its tag", async () => {
		mocks.getKnownContracts.mockResolvedValue(NAMES)
		const w = await mountPage(session(many, { broad: false }))
		expect(mocks.getKnownContracts).toHaveBeenCalledWith("s1")
		expect(section(w).find("h2").text()).toBe("Permissions · any contract")
		expect(kindTitles(w)).toEqual([
			"Let this app list all your accounts",
			"Act for you in transactions you approve",
			"See your address book",
		])
		expect(section(w).find('[data-kind-row="address-book"]').classes()).toContain(FLAGGED)

		expect(section(w).find(`.${TABLE.head}`).text()).toBe("Contract")
		expect(
			section(w)
				.findAll(`.${TABLE.sub}`)
				.map((sub) => sub.text()),
		).toEqual(["Nulo knows", "Nulo doesn't know", "Contract classes"])
		expect(tableRows(w)).toEqual(["known-0", "unknown-0", "classes-0", "any"])
		expect(shownNames(w)).toEqual(["Sponsored fee payer", "0x1b1b…1b1b", "0x2e2e…2e2e", "Any contract"])
		expect(w.find('[data-testid="cap-detail-toggle"]').exists()).toBe(false)
		expect(legend(w)).toEqual(LEGEND)
		expect(w.find(`.${TABLE.foot}`).exists()).toBe(true)
		expect(w.text()).not.toMatch(/Granted permissions|Account access|Contract registration/)

		await w.find('[data-testid="cap-details-row"][data-details-key="unknown-0"]').trigger("click")
		const lines = w
			.findAll(`[data-testid="cap-details-fns"] .${TABLE.fn}`)
			.map((line) => line.findAll("span").map((cell) => cell.text()))
		expect(lines).toEqual([
			["Simulate", "Any function"],
			["Transact", "transfer_public_to_public"],
		])
	})

	test("the read-only grant: one Any contract row with the Details mark, no kind row, no footnote", async () => {
		const w = await mountPage(session([readOnly]))
		expect(section(w).find("h2").text()).toBe("Permissions · any contract")
		expect(kindTitles(w)).toEqual([])
		expect(tableRows(w)).toEqual(["any"])
		const marks = [...(w.find('[data-testid="cap-details-row"]').element.parentElement?.children ?? [])]
			.filter((el) => el.classList.contains(TABLE.yes) || el.classList.contains(TABLE.no))
			.map((el) => el.classList.contains(TABLE.yes))
		expect(marks).toEqual([false, false, false, true, false, false])
		expect(legend(w)).toEqual(LEGEND)
		expect(w.find(`.${TABLE.foot}`).exists()).toBe(false)
		expect(w.text()).not.toContain("Contract registration")
	})

	test("a refused names read lists every contract by its address, under Nulo doesn't know", async () => {
		mocks.getKnownContracts.mockRejectedValue(new Error("Invalid id"))
		const w = await mountPage(session(many))
		expect(tableRows(w)).toEqual(["unknown-0", "unknown-1", "classes-0", "any"])
		expect(shownNames(w)).toEqual(["0x1b1b…1b1b", "0x0c0c…0c0c", "0x2e2e…2e2e", "Any contract"])
	})

	test("the table waits for the names read; the kind rows and the switch do not", async () => {
		mocks.getKnownContracts.mockImplementationOnce(() => clients.HOLD)
		const w = await mountPage(session(many, { broad: false }))
		expect(toggle(w).exists()).toBe(true)
		expect(section(w).find("h2").text()).toBe("Permissions · any contract")
		expect(tableRows(w)).toEqual([])

		clients.held[0].resolve(NAMES)
		await flushPromises()
		expect(tableRows(w)).toEqual(["known-0", "unknown-0", "classes-0", "any"])
	})

	test("the kind rows and the table stand 24 px apart, the gap between the page's sections", async () => {
		const w = await mountPage(session(many))
		expect(section(w).attributes("gap")).toBe("10")
		const column = section(w).find('[gap="24"]')
		expect(column.element.children).toHaveLength(2)
		expect(column.element.children[0].querySelector('[data-testid="connected-app-kind-row"]')).not.toBeNull()
		expect(column.element.children[1].querySelector(`.${TABLE.head}`)).not.toBeNull()
	})

	test("a stored simulation grant it cannot read still draws, flagged as any contract; a listed one is not", async () => {
		const book = { type: "data", addressBook: true }
		const unreadable = await mountPage(session([{ type: "simulation", utilities: null }, book]))
		expect(section(unreadable).find('[data-kind-row="address-book"]').classes()).toContain(FLAGGED)
		const listed = { type: "simulation", utilities: { scope: [{ contract: TOKEN, function: "balance_of_public" }] } }
		const control = await mountPage(session([listed, book]))
		expect(section(control).find('[data-kind-row="address-book"]').classes()).not.toContain(FLAGGED)
	})

	test("a type Nulo doesn't recognize draws the window's row for it; no grant draws no section", async () => {
		const w = await mountPage(session([readOnly, { type: "teleport" }]))
		expect(kindTitles(w)).toEqual(["Use 1 permission Nulo doesn't recognize"])
		expect(section(await mountPage(session([]))).exists()).toBe(false)
	})
})

describe("Settings › Connected app › the Network line", () => {
	const network = (w: Awaited<ReturnType<typeof mountPage>>) => {
		const label = w.findAll("span").find((span) => span.text() === "Network:")
		return label?.element.nextElementSibling?.textContent?.trim()
	}

	test.each([
		{ chainId: "2904119610", reads: "Testnet V6-RC.1" },
		{ chainId: "677692", reads: "Aztec:677692" },
	])("a session on chain $chainId, which has no network row, reads $reads", async ({ chainId, reads }) => {
		const w = await mountPage({
			...session([accounts(false)]),
			chainId,
			permissions: [{ methods: ["aztec_sendTx"] }],
		} as unknown as StoredSession)
		expect(network(w)).toBe(reads)
	})

	test.each([
		{ chainId: CHAIN_IDS.TESTNET, name: "Staging", row: "STAGING" },
		{ chainId: 31337, name: "My Devnet", row: "MY DEVNET" },
		{ chainId: CHAIN_IDS.SANDBOX, name: "Local Network", row: "LOCAL NETWORK" },
		{ chainId: 31337, name: "Mainnet Fork Wide Network", row: "MAINNET FORK WIDE NETWORK" },
		{ chainId: 31337, name: "W".repeat(25), row: "W".repeat(25) },
	])("a session on a network named $name reads it on the Network line and $row on its account rows", async ({ chainId, name, row }) => {
		const address = `0x${"2a".repeat(32)}`
		mocks.getNetworks.mockImplementation(async (id: number) => [{ chainId: id }])
		mocks.getAccount.mockImplementation(async (_profileId: string, id: number, at: string) => ({
			chainId: id,
			address: at,
			name: "Main",
		}))
		const w = await mountPage({
			...session([accounts(false)]),
			chainId: String(chainId),
			accounts: [`aztec:${chainId}:${address}`],
			permissions: [{ methods: ["aztec_sendTx"] }],
		} as unknown as StoredSession)
		useAppStore().networks = [{ chainId, name }] as never
		await flushPromises()
		expect(network(w)).toBe(name)
		const accountRow = w.get('[data-testid="connected-app-account-row"]')
		expect(accountRow.attributes("description")).toBe(`${row} · 0x2a2a...2a2a`)
		// Wrapping, the address goes under a name too long for one line with it, and a short one reads as before.
		expect(accountRow.attributes("wrapdescription")).toBeDefined()
	})
})

describe("Settings › Connected app › its row deleted elsewhere", () => {
	test("a delete naming another row keeps the page; one naming this row leaves it", async () => {
		await mountPage(session([accounts(false)]))
		for (const fn of mocks.deleted) fn({ id: "s2" })
		expect(mocks.routerGo).not.toHaveBeenCalled()
		for (const fn of mocks.deleted) fn({ id: "s1" })
		expect(mocks.routerGo).toHaveBeenCalledWith(-1)
	})
})

describe("Settings › Connected app › its first read", () => {
	test.each([
		{ order: "while it is out", answeredFirst: false },
		{ order: "after it answered empty, before the page resumes", answeredFirst: true },
	])("leaving $order opens no page of its own", async ({ answeredFirst }) => {
		mocks.getDappSession.mockImplementationOnce(() => clients.HOLD)
		const w = await mountPage(session([]))
		expect(clients.held).toHaveLength(1)

		if (answeredFirst) clients.held[0].resolve(undefined)
		w.unmount()
		await flushPromises()

		expect(mocks.routerPush).not.toHaveBeenCalled()
	})

	test("a read refused while the page is open opens Connected apps", async () => {
		mocks.getDappSession.mockRejectedValueOnce(new Error("Invalid id"))
		await mountPage(session([]))
		expect(mocks.routerPush).toHaveBeenCalledExactlyOnceWith("/popup/settings/connected-apps")
	})

	test("a session that loads stays on its page", async () => {
		const w = await mountPage(session([]))
		expect(w.find('[data-testid="connected-app-not-connected"]').exists()).toBe(true)
		expect(mocks.routerPush).not.toHaveBeenCalled()
	})
})

describe("Settings › Connected app › a row no connection reached", () => {
	const NOT_CONNECTED = '[data-testid="connected-app-not-connected"]'

	test("says it was allowed and is not connected; the hash a connection writes takes the line away", async () => {
		const w = await mountPage(session([]))
		expect(w.find(NOT_CONNECTED).text().replace(/\s+/g, " ")).toBe(
			"You allowed this app, but it has not finished connecting. Nothing is shared with it. Its next connection starts with the emoji check.",
		)

		mocks.updated[0]({ ...session([]), verificationHash: "ab".repeat(32) })
		await flushPromises()
		expect(w.find(NOT_CONNECTED).exists()).toBe(false)
	})
})

describe("Settings › Connected app › a connected row", () => {
	test("draws no connection check and nothing under its expiry", async () => {
		const w = await mountPage({ ...session([accounts(false)]), verificationHash: "ab".repeat(32), expiry: Date.now() + 86_400_000 })
		expect(w.find('[data-testid="connected-app-page"]').exists()).toBe(true)
		expect(w.text()).toMatch(/Expires \S/)
		expect(w.text()).not.toMatch(/connection check|emoji|connected after/i)
	})
})

describe("Settings › Connected app › leaving the page", () => {
	const ACCOUNT_ROW = '[data-testid="connected-app-account-row"]'
	// Two chains, so one account client has to serve both.
	const [A1, A2] = [`0x${"0a".repeat(32)}`, `0x${"1b".repeat(32)}`]
	const shared = () => ({ ...session([accounts(false)]), accounts: [`aztec:1:${A1}`, `aztec:2:${A2}`] })
	const account = (chainId: number, address: string) => ({ chainId, address, name: "Main" })

	beforeEach(() => {
		mocks.getNetworks.mockImplementation(async (chainId: number) => [{ chainId }])
		mocks.getAccount.mockImplementation(async (_profileId: string, chainId: number, address: string) => account(chainId, address))
	})

	test("every client the page builds is disconnected once", async () => {
		const w = await mountPage(shared())
		expect(w.findAll(ACCOUNT_ROW)).toHaveLength(2)

		w.unmount()
		expect(clients.built.map((c) => c.kind).sort()).toEqual(["account", "interaction", "network", "session"])
		for (const c of clients.built) expect(c.disconnect, c.kind).toHaveBeenCalledOnce()
	})

	test.each([
		{ order: "while an account read is out", held: "getAccount", settledFirst: false, disconnectErrors: 1 },
		{ order: "after an account read settled, before the page resumes", held: "getAccount", settledFirst: true, disconnectErrors: 0 },
		{ order: "after a network read settled, before the page resumes", held: "getNetworks", settledFirst: true, disconnectErrors: 0 },
		{
			order: "after the session read settled, before the page resumes",
			held: "getDappSession",
			settledFirst: true,
			disconnectErrors: 0,
		},
	] as const)("leaving $order makes no call after it", async ({ held, settledFirst, disconnectErrors }) => {
		const answers = { getDappSession: shared(), getNetworks: [{ chainId: 1 }], getAccount: account(1, A1) }
		mocks[held].mockImplementationOnce(() => clients.HOLD)
		const errors: unknown[] = []
		const w = await mountPage(shared(), (error) => errors.push(error))
		expect(clients.held).toHaveLength(1)

		if (settledFirst) clients.held[0].resolve(answers[held])
		w.unmount()
		const callsAtUnmount = clients.calls.length
		// A worker that never saw the port close still answers; a disconnected client drops it.
		if (!settledFirst) clients.held[0].resolve(answers[held])
		await flushPromises()

		expect(clients.calls.slice(callsAtUnmount)).toEqual([])
		expect(errors).toHaveLength(disconnectErrors)
		expect(errors.every(isClientDisconnectRejection)).toBe(true)
	})
})
