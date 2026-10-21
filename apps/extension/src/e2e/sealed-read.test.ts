import { describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { TxStatus, type Tx } from "@/wallet/services/transaction/service"
import { TestRowKeys } from "@/wallet/storage/sealed-entity-storage.testing"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { answerSealedReads } from "./sealed-read"
import { SEALED_READ_MESSAGE } from "./sealed-read-message"

const ORIGIN = "chrome-extension://nulo/"
const HASH = `0x${"11".repeat(32)}`
const tx: Tx = {
	chainId: 1,
	account: `0x${"ab".repeat(32)}`,
	nonce: "0",
	feePaymentMethod: 0 as never,
	hash: HASH,
	createdAt: 1,
	updatedAt: 1,
	status: TxStatus.Proposed,
	origin: { type: 0 } as never,
	calls: [],
	profileId: "p",
}

async function wired() {
	const api = new FakeBrowserApi()
	api.reset()
	const keys = await new TestRowKeys().unlock("p")
	await sealedEntityStorage("txs", api.storage.local, keys.source).set(HASH, tx)
	let listener: Parameters<Parameters<typeof answerSealedReads>[0]["addMessageListener"]>[0] = () => false
	answerSealedReads({
		area: api.storage.local,
		keys: keys.source,
		addMessageListener: (added) => {
			listener = added
		},
		extensionOrigin: ORIGIN,
	})
	const ask = async (message: unknown, url = `${ORIGIN}popup.html`) => {
		const respond = vi.fn()
		const kept = listener(message, { url }, respond)
		if (kept) await vi.waitFor(() => expect(respond).toHaveBeenCalled())
		return { kept, response: respond.mock.calls[0]?.[0] }
	}
	return { api, ask }
}

describe("the e2e sealed-read seam", () => {
	test("answers an extension page with each readable row, where it is stored and whose it is", async () => {
		const { api, ask } = await wired()
		const [storageKey] = Object.keys(await api.storage.local.get())
		const { response } = await ask({ type: SEALED_READ_MESSAGE, root: "txs" })
		expect(response).toEqual([{ storageKey, naturalId: HASH, profileId: "p", sealed: true, row: tx }])
		expect(storageKey).not.toContain(HASH.slice(2))
	})

	test("opens a captured value in place of storage", async () => {
		const { api, ask } = await wired()
		const stored = await api.storage.local.get()
		await api.storage.local.clear()
		const { response } = await ask({ type: SEALED_READ_MESSAGE, root: "txs", stored })
		expect(response).toMatchObject([{ naturalId: HASH, row: tx }])
	})

	test.each([
		["a root that is not sealed", { type: SEALED_READ_MESSAGE, root: "networks" }, `${ORIGIN}popup.html`],
		["a root no store names", { type: SEALED_READ_MESSAGE, root: "__proto__" }, `${ORIGIN}popup.html`],
		["a web page", { type: SEALED_READ_MESSAGE, root: "txs" }, "https://dapp.example/"],
		["another message", { type: "nulo:other", root: "txs" }, `${ORIGIN}popup.html`],
	])("leaves %s unanswered", async (_label, message, url) => {
		const { ask } = await wired()
		expect(await ask(message, url)).toEqual({ kept: false, response: undefined })
	})

	test("a row of a profile this worker never unlocked is absent", async () => {
		const { ask } = await wired()
		const api = new FakeBrowserApi()
		api.reset()
		const other = await new TestRowKeys().unlock("q")
		await sealedEntityStorage("txs", api.storage.local, other.source).set(HASH, { ...tx, profileId: "q" })
		const { response } = await ask({ type: SEALED_READ_MESSAGE, root: "txs", stored: await api.storage.local.get() })
		expect(response).toEqual([])
	})
})
