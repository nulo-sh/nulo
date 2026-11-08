/**
 * The probe's drivers for the unleashed tools app: its connect flow, every Nulo approval window it
 * raises, and an EIP-1193 Sepolia wallet answered from Node. The wallet signs only the bridge's own
 * requests (a test-token mint, a Permit2 approval, the recovery-key message that seals a private
 * deposit, a Permit2 witness for the router, `bridgeWithPermit`), one deposit per arming, and refuses
 * everything else; an allowed request can still carry what the page chose, so the throwaway key's
 * Sepolia ETH and test tokens stay exposed to the page, a known limit.
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import type { Page, Target } from "puppeteer"
import {
	type Address,
	type Hex,
	createPublicClient,
	createWalletClient,
	decodeFunctionData,
	encodeFunctionData,
	hexToString,
	http,
	parseAbi,
	parseUnits,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { waitForTarget } from "./fixtures/browser"
import { patchPagePolling } from "./fixtures/dom"
import type { ExtensionContext } from "./fixtures/extension"
import { approveCapabilities, approveDiscover, approveExecute, approveVerify, waitForMainFrame } from "./fixtures/popups"

export const TOOLS_ORIGIN = "https://testnet.app.unleashed.systems"

/** unleashed `apps/tools/public/testnet-bridge.json` at 7de51e7, which the deployed app still serves. */
const BRIDGE = {
	permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
	depositRouter: "0x6e5566894908e945a12245f9810b4055c4a1035b",
	erc20: {
		USDC: "0x8648424f0eae2368555d080c948b622d992651fc",
		USDT: "0x8badb545be5d79f28d516844bf1713cc7a3f238f",
		EURC: "0xc10bcb5a0519934e68b489a3a89ee28af8624d24",
		GBPC: "0x177ead2a677858e376941390548fcf01a6ebefca",
	} as Record<string, Address>,
	portal: {
		USDC: "0x8128d00bb1349e1b21d2281167925e9e3187fb74",
		USDT: "0xe4b6a28350ad82eb03b3167587d6cb06c096c247",
		EURC: "0x6535a0f1426524a8ed5bb64692e7645c033d15cc",
		GBPC: "0x717ae3636685489c87cf331af663cfa75723d0d9",
	} as Record<string, Address>,
} as const
/** All four bridged test tokens have 6 decimals. */
const DECIMALS = 6
const SEPOLIA_ID = 11155111
const SEPOLIA_HEX = "0xaa36a7"
const BRIDGE_WITH_PERMIT = "0xefdd760e"
const ERC20_WRITES = parseAbi(["function approve(address spender, uint256 amount)", "function mint(address to, uint256 amount)"])
const BALANCE_OF = parseAbi(["function balanceOf(address owner) view returns (uint256)"])
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

/** One signing request as the wallet saw it: what it would have been, and whether it was refused. */
export interface L1Step {
	step: string
	method: string
	why?: string
	/** A refused request that passed every check: only the dry run refuses those. */
	allowed?: boolean
}

export interface L1Signer {
	readonly address: Address
	readonly dryrun: boolean
	/** Signing requests the wallet refused. */
	readonly refused: number
	/** Transactions and signatures it produced. */
	readonly signed: number
	/** Allows ONE deposit of at most `units` of `symbol`: its approval, seals, permit and router call. */
	arm(symbol: string, units: bigint): void
	/** The address's balance of `symbol`; undefined when the run has no L1 reader. */
	balanceOf(symbol: string): Promise<bigint | undefined>
	onStep(fn: (step: L1Step) => void): void
	handle(method: string, params: unknown[]): Promise<unknown>
}

type Sign = {
	tx(tx: Record<string, string | undefined>): Promise<Hex>
	typed(data: Record<string, unknown>): Promise<Hex>
	message(raw: Hex): Promise<Hex>
}
type Read = (method: string, params: unknown[]) => Promise<unknown>

/** What the wallet may still sign: a mint and an approval once per token, one deposit per arming. */
interface Budget {
	armed?: { symbol: string; units: bigint; permit: boolean; deposit: boolean }
	minted: Set<string>
	approved: Set<string>
}

const symbolOf = (token: unknown) => Object.keys(BRIDGE.erc20).find((s) => BRIDGE.erc20[s] === lower(token))

function armedFor(budget: Budget, what: string) {
	if (!budget.armed) throw refusal(`${what} with no deposit armed`)
	return budget.armed
}

