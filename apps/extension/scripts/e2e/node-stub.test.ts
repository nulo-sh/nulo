// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { makeFetchWithTimeout } from "@nulo/aztec-runtime/utils"
import { afterAll, expect, test } from "vitest"
import { startNodeStub } from "../../tests/e2e/fixtures/node-stub"

const ROOT = mkdtempSync(path.join(tmpdir(), "nulo-node-stub-test-"))
const REGISTRY = path.join(ROOT, "ports.md")
// The stub claims its port in the host registry; this suite must never write the real one.
process.env.NULO_E2E_PORT_REGISTRY = REGISTRY

afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

test("the wallet's node client stops at the stub's first answer instead of retrying", async () => {
	const stub = await startNodeStub()
	try {
		const call = makeFetchWithTimeout(5_000)(stub.url, { jsonrpc: "2.0", id: 1, method: "node_getNodeInfo", params: [] })
		await expect(call).rejects.toThrow(/Error 400 from server/)
		// The client rejects only once its retries are spent, so one request means none were made.
		expect(stub.requests()).toBe(1)
		expect(readFileSync(REGISTRY, "utf8")).toContain(`| ${new URL(stub.url).port} | nulo-e2e-egress-node-stub |`)
	} finally {
		await stub.stop()
	}
	expect(readFileSync(REGISTRY, "utf8")).not.toContain(`| ${new URL(stub.url).port} |`)
})
