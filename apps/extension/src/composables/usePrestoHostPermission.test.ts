/**
 * The grant read over a fake `chrome.permissions` whose every `contains` and `request` answer is
 * released by hand, so each test fixes the order in which reads, events and disposal land.
 */
import { flushPromises } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { usePrestoHostPermission } from "./usePrestoHostPermission"

const LOOPBACK = ["https://127.0.0.1/*", "http://127.0.0.1/*"]
const SHIPPED_HOSTS = ["https://passkey.nulo.sh/", ...LOOPBACK]

type Answer = { resolve: (value: boolean) => void; reject: (error: unknown) => void }

function answer(list: Answer[]): Promise<boolean> {
	return new Promise<boolean>((resolve, reject) => list.push({ resolve, reject }))
}

function event() {
	const listeners = new Set<() => void>()
	return {
		listeners,
		addListener: vi.fn((l: () => void) => listeners.add(l)),
		removeListener: vi.fn((l: () => void) => listeners.delete(l)),
		fire: () => {
			for (const l of [...listeners]) l()
		},
	}
}

function browser(options: { firefox?: boolean; hosts?: unknown[] } = {}) {
	const reads: Answer[] = []
	const requests: Answer[] = []
	const permissions = {
		contains: vi.fn(() => answer(reads)),
		request: vi.fn(() => answer(requests)),
		onAdded: event(),
		onRemoved: event(),
	}
	const runtime: Record<string, unknown> = { getManifest: () => ({ host_permissions: options.hosts ?? SHIPPED_HOSTS }) }
	if (options.firefox !== false) runtime.getBrowserInfo = vi.fn()
	vi.stubGlobal("chrome", { runtime, permissions })
	return { permissions, reads, requests }
}

