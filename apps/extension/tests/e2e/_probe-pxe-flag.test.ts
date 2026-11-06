/**
 * A measurement probe, not a regression test: PXE's concurrent contract sync, flag on and off, on the
 * live Testnet with throwaway profiles that exist only in this process. Runs on an artifact run only.
 * Never prints a recovery phrase, a key or a node address.
 */
import { appendFileSync, mkdirSync } from "node:fs"
import { homedir, loadavg } from "node:os"
import { join } from "node:path"
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import type { Page } from "puppeteer"
import { describe, inject, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { randomAztecAddress } from "./fixtures/aztec"
import { TEST_PASSWORD } from "./fixtures/constants"
import { clickByTestId, replaceInputValue, waitForHash } from "./fixtures/dom"
import { type ExtensionContext, launchExtension } from "./fixtures/extension"
import { switchToNetwork } from "./fixtures/networks"
import { readRecoveryWords } from "./fixtures/profiles"
import { callService, captureSoleProfileId } from "./fixtures/helpers"
import { importToken, refreshBalances } from "./fixtures/tokens"
import { enterSendForm, selectFeeMethod, setActiveSendType } from "./fixtures/transfers"
import { waitForToast } from "./fixtures/widgets"
import { navigateByHash } from "./fixtures/navigation"
import { openOnboarding, openPopup } from "./fixtures/wallet-pages"
import { acceptOnboardingTerms } from "./helpers/legal-drivers"
import { ONBOARDING_IMPORT_SHELL, importSeed } from "./helpers/import-drivers"
import {
	TOOLS_ORIGIN,
	answerNuloWindows,
	bridgeTokens,
	driveToolsConnected,
	l1SignerFromEnv,
	pollPage,
	scrub,
} from "./_probe-pxe-flag-tools"

type Arm = "on" | "off"
type Probe = {
	config: unknown[]
	ops: Record<string, unknown>[]
	calls: { t: number; m: string; d: string }[]
	spans: { t: number; ms: number }[]
}

const SCRATCH = join(homedir(), ".cache/nulo-backlog/pxe-flag-1")
const BUILD: Record<Arm, string> = { on: join(SCRATCH, "builds/on"), off: join(SCRATCH, "builds/off") }
const OUT = join(SCRATCH, "testnet", `${process.env.PXE_FLAG_MODE}-${Date.now()}.jsonl`)
const node = createAztecNodeClient(TESTNET_RPC_URL)

function record(row: Record<string, unknown>): void {
	mkdirSync(join(SCRATCH, "testnet"), { recursive: true })
	appendFileSync(OUT, `${JSON.stringify({ ...row, at: new Date().toISOString(), load1: loadavg()[0] })}\n`)
}

/** Every host the tools app's own CSP lets it load or reach, read at run time and never printed. */
async function toolsHosts(): Promise<string[]> {
	const res = await fetch(`${TOOLS_ORIGIN}/`)
	const csp = res.headers.get("content-security-policy") ?? ""
	const hosts = csp
		.split(";")
		.map((d) => d.trim().split(/\s+/))
		.filter(([name]) => name !== undefined && /-src$/.test(name))
		.flatMap(([, ...sources]) => sources)
		.filter((src) => /^(https|wss):\/\//.test(src))
		.map((src) => src.replace(/^(https|wss):\/\//, "").replace(/[/:].*$/, ""))
	return [...new Set([new URL(TOOLS_ORIGIN).hostname, ...hosts])]
}

async function launch(arm: Arm, tools: boolean): Promise<ExtensionContext> {
	const extraDirectHosts = tools ? await toolsHosts() : []
	return launchExtension({ live: true, extensionPath: BUILD[arm], cspRecorder: false, extraDirectHosts })
}

async function offscreen<T>(ctx: ExtensionContext, expression: string): Promise<T> {
	const url = `chrome-extension://${ctx.extensionId}/src/offscreen/index.html`
	const target = ctx.browser.targets().find((t) => t.url().split("?")[0] === url)
	if (!target) throw new Error("no offscreen document")
	const session = await target.createCDPSession()
	try {
		const { result } = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
		return result.value as T
	} finally {
		await session.detach().catch(() => {})
	}
}

/** Takes everything the instrument recorded since the last drain. */
function drain(ctx: ExtensionContext): Promise<Probe> {
	return offscreen<Probe>(
		ctx,
		`(() => { const p = globalThis.__pxeFlagProbe; if (!p) return { config: [], ops: [], calls: [], spans: [] }; return { config: p.config.slice(), ops: p.ops.splice(0), calls: p.calls.splice(0), spans: p.spans.splice(0) } })()`,
	)
}

async function heapMb(ctx: ExtensionContext): Promise<number> {
	const url = `chrome-extension://${ctx.extensionId}/src/offscreen/index.html`
	const target = ctx.browser.targets().find((t) => t.url().split("?")[0] === url)
	if (!target) return -1
	const session = await target.createCDPSession()
	try {
		await session.send("Performance.enable")
		const { metrics } = await session.send("Performance.getMetrics")
		const used = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? -1
		return Math.round(used / 1048576)
	} finally {
		await session.detach().catch(() => {})
	}
}

/** Counts the PXE's speculative-sync warnings in the log buffer; the lines name contracts, so only a count leaves. */
async function speculativeWarnings(page: Page): Promise<number> {
	const logs = await callService<unknown[]>(page, "log-viewer", "getLogs", [10_000, 0])
	return (Array.isArray(logs) ? logs : []).filter((l) => JSON.stringify(l).includes("Speculative sync of")).length
}

async function createProfile(ctx: ExtensionContext): Promise<string[]> {
	const page = await openOnboarding(ctx, { legal: "missing" })
	await clickByTestId(page, "onboarding-welcome-create")
	await acceptOnboardingTerms(page, "create")
	await clickByTestId(page, "onboarding-method-password")
	for (const id of ["onboarding-password-input", "onboarding-password-confirm"]) {
		await replaceInputValue(page, `[data-testid="${id}"]`, TEST_PASSWORD)
	}
	await clickByTestId(page, "onboarding-submit-create")
	await page.waitForSelector('[data-testid="onboarding-phrase-later"]', { visible: true, timeout: 60_000 })
	const words = await readRecoveryWords(page, "onboarding-phrase")
	await clickByTestId(page, "onboarding-phrase-later")
	await waitForHash(page, "#/onboarding/done", 10_000)
	await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": true }))
	await page.close()
	return words
}

async function restoreProfile(ctx: ExtensionContext, words: readonly string[]): Promise<void> {
	const page = await openOnboarding(ctx, { legal: "missing" })
	await clickByTestId(page, "onboarding-welcome-import")
	await acceptOnboardingTerms(page, "import")
	await importSeed(page, words.join(" "), TEST_PASSWORD, ONBOARDING_IMPORT_SHELL)
	await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": true }))
	await page.close()
}

/**
 * The wallet lists at least `count` Testnet tokens and Home's list is settled: every balance read,
 * nothing loading or refreshing. Home shows three rows at most, so the count comes from the wallet.
 */
async function waitSettled(page: Page, count: number, timeout = 15 * 60_000): Promise<void> {
	const end = Date.now() + timeout
	while (Date.now() < end) {
		const listed = await walletTokens(page).then(
			(rows) => rows.length,
			() => 0,
		)
		const quiet = await page
			.evaluate(
				() =>
					document.querySelector('[data-testid="tokens-list"][data-settled="true"]') !== null &&
					document.querySelector('[data-testid="token-balance-loading"]') === null &&
					document.querySelector('[data-testid="tokens-refreshing"]') === null,
			)
			.catch(() => false)
		if (listed >= count && quiet) return
		await new Promise((r) => setTimeout(r, 250))
	}
	mkdirSync(join(SCRATCH, "shots"), { recursive: true })
	await page.screenshot({ path: join(SCRATCH, "shots", `unsettled-${Date.now()}.png`) }).catch(() => undefined)
	throw new Error(`Home did not settle with ${count} tokens within ${Math.round(timeout / 1000)} s`)
}

async function blockNumber(): Promise<number | undefined> {
	return node.getBlockNumber().then(Number, () => undefined)
}

async function openTestnetHome(ctx: ExtensionContext): Promise<Page> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 60_000)
	return page
}

/** (c4) and (c6): a restored profile's first sync on Testnet, before and after its two custom tokens. */
async function firstSync(ctx: ExtensionContext, arm: Arm, words: readonly string[], custom: readonly string[], tag: object): Promise<Page> {
	await restoreProfile(ctx, words)
	const page = await openTestnetHome(ctx)
	await drain(ctx)
	const block = await blockNumber()
	const t0 = Date.now()
	await switchToNetwork(page, "Testnet")
	await waitSettled(page, 4)
	const c4 = Date.now() - t0
	record({ ...tag, w: "c4", arm, block, wallMs: c4, probe: await drain(ctx) })
	const t1 = Date.now()
	for (const address of custom) await importToken(page, address)
	await waitSettled(page, 4 + custom.length)
	record({ ...tag, w: "c6", arm, block: await blockNumber(), wallMs: Date.now() - t1, probe: await drain(ctx) })
	return page
}

/** (b): refreshes timed from the click until the dot clears and the instrument has seen the pass end. */
async function refreshPasses(ctx: ExtensionContext, page: Page, arm: Arm, passes: number, tag: object): Promise<void> {
	const heapBefore = await heapMb(ctx)
	for (let k = 1; k <= passes; k++) {
		await drain(ctx)
		const block = await blockNumber()
		const t0 = Date.now()
		await refreshBalances(page)
		await page.waitForSelector('[data-testid="tokens-refreshing"]', { timeout: 10_000 }).catch(() => {})
		await pollPage(page, (sel) => document.querySelector(sel) === null, '[data-testid="tokens-refreshing"]', 10 * 60_000, "the refresh")
		const wallMs = Date.now() - t0
		record({ ...tag, w: "b", arm, k, block, wallMs, probe: await drain(ctx) })
		await waitForNextBlock(block)
	}
	record({ ...tag, w: "heap", arm, heapBefore, heapAfter: await heapMb(ctx) })
}

async function waitForNextBlock(after: number | undefined, timeout = 5 * 60_000): Promise<void> {
	if (after === undefined) return
	const end = Date.now() + timeout
	while (Date.now() < end) {
		const now = await blockNumber()
		if (now !== undefined && now > after) return
		await new Promise((r) => setTimeout(r, 3_000))
	}
}

/** (a): private SIGNAL sends to an address nobody holds, paid by the SponsoredFPC; the instrument times the estimate and the proof. */
async function sends(ctx: ExtensionContext, page: Page, arm: Arm, symbol: string, count: number, tag: object): Promise<void> {
	const [tokenId] = await tokenIds(page, [symbol])
	for (let k = 1; k <= count; k++) {
		await drain(ctx)
		const block = await blockNumber()
		const t0 = Date.now()
		await sendOne(page, tokenId, await randomAztecAddress())
		record({ ...tag, w: "a", arm, k, block, wallMs: Date.now() - t0, probe: await drain(ctx) })
		await waitForNextBlock(block)
	}
}

async function sendOne(page: Page, tokenId: number, destination: string): Promise<void> {
	await navigateByHash(page, `#/popup/send?tokenId=${tokenId}`, 15_000)
	await page.waitForSelector('[data-testid="send-from-type"]', { timeout: 30_000 })
	await setActiveSendType(page, "send-from-type", "private")
	await setActiveSendType(page, "send-to-type", "private")
	await enterSendForm(page, { amount: "1", destination })
	await selectFeeMethod(page, "sponsored", { mountTimeoutMs: 120_000 })
	await pollPage(
		page,
		(sel) => {
			const btn = document.querySelector(sel) as HTMLElement | null
			return btn !== null && getComputedStyle(btn).pointerEvents !== "none"
		},
		'[data-testid="send-submit"]',
		180_000,
		"Send enabled",
	)
	await clickByTestId(page, "send-submit")
	await waitForToast(page, "Transaction submitted", 10 * 60_000)
}

async function walletTokens(page: Page): Promise<{ id: number; contract: string; symbol: string }[]> {
	const profileId = await captureSoleProfileId(page)
	return callService(page, TOKEN_SERVICE_NAME, "getTokens", [profileId, CHAIN_IDS.TESTNET])
}

async function tokenIds(page: Page, symbols: readonly string[]): Promise<number[]> {
	const rows = await walletTokens(page)
	return symbols.map((s) => {
		const row = rows.find((r) => r.symbol === s)
		if (!row) throw new Error(`token ${s} is not in the wallet`)
		return row.id
	})
}

/** One drip of `symbol`, approved in Nulo's execute window by the answerer; the dApp embeds the SponsoredFPC. */
async function drip(app: Page, symbol: string, kind: "public" | "private"): Promise<void> {
	const card = `[data-testid="tl-token-card"][data-symbol="${symbol}"]`
	await app.waitForSelector(card, { visible: true, timeout: 60_000 })
	await app.click(`${card} [data-testid="tl-btn-drip-${kind}"]`)
	const status = `${card} [data-testid="tl-drip-status"]`
	await pollPage(
		app,
		(sel) => ["ok", "error"].includes(document.querySelector(sel)?.getAttribute("data-drip-status") ?? ""),
		status,
		15 * 60_000,
		`the ${kind} ${symbol} drip`,
	)
	const outcome = await app.$eval(status, (el) => el.getAttribute("data-drip-status"))
	if (outcome !== "ok") throw new Error(`the ${kind} ${symbol} drip failed`)
}

/** Adds `symbol` to Nulo through the tools app and waits until the wallet lists it. */
async function addToWallet(app: Page, page: Page, symbol: string): Promise<void> {
	await app.click(`[data-testid="tl-token-card"][data-symbol="${symbol}"] [data-testid="tl-btn-add-to-wallet"]`)
	const end = Date.now() + 120_000
	while (Date.now() < end) {
		if ((await walletTokens(page)).some((r) => r.symbol === symbol)) return
		await new Promise((r) => setTimeout(r, 2_000))
	}
	throw new Error(`${symbol} never reached the wallet`)
}

async function tokenAddresses(page: Page, symbols: readonly string[]): Promise<string[]> {
	const rows = await walletTokens(page)
	return symbols.map((s) => {
		const row = rows.find((r) => r.symbol === s)
		if (!row) throw new Error(`token ${s} is not in the wallet`)
		return row.contract
	})
}

/** Setup: the profile all sessions restore, its drips, and the Holdings capture. */
async function setup(): Promise<{ words: string[]; custom: string[] }> {
	const ctx = await launch("off", true)
	try {
		const words = await createProfile(ctx)
		const page = await openTestnetHome(ctx)
		await switchToNetwork(page, "Testnet")
		await waitSettled(page, 4)
		const windows = answerNuloWindows(ctx, record)
		const app = await ctx.browser.newPage()
		try {
			await app.goto(`${TOOLS_ORIGIN}/`, { waitUntil: "networkidle2", timeout: 120_000 })
			await app.click('[data-testid="tl-tab-drip"]')
			await driveToolsConnected(app, "drip")
			for (const symbol of ["SIGNAL", "NOISE"]) {
				for (const kind of ["private", "public"] as const) await drip(app, symbol, kind)
				await addToWallet(app, page, symbol)
			}
		} finally {
			await windows.stop()
			await app.close().catch(() => undefined)
		}
		const custom = await tokenAddresses(page, ["SIGNAL", "NOISE"])
		await navigateByHash(page, "#/popup/general")
		await waitSettled(page, 6)
		mkdirSync(join(SCRATCH, "shots"), { recursive: true })
		await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }])
		await page.screenshot({ path: join(SCRATCH, "shots", "holdings-testnet-light.png") })
		record({ w: "setup", block: await blockNumber(), custom: custom.length })
		return { words, custom }
	} finally {
		await ctx.close()
	}
}

