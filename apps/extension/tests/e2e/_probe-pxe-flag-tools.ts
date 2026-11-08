/**
 * The probe's drivers for the unleashed tools app: its connect flow, every Nulo approval window it
 * raises, and an EIP-1193 Sepolia wallet answered from Node. The wallet signs only the bridge's own
 * calls (a test-token mint, a Permit2 approval, `bridgeWithPermit`, a Permit2 witness for the
 * router) and refuses everything else; an allowed call can still carry amounts the page chose, so
 * the throwaway key's Sepolia ETH and test tokens stay exposed to the page, a known limit.
 */
import type { Page, Target } from "puppeteer"
import { type Address, type Hex, createPublicClient, createWalletClient, decodeFunctionData, http, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { waitForTarget } from "./fixtures/browser"
import { patchPagePolling } from "./fixtures/dom"
import type { ExtensionContext } from "./fixtures/extension"
import { approveCapabilities, approveDiscover, approveExecute, approveVerify, waitForMainFrame } from "./fixtures/popups"

export const TOOLS_ORIGIN = "https://testnet.app.unleashed.systems"

/** unleashed `apps/tools/public/testnet-bridge.json` at 7de51e7. */
const BRIDGE = {
	permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
	depositRouter: "0x6e5566894908e945a12245f9810b4055c4a1035b",
	erc20: {
		USDC: "0x8648424f0eae2368555d080c948b622d992651fc",
		USDT: "0x8badb545be5d79f28d516844bf1713cc7a3f238f",
		EURC: "0xc10bcb5a0519934e68b489a3a89ee28af8624d24",
		GBPC: "0x177ead2a677858e376941390548fcf01a6ebefca",
	} as Record<string, Address>,
} as const
const SEPOLIA_HEX = "0xaa36a7"
const BRIDGE_WITH_PERMIT = "0xefdd760e"
const ERC20_WRITES = parseAbi(["function approve(address spender, uint256 amount)", "function mint(address to, uint256 amount)"])
const READS = new Set([
	"eth_blockNumber",
	"eth_call",
	"eth_estimateGas",
	"eth_feeHistory",
	"eth_gasPrice",
	"eth_getBalance",
	"eth_getBlockByHash",
	"eth_getBlockByNumber",
	"eth_getCode",
	"eth_getLogs",
	"eth_getStorageAt",
	"eth_getTransactionByHash",
	"eth_getTransactionCount",
	"eth_getTransactionReceipt",
	"eth_maxPriorityFeePerGas",
])
const MIN_WEI = 20_000_000_000_000_000n

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const lower = (s: unknown) => String(s ?? "").toLowerCase()
/** Error text with every URL cut, so no node address reaches a log, a record or the page. */
export const scrub = (s: unknown) => String(s ?? "").replace(/\b(?:https?|wss?):\/\/\S+/gi, "<url>")
const rpcError = (code: number, message: string) => Object.assign(new Error(message), { code })
const refusal = (why: string) => rpcError(4001, `refused by the probe wallet: ${why}`)

export interface L1Signer {
	readonly address: Address
	readonly dryrun: boolean
	/** Signing requests the wallet refused. */
	readonly refused: number
	/** Transactions and signatures it produced. */
	readonly signed: number
	handle(method: string, params: unknown[]): Promise<unknown>
}

type Sign = { tx(tx: Record<string, string | undefined>): Promise<Hex>; typed(data: Record<string, unknown>): Promise<Hex> }
type Read = (method: string, params: unknown[]) => Promise<unknown>

function checkTx(tx: Record<string, string | undefined>, self: Address): void {
	if (tx.from && lower(tx.from) !== lower(self)) throw refusal("another sender")
	if (tx.value && BigInt(tx.value) !== 0n) throw refusal("a transaction carrying ETH")
	const to = lower(tx.to)
	const data = (tx.data ?? "0x") as Hex
	if (to === BRIDGE.depositRouter) {
		if (!data.startsWith(BRIDGE_WITH_PERMIT)) throw refusal("a router call other than bridgeWithPermit")
		return
	}
	if (!Object.values(BRIDGE.erc20).includes(to as Address)) throw refusal("a target outside the bridge")
	const call = decodeFunctionData({ abi: ERC20_WRITES, data })
	if (call.functionName === "approve" && lower(call.args[0]) !== BRIDGE.permit2)
		throw refusal("an approval to a spender other than Permit2")
	if (call.functionName === "mint" && lower(call.args[0]) !== lower(self)) throw refusal("a mint to another address")
}

function checkTyped(data: Record<string, unknown>): void {
	const domain = data.domain as { chainId?: unknown; verifyingContract?: unknown } | undefined
	const message = data.message as { spender?: unknown; permitted?: { token?: unknown } } | undefined
	if (data.primaryType !== "PermitWitnessTransferFrom") throw refusal("typed data other than a Permit2 witness transfer")
	if (lower(domain?.verifyingContract) !== BRIDGE.permit2 || Number(domain?.chainId) !== 11155111)
		throw refusal("a domain other than Sepolia's Permit2")
	if (lower(message?.spender) !== BRIDGE.depositRouter) throw refusal("a spender other than the deposit router")
	if (!Object.values(BRIDGE.erc20).includes(lower(message?.permitted?.token) as Address)) throw refusal("a token outside the bridge")
}

function makeSigner(address: Address, dryrun: boolean, sign: Sign | undefined, read: Read | undefined): L1Signer {
	const counts = { refused: 0, signed: 0 }
	const produce = async (method: string, params: unknown[]): Promise<Hex> => {
		if (!sign) throw refusal("the dry run signs nothing")
		if (method === "eth_sendTransaction") {
			const tx = params[0] as Record<string, string | undefined>
			checkTx(tx, address)
			return sign.tx(tx)
		}
		const typed = JSON.parse(String(params[1])) as Record<string, unknown>
		checkTyped(typed)
		return sign.typed(typed)
	}
	const signing = async (method: string, params: unknown[]): Promise<Hex> => {
		try {
			const out = await produce(method, params)
			counts.signed++
			return out
		} catch (error) {
			if ((error as { code?: number }).code === 4001) counts.refused++
			throw error
		}
	}
	const local: Record<string, (params: unknown[]) => unknown> = {
		eth_requestAccounts: () => [address],
		eth_accounts: () => [address],
		eth_chainId: () => SEPOLIA_HEX,
		net_version: () => "11155111",
		wallet_getCapabilities: () => ({ [SEPOLIA_HEX]: { atomic: { status: "unsupported" } } }),
		wallet_switchEthereumChain: (params) => {
			if (lower((params[0] as { chainId?: string } | undefined)?.chainId) === SEPOLIA_HEX) return null
			throw rpcError(4902, "the probe wallet is on Sepolia only")
		},
	}
	return {
		address,
		dryrun,
		get refused() {
			return counts.refused
		},
		get signed() {
			return counts.signed
		},
		async handle(method, params) {
			const answer = local[method]
			if (answer) return answer(params)
			if (method === "eth_sendTransaction" || method === "eth_signTypedData_v4") return signing(method, params)
			if (!READS.has(method)) throw rpcError(4200, `the probe wallet does not support ${method}`)
			if (!read) throw rpcError(-32603, "the dry run has no L1 reader")
			return read(method, params)
		},
	}
}

/**
 * The keyed run's wallet, built from `NULO_PROBE_L1_PRIVATE_KEY` and `SEPOLIA_RPC_URL`, which leave
 * the environment here, before any browser starts. Prints only the address, then waits up to an
 * hour for Sepolia ETH. The dry run knows a public address (`NULO_PROBE_L1_ADDRESS`, else the burn
 * address), reads nothing and signs nothing.
 */
export async function l1SignerFromEnv(dryrun: boolean): Promise<L1Signer> {
	if (dryrun) {
		const address = (process.env.NULO_PROBE_L1_ADDRESS ?? "0x000000000000000000000000000000000000dEaD") as Address
		return makeSigner(address, true, undefined, undefined)
	}
	const key = process.env.NULO_PROBE_L1_PRIVATE_KEY
	const rpc = process.env.SEPOLIA_RPC_URL
	delete process.env.NULO_PROBE_L1_PRIVATE_KEY
	delete process.env.SEPOLIA_RPC_URL
	if (!key || !rpc) throw new Error("the keyed run's variables are missing")
	const account = privateKeyToAccount(key as Hex)
	const transport = http(rpc, { retryCount: 3 })
	const pub = createPublicClient({ chain: sepolia, transport })
	const wallet = createWalletClient({ account, chain: sepolia, transport })
	const big = (v: string | undefined) => (v === undefined ? undefined : BigInt(v))
	const sign: Sign = {
		tx: (tx) =>
			wallet.sendTransaction({
				to: tx.to as Address,
				data: tx.data as Hex | undefined,
				gas: big(tx.gas),
				maxFeePerGas: big(tx.maxFeePerGas),
				maxPriorityFeePerGas: big(tx.maxPriorityFeePerGas),
				nonce: tx.nonce === undefined ? undefined : Number(BigInt(tx.nonce)),
			} as never),
		typed: (data) => {
			const { EIP712Domain: _drop, ...types } = data.types as Record<string, unknown>
			return account.signTypedData({ domain: data.domain, types, primaryType: data.primaryType, message: data.message } as never)
		},
	}
	const read: Read = (method, params) => pub.request({ method, params } as never)
	console.log(`[pxe-flag] probe L1 address ${account.address}: send it at least 0.05 Sepolia ETH; waiting up to 60 min`)
	const end = Date.now() + 60 * 60_000
	for (;;) {
		const wei = await pub.getBalance({ address: account.address }).catch(() => 0n)
		if (wei >= MIN_WEI) break
		if (Date.now() > end) throw new Error("the probe L1 address was not funded within 60 min")
		await sleep(30_000)
	}
	console.log("[pxe-flag] probe L1 address funded")
	return makeSigner(account.address, false, sign, read)
}

/** Installs `window.ethereum` on `page` before any of its documents runs; call before `goto`. */
export async function installL1(page: Page, signer: L1Signer): Promise<void> {
	await page.exposeFunction("__probeL1Request", async (json: string) => {
		const { method, params } = JSON.parse(json) as { method: string; params?: unknown[] }
		try {
			return JSON.stringify({ result: (await signer.handle(method, params ?? [])) ?? null })
		} catch (error) {
			const e = error as { code?: number; shortMessage?: string; message?: string }
			return JSON.stringify({ error: { code: e.code ?? -32603, message: scrub(e.shortMessage ?? e.message ?? error) } })
		}
	})
	await page.evaluateOnNewDocument(() => {
		const listeners = new Map<string, Set<(v: unknown) => void>>()
		const w = window as unknown as { __probeL1Request(json: string): Promise<string>; ethereum?: unknown }
		const provider = {
			async request(args: { method: string; params?: unknown[] }) {
				const reply = JSON.parse(await w.__probeL1Request(JSON.stringify(args))) as {
					result?: unknown
					error?: { code: number; message: string }
				}
				if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code })
				return reply.result
			},
			on(event: string, fn: (v: unknown) => void) {
				listeners.set(event, (listeners.get(event) ?? new Set()).add(fn))
				return provider
			},
			removeListener(event: string, fn: (v: unknown) => void) {
				listeners.get(event)?.delete(fn)
				return provider
			},
		}
		Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: false })
	})
}