function checkTokenWrite(to: string, data: Hex, self: Address, budget: Budget): string {
	const symbol = symbolOf(to)
	if (!symbol) throw refusal("a target outside the bridge")
	const call = decodeFunctionData({ abi: ERC20_WRITES, data })
	if (call.functionName === "mint") {
		if (lower(call.args[0]) !== lower(self)) throw refusal("a mint to another address")
		if (budget.minted.has(symbol)) throw refusal(`a second ${symbol} mint`)
		budget.minted.add(symbol)
		return "mint-signed"
	}
	if (lower(call.args[0]) !== BRIDGE.permit2) throw refusal("an approval to a spender other than Permit2")
	if (armedFor(budget, "an approval").symbol !== symbol) throw refusal("an approval of a token other than the armed one")
	if (budget.approved.has(symbol)) throw refusal(`a second ${symbol} approval`)
	budget.approved.add(symbol)
	return "approve-signed"
}

function checkTx(tx: Record<string, string | undefined>, self: Address, budget: Budget): string {
	if (tx.from && lower(tx.from) !== lower(self)) throw refusal("another sender")
	if (tx.value && BigInt(tx.value) !== 0n) throw refusal("a transaction carrying ETH")
	const data = (tx.data ?? "0x") as Hex
	if (lower(tx.to) !== BRIDGE.depositRouter) return checkTokenWrite(lower(tx.to), data, self, budget)
	if (!data.startsWith(BRIDGE_WITH_PERMIT)) throw refusal("a router call other than bridgeWithPermit")
	const armed = armedFor(budget, "a deposit")
	if (armed.deposit) throw refusal("a second deposit for one arming")
	armed.deposit = true
	return "deposit-signed"
}

function checkTyped(data: Record<string, unknown>, budget: Budget): string {
	const domain = data.domain as { chainId?: unknown; verifyingContract?: unknown } | undefined
	const message = data.message as { spender?: unknown; permitted?: { token?: unknown; amount?: unknown } } | undefined
	if (data.primaryType !== "PermitWitnessTransferFrom") throw refusal("typed data other than a Permit2 witness transfer")
	if (lower(domain?.verifyingContract) !== BRIDGE.permit2 || Number(domain?.chainId) !== SEPOLIA_ID)
		throw refusal("a domain other than Sepolia's Permit2")
	if (lower(message?.spender) !== BRIDGE.depositRouter) throw refusal("a spender other than the deposit router")
	const armed = armedFor(budget, "a permit")
	if (symbolOf(message?.permitted?.token) !== armed.symbol) throw refusal("a permit for a token other than the armed one")
	if (BigInt(String(message?.permitted?.amount ?? "0")) > armed.units) throw refusal("a permit above the measured deposit")
	if (armed.permit) throw refusal("a second permit for one arming")
	armed.permit = true
	return "permit-signed"
}

/** The tools app's recovery-key text (its site and legacy forms), naming the armed token's Sepolia portal. */
function checkSeal(text: string, budget: Budget): string {
	const armed = armedFor(budget, "a recovery-key signature")
	const portal = BRIDGE.portal[armed.symbol]
	const lines = text.split("\n")
	const site =
		lines[0] === "Unleashed: unlock one transfer's recovery data" &&
		lines.includes(`Site: ${TOOLS_ORIGIN}`) &&
		lines.includes(`Chain: ${SEPOLIA_ID}`) &&
		lines.includes(`Portal: ${portal}`) &&
		lines.at(-1) === "Signing is free. It is not a transaction and moves no funds."
	const legacy =
		lines.length === 3 &&
		lines[0]?.startsWith("Unleashed Bridge recovery key v1") === true &&
		lines[1] === "This is not a transaction and costs nothing." &&
		new RegExp(`^chain=${SEPOLIA_ID} portal=${portal} bridge=0x[0-9a-f]+ record=0x[0-9a-f]+$`).test(lines[2] ?? "")
	if (!site && !legacy) throw refusal("a message other than the armed deposit's recovery key")
	return "seal-signed"
}

/** The step a signing request would be, after every check; throws a 4001 refusal otherwise. */
function checkRequest(method: string, params: unknown[], self: Address, budget: Budget): string {
	if (method === "eth_sendTransaction") return checkTx(params[0] as Record<string, string | undefined>, self, budget)
	if (method === "eth_signTypedData_v4") {
		if (lower(params[0]) !== lower(self)) throw refusal("another signer")
		return checkTyped(JSON.parse(String(params[1])) as Record<string, unknown>, budget)
	}
	if (lower(params[1]) !== lower(self)) throw refusal("another signer")
	return checkSeal(hexToString(params[0] as Hex), budget)
}

