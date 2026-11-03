import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const WORKSPACE = resolve(import.meta.dir, "..")
const pin = (path: string, field: string) => JSON.parse(readFileSync(resolve(WORKSPACE, path), "utf8"))[field]?.["@aztec-labs/stdlib"]

function runClient(): Record<string, unknown> {
	const run = Bun.spawnSync([process.execPath, "--no-install", join(import.meta.dir, "node-client.ts")], {
		cwd: WORKSPACE,
		stdout: "pipe",
		stderr: "pipe",
	})
	expect(run.exitCode, run.stderr.toString()).toBe(0)
	const line = run.stdout
		.toString()
		.split("\n")
		.find((l) => l.startsWith("RESULT "))
	return JSON.parse(line?.slice("RESULT ".length) ?? "{}")
}

describe("the real node client", () => {
	const client = runClient()

	test("every schema method, under the prefix the client sends, is allowed", () => {
		expect(client.prefix).toBe("aztec_")
		expect(client.missing).toEqual([])
	})

	test("reads a result through the proxy, and gives up after one request on a local 4xx", () => {
		expect(client.result).toBe(42)
		expect(client.refusal).toMatch(/429/)
		expect(client.limitedRequests).toBe(1)
	})
})

test("the workspace's stdlib pin is the extension's", () => {
	expect(pin("package.json", "devDependencies")).toBe(pin("../../apps/extension/package.json", "dependencies"))
})
