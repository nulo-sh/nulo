/**
 * The emoji check's page, mounted over wire-shaped rows: a 64-hex verification hash in the URL,
 * CAIP accounts as the session row stores them, and a dApp name built to pass as wallet text.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import IdentityStrip from "@/components/composite/IdentityStrip.vue"
import { CHAIN_IDS } from "@/utils/chain-ids"
import type { Network } from "@/wallet/services/network/client"

const URL_HASH = "3c".repeat(32)
const ROW_HASH = "d1".repeat(32)
const ADDRESS = `0x${"0a".repeat(32)}`
/** Bidi overrides, isolates and zero-width joiners around words a header could be mistaken for. */
const HOSTILE_NAME = `‮Phishy​Dapp⁦Vault⁩‍${"x".repeat(44)}`.slice(0, 64)

const row = (chainId: number, name: string): Network =>
	({ id: `n-${chainId}`, profileId: "p1", chainId, l1ChainId: 1, name, primaryEndpointId: "e", endpoints: [] }) as Network
const NETWORKS = [row(CHAIN_IDS.TESTNET, "Testnet"), row(0, "Local Network")]

let routeQuery: Record<string, string> = {}
let sessionRow: Record<string, unknown> = {}
let readSession: () => Promise<unknown> = async () => sessionRow
const accountsByAddress: Record<string, { name: string; chainId: number; address: string }> = {}

vi.mock("vue-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vue-router")>()
	return { ...actual, useRouter: () => ({ currentRoute: { value: { query: routeQuery } } }) }
})
vi.mock("@aztec-labs/wallet-sdk/crypto", () => ({ hashToEmoji: (hash: string) => `grid(${hash})` }))
vi.mock("@/wallet/services/dapp-session/client", () => ({
	DappSessionServiceClient: vi.fn(function () {
		return {
			connect: () => {},
			disconnect: () => {},
			getDappSession: () => readSession(),
			setTrustedVerification: async () => undefined,
		}
	}),
}))
vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return { getAccount: async (_p: string, _c: number, address: string) => accountsByAddress[address], disconnect: () => {} }
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return { getNetworks: async (chainId: number) => NETWORKS.filter((n) => n.chainId === chainId), disconnect: () => {} }
	}),
}))
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({
		isSessionChecked: true,
		profile: { id: "p1" },
		networks: NETWORKS,
		network: NETWORKS[1],
		account: { name: "Account 1", chainId: 0, address: ADDRESS },
	}),
}))

import Verify from "./index.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	SectionLabel: { props: ["label"], template: "<div />" },
	Toggle: { props: ["modelValue"], template: "<div />" },
	EmojiGrid: { props: ["emojis"], template: '<div data-testid="emoji-grid-stub">{{ emojis }}</div>' },
	DappIdentityBlock: { props: ["dapp", "hostname", "hostnameSuspicious", "actionLabel"], template: "<div />" },
	// As the real primitive: only `disabled` sets the attribute, and listeners reach the button.
	Button: { props: ["disabled", "loading"], template: '<button :disabled="disabled"><slot /></button>' },
}

/** The row a new connection's check reads: nothing shared yet, the dApp's own metadata. */
const newConnectionRow = (over: Record<string, unknown> = {}) => ({
	id: "row-1",
	chainId: "0",
	accounts: [],
	verificationHash: ROW_HASH,
	dappMetadata: { name: HOSTILE_NAME, url: "https://dapp.example" },
	...over,
})

const wrappers: Array<ReturnType<typeof mount>> = []
async function mountCheck(query: Record<string, string> = {}) {
	routeQuery = { sessionId: "row-1", verificationHash: URL_HASH, isReconnect: "false", ...query }
	const w = mount(Verify, { global: { stubs: STUBS, components: { IdentityStrip } }, attachTo: document.body })
	wrappers.push(w)
	await flushPromises()
	return w
}
const header = (w: ReturnType<typeof mount>) => w.findComponent(IdentityStrip).text()
const button = (w: ReturnType<typeof mount>, testid: string) => w.get(`[data-testid="${testid}"]`).element as HTMLButtonElement

beforeEach(() => {
	sessionRow = newConnectionRow()
	readSession = async () => sessionRow
	// biome-ignore lint/suspicious/noExplicitAny: chrome runtime stub for tests
	;(globalThis as any).chrome = { windows: { getCurrent: () => {}, remove: () => {} } }
})
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.useRealTimers()
	for (const key of Object.keys(accountsByAddress)) delete accountsByAddress[key]
})

describe("windows/verify — the header names who and where", () => {
	test("a new connection's check says no account is shared and names the session's network, never the dApp's name", async () => {
		const w = await mountCheck()
		const text = header(w)
		expect(text).toContain("No account shared")
		expect(text).toContain("Local Network")
		expect(text).not.toContain("Account 1")
		for (const part of ["Phishy", "Dapp", "Vault", "‮", "​", "⁦", "‍"]) expect(text).not.toContain(part)
	})

	test("a new connection on another network than the active one names that network, not in orange", async () => {
		sessionRow = newConnectionRow({ chainId: String(CHAIN_IDS.TESTNET) })
		const w = await mountCheck()
		expect(w.findComponent(IdentityStrip).props()).toMatchObject({
			accountLabel: "No account shared",
			networkLabel: "Testnet",
			warn: false,
		})
	})

	test("a reconnect's check names the shared account and the network's name", async () => {
		accountsByAddress[ADDRESS] = { name: "Savings", chainId: 0, address: ADDRESS }
		sessionRow = newConnectionRow({ accounts: [`aztec:0:${ADDRESS}`] })
		const w = await mountCheck({ isReconnect: "true" })
		const text = header(w)
		expect(text).toContain("Savings")
		expect(text).toContain("Local Network")
		expect(text).not.toContain("chain 0")
	})
})