const SIGNING = new Set(["eth_sendTransaction", "eth_signTypedData_v4", "personal_sign"])

function produce(sign: Sign, method: string, params: unknown[]): Promise<Hex> {
	if (method === "eth_sendTransaction") return sign.tx(params[0] as Record<string, string | undefined>)
	if (method === "eth_signTypedData_v4") return sign.typed(JSON.parse(String(params[1])) as Record<string, unknown>)
	return sign.message(params[0] as Hex)
}

function localAnswers(address: Address): Record<string, (params: unknown[]) => unknown> {
	return {
		eth_requestAccounts: () => [address],
		eth_accounts: () => [address],
		eth_chainId: () => SEPOLIA_HEX,
		net_version: () => String(SEPOLIA_ID),
		wallet_getCapabilities: () => ({ [SEPOLIA_HEX]: { atomic: { status: "unsupported" } } }),
		wallet_switchEthereumChain: (params) => {
			if (lower((params[0] as { chainId?: string } | undefined)?.chainId) === SEPOLIA_HEX) return null
			throw rpcError(4902, "the probe wallet is on Sepolia only")
		},
	}
}

function makeSigner(address: Address, sign: Sign | undefined, read: Read | undefined): L1Signer {
	const counts = { refused: 0, signed: 0 }
	const budget: Budget = { minted: new Set(), approved: new Set() }
	const listeners: ((step: L1Step) => void)[] = []
	const emit = (step: L1Step) => {
		for (const fn of listeners) fn(step)
	}
	const local = localAnswers(address)
	const signing = async (method: string, params: unknown[]): Promise<Hex> => {
		let step: string | undefined
		try {
			step = checkRequest(method, params, address, budget)
			if (!sign) throw refusal("the dry run signs nothing")
			const out = await produce(sign, method, params)
			counts.signed++
			emit({ step, method })
			return out
		} catch (error) {
			if ((error as { code?: number }).code === 4001) counts.refused++
			emit({ step: "refused", method, why: scrub((error as Error)?.message).slice(0, 160), allowed: step !== undefined })
			throw error
		}
	}
	return {
		address,
		dryrun: sign === undefined,
		get refused() {
			return counts.refused
		},
		get signed() {
			return counts.signed
		},
		arm(symbol, units) {
			budget.armed = { symbol, units, permit: false, deposit: false }
		},
		async balanceOf(symbol) {
			if (!read) return undefined
			const data = encodeFunctionData({ abi: BALANCE_OF, args: [address] })
			return BigInt(String(await read("eth_call", [{ to: BRIDGE.erc20[symbol], data }, "latest"])))
		},
		onStep(fn) {
			listeners.push(fn)
		},
		async handle(method, params) {
			const answer = local[method]
			if (answer) return answer(params)
			if (SIGNING.has(method)) return signing(method, params)
			if (!READS.has(method)) {
				emit({ step: "unsupported", method })
				throw rpcError(4200, `the probe wallet does not support ${method}`)
			}
			if (!read) throw rpcError(-32603, "the dry run has no L1 reader")
			return read(method, params)
		},
	}
}

function reader(rpc: string): Read {
	const pub = createPublicClient({ chain: sepolia, transport: http(rpc, { retryCount: 3 }) })
	return (method, params) => pub.request({ method, params } as never)
}

/**
 * The keyed run's wallet, built from `NULO_PROBE_L1_PRIVATE_KEY` and `SEPOLIA_RPC_URL`, which leave
 * the environment here, before any browser starts. Prints only the address, then waits up to an
 * hour for Sepolia ETH. The dry run knows a public address (`NULO_PROBE_L1_ADDRESS`, else the burn
 * address) and signs nothing; with `SEPOLIA_RPC_URL` it also reads, so it reaches the review.
 */