const tid = (id: string) => `[data-testid="${id}"]`

function visible(page: Page, selector: string): Promise<boolean> {
	return page
		.evaluate((sel: string) => {
			const el = document.querySelector(sel) as HTMLElement | null
			return el?.checkVisibility() === true
		}, selector)
		.catch(() => false)
}

async function tap(page: Page, selector: string): Promise<void> {
	await page.click(selector).catch(() => undefined)
}

/** Drives the tools app's Aztec connection to `connected`, answering each stop on its side as it shows. */
type ConnectIds = { connect: string; status: string }

/** One look at the tools app's side of the connection, one answer; returns when Connect was last pressed. */
async function answerToolsStop(app: Page, ids: ConnectIds, state: string | null, lastClick: number): Promise<number> {
	const row = tid("tl-wallet-picker-row")
	if (await visible(app, tid("tl-btn-verify-confirm"))) await tap(app, tid("tl-btn-verify-confirm"))
	else if (await visible(app, tid("tl-verification-modal"))) return lastClick
	else if (await visible(app, tid("tl-account-choice"))) throw new Error("the tools app asked to choose an account")
	else if (await visible(app, row)) await tap(app, `${row} ${tid("tl-wallet-picker-connect")}`)
	else if ((state === "idle" || state === "error" || state === null) && Date.now() - lastClick > 20_000) {
		await tap(app, tid(ids.connect))
		return Date.now()
	}
	return lastClick
}

