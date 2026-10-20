/**
 * The trust-confirmation window's own lifecycle and anti-phishing display, over wire-shaped rows:
 * `dappMetadata` as the worker writes it (a sanitized dApp name, the tab's serialized origin), a
 * 64-hex verification hash and CAIP accounts. The identity block is the real one, so the origin
 * and its warning are read as rendered. A new connection and a remembered app's reconnect show the
 * same check with the same two answers.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { ref } from "vue"
import DappIdentityBlock from "@/components/composite/DappIdentityBlock.vue"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"

const URL_HASH = "3c".repeat(32)
const ADDRESS = `0x${"0a".repeat(32)}`
const WIRE_NAME = sanitizeWireString(`‮Phishy​Dapp⁦Vault⁩${"x".repeat(70)}`, 64)

let routeQuery: Record<string, string> = {}
let sessionRow: unknown
const callLog: string[] = []
const getDappSession = vi.fn(async (id: string) => {
	callLog.push(`getDappSession:${id}`)
	if (sessionRow instanceof Error) throw sessionRow
	return sessionRow
})
let confirmation: () => Promise<void> = async () => undefined
const confirmVerification = vi.fn(async (hash: string) => {
	callLog.push(`confirmVerification:${hash}`)
	return confirmation()
})
let refusal: () => Promise<string> = async () => "revoked"
const refuseVerification = vi.fn(async (target: { origin: string }) => {
	callLog.push(`refuseVerification:${target.origin}`)
	return refusal()
})

/** The store's session flag, read through a counting getter so a watcher left running shows up. */
const sessionChecked = ref(true)
let sessionCheckedReads = 0

vi.mock("vue-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vue-router")>()
	return { ...actual, useRouter: () => ({ currentRoute: { value: { query: routeQuery } } }) }
})
vi.mock("@aztec-labs/wallet-sdk/crypto", () => ({ hashToEmoji: (hash: string) => `grid(${hash})` }))
vi.mock("@/wallet/services/dapp-session/client", () => ({
	DappSessionServiceClient: vi.fn(function () {
		return { connect: () => {}, disconnect: () => {}, getDappSession, confirmVerification, refuseVerification }
	}),
}))
vi.mock("@/wallet/services/account/client", () => ({
	AccountServiceClient: vi.fn(function () {
		return { getAccount: async () => undefined, disconnect: () => {} }
	}),
}))
vi.mock("@/wallet/services/network/client", () => ({
	NetworkServiceClient: vi.fn(function () {
		return { getNetworks: async () => [], disconnect: () => {} }
	}),
}))
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({
		get isSessionChecked() {
			sessionCheckedReads++
			return sessionChecked.value
		},
		profile: { id: "p1" },
		networks: [],
	}),
}))

import Verify from "./index.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	SectionLabel: { template: "<div />" },
	IdentityStrip: { template: "<div />" },
	EmojiGrid: { props: ["emojis"], template: "<div>{{ emojis }}</div>" },
	Button: { props: ["disabled"], template: '<button :disabled="disabled"><slot /></button>' },
}

const row = (url: string) => ({
	id: "row-1",
	profileId: "p1",
	chainId: "0",
	accounts: [`aztec:0:${ADDRESS}`],
	verificationHash: "d1".repeat(32),
	dappMetadata: { name: WIRE_NAME, url },
})

let currentWindow: { id?: number } = { id: 7 }
const getCurrent = vi.fn((_options: unknown, cb: (w: { id?: number }) => void) => {
	callLog.push("getCurrent")
	cb(currentWindow)
})
const remove = vi.fn((id: number) => callLog.push(`remove:${id}`))

const wrappers: Array<ReturnType<typeof mount>> = []
const mountVerify = (
	query: Record<string, string> = { sessionId: "row-1", verificationHash: URL_HASH, isReconnect: "false" },
	errors?: unknown[],
) => {
	routeQuery = query
	const config = errors ? { errorHandler: (err: unknown) => errors.push(err) } : {}
	const w = mount(Verify, { global: { stubs: STUBS, components: { DappIdentityBlock }, config } })
	wrappers.push(w)
	return w
}

/** Counts microtask rungs from the moment it starts, so a test can pin how many ticks an effect takes. */
function microtaskLadder(): () => number {
	let rung = 0
	const step = () => {
		rung++
		if (rung < 20) queueMicrotask(step)
	}
	queueMicrotask(step)
	return () => rung
}

/** The rung at which the read runs today; an extra `async` layer around the wait moves it. */
const SLOW_PATH_RUNG = 1

