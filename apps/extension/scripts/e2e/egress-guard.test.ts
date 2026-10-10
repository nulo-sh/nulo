// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { type Socket, connect } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, describe, expect, test, vi } from "vitest"
import {
	EGRESS_CANARY_HOST,
	type EgressAttempt,
	type EgressCanary,
	type EgressGuard,
	type HeldNode,
	MALFORMED,
	guardArmed,
	ownGuardedLaunch,
	proxyTarget,
	startEgressCanary,
	startEgressGuard,
	undeclared,
} from "../../tests/e2e/fixtures/egress-guard"

const ROOT = mkdtempSync(path.join(tmpdir(), "nulo-egress-guard-test-"))
const REGISTRY = path.join(ROOT, "ports.md")
// The guard claims its port in the host registry; this suite must never write the real one.
process.env.NULO_E2E_PORT_REGISTRY = REGISTRY

afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

const running: Array<EgressGuard | EgressCanary> = []
afterEach(async () => {
	await Promise.all(running.splice(0).map((listener) => listener.stop()))
})

async function guard(): Promise<EgressGuard> {
	const started = await startEgressGuard()
	running.push(started)
	return started
}

async function canary(): Promise<EgressCanary> {
	const started = await startEgressCanary()
	running.push(started)
	return started
}

interface Exchange {
	response: string
	reset: boolean
}

/** Sends `request`, then reads until the guard closes the connection. */
function exchange(port: number, request: string): Promise<Exchange> {
	return new Promise((resolve) => {
		let response = ""
		let reset = false
		const socket = connect(port, "127.0.0.1", () => socket.write(request))
		socket.setEncoding("latin1")
		socket.on("data", (chunk: string) => {
			response += chunk
		})
		socket.on("error", (err: NodeJS.ErrnoException) => {
			reset = err.code === "ECONNRESET"
		})
		socket.on("close", () => resolve({ response, reset }))
	})
}