export async function l1SignerFromEnv(dryrun: boolean): Promise<L1Signer> {
	const key = process.env.NULO_PROBE_L1_PRIVATE_KEY
	const rpc = process.env.SEPOLIA_RPC_URL
	delete process.env.NULO_PROBE_L1_PRIVATE_KEY
	delete process.env.SEPOLIA_RPC_URL
	if (dryrun) {
		const address = (process.env.NULO_PROBE_L1_ADDRESS ?? "0x000000000000000000000000000000000000dEaD") as Address
		return makeSigner(address, undefined, rpc ? reader(rpc) : undefined)
	}
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
		message: (raw) => account.signMessage({ message: { raw } }),
	}
	console.log(`[pxe-flag] probe L1 address ${account.address}: send it at least 0.05 Sepolia ETH; waiting up to 60 min`)
	const end = Date.now() + 60 * 60_000
	for (;;) {
		const wei = await pub.getBalance({ address: account.address }).catch(() => 0n)
		if (wei >= MIN_WEI) break
		if (Date.now() > end) throw new Error("the probe L1 address was not funded within 60 min")
		await sleep(30_000)
	}
	console.log("[pxe-flag] probe L1 address funded")
	return makeSigner(account.address, sign, reader(rpc))
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

/** A deposit's wait, from its first Confirm to the receipt; past it the run stops and keeps screenshots. */
const RECEIPT_WAIT_MS = 15 * 60_000

export interface BridgeRun {
	ctx: ExtensionContext
	signer: L1Signer
	symbols: readonly string[]
	arm: "on" | "off"
	amount?: string
	/** Where a failed deposit's screenshots go. */
	shotDir: string
	record(row: Record<string, unknown>): void
	drain(): Promise<unknown>
	/** The instrument's PXE operations from index `from` on, read without draining. */
	peek(from: number): Promise<{ op: string; fn: string; ok: boolean; ms: number }[]>
}

/** One deposit's clock and what has gone wrong in Nulo since it started. */
interface Leg {
	run: BridgeRun
	app: Page
	symbol: string
	t0: number
	/** Nulo windows left open (a fee or network question) or failed to answer. */
	windowTrouble: number
	opsSeen: number
	lastState: string
	changedAt: number
}

const elapsed = (leg: Leg) => Date.now() - leg.t0
const note = (leg: Leg, row: Record<string, unknown>) =>
	leg.run.record({ ...row, arm: leg.run.arm, symbol: leg.symbol, elapsedMs: elapsed(leg) })

type SendState = { view: string; grant: string; error: string; stale: boolean; confirmLive: boolean; phases: string }

/** Everything the wizard shows about the send, in one read. */
function sendState(app: Page): Promise<SendState> {
	return app.evaluate(() => {
		const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
		const shown = (id: string) => el(id)?.checkVisibility() === true
		const confirm = el("tl-send-review-confirm") as HTMLButtonElement | null
		const views = ["tl-bridge-receipt", "tl-bridge-stepper", "tl-send-step-review", "tl-send-step-amount"]
		const grants = ["pending", "declined", "busy"]
		return {
			view: views.find(shown)?.replace(/^tl-(bridge-|send-step-)/, "") ?? "other",
			grant: grants.find((g) => shown(`tl-send-grant-${g}`)) ?? "",
			error: shown("tl-send-review-error") ? (el("tl-send-review-error")?.textContent ?? "").trim() : "",
			stale: shown("tl-send-review-stale"),
			confirmLive: confirm !== null && !confirm.disabled && confirm.checkVisibility(),
			phases: [...document.querySelectorAll('[data-testid="tl-stepper-phase"]')]
				.map((p) => `${p.getAttribute("data-phase")}:${p.getAttribute("data-state")}`)
				.join(","),
		}
	})
}

/** Records the wizard's state when it changes, and every PXE operation Nulo ran since the last look. */
async function observe(leg: Leg): Promise<SendState | undefined> {
	const state = await sendState(leg.app).catch(() => undefined)
	const key = JSON.stringify(state ?? null)
	if (state && key !== leg.lastState) {
		leg.lastState = key
		leg.changedAt = Date.now()
		note(leg, { w: "bridge-step", ...state, error: scrub(state.error).slice(0, 200) })
	}
	const ops = await leg.run.peek(leg.opsSeen).catch(() => [])
	leg.opsSeen += ops.length
	for (const op of ops) note(leg, { w: "nulo-op", op: op.op, fn: op.fn, ok: op.ok, opMs: op.ms })
	return state
}

/** The wallet's counts when Confirm was pressed. */
type PressMark = { signed: number; refused: number }