/** Drives the tools app's Aztec connection to `connected`; Nulo's own windows are the answerer's. */
export async function driveToolsConnected(app: Page, panel: "bridge" | "drip", timeoutMs = 5 * 60_000): Promise<void> {
	const ids: ConnectIds =
		panel === "bridge"
			? { connect: "tl-bridge-l2-connect", status: "tl-bridge-l2-status" }
			: { connect: "tl-btn-connect", status: "tl-status" }
	const end = Date.now() + timeoutMs
	let lastClick = 0
	while (Date.now() < end) {
		const state = await app.$eval(tid(ids.status), (el) => el.getAttribute("data-status")).catch(() => null)
		if (state === "connected") return
		lastClick = await answerToolsStop(app, ids, state, lastClick)
		await sleep(700)
	}
	throw new Error("the tools app never reached connected")
}

const WINDOW_KINDS = ["discover", "verify", "capabilities", "execute", "fee", "network-unavailable"] as const
type WindowKind = (typeof WINDOW_KINDS)[number]

function kindOf(url: string): WindowKind | undefined {
	return WINDOW_KINDS.find((k) => url.includes(`#/windows/${k}?`) || url.endsWith(`#/windows/${k}`))
}

/**
 * Answers every Nulo window the tools app raises, each as it opens: allow, the emoji check,
 * capabilities as offered, execute with the fee method the window picked. A fee or network window
 * is recorded and left open, which fails the step that raised it.
 */