const ABBA: Arm[][] = [
	["on", "off"],
	["off", "on"],
	["off", "on"],
	["on", "off"],
]

async function session(arm: Arm, words: readonly string[], custom: readonly string[], tag: object, work: "cb" | "a"): Promise<void> {
	const ctx = await launch(arm, false)
	try {
		const config = (await drain(ctx)).config
		const page = await firstSync(ctx, arm, words, custom, tag)
		record({ ...tag, w: "config", arm, config })
		if (work === "cb") await refreshPasses(ctx, page, arm, 6, tag)
		else await sends(ctx, page, arm, "SIGNAL", 3, tag)
		record({ ...tag, w: "warnings", arm, speculative: await speculativeWarnings(page) })
	} catch (error) {
		record({ ...tag, w: "error", arm, message: scrub((error as Error)?.message ?? error).slice(0, 300) })
	} finally {
		await ctx.close()
	}
}

/** Unset on every run but the probe's own, so a suite run never reaches Testnet through this file. */
const MODE = process.env.PXE_FLAG_MODE

describe.skipIf(inject("liveLeg") !== true || MODE === undefined)("pxe-flag probe on the live Testnet", () => {
	test.runIf(MODE === "sessions")("sessions", { timeout: 6 * 60 * 60_000, retry: 0 }, async () => {
		const { words, custom } = await setup()
		for (const [pair, arms] of ABBA.entries()) {
			for (const arm of arms) await session(arm, words, custom, { pair: pair + 1 }, "cb")
		}
		for (const [pair, arms] of ABBA.slice(0, 3).entries()) {
			for (const arm of arms) await session(arm, words, custom, { pair: pair + 1 }, "a")
		}
	})

	test.runIf(MODE === "bridge" || MODE === "dryrun")("bridge", { timeout: 4 * 60 * 60_000, retry: 0 }, async () => {
		const signer = await l1SignerFromEnv(MODE === "dryrun")
		const ctx = await launch("off", true)
		let words: string[] = []
		try {
			words = await createProfile(ctx)
			const page = await openTestnetHome(ctx)
			await switchToNetwork(page, "Testnet")
			await waitSettled(page, 4)
			await bridgeTokens({ ctx, signer, symbols: ["USDC", "USDT"], arm: "off", record, drain: () => drain(ctx) })
		} finally {
			await ctx.close()
		}
		if (MODE === "dryrun") return
		const on = await launch("on", true)
		try {
			await restoreProfile(on, words)
			const page = await openTestnetHome(on)
			await switchToNetwork(page, "Testnet")
			await waitSettled(page, 4)
			await bridgeTokens({ ctx: on, signer, symbols: ["EURC", "GBPC"], arm: "on", record, drain: () => drain(on) })
			await refreshPasses(on, page, "on", 6, { funded: true })
		} finally {
			await on.close()
		}
		const off = await launch("off", false)
		try {
			const page = await firstSync(off, "off", words, [], { funded: true })
			await refreshPasses(off, page, "off", 6, { funded: true })
		} finally {
			await off.close()
		}
	})
})