beforeEach(() => {
	sessionRow = row("https://dapp.example")
	sessionChecked.value = true
	sessionCheckedReads = 0
	currentWindow = { id: 7 }
	refusal = async () => "revoked"
	confirmation = async () => undefined
	// biome-ignore lint/suspicious/noExplicitAny: chrome runtime stub for tests
	;(globalThis as any).chrome = { windows: { getCurrent, remove } }
})
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	callLog.length = 0
	vi.clearAllMocks()
})

describe("windows/verify — the origin the user is asked to trust", () => {
	test.each([
		["https://dapp.example:8443", "https://dapp.example:8443", false],
		["http://[::1]:5173", "http://[::1]:5173", false],
		["https://xn--exmple-cua.com", "https://xn--exmple-cua.com", true],
		["https://dapp.example.evil.example", "https://dapp.example.evil.example", false],
		["null", "null", false],
		["unknown", "unknown", false],
		["https://dapp.example@evil.example", "https://evil.example", false],
	])("%s renders %s, warning %s", async (url, origin, warned) => {
		sessionRow = row(url)
		const w = mountVerify()
		await flushPromises()
		const block = w.findComponent(DappIdentityBlock)
		expect(block.text()).toContain(origin)
		expect(block.find('[data-testid="dapp-hostname-warning"]').exists()).toBe(warned)
		for (const part of ["‮", "​", "⁦"]) expect(block.text()).not.toContain(part)
	})
})

describe.each(["false", "true"])("windows/verify — the check with isReconnect=%s", (isReconnect) => {
	const open = () => mountVerify({ sessionId: "row-1", verificationHash: URL_HASH, isReconnect })
	const press = async (w: ReturnType<typeof mountVerify>, testid: string) => {
		await w.get(`[data-testid="${testid}"]`).trigger("click")
		await flushPromises()
	}

	test("shows the URL's grid and both answers, and no switch to skip the check", async () => {
		const w = open()
		await flushPromises()
		expect(w.get('[data-testid="verify-emoji-grid"]').text()).toBe(`grid(${URL_HASH})`)
		expect(w.find('[data-testid="verify-mismatch-btn"]').exists()).toBe(true)
		expect(w.find('[data-testid="verify-confirm-btn"]').exists()).toBe(true)
		expect(w.find('[data-testid="verify-always-trust-toggle"]').exists()).toBe(false)
	})

	test("They match reports the URL's hash, not the row's, then closes the window", async () => {
		const w = open()
		await flushPromises()
		await press(w, "verify-confirm-btn")
		expect(callLog).toEqual(["getDappSession:row-1", `confirmVerification:${URL_HASH}`, "getCurrent", "remove:7"])
	})

	test("They don't match refuses the app the wallet's own row names, then closes the window", async () => {
		const w = open()
		await flushPromises()
		await press(w, "verify-mismatch-btn")
		expect(refuseVerification.mock.calls).toEqual([[{ origin: "https://dapp.example", chainId: "0", profileId: "p1" }]])
		expect(callLog).toEqual(["getDappSession:row-1", "refuseVerification:https://dapp.example", "getCurrent", "remove:7"])
	})
})

describe("windows/verify — closing", () => {
	test.each([
		["no sessionId in the URL", () => mountVerify({ verificationHash: URL_HASH })],
		[
			"no row for the session",
			() => {
				sessionRow = undefined
				return mountVerify()
			},
		],
		[
			"a failed row read",
			() => {
				sessionRow = new Error("port gone")
				return mountVerify()
			},
		],
	])("%s closes the current window by id", async (_, open) => {
		open()
		await flushPromises()
		expect(getCurrent).toHaveBeenCalledTimes(1)
		expect(getCurrent.mock.calls[0][0]).toBeUndefined()
		expect(typeof getCurrent.mock.calls[0][1]).toBe("function")
		expect(remove.mock.calls).toEqual([[7]])
	})

	test("a current window without an id is not removed", async () => {
		currentWindow = {}
		mountVerify({ verificationHash: URL_HASH })
		await flushPromises()
		expect(getCurrent).toHaveBeenCalledTimes(1)
		expect(remove).not.toHaveBeenCalled()
	})
})