export function answerNuloWindows(ctx: ExtensionContext, record: (row: Record<string, unknown>) => void) {
	const handled = new Set<string>()
	const inFlight = new Set<Promise<void>>()
	let stopped = false
	const answer = async (target: Target, kind: WindowKind) => {
		const t0 = Date.now()
		try {
			const page = await target.asPage()
			await waitForMainFrame(page, 15_000)
			patchPagePolling(page)
			if (kind === "discover") await approveDiscover(page)
			else if (kind === "verify") await approveVerify(page)
			else if (kind === "capabilities") await approveCapabilities(page)
			else if (kind === "execute") await approveExecute(page, { approvableTimeoutMs: 10 * 60_000 })
			record({ w: "window", kind, ms: Date.now() - t0, ok: kind === "fee" || kind === "network-unavailable" ? "left" : true })
		} catch (error) {
			record({ w: "window", kind, ms: Date.now() - t0, ok: false, message: scrub((error as Error)?.message).slice(0, 200) })
		}
	}
	const loop = (async () => {
		while (!stopped) {
			const target = await waitForTarget(
				ctx.browser,
				(t) => t.type() === "page" && kindOf(t.url()) !== undefined && !handled.has(t.url()),
				3_000,
			).catch(() => undefined)
			if (!target) continue
			const url = target.url()
			handled.add(url)
			const p = answer(target, kindOf(url) as WindowKind).finally(() => inFlight.delete(p))
			inFlight.add(p)
		}
	})()
	return {
		async stop(): Promise<void> {
			stopped = true
			await loop
			await Promise.allSettled([...inFlight])
		},
	}
}

/**
 * Polls `fn(arg)` in the page until it holds. A long `waitForFunction` is one CDP call, which the
 * protocol timeout kills long before a Testnet sync settles.
 */
