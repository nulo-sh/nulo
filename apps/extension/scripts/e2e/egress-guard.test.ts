// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { type Socket, connect } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, describe, expect, test } from "vitest"
import {
	type EgressCanary,
	type EgressGuard,
	MALFORMED,
	guardArmed,
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

	test("a declared wallet host and the running browser's listed host pass", () => {
		expect(undeclared([attempt("lb.drpc.live"), attempt("update.googleapis.com")], "chrome")).toEqual([])
	})

	test("an unlisted host under a listed host's domain fails", () => {
		const hosts = [attempt("firebaseinstallations.googleapis.com"), attempt("evil-update.googleapis.com")]
		expect(undeclared(hosts, "chrome")).toEqual(["evil-update.googleapis.com:443", "firebaseinstallations.googleapis.com:443"])
	})

	test("another browser's listed host fails, and so does a malformed request", () => {
		expect(undeclared([attempt("update.googleapis.com"), { host: MALFORMED, port: 0, count: 1 }], "firefox")).toEqual([
			`${MALFORMED}:0`,
			"update.googleapis.com:443",
		])
	})
})

test("proxyTarget refuses a CONNECT with a path and a request for another scheme", () => {
	expect(proxyTarget("CONNECT a.test:443/x HTTP/1.1")).toBeUndefined()
	expect(proxyTarget("GET ftp://a.test/ HTTP/1.1")).toBeUndefined()
	expect(proxyTarget("CONNECT A.Test:8443 HTTP/1.1")).toEqual({ host: "a.test", port: 8443 })
})

test("only a provided true arms the guard", () => {
	expect([true, undefined, false, "true", 1].map(guardArmed)).toEqual([true, false, false, false, false])
})
