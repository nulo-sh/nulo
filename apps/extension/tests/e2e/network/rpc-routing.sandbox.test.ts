/**
 * Routing between a network's endpoints against the real local network: the real node adapter and
 * router, and a server-entrypoint PXE (proverless: kernels simulated, anchored reads real), behind
 * two fault relays, A (the primary) and B, in front of the run's one sandbox node. The relays fail on
 * cue; every assertion reads what each relay received and where the route sent it.
 *
 * Sends run through the route as the wallet's send path does: the routed node refuses `sendTx`, so
 * the test wallet's node hands the transaction to `route.pickForSend` and submits it on the endpoint
 * it returns. The sending account is the local network's third genesis account, which no other
 * network file uses, so its tagging indexes are this file's alone. The local network mines a block
 * only when a transaction arrives, so a scenario that needs the chain to move sends public mints
 * straight to the node, past both relays.
 */
import { randomBytes } from "node:crypto"
import { mkdirSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { TokenContract } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing"
import { NO_WAIT } from "@aztec-labs/aztec.js/contracts"
import { waitForTx } from "@aztec-labs/aztec.js/node"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { getPXEConfig } from "@aztec-labs/pxe/config"
import { createPXE, type PXE } from "@aztec-labs/pxe/server"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { BlockHash } from "@aztec-labs/stdlib/block"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { Tx, TxHash } from "@aztec-labs/stdlib/tx"
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded"
import { AztecNodeFactoryAdapter } from "@nulo/aztec-runtime/adapters"
import { callFailureOf, type RoutedNode, type RouteSpec } from "@nulo/aztec-runtime/routing"
import { afterAll, afterEach, beforeAll, describe, expect, inject, test } from "vitest"
import { type AztecTestConfig, createSponsoredFeeOptions, deployTestToken, E2E_FEE_GAS } from "../fixtures/aztec"
import { holdMining, releaseMining } from "../fixtures/mining-hold"
import { pollUntil } from "../fixtures/poll"
import { RELAY_REPLIES, type RelayFault, type RpcRelay, startRpcRelay } from "../fixtures/rpc-relay"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
// The suite drives no browser: the Chrome lane runs it, once per PR.
const onFirefoxLane = (process.env.NULO_E2E_BROWSER ?? "chrome") === "firefox"

/** The node methods that read at a block the caller names, the PXE's anchored reads among them. */
const ANCHORED = [
	"findLeavesIndexes",
	"getNullifierMembershipWitness",
	"getLowNullifierMembershipWitness",
	"getPublicDataWitness",
	"getBlockHashMembershipWitness",
	"getNoteHashMembershipWitness",
	"getL1ToL2MessageMembershipWitness",
	"getPublicStorageAt",
	"getBlockData",
	"getContract",
]
/** The PXE block stream's reads by number, which only the active endpoint serves. */
const SYNC_READS = ["getChainTips", "getBlocks", "getBlockNumber"]

const DATA_ROOT = join(homedir(), ".cache", "nulo-e2e")
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const factory = new AztecNodeFactoryAdapter(() => undefined)

async function rawRpc(url: string, method: string, params: unknown[]) {
	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method, params }]),
	})
	return { status: res.status, entry: ((await res.json()) as [{ result?: unknown; error?: { code: number } }])[0] }
}

/** A test wallet whose PXE reports each proof about to start, for a fault armed inside it. */
class RoutedWallet extends EmbeddedWallet {
	public beforeProve: (() => void) | undefined

	constructor(...[pxe, node, walletDB, accountContracts, log]: ConstructorParameters<typeof EmbeddedWallet>) {
		super(pxe, node, walletDB, accountContracts, log)
		const prove = pxe.proveTx.bind(pxe)
		pxe.proveTx = (...args) => {
			const armed = this.beforeProve
			this.beforeProve = undefined
			armed?.()
			return prove(...args)
		}
	}
}

/** The routed node, with `sendTx` submitting on the endpoint `pickForSend` returns. */
function sendingNode(routed: RoutedNode): AztecNode {
	const sendTx = async (tx: Tx) => {
		const anchor = await tx.data.constants.anchorBlockHeader.hash()
		const picked = await routed.route.pickForSend(tx.getTxHash().toString(), anchor.toString())
		return factory.createNode(picked.rpcUrl).sendTx(tx)
	}
	return new Proxy(routed, { get: (target, prop) => (prop === "sendTx" ? sendTx : Reflect.get(target, prop)) })
}