/** Why the send stopped short, or undefined while it may still arrive. */
function stoppedBecause(leg: Leg, state: SendState | undefined, at: PressMark): string | undefined {
	if (leg.windowTrouble > 0) return "a Nulo window was left open or failed"
	if (!state) return undefined
	const failed = /(?:^|,)([^,:]+):failed/.exec(state.phases)?.[1]
	if (failed) return `the stepper failed at its ${failed} phase`
	const refused = leg.run.signer.refused > at.refused
	const settledOnReview = state.view === "review" && state.confirmLive
	if (refused && (settledOnReview || Date.now() - leg.changedAt > 60_000)) return "the probe wallet refused a signature"
	if (settledOnReview && (state.error || state.grant === "declined" || state.grant === "busy"))
		return `the review refused the confirm: ${scrub(state.error || `grant ${state.grant}`).slice(0, 200)}`
	if (state.stale) return leg.run.signer.signed > at.signed ? "the review was stood down after a signature" : "stale"
	return undefined
}

/** Waits after a Confirm until the receipt, a stop, or the deposit's deadline. */
async function awaitDeposit(leg: Leg, at: PressMark, deadline: number): Promise<string> {
	while (Date.now() < deadline) {
		const state = await observe(leg)
		if (state?.view === "receipt") return "receipt"
		const stop = stoppedBecause(leg, state, at)
		if (stop) return stop
		await sleep(1_000)
	}
	return `no receipt within ${RECEIPT_WAIT_MS / 60_000} min`
}

/**
 * Presses Confirm and waits. A review stood down before anything was signed is reviewed again, at
 * most four times; once the wallet has signed anything for this deposit, Confirm is never pressed
 * again, so a run spends at most the one deposit it measures.
 */
async function confirmAndWait(leg: Leg): Promise<string> {
	const signedAtStart = leg.run.signer.signed
	const deadline = Date.now() + RECEIPT_WAIT_MS
	for (let press = 1; press <= 4; press++) {
		await pollPage(
			leg.app,
			([confirm, stale]) => {
				const c = document.querySelector(confirm) as HTMLButtonElement | null
				const s = document.querySelector(stale) as HTMLElement | null
				return (c !== null && !c.disabled && c.checkVisibility()) || s?.checkVisibility() === true
			},
			[tid("tl-send-review-confirm"), tid("tl-send-review-stale")] as const,
			120_000,
			"a live Confirm or a stand-down",
		)
		if (!(await visible(leg.app, tid("tl-send-review-stale")))) {
			const at: PressMark = { signed: leg.run.signer.signed, refused: leg.run.signer.refused }
			await leg.app.click(tid("tl-send-review-confirm"))
			note(leg, { w: "bridge-step", step: "confirm-pressed", press })
			const outcome = await awaitDeposit(leg, at, deadline)
			if (outcome !== "stale") return outcome
		}
		if (leg.run.signer.signed > signedAtStart) return "the review was stood down after a signature"
		await goToReview(leg.app)
	}
	return "the review was stood down four times in a row"
}

