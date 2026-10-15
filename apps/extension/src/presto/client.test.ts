import "./client"
import { readFileSync } from "node:fs"
import { PrestoClient } from "@alejoamiras/presto-core"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type ClientModule = typeof import("./client")
let first: ClientModule
let second: ClientModule

// Loaded during collection, so each case's re-import only re-evaluates it.
beforeEach(async () => {
	vi.resetModules()
	first = await import("./client")
	vi.resetModules()
	second = await import("./client")
})

describe("getPrestoClient", () => {
	test("returns one PrestoClient per module instance", () => {
		const client = first.getPrestoClient()
		expect(client).toBeInstanceOf(PrestoClient)
		expect(first.getPrestoClient()).toBe(client)
	})

	test("a fresh module instance (a new page context) gets its own client", () => {
		expect(second.getPrestoClient()).not.toBe(first.getPrestoClient())
	})
})

describe("the status the pages read", () => {
	afterEach(() => vi.unstubAllGlobals())

	// The offscreen prover sends the SDK's own bb.js pin; a status asked about any other version
	// reports a download Presto will never need.
	test("asks Presto about the bb release the SDK's prover requests", async () => {
		const sdk = JSON.parse(readFileSync(resolvePackageAsset("@alejoamiras/presto", "package.json", { from: import.meta.url }), "utf8"))
		const proved: string = sdk.dependencies["@aztec-foundation/bb.js"]
		const health = {
			status: "ok",
			api_version: 1,
			version: "1.1.3",
			aztec_version: proved,
			available_versions: [proved],
			bb_available: true,
		}
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(health), { headers: { "content-type": "application/json" } })),
		)
		expect(await first.getPrestoClient().checkStatus()).toMatchObject({ available: true, needsDownload: false })
	})
})