describe("windows/verify — They match releases the app's calls", () => {
	const press = async (w: ReturnType<typeof mountVerify>, testid: string) => {
		await w.get(`[data-testid="${testid}"]`).trigger("click")
		await flushPromises()
	}

	test("a window opened without a hash closes on They match without reporting the row's", async () => {
		const w = mountVerify({ sessionId: "row-1", isReconnect: "false" })
		await flushPromises()
		await press(w, "verify-confirm-btn")
		expect(confirmVerification).not.toHaveBeenCalled()
		expect(remove.mock.calls).toEqual([[7]])
	})

	test("a report that fails keeps the window open and both controls answer again", async () => {
		confirmation = async () => {
			throw new Error("port gone")
		}
		const errors: unknown[] = []
		const w = mountVerify(undefined, errors)
		await flushPromises()
		await press(w, "verify-confirm-btn")
		expect(confirmVerification).toHaveBeenCalledTimes(1)
		expect(errors).toHaveLength(1)
		expect(remove).not.toHaveBeenCalled()
		for (const id of ["verify-mismatch-btn", "verify-confirm-btn"]) {
			expect(w.get(`[data-testid="${id}"]`).attributes("disabled")).toBeUndefined()
		}

		confirmation = async () => undefined
		await press(w, "verify-confirm-btn")
		expect(confirmVerification).toHaveBeenCalledTimes(2)
		expect(remove.mock.calls).toEqual([[7]])
	})

	test("They don't match never reports the check", async () => {
		const w = mountVerify()
		await flushPromises()
		await press(w, "verify-mismatch-btn")
		expect(refuseVerification).toHaveBeenCalledTimes(1)
		expect(confirmVerification).not.toHaveBeenCalled()
	})
})

describe("windows/verify — They don't match", () => {
	const ERROR = '[data-testid="verify-mismatch-error"]'
	const press = async (w: ReturnType<typeof mountVerify>, testid: string) => {
		await w.get(`[data-testid="${testid}"]`).trigger("click")
		await flushPromises()
	}

	test("an app already gone closes the window", async () => {
		refusal = async () => "absent"
		const w = mountVerify()
		await flushPromises()
		await press(w, "verify-mismatch-btn")
		expect(remove.mock.calls).toEqual([[7]])
		expect(w.find(ERROR).exists()).toBe(false)
	})

	test.each([
		[
			"a row it could not delete",
			async () => "unavailable",
			"The connection ended, but this app could not be removed. Remove it in Settings, Connected apps.",
		],
		[
			"a failed refusal",
			async () => {
				throw new Error("port gone")
			},
			"Couldn't disconnect this app. Disconnect it in Settings, Connected apps.",
		],
	])("%s keeps the window open with its own line, and both controls answer again", async (_, outcome, line) => {
		refusal = outcome
		const w = mountVerify()
		await flushPromises()
		await press(w, "verify-mismatch-btn")
		expect(remove).not.toHaveBeenCalled()
		expect(w.get(ERROR).text()).toBe(line)
		expect(w.get(ERROR).attributes("role")).toBe("alert")
		for (const id of ["verify-mismatch-btn", "verify-confirm-btn"]) {
			expect(w.get(`[data-testid="${id}"]`).attributes("disabled")).toBeUndefined()
		}
	})

	test("a press of either control while an answer runs, or once the window is closing, runs nothing", async () => {
		let settle: (value: string) => void = () => {}
		refusal = () => new Promise((resolve) => (settle = resolve))
		const w = mountVerify()
		await flushPromises()
		// Emitted on the component, so what refuses is the handlers' latch, not the disabled attribute.
		const emitClick = async (testid: string) => {
			;(w.findComponent(`[data-testid="${testid}"]`) as VueWrapper).vm.$emit("click")
			await flushPromises()
		}
		await emitClick("verify-mismatch-btn")
		await emitClick("verify-mismatch-btn")
		await emitClick("verify-confirm-btn")
		settle("revoked")
		await flushPromises()
		await emitClick("verify-confirm-btn")
		expect(refuseVerification).toHaveBeenCalledTimes(1)
		expect(remove.mock.calls).toEqual([[7]])
	})
})

describe("windows/verify — the session wait", () => {
	test("an already checked session is read inside mount, before any tick", () => {
		mountVerify()
		expect(getDappSession).toHaveBeenCalledTimes(1)
	})

	test("an unchecked session is read on a fixed tick after the flag flips, and the watcher stops", async () => {
		sessionChecked.value = false
		let readAt = -1
		const w = mountVerify()
		await flushPromises()
		expect(getDappSession).not.toHaveBeenCalled()

		sessionChecked.value = true
		const rung = microtaskLadder()
		getDappSession.mockImplementationOnce(async (id: string) => {
			readAt = rung()
			callLog.push(`getDappSession:${id}`)
			return sessionRow
		})
		await flushPromises()
		expect(getDappSession).toHaveBeenCalledTimes(1)
		expect(readAt).toBe(SLOW_PATH_RUNG)

		const reads = sessionCheckedReads
		sessionChecked.value = false
		await flushPromises()
		sessionChecked.value = true
		await flushPromises()
		expect(sessionCheckedReads).toBe(reads)
		expect(getDappSession).toHaveBeenCalledTimes(1)
		void w
	})
})
