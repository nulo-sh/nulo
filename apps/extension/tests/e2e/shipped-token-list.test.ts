/**
 * The shipped token list against the live chain. A release build seeds the four Testnet tokens on
 * every profile; every other smoke launch answers the node with the stand-in, so those seeds end
 * failed there. This launch alone sends the Testnet node's host direct, and the guard recording
 * that host fails its close. A source build seeds nothing, so the spec runs only in an artifact run.
 */
import type { Page } from "puppeteer"
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { seedsForChain } from "@/wallet/services/token/default-tokens"
import { openScratchPage } from "./fixtures/browser"
import { type ExtensionContext, launchExtension, openPopup, registerProfile, waitForHash, withTimeoutMessage } from "./fixtures/extension"
import { captureSoleProfileId } from "./fixtures/helpers"

const SEEDS = seedsForChain(CHAIN_IDS.TESTNET)
const PROBE_BUDGET_MS = 10_000
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
const EXPECTED: TokenTuple[] = SEEDS.map((s) => ({ contract: s.contract, symbol: s.expectedSymbol, decimals: s.expectedDecimals })).sort(
	byContract,
)

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

async function defaultRows(page: Page): Promise<string[]> {
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
		const contract = SEEDS.find((s) => s.expectedSymbol === symbol)?.contract
		return `${contract === undefined ? symbol : `${symbol} (${contract})`} ${status}${reason ? `: ${reason}` : ""}`
	})
}

async function waitForSeedsToStop(page: Page): Promise<void> {
	await withTimeoutMessage(
		page.waitForFunction(
			(settled: string, working: string) => document.querySelector(settled) !== null && document.querySelector(working) === null,
			{ timeout: SEEDS_STOP_MS, polling: 500 },
			SETTLED,
			SEED_WORKING,
		),
		async () =>
			`Home's default tokens never stopped within ${SEEDS_STOP_MS / 1000}s: ${(await defaultRows(page)).join("; ") || "none shown"}`,
	)
}

async function storedTestnetTokens(page: Page): Promise<TokenTuple[]> {
	const profileId = await captureSoleProfileId(page)
	const rows = await page.evaluate(async () => {
		const all = await chrome.storage.local.get(null)
		return Object.entries(all)
			.filter(([key]) => key.startsWith("nulo:core:tokens@"))
			.map(([, value]) => JSON.parse(value as string) as { profileId: string; chainId: number } & TokenTuple)
	})
	return rows
		.filter((row) => row.profileId === profileId && row.chainId === CHAIN_IDS.TESTNET)
		.map(({ contract, symbol, decimals }) => ({ contract, symbol, decimals }))
		.sort(byContract)
}

describe.skipIf(inject("liveLeg") !== true)("the shipped token list on the live Testnet", () => {
	let ctx: ExtensionContext

	beforeAll(async () => {
		ctx = await launchExtension({ liveNode: true })
	})

	afterAll(async () => {
		await ctx?.close()
	})

	test("the node answers directly, and every shipped Testnet seed lands as its token", { timeout: 240_000, retry: 0 }, async () => {
		const outcome = await nodeInfo(ctx)
		expect(outcome, `the live Testnet node did not answer: ${outcome}`).toBe("answered")

		await registerProfile(ctx)
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		await waitForSeedsToStop(page)
		// Home keeps a stopped default past its row cap, so one that failed or was rejected shows here.
		expect(await defaultRows(page), "default tokens that never became tokens").toEqual([])
		expect(await storedTestnetTokens(page)).toEqual(EXPECTED)
	})
})