/** Full-page captures of the tools app and every open Nulo window; returns the file names. */
async function saveShots(leg: Leg, why: string): Promise<string[]> {
	mkdirSync(leg.run.shotDir, { recursive: true })
	const stem = `bridge-${leg.run.arm}-${leg.symbol}-${Date.now()}`
	const names: string[] = []
	const shoot = async (page: Page, name: string) => {
		await page.screenshot({ path: join(leg.run.shotDir, name), fullPage: true })
		names.push(name)
	}
	await shoot(leg.app, `${stem}-tools.png`).catch(() => undefined)
	const windows = leg.run.ctx.browser.targets().filter((t) => t.type() === "page" && kindOf(t.url()) !== undefined)
	for (const [i, target] of windows.entries()) {
		const page = await target.asPage().catch(() => undefined)
		if (page) await shoot(page, `${stem}-nulo-${kindOf(target.url())}-${i + 1}.png`).catch(() => undefined)
	}
	note(leg, { w: "bridge-shots", why: scrub(why).slice(0, 200), files: names })
	return names
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

/**
 * Mints `symbol` once, only when the address holds less than the deposit, and waits for the tile to
 * show it. A run whose address already holds the amount sends no mint.
 */
async function ensureBalance(leg: Leg, units: bigint): Promise<void> {
	const { app, run, symbol } = leg
	const tile = `${tid("tl-send-token-tile")}[data-key="11155111:${BRIDGE.erc20[symbol]}"]`
	await waitVisible(app, tile, 120_000)
	const held = await run.signer.balanceOf(symbol).catch(() => undefined)
	note(leg, { w: "l1-balance", units: held?.toString() ?? null, needed: units.toString() })
	if (held !== undefined && held >= units) return
	const shown = () => app.$eval(`${tile} ${tid("tl-send-token-balance")}`, (el) => el.textContent ?? "").catch(() => "")
	const before = { signed: run.signer.signed, refused: run.signer.refused, text: await shown() }
	await app.click(`${tid("tl-mint-l1-card")} ${tid("tl-mint-l1")}[data-symbol="${symbol}"]`)
	const end = Date.now() + 10 * 60_000
	while (Date.now() < end) {
		if (run.signer.refused > before.refused) throw new Error(`the ${symbol} mint was refused by the probe wallet`)
		const now = run.signer.signed > before.signed ? await run.signer.balanceOf(symbol).catch(() => undefined) : undefined
		if (now !== undefined && now >= units && (await shown()) !== before.text) return
		await sleep(2_000)
	}
	throw new Error(`the ${symbol} mint did not land within 10 min`)
}

/**
 * One private "Token + gas" deposit, timed from Confirm to the receipt; the claim is approved in
 * Nulo. Every step lands as a row with its elapsed time; a stop or the deadline saves screenshots
 * and throws.
 */
async function depositOne(leg: Leg): Promise<void> {
	const { app, run, symbol } = leg
	const amount = run.amount ?? "90"
	const units = parseUnits(amount, DECIMALS)
	await ensureBalance(leg, units)
	await chooseTokenGasPrivate(app, symbol, amount)
	await goToReview(app)
	await run.drain()
	leg.opsSeen = 0
	run.signer.arm(symbol, units)
	const t0 = Date.now()
	const outcome = await confirmAndWait(leg)
	if (outcome !== "receipt") {
		await observe(leg)
		await saveShots(leg, outcome)
		throw new Error(`the ${symbol} deposit stopped: ${outcome}`)
	}
	run.record({ w: "bridge", arm: run.arm, symbol, wallMs: Date.now() - t0, probe: await run.drain() })
	await app.click(tid("tl-receipt-new-bridge"))
	await waitVisible(app, tid("tl-send-step-token"), 60_000)
}

/**
 * The address-only rehearsal: the same deposit, with a wallet that runs every check and then refuses
 * to sign. It passes once a signing request that passed every check was refused, so the step is
 * proven up to its first signature after whatever the address already holds.
 */
async function rehearse(leg: Leg): Promise<void> {
	const steps: string[] = []
	leg.run.signer.onStep((s) => steps.push(`${s.step}:${s.method}${s.allowed ? ":allowed" : ""}`))
	const outcome = await depositOne(leg).then(
		() => "receipt",
		(error) => scrub((error as Error)?.message).slice(0, 200),
	)
	note(leg, { w: "dryrun", outcome, steps })
	if (!steps.some((s) => s.endsWith(":allowed"))) throw new Error(`the rehearsal reached no allowed signature: ${outcome}`)
}

/**
 * Bridges each symbol privately as "Token + gas" through the tools app's Send wizard. The dry run
 * rehearses the first symbol only, up to the first signature its wallet refuses.
 */
export async function bridgeTokens(run: BridgeRun): Promise<void> {
	const { ctx, signer } = run
	const app = await ctx.browser.newPage()
	await installL1(app, signer)
	const leg: Leg = { run, app, symbol: "", t0: Date.now(), windowTrouble: 0, opsSeen: 0, lastState: "", changedAt: Date.now() }
	signer.onStep((step) => note(leg, { w: "l1", ...step }))
	const windows = answerNuloWindows(ctx, (row) => {
		if (row.ok !== true) leg.windowTrouble++
		note(leg, row)
	})
	try {
		await app.goto(`${TOOLS_ORIGIN}/`, { waitUntil: "networkidle2", timeout: 120_000 })
		await app.click(tid("tl-tab-send"))
		await waitVisible(app, tid("tl-send-view"), 60_000)
		await app.click(tid("tl-l1-connect"))
		await app.waitForSelector(`${tid("tl-l1-status")}[data-connected="true"]`, { timeout: 60_000 })
		await driveToolsConnected(app, "bridge")
		run.record({ w: "bridge-connected", arm: run.arm })
		for (const symbol of signer.dryrun ? run.symbols.slice(0, 1) : run.symbols) {
			Object.assign(leg, { symbol, t0: Date.now(), windowTrouble: 0, lastState: "", changedAt: Date.now() })
			await app.click(tid("tl-send-direction-deposit"))
			if (signer.dryrun) await rehearse(leg)
			else await depositOne(leg)
		}
	} finally {
		await windows.stop()
		await app.close().catch(() => undefined)
	}
}