describe.skipIf(!aztecConfig || onFirefoxLane)("routing between endpoints on the real local network", () => {
	const nodeUrl = aztecConfig?.nodeUrl ?? ""
	let a: RpcRelay
	let b: RpcRelay
	let l1ChainId = 0
	let tokenAddress: AztecAddress
	let advance: (blocks: number) => Promise<void> = async () => {}
	let stopSetup: () => Promise<unknown> = async () => {}
	const dataDirs: string[] = []
	const pxes: PXE[] = []
	const wallets: RoutedWallet[] = []

	const spec = (): RouteSpec => ({
		chainId: 0,
		l1ChainId,
		endpoints: [
			{ id: "a", rpcUrl: a.url },
			{ id: "b", rpcUrl: b.url },
		],
	})
	const active = (node: RoutedNode) => node.route.active()?.id
	const states = (node: RoutedNode) => node.route.snapshot().map((e) => `${e.id}:${e.state}`)
	const tipNow = async () => (await rawRpc(nodeUrl, "aztec_getBlockNumber", [])).entry.result as number
	const methodsAfter = (relay: RpcRelay, from: number) =>
		relay
			.methods()
			.slice(from)
			.map((m) => m.replace(/^aztec_/, ""))

	function dataDir(): string {
		const dir = join(DATA_ROOT, `rpc-routing-${process.pid}-${randomBytes(4).toString("hex")}`)
		mkdirSync(dir, { recursive: true })
		dataDirs.push(dir)
		return dir
	}

	async function openPxe(node: AztecNode, dir = dataDir()): Promise<PXE> {
		const pxe = await createPXE(node, { ...getPXEConfig(), dataDirectory: dir, proverEnabled: false, autoSync: false })
		pxes.push(pxe)
		return pxe
	}

	/** A wallet on a fresh route over A and B, holding the sending account and the suite's token. */
	async function routedWallet({ handshake = false } = {}) {
		const routed = factory.createRoutedNode(spec())
		const wallet = await RoutedWallet.create(sendingNode(routed), { pxe: { dataDirectory: dataDir(), proverEnabled: false } })
		wallets.push(wallet)
		const sender = await registerSender(wallet)
		const instance = await routed.getContract(tokenAddress)
		if (!instance) throw new Error("the suite's token is not on the node")
		await wallet.registerContract(instance, TokenContract.artifact)
		const fee = await createSponsoredFeeOptions(wallet)
		const token = await TokenContract.at(tokenAddress, wallet)
		const recipient = await AztecAddress.random()
		let amount = 0n
		/** A private mint to `recipient`: a tagged note, whose next one's sender sync reads this one's receipt. */
		const mintCall = () => {
			amount++
			return token.methods.mint_to_private(recipient, amount)
		}
		const mint = async (): Promise<TxHash> =>
			(await mintCall().send({ fee: { ...fee, gasSettings: E2E_FEE_GAS }, from: sender, wait: NO_WAIT })).txHash
		/** Runs the next mint's private execution, its sender sync included, and sends nothing. A constrained
		 *  delivery reads the nullifier of the recipient's previous message, so with that one unmined the
		 *  kernel refuses the mint; the sync has already run. */
		const simulateMint = () =>
			mintCall()
				.simulate({ from: sender })
				.then(
					() => "simulated",
					(error: Error) => error.message,
				)
		const mined = (txHash: TxHash) => waitForTx(sendingNode(routed), txHash, { timeout: 120 })
		// The first send to a recipient performs the handshake: a later one reads the secret it set.
		if (handshake) await mined(await mint())
		return { routed, wallet, sender, token, mint, simulateMint, mined }
	}

	async function registerSender(wallet: EmbeddedWallet): Promise<AztecAddress> {
		const genesis = (await getInitialTestAccountsData())[2]
		if (!genesis) throw new Error("the local network ships fewer than three genesis accounts")
		return (await wallet.createSchnorrInitializerlessAccount(genesis.secret, genesis.salt, genesis.signingKey)).address
	}

	beforeAll(async () => {
		a = await startRpcRelay(nodeUrl, "rpc-relay-a")
		b = await startRpcRelay(nodeUrl, "rpc-relay-b")
		l1ChainId = ((await rawRpc(nodeUrl, "aztec_getNodeInfo", [])).entry.result as { l1ChainId: number }).l1ChainId
		const setup = await EmbeddedWallet.create(factory.createNode(nodeUrl), { pxe: { dataDirectory: dataDir(), proverEnabled: false } })
		stopSetup = () => setup.stop()
		const sender = await registerSender(setup)
		const fee = await createSponsoredFeeOptions(setup)
		tokenAddress = AztecAddress.fromStringUnsafe(await deployTestToken(setup, sender, fee, "RTE"))
		const token = await TokenContract.at(tokenAddress, setup)
		let minted = 0n
		advance = async (blocks) => {
			for (let i = 0; i < blocks; i++) {
				minted++
				await token.methods
					.mint_to_public(sender, minted)
					.send({ fee: { ...fee, gasSettings: E2E_FEE_GAS }, from: sender, wait: { timeout: 120 } })
			}
		}
	}, 300_000)

	afterEach(async () => {
		await releaseMining()
		for (const relay of [a, b]) {
			relay.clear()
			relay.unfreeze()
			await relay.restore()
		}
		await Promise.allSettled([...wallets.splice(0).map((w) => w.stop()), ...pxes.splice(0).map((p) => p.stop())])
	})

	afterAll(async () => {
		await Promise.allSettled([a?.close(), b?.close(), stopSetup()])
		for (const dir of dataDirs) rmSync(dir, { recursive: true, force: true })
	})

	test("S1: reads polled each second survive each failure of the active endpoint, one 60 s blackhole included; a runtime built while the primary refuses getBlock starts on the fallback", async () => {
		const node = factory.createRoutedNode(spec())
		const failed: string[] = []
		let polling = true
		const poller = (async () => {
			while (polling) {
				const started = Date.now()
				await Promise.all([node.getChainTips(), node.getNodeInfo()]).catch((error: Error) => failed.push(error.message))
				await sleep(Math.max(0, 1_000 - (Date.now() - started)))
			}
		})()
		const faults: RelayFault[] = [
			{ kind: "kill" },
			RELAY_REPLIES.server,
			RELAY_REPLIES.overloaded,
			RELAY_REPLIES.refused,
			RELAY_REPLIES.malformed,
			{ kind: "blackhole" },
		]
		try {
			await pollUntil(
				async () => active(node),
				(id) => id === "a",
				{ label: "the primary active", timeoutMs: 10_000, intervalMs: 200 },
			)
			for (const fault of faults) {
				const holder = active(node)
				const relay = holder === "b" ? b : a
				if (fault.kind === "kill") await relay.kill()
				else relay.fail({ fault })
				const budget = fault.kind === "blackhole" ? 75_000 : 15_000
				await pollUntil(
					async () => active(node),
					(id) => id !== undefined && id !== holder,
					{
						label: `the role off ${holder} on ${fault.kind === "reply" ? fault.status : fault.kind}`,
						timeoutMs: budget,
						intervalMs: 200,
					},
				)
				// Long enough for the next fault's successor to be probed again (5 s spacing).
				await sleep(6_000)
				relay.clear()
				await relay.restore()
			}
		} finally {
			polling = false
			await poller
		}
		expect(failed).toEqual([])

		a.fail({ methods: ["getBlock"], fault: RELAY_REPLIES.refused })
		const building = factory.createRoutedNode(spec())
		await openPxe(building)
		expect(active(building)).toBe("b")
		expect(states(building)).toEqual(["a:ready", "b:ready"])
	}, 300_000)

	test("S3: a fallback frozen below the floor is never used while behind and the synced block never falls; a rebuilt runtime starts on it once it catches up, and the primary returns once released", async () => {
		const node = factory.createRoutedNode(spec())
		const dir = dataDir()
		const pxe = await openPxe(node, dir)
		const synced: number[] = []
		// The PXE's sync logs a failed read and resolves; what it holds after is what this records.
		const sync = async (target = pxe) => {
			await target.sync()
			synced.push((await target.getSyncedBlockHeader()).getBlockNumber())
		}
		const probesOnly = (m: string) => m === "getNodeInfo" || m === "getChainTips"
		await sync()
		await b.freeze()
		await advance(2)
		await sync()

		await a.kill()
		const seenOnB = b.methods().length
		await expect(node.getChainTips()).rejects.toThrow()
		await sync()
		expect(states(node)).toEqual(["a:down", "b:behind"])
		expect(methodsAfter(b, seenOnB).every(probesOnly)).toBe(true)

		b.unfreeze()
		await sleep(5_000)
		await sync()
		expect(active(node)).toBe("b")

		await a.freeze()
		await advance(2)
		await sync()
		await a.restore()
		await pxe.stop()
		pxes.splice(pxes.indexOf(pxe), 1)

		const rebuilt = factory.createRoutedNode(spec())
		rebuilt.route.seedFloor(synced.at(-1) ?? 0)
		const runtime = await openPxe(rebuilt, dir)
		expect(active(rebuilt)).toBe("b")
		expect(states(rebuilt)[0]).toBe("a:behind")
		await sync(runtime)

		a.unfreeze()
		await pollUntil(
			async () => {
				await sync(runtime)
				return active(rebuilt)
			},
			(id) => id === "a",
			{ label: "the primary back once released", timeoutMs: 90_000, intervalMs: 1_000 },
		)
		expect(synced).toEqual([...synced].sort((x, y) => x - y))
	}, 400_000)

	test("S3b: a fallback admitted in an earlier outage, frozen below, takes nothing when the active endpoint fails once; the synced block never falls", async () => {
		const node = factory.createRoutedNode(spec())
		const pxe = await openPxe(node)
		const synced: number[] = []
		const sync = async () => {
			await pxe.sync()
			synced.push((await pxe.getSyncedBlockHeader()).getBlockNumber())
		}
		await sync()
		a.fail({ methods: ["getChainTips"], times: 1, fault: RELAY_REPLIES.server })
		await sync()
		expect(active(node)).toBe("b")
		await sleep(5_000)
		b.fail({ methods: ["getChainTips"], times: 1, fault: RELAY_REPLIES.server })
		await sync()
		expect(active(node)).toBe("a")

		await b.freeze()
		await advance(2)
		await sync()
		await sleep(5_000)
		const seenOnB = b.methods().length
		a.fail({ methods: ["getChainTips"], times: 1, fault: RELAY_REPLIES.server })
		await sync()
		const header = await pxe.getSyncedBlockHeader()
		a.fail({ methods: ANCHORED, times: 1, fault: RELAY_REPLIES.server })
		await node.getPublicStorageAt(
			{ number: header.getBlockNumber(), hash: await header.hash() },
			AztecAddress.fromStringUnsafe(aztecConfig?.tokenAddress ?? ""),
			Fr.ZERO,
		)
		expect(active(node)).toBe("a")
		expect(states(node)[1]).toBe("b:behind")
		expect(methodsAfter(b, seenOnB).every((m) => m === "getNodeInfo" || m === "getChainTips")).toBe(true)
		expect(synced).toEqual([...synced].sort((x, y) => x - y))
	}, 300_000)

	test("S4: the primary killed on the first anchored read inside a proof: the proof completes through the fallback, which alone carries the send and its receipts", async () => {
		const { wallet, mint, mined } = await routedWallet()
		let armed = false
		wallet.beforeProve = () => {
			armed = true
			a.fail({ methods: ANCHORED, times: 1, fault: { kind: "kill" } })
		}
		const txHash = await mint()
		const receipt = await mined(txHash)
		expect(armed).toBe(true)
		expect(receipt.isMined()).toBe(true)
		expect(a.carried(txHash.toString())).toBe(0)
		expect(b.carried(txHash.toString())).toBeGreaterThan(0)
	}, 300_000)

	test("S5: a half-dead primary (tips served, anchored reads failing) moves only its failures, through the PXE's cached node", async () => {
		const { routed, sender, token } = await routedWallet()
		await token.methods.balance_of_private(sender).simulate({ from: sender })
		// A new block moves the PXE's anchor, so the cached reads of the first run miss.
		await advance(1)
		const seenOnB = b.methods().length
		const failedOnA = a.requests()
		a.fail({ methods: ANCHORED, times: 2, fault: RELAY_REPLIES.server })
		await token.methods.balance_of_private(sender).simulate({ from: sender })
		expect(a.requests() - failedOnA).toBeGreaterThanOrEqual(2)
		expect(active(routed)).toBe("a")
		expect(states(routed)[0]).toBe("a:ready")
		const movedToB = methodsAfter(b, seenOnB).filter((m) => m !== "getNodeInfo" && m !== "getChainTips")
		expect(movedToB.length).toBeGreaterThan(0)
		expect(movedToB.every((m) => ANCHORED.includes(m))).toBe(true)
		expect(methodsAfter(b, seenOnB).some((m) => SYNC_READS.includes(m) && m !== "getChainTips")).toBe(false)
	}, 300_000)

	test("S6: an anchored read at an unknown block hash is the node's own answer, and the call ends where it is", async () => {
		const tip = await tipNow()
		const unknown = BlockHash.random()
		const raw = await rawRpc(nodeUrl, "aztec_getPublicStorageAt", [
			{ number: tip, hash: unknown.toString() },
			AztecAddress.ZERO.toString(),
			Fr.ZERO.toString(),
		])
		expect(raw.status).toBe(200)
		expect(raw.entry.error?.code).toBeGreaterThanOrEqual(-32768)
		expect(raw.entry.error?.code).toBeLessThanOrEqual(-32000)

		const node = factory.createRoutedNode(spec())
		await node.getNodeInfo()
		const seenOnB = b.methods().length
		const error = await node.getPublicStorageAt({ number: tip, hash: unknown } as never, AztecAddress.ZERO, Fr.ZERO).then(
			() => undefined,
			(e: unknown) => e,
		)
		expect(error).toBeInstanceOf(Error)
		expect(callFailureOf(error)).toBeUndefined()
		expect(methodsAfter(b, seenOnB)).toEqual([])
	}, 60_000)

	test("S7: a transaction sent through the fallback is read there only, by the PXE's next sender sync, while the primary is active again", async () => {
		const { routed, mint, simulateMint, mined } = await routedWallet({ handshake: true })
		await holdMining()
		await a.kill()
		const first = await mint()
		expect(active(routed)).toBe("b")
		await a.restore()
		await pollUntil(
			async () => {
				await routed.getNodeInfo()
				return active(routed)
			},
			(id) => id === "a",
			{ label: "the primary back", timeoutMs: 90_000, intervalMs: 1_000 },
		)
		const sentOnB = b.carried(first.toString())
		expect(await simulateMint()).toMatch(/^simulated$|reading an unknown nullifier/)
		expect(b.carried(first.toString())).toBeGreaterThan(sentOnB)
		expect(a.carried(first.toString())).toBe(0)
		await releaseMining()
		await mined(first)
		expect(a.carried(first.toString())).toBe(0)
	}, 300_000)

	test("S7b: the primary killed after a send through it: the same transfer sent again goes through the fallback, and the first one's hash never leaves the primary", async () => {
		const { routed, mint, mined } = await routedWallet({ handshake: true })
		const first = await mint()
		expect(a.carried(first.toString())).toBeGreaterThan(0)
		await a.kill()
		const seenOnA = a.requests()
		// Read past both relays: the node has the transaction whatever became of the endpoint it reached.
		await pollUntil(
			async () =>
				((await rawRpc(nodeUrl, "aztec_getTxReceipt", [first.toString()])).entry.result as { status?: string } | undefined)?.status,
			(status) => status !== undefined && status !== "pending" && status !== "dropped",
			{ label: "the first transaction mined", timeoutMs: 120_000, intervalMs: 1_000 },
		)
		const second = await mint()
		await mined(second)
		expect(a.requests()).toBe(seenOnA)
		expect(b.carried(first.toString())).toBe(0)
		expect(b.carried(second.toString())).toBeGreaterThan(0)
		expect(active(routed)).toBe("b")
	}, 300_000)
})
