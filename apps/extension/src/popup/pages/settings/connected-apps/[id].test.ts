import { createTestingPinia } from "@pinia/testing"
import { Icon, Toggle, Tooltip } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { isClientDisconnectRejection } from "@nulo/extension-messaging/errors"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import PermissionRow from "@/components/composite/capabilities/PermissionRow.vue"
import ConnectedApp from "./[id].vue"

const mocks = vi.hoisted(() => ({
	openToast: vi.fn(),
	getDappSession: vi.fn(),
	setAuthorizationsWithoutAsking: vi.fn(),
	getNetworks: vi.fn(),
	getAccount: vi.fn(),
	updated: [] as Array<(session: unknown) => void>,
	deleted: [] as Array<(session: unknown) => void>,
	routerGo: vi.fn(),
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
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "s1" } }), useRouter: () => ({ push: vi.fn(), go: mocks.routerGo }) }))
vi.mock("@aztec-labs/wallet-sdk/crypto", () => ({ hashToEmoji: () => "" }))
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

async function mountPage(initial: ReturnType<typeof session>, errorHandler?: (error: unknown) => void) {
	mocks.getDappSession.mockResolvedValue(initial)
	const w = mount(ConnectedApp, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { app: { profile: { id: "p1" } } } })],
			config: errorHandler ? { errorHandler } : {},
			components: { Icon, Toggle, Tooltip },
			mocks: { confirmationPolicies: [] },
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				Dropdown: true,
				Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				SectionLabel: { props: ["label"], template: "<h2>{{ label }}</h2>" },
				ItemsContainer: { template: "<div><slot /></div>" },
				GrantedCapabilitiesList: true,
			},
		},
	})
	await flushPromises()
	return w
}

const row = (w: Awaited<ReturnType<typeof mountPage>>) => w.find('[data-testid="connected-app-authorizations"]')
const toggle = (w: Awaited<ReturnType<typeof mountPage>>) => w.find('[data-testid="connected-app-authorizations-toggle"]')
/** The line as read: the dotted term's always-mounted definition copy is `hidden`. */
const line = (w: Awaited<ReturnType<typeof mountPage>>) => {
	const copy = w.find('[data-testid="cap-row-sub"]').element.cloneNode(true) as HTMLElement
	for (const hidden of copy.querySelectorAll("[hidden]")) hidden.remove()
	return copy.textContent?.replace(/\s+/g, " ").trim()
}
const FLAGGED = (PermissionRow as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style.flagged

describe("Settings › Connected app › If you allow, it can", () => {
	test("the row shows the consent, with the dotted term, and its switch writes it", async () => {
		const w = await mountPage(session([accounts(true), txListed], { broad: false }))
		expect(w.text()).toContain("If you allow, it can")
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
		expect(w.text()).not.toContain("If you allow, it can")
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

describe("Settings › Connected app › its row deleted elsewhere", () => {
	test("a delete naming another row keeps the page; one naming this row leaves it", async () => {
		await mountPage(session([accounts(false)]))
		for (const fn of mocks.deleted) fn({ id: "s2" })
		expect(mocks.routerGo).not.toHaveBeenCalled()
		for (const fn of mocks.deleted) fn({ id: "s1" })
		expect(mocks.routerGo).toHaveBeenCalledWith(-1)
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
		expect(clients.built.map((c) => c.kind).sort()).toEqual(["account", "network", "session"])
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