function mountPermission() {
	const onFirstAllowed = vi.fn()
	const onGranted = vi.fn()
	const api = usePrestoHostPermission({ onFirstAllowed, onGranted })
	return { ...api, onFirstAllowed, onGranted }
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe("usePrestoHostPermission", () => {
	test("on Chrome the page may probe at once, and no permission is read, watched or requested", () => {
		const { permissions } = browser({ firefox: false })
		const { missing, request, onFirstAllowed, onGranted } = mountPermission()
		request()
		expect(onFirstAllowed).toHaveBeenCalledOnce()
		expect(onGranted).not.toHaveBeenCalled()
		expect(missing.value).toBe(false)
		expect(permissions.contains).not.toHaveBeenCalled()
		expect(permissions.request).not.toHaveBeenCalled()
		expect(permissions.onAdded.addListener).not.toHaveBeenCalled()
	})

	test("reads and requests only the manifest's loopback origins, not its other hosts or a wildcard", () => {
		const { permissions } = browser({ hosts: ["https://passkey.nulo.sh/", "*://*/*", ...LOOPBACK, "https://127.0.0.2/*", 7] })
		const { request } = mountPermission()
		request()
		expect(permissions.contains).toHaveBeenCalledExactlyOnceWith({ origins: LOOPBACK })
		expect(permissions.request).toHaveBeenCalledExactlyOnceWith({ origins: LOOPBACK })
	})

	test("a manifest with no loopback entry reads nothing and lets the page probe", () => {
		const { permissions } = browser({ hosts: ["https://passkey.nulo.sh/"] })
		const { missing, onFirstAllowed } = mountPermission()
		expect(onFirstAllowed).toHaveBeenCalledOnce()
		expect(missing.value).toBe(false)
		expect(permissions.contains).not.toHaveBeenCalled()
		expect(permissions.onAdded.addListener).not.toHaveBeenCalled()
	})

	test("subscribes before the first read, and a held grant lets the page probe once, with no re-check", async () => {
		const { permissions, reads } = browser()
		const { missing, onFirstAllowed, onGranted } = mountPermission()
		expect(permissions.onAdded.addListener.mock.invocationCallOrder[0]).toBeLessThan(permissions.contains.mock.invocationCallOrder[0])
		expect(onFirstAllowed).not.toHaveBeenCalled()
		reads[0].resolve(true)
		await flushPromises()
		expect(onFirstAllowed).toHaveBeenCalledOnce()
		expect(onGranted).not.toHaveBeenCalled()
		expect(missing.value).toBe(false)
	})

	test("a missing grant shows the row and holds the probe; the grant's event re-checks once", async () => {
		const { permissions, reads } = browser()
		const { missing, onFirstAllowed, onGranted } = mountPermission()
		reads[0].resolve(false)
		await flushPromises()
		expect(missing.value).toBe(true)
		expect(onFirstAllowed).not.toHaveBeenCalled()
		expect(onGranted).not.toHaveBeenCalled()

		permissions.onAdded.fire()
		reads[1].resolve(true)
		await flushPromises()
		expect(missing.value).toBe(false)
		expect(onGranted).toHaveBeenCalledOnce()
		expect(onFirstAllowed).not.toHaveBeenCalled()

		// An unrelated permission change that leaves the grant in place re-checks nothing.
		permissions.onAdded.fire()
		reads[2].resolve(true)
		await flushPromises()
		expect(onGranted).toHaveBeenCalledOnce()
	})

	test("a first read that fails shows today's page; a grant after it still re-checks", async () => {
		const { permissions, reads } = browser()
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const { missing, onFirstAllowed, onGranted } = mountPermission()
		reads[0].reject(new Error("no such origin"))
		await flushPromises()
		expect(missing.value).toBe(false)
		expect(onFirstAllowed).toHaveBeenCalledOnce()
		expect(debug).toHaveBeenCalledWith("presto host permission read failed", { error: expect.any(Error) })

		permissions.onAdded.fire()
		reads[1].resolve(true)
		await flushPromises()
		expect(onGranted).toHaveBeenCalledOnce()
		expect(onFirstAllowed).toHaveBeenCalledOnce()
	})

	test("a revoke turns a granted page into the row, and a later failed read keeps the row", async () => {
		const { permissions, reads } = browser()
		vi.spyOn(console, "debug").mockImplementation(() => {})
		const { missing, onFirstAllowed, onGranted } = mountPermission()
		reads[0].resolve(true)
		await flushPromises()

		permissions.onRemoved.fire()
		reads[1].resolve(false)
		await flushPromises()
		expect(missing.value).toBe(true)

		permissions.onAdded.fire()
		reads[2].reject(new Error("port closed"))
		await flushPromises()
		expect(missing.value).toBe(true)
		expect(onGranted).not.toHaveBeenCalled()
		expect(onFirstAllowed).toHaveBeenCalledOnce()
	})

	test("a grant whose event overtakes the mount read re-checks, and the mount read's late answer lands nothing", async () => {
		const { permissions, reads } = browser()
		const { missing, onFirstAllowed, onGranted } = mountPermission()
		permissions.onAdded.fire()
		reads[1].resolve(true)
		await flushPromises()
		expect(onGranted).toHaveBeenCalledOnce()
		expect(onFirstAllowed).not.toHaveBeenCalled()

		reads[0].resolve(false)
		await flushPromises()
		expect(missing.value).toBe(false)
		expect(onGranted).toHaveBeenCalledOnce()
	})

	test("an event's read that fails before any read answered shows today's page", async () => {
		const { permissions, reads } = browser()
		vi.spyOn(console, "debug").mockImplementation(() => {})
		const { missing, onFirstAllowed, onGranted } = mountPermission()
		permissions.onRemoved.fire()
		reads[1].reject(new Error("port closed"))
		await flushPromises()
		expect(missing.value).toBe(false)
		expect(onFirstAllowed).toHaveBeenCalledOnce()
		expect(onGranted).not.toHaveBeenCalled()
	})

	test("an older read resolving late never lands over a newer one", async () => {
		const { permissions, reads } = browser()
		const { missing, onFirstAllowed, onGranted } = mountPermission()
		permissions.onRemoved.fire()
		reads[1].resolve(false)
		await flushPromises()
		expect(missing.value).toBe(true)

		reads[0].resolve(true)
		await flushPromises()
		expect(missing.value).toBe(true)
		expect(onFirstAllowed).not.toHaveBeenCalled()
		expect(onGranted).not.toHaveBeenCalled()
	})

	test("Allow requests inside the click's own call; a refusal or a failure keeps the row and never rejects", async () => {
		const { reads, requests, permissions } = browser()
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const { missing, request, onGranted } = mountPermission()
		reads[0].resolve(false)
		await flushPromises()

		expect(request()).toBeUndefined()
		expect(permissions.request).toHaveBeenCalledOnce()
		requests[0].resolve(false)
		request()
		requests[1].reject(new Error("prompt dismissed"))
		await flushPromises()

		expect(missing.value).toBe(true)
		expect(onGranted).not.toHaveBeenCalled()
		expect(permissions.contains).toHaveBeenCalledOnce()
		expect(debug).toHaveBeenCalledWith("presto host permission refused")
		expect(debug).toHaveBeenCalledWith("presto host permission request failed", { error: expect.any(Error) })
	})

	test("dispose() unsubscribes, and a read or request answered after it lands, calls and logs nothing", async () => {
		const { permissions, reads, requests } = browser()
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const { missing, request, dispose, onGranted } = mountPermission()
		reads[0].resolve(false)
		await flushPromises()
		permissions.onAdded.fire()
		request()
		request()
		dispose()
		expect(permissions.onAdded.listeners.size).toBe(0)
		expect(permissions.onRemoved.listeners.size).toBe(0)

		reads[1].resolve(true)
		requests[0].resolve(false)
		requests[1].reject(new Error("prompt dismissed"))
		await flushPromises()
		expect(missing.value).toBe(true)
		expect(onGranted).not.toHaveBeenCalled()
		expect(debug).not.toHaveBeenCalled()

		request()
		expect(permissions.request).toHaveBeenCalledTimes(2)
	})

	test("a first read answered after dispose() never lets the page probe", async () => {
		const { reads } = browser()
		const { dispose, onFirstAllowed } = mountPermission()
		dispose()
		reads[0].resolve(true)
		await flushPromises()
		expect(onFirstAllowed).not.toHaveBeenCalled()
	})
})
