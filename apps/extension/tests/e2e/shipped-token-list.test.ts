/**
 * The published token list against the live chain. A release build fetches the signed list from
 * `tokens.nulo.sh` and seeds its Testnet entries on every profile; every other smoke launch refuses
 * that host and answers the node with the stand-in. This launch alone sends both hosts direct, and
 * the guard recording either fails its close. A source build pins no production key, so the spec
 * runs only in an artifact run. Its expectations are the entries of the list the wallet verified.
 */
import type { Page } from "puppeteer"
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { BUNDLED_TOKEN_CLASS_IDS, readTokenList, type TokenListEntry } from "@nulo/token-list"
import { openScratchPage } from "./fixtures/browser"
import { type ExtensionContext, launchExtension, openPopup, waitForHash, withTimeoutMessage } from "./fixtures/extension"
import { callService, captureSoleProfileId } from "./fixtures/helpers"
import { switchToNetwork } from "./fixtures/networks"
import { createProfileAcceptingTerms } from "./helpers/legal-drivers"

const PROBE_BUDGET_MS = 10_000
/** The fetch on the Terms acceptance: a few seconds, inside the 10 s abort. */
const LIST_ARRIVES_MS = 30_000
/** The seed pass's own budget against a failing node: two retry waits (15 s, then 60 s) and three
 *  attempts, as `rows.test.ts` gives Home. */
const SEEDS_STOP_MS = 150_000
const SETTLED = '[data-testid="tokens-list"][data-settled="true"]'
const SEED_ROW = '[data-testid="token-seed-row"]'
const SEED_WORKING = `${SEED_ROW}:not([data-status="failed"]):not([data-status="rejected"])`
/** A default still drawn as anything but a token card: a seed row, or the import row of one whose import began. */
const NOT_A_TOKEN = `${SEED_ROW}, [data-testid="token-import-row"]`

type TokenTuple = { contract: string; symbol: string; decimals: number }

const byContract = (a: TokenTuple, b: TokenTuple) => a.contract.localeCompare(b.contract)

/** `node_getNodeInfo` from an extension page, under the extension's CSP: `answered` for a JSON-RPC
 *  result, otherwise what came back instead. */
async function nodeInfo(ctx: ExtensionContext): Promise<string> {
	const page = await openScratchPage(ctx.browser, ctx.extensionId)
	try {
		return await page.evaluate(
			async (url: string, budgetMs: number) => {
				const call = { jsonrpc: "2.0", id: 1, method: "node_getNodeInfo", params: [] }
				try {
					const response = await fetch(url, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(call),
						cache: "no-store",
						signal: AbortSignal.timeout(budgetMs),
					})
					const body = await response.json().catch(() => undefined)
					if (response.status === 200 && body?.error === undefined && typeof body?.result === "object" && body.result !== null) {
						return "answered"
					}
					return `status ${response.status}, ${body?.error === undefined ? "no JSON-RPC result" : `error ${JSON.stringify(body.error).slice(0, 200)}`}`
				} catch (err) {
					return `rejected: ${String(err)}`
				}
			},
			TESTNET_RPC_URL,
			PROBE_BUDGET_MS,
		)
	} finally {
		await page.close().catch(() => {})
	}
}

/** The Testnet entries of the list the wallet stored, verified here against the release's pinned keys. */
async function verifiedTestnetEntries(page: Page): Promise<TokenListEntry[]> {
	const stored = await withTimeoutMessage(
		page.waitForFunction(
			async () => {
				const raw = (await chrome.storage.local.get("nulo:core:token-list"))["nulo:core:token-list"]
				const state = typeof raw === "string" ? (JSON.parse(raw) as { envelope?: unknown }) : undefined
				return typeof state?.envelope === "string" ? state.envelope : false
			},
			{ timeout: LIST_ARRIVES_MS, polling: 500 },
		),
		async () => `the wallet stored no token list within ${LIST_ARRIVES_MS / 1000}s`,
	)
	const list = await readTokenList((await stored.jsonValue()) as string)
	return list.entries.filter((e) => e.chainId === CHAIN_IDS.TESTNET && BUNDLED_TOKEN_CLASS_IDS.includes(e.classId))
}

async function defaultRows(page: Page, entries: readonly TokenListEntry[]): Promise<string[]> {
	const rows = await page.$$eval(NOT_A_TOKEN, (els) =>
		els.map((el) => {
			const text = (testid: string) => el.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim()
			if (el.getAttribute("data-testid") === "token-import-row") {
				return { symbol: text("token-import-title") ?? "?", status: "import", reason: text("token-import-subtitle") }
			}
			return {
				symbol: el.getAttribute("data-symbol") ?? "?",
				status: el.getAttribute("data-status") ?? "?",
				reason: text("token-seed-reason"),
			}
		}),
	)
	return rows.map(({ symbol, status, reason }) => {
		const contract = entries.find((e) => e.symbol === symbol)?.address
		return `${contract === undefined ? symbol : `${symbol} (${contract})`} ${status}${reason ? `: ${reason}` : ""}`
	})
}

async function waitForSeedsToStop(page: Page, entries: readonly TokenListEntry[]): Promise<void> {
	await withTimeoutMessage(
		page.waitForFunction(
			(settled: string, working: string) => document.querySelector(settled) !== null && document.querySelector(working) === null,
			{ timeout: SEEDS_STOP_MS, polling: 500 },
			SETTLED,
			SEED_WORKING,
		),
		async () =>
			`Home's default tokens never stopped within ${SEEDS_STOP_MS / 1000}s: ${(await defaultRows(page, entries)).join("; ") || "none shown"}`,
	)
}

async function storedTestnetTokens(page: Page): Promise<TokenTuple[]> {
	const profileId = await captureSoleProfileId(page)
	const rows = await callService<TokenTuple[]>(page, TOKEN_SERVICE_NAME, "getTokens", [profileId, CHAIN_IDS.TESTNET])
	return rows.map(({ contract, symbol, decimals }) => ({ contract, symbol, decimals })).sort(byContract)
}

describe.skipIf(inject("liveLeg") !== true)("the shipped token list on the live Testnet", () => {
	let ctx: ExtensionContext

	beforeAll(async () => {
		ctx = await launchExtension({ live: true })
	})

	afterAll(async () => {
		await ctx?.close()
	})

	test("the node answers directly, and every Testnet entry of the verified list lands as its token", {
		timeout: 240_000,
		retry: 0,
	}, async () => {
		const outcome = await nodeInfo(ctx)
		expect(outcome, `the live Testnet node did not answer: ${outcome}`).toBe("answered")

		await createProfileAcceptingTerms(ctx)
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		// A new profile starts on Mainnet; Home shows the defaults of the active chain only.
		await switchToNetwork(page, "Testnet")
		// A list with no Testnet entry is valid: then no token lands, and that is what is checked.
		const entries = await verifiedTestnetEntries(page)
		await waitForSeedsToStop(page, entries)
		// Home keeps a stopped default past its row cap, so one that failed or was rejected shows here.
		expect(await defaultRows(page, entries), "default tokens that never became tokens").toEqual([])
		const expected = entries.map((e) => ({ contract: e.address, symbol: e.symbol, decimals: e.decimals })).sort(byContract)
		expect(await storedTestnetTokens(page)).toEqual(expected)
	})
})
