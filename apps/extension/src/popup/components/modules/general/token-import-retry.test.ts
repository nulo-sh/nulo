import { describe, expect, test, vi } from "vitest"
import { canRetryImport, importFailureSentence, type ImportRetryClient, type RetryableImport, retryTokenImport } from "./token-import-retry"

const interrupted: RetryableImport = {
	progress: { stage: "failed" },
	error: { kind: "interrupted_by_restart", message: "Job declared lost: SW restart", normalizedRaw: null },
	origin: "popup",
	profileId: "p1",
	networkId: "net1",
	accountAddress: "0xacc1",
	contractAddress: "0x0a01",
}

function fakeClient(isComplete = true) {
	const tokenInterface = { chainId: 1, contract: "0x0a01", isComplete }
	return {
		tokenInterface,
		client: {
			parseTokenInterface: vi.fn(async () => tokenInterface),
			addToken: vi.fn(async () => ({ id: 1 })),
		} as unknown as ImportRetryClient & { parseTokenInterface: ReturnType<typeof vi.fn>; addToken: ReturnType<typeof vi.fn> },
	}
}

describe("importFailureSentence", () => {
	test("names a restart in the wallet's words; any other reason has no sentence of its own", () => {
		expect(importFailureSentence(interrupted)).toBe("The wallet restarted while adding this token.")
		for (const kind of ["stale_on_resume", "metadata_fetch"]) {
			expect(importFailureSentence({ error: { kind, message: "x", normalizedRaw: null } })).toBeUndefined()
		}
		expect(importFailureSentence({ error: null })).toBeUndefined()
	})
})

describe("canRetryImport", () => {
	test("the person's and a dApp's interrupted import can be retried", () => {
		expect([canRetryImport(interrupted), canRetryImport({ ...interrupted, origin: "dapp" })]).toEqual([true, true])
	})

	test("refuses a default's import, another failure, a record still running and one missing what the import needs", () => {
		const refused: [string, RetryableImport][] = [
			["seed origin", { ...interrupted, origin: "seed" }],
			["another kind", { ...interrupted, error: { kind: "stale_on_resume", message: "x", normalizedRaw: null } }],
			["running", { ...interrupted, progress: { stage: "simulating" }, error: null }],
			["no network", { ...interrupted, networkId: undefined }],
			["no account", { ...interrupted, accountAddress: "" }],
			["no contract", { ...interrupted, contractAddress: undefined }],
		]
		for (const [name, op] of refused) expect([name, canRetryImport(op)]).toEqual([name, false])
	})
})

describe("retryTokenImport", () => {
	test("parses the record's contract on its network, then adds it for its profile and account as the person's own", async () => {
		const { client, tokenInterface } = fakeClient()
		await retryTokenImport(client, { ...interrupted, origin: "dapp" }, () => true)
		expect(client.parseTokenInterface.mock.calls).toEqual([["net1", "0x0a01"]])
		expect(client.addToken.mock.calls).toEqual([["p1", "net1", "0xacc1", tokenInterface, { origin: "popup" }]])
	})

	test("an incomplete interface is refused before any add", async () => {
		const { client } = fakeClient(false)
		await expect(retryTokenImport(client, interrupted, () => true)).rejects.toThrow("incomplete token interface")
		expect(client.addToken).not.toHaveBeenCalled()
	})

	test("a page gone during the parse adds nothing", async () => {
		const { client } = fakeClient()
		await retryTokenImport(client, interrupted, () => false)
		expect([client.parseTokenInterface.mock.calls.length, client.addToken.mock.calls.length]).toEqual([1, 0])
	})

	test("a record that cannot be retried reaches no RPC", async () => {
		const { client } = fakeClient()
		await expect(retryTokenImport(client, { ...interrupted, origin: "seed" }, () => true)).rejects.toThrow()
		expect([client.parseTokenInterface.mock.calls.length, client.addToken.mock.calls.length]).toEqual([0, 0])
	})
})