describe("windows/verify — the grid and the keyboard", () => {
	test("the grid is drawn from the URL's hash, not the row's", async () => {
		const w = await mountCheck()
		expect(w.get('[data-testid="emoji-grid-stub"]').text()).toBe(`grid(${URL_HASH})`)
	})

	test("nothing is focused after mount and no key listener is installed on the document or window", async () => {
		const onDocument = vi.spyOn(document, "addEventListener")
		const onWindow = vi.spyOn(window, "addEventListener")
		await mountCheck()
		const keyListeners = [...onDocument.mock.calls, ...onWindow.mock.calls].filter(([type]) => String(type).startsWith("key"))
		onDocument.mockRestore()
		onWindow.mockRestore()
		expect([document.body, null]).toContain(document.activeElement)
		expect(keyListeners).toEqual([])
	})

	test.each(
		["verify-mismatch-btn", "verify-confirm-btn"].flatMap((testid) =>
			(
				[
					["a repeat", false, { repeat: true }],
					["a composing", false, { isComposing: true }],
					["an IME boundary", false, { keyCode: 229 }],
					["a plain", true, {}],
				] as const
			).map(([kind, goesThrough, init]) => [kind, testid, goesThrough, init] as const),
		),
	)("%s Enter on %s goes through: %s", async (_, testid, goesThrough, init) => {
		const w = await mountCheck()
		const control = button(w, testid)
		control.focus()
		expect(control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }))).toBe(
			goesThrough,
		)
	})
})

describe("windows/verify — the connect step bar", () => {
	test("a new connection's check shows step 2 of the connect bar, and a reconnect's shows none", async () => {
		const fresh = await mountCheck()
		expect(fresh.get('[data-testid="connect-step-bar"]').attributes("data-step")).toBe("2")
		const reconnect = await mountCheck({ isReconnect: "true" })
		expect(reconnect.find('[data-testid="connect-step-bar"]').exists()).toBe(false)
	})
})

const CHECK_ANNOUNCEMENT =
	"Connection check. Check that the app shows these same emojis in the same order. If they differ, the connection may not be safe. Choose They don't match."
const LOOKALIKE_WARNING =
	"This hostname contains non-ASCII or punycoded characters. Verify carefully. Some characters can imitate Latin letters."

describe("windows/verify — the swap to the check is announced", () => {
	const region = (w: ReturnType<typeof mount>) => w.get('[data-testid="verify-announce"]')
	const said = (w: ReturnType<typeof mount>) => region(w).element.textContent
	const leaksTheApp = (text: string) =>
		["Phishy", "Dapp", "Vault", "dapp.example", "exmple", "xn--"].filter((part) => text.includes(part))
	const unmountNow = (w: ReturnType<typeof mount>) => {
		wrappers.splice(wrappers.indexOf(w), 1)
		w.unmount()
	}
	const CHECKS = [
		["a new connection's", "false"],
		["a reconnect's", "true"],
	] as const

	test.each(CHECKS)(
		"%s polite region mounts empty, and 300 ms after the grid shows it reads the window's own words; nothing takes the focus",
		async (_, isReconnect) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			const w = await mountCheck({ isReconnect })
			expect(region(w).attributes()).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" })
			expect(said(w)).toBe("")

			await vi.advanceTimersByTimeAsync(299)
			expect(said(w)).toBe("")
			await vi.advanceTimersByTimeAsync(1)
			expect(said(w)).toBe(CHECK_ANNOUNCEMENT)
			expect(leaksTheApp(said(w) ?? "")).toEqual([])
			expect([document.body, null]).toContain(document.activeElement)
		},
	)

	test.each(CHECKS)(
		"on %s check, a look-alike hostname adds the window's warning to the announcement, still naming nothing of the app",
		async (_, isReconnect) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			sessionRow = newConnectionRow({ dappMetadata: { name: HOSTILE_NAME, url: "https://xn--exmple-cua.com" } })
			const w = await mountCheck({ isReconnect })
			await vi.advanceTimersByTimeAsync(300)
			expect(said(w)).toBe(`${CHECK_ANNOUNCEMENT} ${LOOKALIKE_WARNING}`)
			expect(leaksTheApp(said(w) ?? "")).toEqual([])
		},
	)

	test("an unmount before the 300 ms, or before the session read answers, leaves no timer behind", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const early = await mountCheck()
		await vi.advanceTimersByTimeAsync(100)
		unmountNow(early)
		expect(vi.getTimerCount()).toBe(0)

		let answer!: (row: unknown) => void
		readSession = () => new Promise((resolve) => (answer = resolve))
		const pending = await mountCheck()
		unmountNow(pending)
		answer(sessionRow)
		await flushPromises()
		expect(vi.getTimerCount()).toBe(0)
	})
})