/** Opens a connection that stays half-open, as a stalled browser socket would. */
function hold(port: number, request?: string): Promise<Socket> {
	return new Promise((resolve) => {
		const socket = connect({ port, host: "127.0.0.1", allowHalfOpen: true }, () => {
			if (request) socket.write(request)
			resolve(socket)
		})
		socket.on("error", () => {})
	})
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe("the guard refuses and records", () => {
	test("a CONNECT gets a whole 403, never a reset, and nothing reaches the target it names", async () => {
		const target = await canary()
		const { port, attempts } = await guard()
		const { response, reset } = await exchange(port, `CONNECT 127.0.0.1:${target.port} HTTP/1.1\r\nHost: x\r\n\r\n`)
		expect(response).toBe("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
		expect(reset).toBe(false)
		expect(attempts()).toEqual([{ host: "127.0.0.1", port: target.port, count: 1 }])
		expect(target.connections()).toBe(0)
	})

	test("success control: a direct connection to that target is counted", async () => {
		const target = await canary()
		await exchange(target.port, "x")
		expect(target.connections()).toBe(1)
	})

	test("an absolute-form request records host and port, never the path or query", async () => {
		const { port, attempts } = await guard()
		const { response } = await exchange(port, "GET http://Example.TEST/secret/path?key=1 HTTP/1.1\r\nHost: example.test\r\n\r\n")
		expect(response).toMatch(/^HTTP\/1\.1 403 /)
		expect(attempts()).toEqual([{ host: "example.test", port: 80, count: 1 }])
		expect(JSON.stringify(attempts())).not.toMatch(/secret|key/)
	})

	test("an IPv6 target keeps its brackets", async () => {
		const { port, attempts } = await guard()
		await exchange(port, "CONNECT [::1]:443 HTTP/1.1\r\n\r\n")
		expect(attempts()).toEqual([{ host: "[::1]", port: 443, count: 1 }])
	})

	test.each([
		["a request line that does not parse", "BREW coffee\r\n\r\n"],
		["a head over 8 KiB", `CONNECT a.test:443 HTTP/1.1\r\nX-Pad: ${"a".repeat(9 * 1024)}\r\n\r\n`],
	])("%s gets a 400 and records it as malformed", async (_, request) => {
		const { port, attempts } = await guard()
		const { response } = await exchange(port, request)
		expect(response).toMatch(/^HTTP\/1\.1 400 /)
		expect(attempts()).toEqual([{ host: MALFORMED, port: 0, count: 1 }])
	})

	test("repeats of one host are one counted entry; the 257th distinct host overflows the record", async () => {
		const { port, attempts, overflowed } = await guard()
		for (let batch = 0; batch < 10; batch++) {
			await Promise.all(Array.from({ length: 200 }, () => exchange(port, "CONNECT busy.test:443 HTTP/1.1\r\n\r\n")))
		}
		expect(attempts()).toEqual([{ host: "busy.test", port: 443, count: 2000 }])
		expect(overflowed()).toBe(false)
		await Promise.all(Array.from({ length: 255 }, (_, i) => exchange(port, `CONNECT h${i}.test:443 HTTP/1.1\r\n\r\n`)))
		expect(overflowed()).toBe(false)
		await exchange(port, "CONNECT one-too-many.test:443 HTTP/1.1\r\n\r\n")
		expect(overflowed()).toBe(true)
		expect(attempts()).toHaveLength(256)
	})
})

describe("stop", () => {
	test("resolves within its deadline with a socket the peer never closes", async () => {
		const started = await guard()
		await hold(started.port)
		const began = Date.now()
		await started.stop()
		expect(Date.now() - began).toBeLessThan(3_000)
	})

	test("records a request that never finished its head as malformed", async () => {
		const started = await guard()
		await hold(started.port, "CONNECT half.test:443 HTTP/1.1\r\n")
		await settle()
		await started.stop()
		expect(started.attempts()).toEqual([{ host: MALFORMED, port: 0, count: 1 }])
	})

	test("success control: a finished request before stop leaves only its host", async () => {
		const started = await guard()
		await exchange(started.port, "CONNECT lb.drpc.live:443 HTTP/1.1\r\n\r\n")
		await started.stop()
		expect(started.attempts()).toEqual([{ host: "lb.drpc.live", port: 443, count: 1 }])
	})

	test("a connection that sent no byte records nothing", async () => {
		const started = await guard()
		await hold(started.port)
		await settle()
		await started.stop()
		expect(started.attempts()).toEqual([])
	})

	test("the port is listed in the host registry while the guard runs, and dropped at stop", async () => {
		const started = await guard()
		expect(readFileSync(REGISTRY, "utf8")).toContain(`| ${started.port} | nulo-e2e-egress-guard |`)
		await started.stop()
		expect(readFileSync(REGISTRY, "utf8")).not.toContain(`| ${started.port} |`)
	})
})

describe("undeclared", () => {
	const attempt = (host: string) => ({ host, port: 443, count: 1 })
	const ownHosts = new Map([["update.googleapis.com", "the component updater"]])

	test("a declared wallet host and a listed browser host pass", () => {
		expect(undeclared([attempt("lb.drpc.live"), attempt("update.googleapis.com")], ownHosts)).toEqual([])
	})

	test("an unlisted host under a listed host's domain fails, and so does a malformed request", () => {
		const hosts = [
			attempt("firebaseinstallations.googleapis.com"),
			attempt("evil-update.googleapis.com"),
			{ host: MALFORMED, port: 0, count: 1 },
		]
		expect(undeclared(hosts, ownHosts)).toEqual([
			`${MALFORMED}:0`,
			"evil-update.googleapis.com:443",
			"firebaseinstallations.googleapis.com:443",
		])
	})
})

test("proxyTarget refuses a CONNECT with a path, another scheme, and a backslash that would name a declared host", () => {
	expect(proxyTarget("CONNECT a.test:443/x HTTP/1.1")).toBeUndefined()
	expect(proxyTarget("GET ftp://a.test/ HTTP/1.1")).toBeUndefined()
	expect(proxyTarget("CONNECT lb.drpc.live\\x.test:443 HTTP/1.1")).toBeUndefined()
	expect(proxyTarget("GET http://lb.drpc.live\\@x.test/ HTTP/1.1")).toBeUndefined()
	expect(proxyTarget("CONNECT A.Test:8443 HTTP/1.1")).toEqual({ host: "a.test", port: 8443 })
})

test("only a provided true arms the guard", () => {
	expect([true, undefined, false, "true", 1].map(guardArmed)).toEqual([true, false, false, false, false])
})

describe("a guarded launch", () => {
	const traffic = { browser: "chrome", ownHosts: new Map([["update.googleapis.com", "the component updater"]]) }

	/** A guard and canary that record what the fake browser "sends", and the browser itself. */
	function rig(opts: { probeSends?: string[]; canaryDirect?: boolean } = {}) {
		const record: EgressAttempt[] = []
		const send = (host: string) => record.push({ host, port: 443, count: 1 })
		const fakeGuard: EgressGuard = { port: 1, attempts: () => record, overflowed: () => false, stop: vi.fn(async () => {}) }
		let direct = 0
		const fakeCanary: EgressCanary = { port: 2, connections: () => direct, stop: vi.fn(async () => {}) }
		const closeBrowser = vi.fn(async () => {})
		const deps = {
			label: "spec.test.ts",
			traffic,
			startGuard: async () => fakeGuard,
			startCanary: async () => fakeCanary,
			launch: vi.fn(async () => ({ value: "browser", close: closeBrowser })),
			settle: vi.fn(async () => "extension-id"),
			probeCanary: vi.fn(async () => {
				if (opts.canaryDirect) direct++
				for (const host of opts.probeSends ?? [EGRESS_CANARY_HOST]) record.push({ host, port: 2, count: 1 })
			}),
			wrapClose: (close: () => Promise<void>) => ({ close }),
		}
		const stopped = () => [vi.mocked(fakeGuard.stop).mock.calls.length > 0, vi.mocked(fakeCanary.stop).mock.calls.length > 0]
		return { deps, send, closeBrowser, stopped }
	}

	test("success control: a launch that tried only declared and listed hosts closes cleanly, once", async () => {
		const { deps, send, closeBrowser, stopped } = rig()
		const launch = await ownGuardedLaunch(deps)
		send("lb.drpc.live")
		send("update.googleapis.com")
		await launch.close()
		expect(stopped()).toEqual([true, true])
		await launch.close()
		expect(closeBrowser).toHaveBeenCalledTimes(2)
	})

	test("a launch that rejects stops the guard and the canary and rethrows", async () => {
		const { deps, stopped } = rig()
		const cause = new Error("no browser")
		deps.launch.mockRejectedValueOnce(cause)
		await expect(ownGuardedLaunch(deps)).rejects.toBe(cause)
		expect(stopped()).toEqual([true, true])
	})

	test("a settle that throws closes the browser and stops both", async () => {
		const { deps, closeBrowser, stopped } = rig()
		deps.settle.mockRejectedValueOnce(new Error("no liveness"))
		await expect(ownGuardedLaunch(deps)).rejects.toThrow("no liveness")
		expect(closeBrowser).toHaveBeenCalled()
		expect(stopped()).toEqual([true, true])
	})

	test("an undeclared host fails the close, naming it, and the browser still closes", async () => {
		const { deps, send, closeBrowser } = rig()
		const launch = await ownGuardedLaunch(deps)
		send("firebaseinstallations.googleapis.com")
		await expect(launch.close()).rejects.toThrow(/spec\.test\.ts: chrome tried 1 host.*firebaseinstallations\.googleapis\.com:443/)
		expect(closeBrowser).toHaveBeenCalled()
	})

	test("a close-time check that throws still runs the egress check", async () => {
		const { deps, send, stopped } = rig()
		const launch = await ownGuardedLaunch({
			...deps,
			wrapClose: () => ({ close: async () => Promise.reject(new Error("2 CSP violation(s)")) }),
		})
		send("api.coingecko.com.evil.test")
		await expect(launch.close()).rejects.toThrow(/api\.coingecko\.com\.evil\.test:443[\s\S]*2 CSP violation/)
		expect(stopped()).toEqual([true, true])
	})

	test("an early check of the wrapped close does not skip the egress check", async () => {
		const { deps, send, closeBrowser } = rig()
		const wrapClose = (close: () => Promise<void>) => {
			let consumed = false
			const check = () => {
				consumed = true
			}
			return { check, close: () => (consumed ? close() : Promise.reject(new Error("unreachable"))) }
		}
		const launch = await ownGuardedLaunch({ ...deps, wrapClose })
		launch.wrapped.check()
		send("unlisted.test")
		await expect(launch.close()).rejects.toThrow(/unlisted\.test:443/)
		expect(closeBrowser).toHaveBeenCalled()
	})

	test("a request that goes direct after the launch was proven fails the close", async () => {
		const { deps } = rig()
		let direct = false
		const launch = await ownGuardedLaunch({
			...deps,
			startCanary: async () => ({ port: 2, connections: () => (direct ? 1 : 0), stop: async () => {} }),
		})
		direct = true
		await expect(launch.close()).rejects.toThrow(/1 connection\(s\) reached egress-canary\.test directly/)
	})

	test("a browser close that rejects still stops both, and its error is reported", async () => {
		const { deps, closeBrowser, stopped } = rig()
		closeBrowser.mockRejectedValueOnce(new Error("browser hung"))
		const launch = await ownGuardedLaunch(deps)
		await expect(launch.close()).rejects.toThrow("browser hung")
		expect(stopped()).toEqual([true, true])
	})

	/** A stand-in node whose failures and stop are logged beside the browser's close. */
	function heldNode(failures: string[], order: string[]): HeldNode {
		return {
			requests: () => 0,
			failures: async () => {
				order.push("node failures read")
				return failures
			},
			stop: async () => {
				order.push("node stopped")
			},
		}
	}

	test("a request the stand-in node lost fails the close: read while the browser is open, stopped after it", async () => {
		const { deps, closeBrowser } = rig()
		const order: string[] = []
		closeBrowser.mockImplementation(async () => {
			order.push("browser closed")
		})
		const launch = await ownGuardedLaunch({ ...deps, holdNode: async () => heldNode(["a target could not be armed"], order) })
		await expect(launch.close()).rejects.toThrow(
			/spec\.test\.ts: the stand-in node lost control of a request: a target could not be armed/,
		)
		expect(order).toEqual(["node failures read", "browser closed", "node stopped"])
	})

	test("success control: a stand-in node that lost nothing closes cleanly", async () => {
		const { deps } = rig()
		const order: string[] = []
		const launch = await ownGuardedLaunch({ ...deps, holdNode: async () => heldNode([], order) })
		await launch.close()
		expect(order).toEqual(["node failures read", "node stopped"])
	})

	test("a stand-in node that cannot be held releases the launch", async () => {
		const { deps, closeBrowser, stopped } = rig()
		await expect(ownGuardedLaunch({ ...deps, holdNode: async () => Promise.reject(new Error("no worker target")) })).rejects.toThrow(
			"no worker target",
		)
		expect(closeBrowser).toHaveBeenCalled()
		expect(stopped()).toEqual([true, true])
	})

	test.each([
		["went direct", { canaryDirect: true }],
		["never reached the guard", { probeSends: [] }],
		["never reached the guard", { probeSends: ["egress-canary.test.evil"] }],
	])("a canary request that %s fails the launch and releases it", async (why, opts) => {
		const { deps, closeBrowser, stopped } = rig(opts)
		await expect(ownGuardedLaunch(deps)).rejects.toThrow(`the canary request ${why}`)
		expect(closeBrowser).toHaveBeenCalled()
		expect(stopped()).toEqual([true, true])
	})
})