export async function pollPage<A>(
	page: Page,
	fn: (arg: A) => boolean | undefined,
	arg: A,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const end = Date.now() + timeoutMs
	while (Date.now() < end) {
		// biome-ignore lint/suspicious/noExplicitAny: Puppeteer flattens handle types in its own signature.
		if (await page.evaluate(fn as any, arg).catch(() => false)) return
		await sleep(500)
	}
	throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s: ${label}`)
}

function waitVisible(page: Page, selector: string, timeout: number): Promise<void> {
	return pollPage(
		page,
		(sel) => (document.querySelector(sel) as HTMLElement | null)?.checkVisibility() === true,
		selector,
		timeout,
		selector,
	)
}

function waitEnabled(page: Page, selector: string, timeout: number): Promise<void> {
	return pollPage(
		page,
		(sel) => {
			const el = document.querySelector(sel) as HTMLButtonElement | null
			return el?.checkVisibility() && !el.disabled && el.getAttribute("aria-disabled") !== "true"
		},
		selector,
		timeout,
		`${selector} enabled`,
	)
}

/** CONTINUE once the amount step has stopped quoting, then the review. */
async function goToReview(app: Page): Promise<void> {
	await waitEnabled(app, tid("tl-send-amount-next"), 120_000)
	await pollPage(
		app,
		(sel) => document.querySelector(sel)?.getAttribute("data-route-loading") !== "true",
		tid("tl-send-step-amount"),
		120_000,
		"the route quote",
	)
	await app.click(tid("tl-send-amount-next"))
	await waitVisible(app, tid("tl-send-step-review"), 60_000)
}

type Pressed = "left" | "stale" | "pending"

/** Where a pressed confirm has got to; a review error beside a live Confirm is a refusal. */
async function pressedOutcome(app: Page): Promise<Pressed> {
	for (const sel of ["tl-bridge-stepper", "tl-bridge-receipt", "tl-send-grant-pending"]) if (await visible(app, tid(sel))) return "left"
	if (await visible(app, tid("tl-send-review-stale"))) return "stale"
	if ((await visible(app, tid("tl-send-review-error"))) && (await app.$(`${tid("tl-send-review-confirm")}:enabled`))) {
		const why = await app.$eval(tid("tl-send-review-error"), (el) => el.textContent ?? "")
		throw new Error(`the review refused the confirm: ${scrub(why).trim().slice(0, 200)}`)
	}
	return "pending"
}

async function pressConfirm(app: Page): Promise<Pressed> {
	await app.click(tid("tl-send-review-confirm"))
	const end = Date.now() + 10 * 60_000
	while (Date.now() < end) {
		const pressed = await pressedOutcome(app)
		if (pressed !== "pending") return pressed
		await sleep(1_000)
	}
	return "pending"
}

/** Confirms the review; a review a late read stood down is reviewed again, at most four times. */
async function confirmReview(app: Page): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt++) {
		await pollPage(
			app,
			([confirm, stale]) => {
				const c = document.querySelector(confirm) as HTMLButtonElement | null
				const s = document.querySelector(stale) as HTMLElement | null
				return (c !== null && !c.disabled && c.checkVisibility()) || s?.checkVisibility() === true
			},
			[tid("tl-send-review-confirm"), tid("tl-send-review-stale")] as const,
			120_000,
			"a live Confirm or a stand-down",
		)
		if (!(await visible(app, tid("tl-send-review-stale"))) && (await pressConfirm(app)) === "left") return
		await goToReview(app)
	}
	throw new Error("the review was stood down four times in a row")
}

export interface BridgeRun {
	ctx: ExtensionContext
	signer: L1Signer
	symbols: readonly string[]
	arm: "on" | "off"
	amount?: string
	record(row: Record<string, unknown>): void
	drain(): Promise<unknown>
}

async function mintL1(app: Page, signer: L1Signer, symbol: string): Promise<void> {
	const tile = `${tid("tl-send-token-tile")}[data-key="11155111:${BRIDGE.erc20[symbol]}"]`
	const balance = `${tile} ${tid("tl-send-token-balance")}`
	await waitVisible(app, tile, 120_000)
	const before = await app.$eval(balance, (el) => el.textContent ?? "").catch(() => "")
	const signedBefore = signer.signed
	const refusedBefore = signer.refused
	await app.click(`${tid("tl-mint-l1-card")} ${tid("tl-mint-l1")}[data-symbol="${symbol}"]`)
	const end = Date.now() + 10 * 60_000
	while (Date.now() < end) {
		if (signer.refused > refusedBefore) throw new Error(`the ${symbol} mint was refused by the probe wallet`)
		if (signer.signed > signedBefore) {
			const now = await app.$eval(balance, (el) => el.textContent ?? "").catch(() => before)
			if (now !== before && /\d/.test(now)) return
		}
		await sleep(2_000)
	}
	throw new Error(`the ${symbol} mint did not land within 10 min`)
}

/** The token's tile → amount → "Token + gas" → private: the wizard left on its amount step. */
async function chooseTokenGasPrivate(app: Page, symbol: string, amount: string): Promise<void> {
	await app.click(`${tid("tl-send-token-tile")}[data-key="11155111:${BRIDGE.erc20[symbol]}"]`)
	await waitVisible(app, tid("tl-send-step-amount"), 60_000)
	await app.type(tid("tl-send-amount-input"), amount)
	await waitEnabled(app, tid("tl-send-choice-token-gas"), 120_000)
	await app.click(tid("tl-send-choice-token-gas"))
	await app.waitForSelector(`${tid("tl-send-choice-token-gas")}[aria-checked="true"]`, { timeout: 10_000 })
	const toggle = tid("tl-send-private-toggle")
	if ((await app.$eval(toggle, (el) => el.getAttribute("aria-checked"))) !== "true") await app.click(toggle)
	await app.waitForSelector(`${toggle}[aria-checked="true"]`, { timeout: 10_000 })
}

/** The address-only rehearsal: the mint's signature is refused, then the choice is made as the run would. */
async function rehearse(app: Page, run: BridgeRun, symbol: string): Promise<void> {
	const refusedBefore = run.signer.refused
	await app.click(`${tid("tl-mint-l1-card")} ${tid("tl-mint-l1")}[data-symbol="${symbol}"]`).catch(() => undefined)
	const end = Date.now() + 120_000
	while (Date.now() < end && run.signer.refused === refusedBefore) await sleep(1_000)
	const choice = await chooseTokenGasPrivate(app, symbol, run.amount ?? "90").then(
		() => "token+gas private selected",
		(error) => `stopped: ${scrub((error as Error)?.message).slice(0, 160)}`,
	)
	run.record({ w: "dryrun", arm: run.arm, symbol, reachedFirstSignature: run.signer.refused > refusedBefore, choice })
}

/** One private "Token + gas" deposit, timed from confirm to the receipt; the claim is approved in Nulo. */
async function depositOne(app: Page, run: BridgeRun, symbol: string): Promise<void> {
	await mintL1(app, run.signer, symbol)
	await chooseTokenGasPrivate(app, symbol, run.amount ?? "90")
	await goToReview(app)
	await run.drain()
	const t0 = Date.now()
	await confirmReview(app)
	await waitVisible(app, tid("tl-bridge-receipt"), 60 * 60_000)
	run.record({ w: "bridge", arm: run.arm, symbol, wallMs: Date.now() - t0, probe: await run.drain() })
	await app.click(tid("tl-receipt-new-bridge"))
	await waitVisible(app, tid("tl-send-step-token"), 60_000)
}

/**
 * Bridges each symbol privately as "Token + gas" through the tools app's Send wizard. The dry run
 * rehearses the first symbol only, up to the signature its wallet refuses and the choice after it.
 */
export async function bridgeTokens(run: BridgeRun): Promise<void> {
	const { ctx, signer, record } = run
	const app = await ctx.browser.newPage()
	await installL1(app, signer)
	const windows = answerNuloWindows(ctx, (row) => record({ ...row, arm: run.arm }))
	try {
		await app.goto(`${TOOLS_ORIGIN}/`, { waitUntil: "networkidle2", timeout: 120_000 })
		await app.click(tid("tl-tab-send"))
		await waitVisible(app, tid("tl-send-view"), 60_000)
		await app.click(tid("tl-l1-connect"))
		await app.waitForSelector(`${tid("tl-l1-status")}[data-connected="true"]`, { timeout: 60_000 })
		await driveToolsConnected(app, "bridge")
		record({ w: "bridge-connected", arm: run.arm })
		for (const symbol of signer.dryrun ? run.symbols.slice(0, 1) : run.symbols) {
			await app.click(tid("tl-send-direction-deposit"))
			if (signer.dryrun) await rehearse(app, run, symbol)
			else await depositOne(app, run, symbol)
		}
	} finally {
		await windows.stop()
		await app.close().catch(() => undefined)
	}
}
