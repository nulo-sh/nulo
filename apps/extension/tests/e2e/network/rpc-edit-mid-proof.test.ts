/**
 * An endpoint edit inside a send's proof. The playground's private mint goes through two relays in
 * front of the local node, A the primary and B the fallback; the proof's first witness read on A is
 * parked, and with the send waiting on it Settings makes B the primary, so A loses its role while
 * the proof reads through it. The send then goes out once, on B, whose anchor the pick asked, its
 * hash is read only there, and it is mined. A was frozen one block behind the chain before the
 * send, so once the role has passed, a read B refuses in either context reaches A only as a probe:
 * A reads `behind` and serves nothing.
 *
 * Failure mode: a role-changing edit while a proof reads sends the transaction twice, through an
 * endpoint the edit demoted with its receipts elsewhere, or leaves the rebuilt routes moving reads
 * to an endpoint behind what the new holder served. The composition and sandbox layers have no
 * Settings page and no two contexts; the floor's own seeding on a handover, before any tip read,
 * is pinned by `routing/routed-node.test.ts` and `routing/endpoint-health.test.ts`.
 *
 * Runs on Chrome only: no step here depends on the browser (the gate, the relays, a settings click),
 * and Firefox's lanes already run `rpc-failover-send.test.ts`, which shares every fixture.
 *
 * @requires-proverless — the proof gate parks the send; the agent runner refuses this file without
 * `NULO_E2E_PROVERLESS=1`. Run it with `NULO_E2E_RETRY=0`: it spends on-chain and PXE state.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { type AztecTestConfig, createSponsoredFeeOptions, createTestWallet, mintPublicTokens, waitForTxMined } from "../fixtures/aztec"
import { BROWSER } from "../fixtures/browser"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import { navigateToSettings, openNetworkDetail, setDebugMode, waitForToast } from "../fixtures/helpers"
import { readSendRecords, waitForSendRecord } from "../fixtures/journal"
import { assertPgOk, callExpectingNoPopup, setPgInput } from "../fixtures/playground"
import { pollUntil } from "../fixtures/poll"
import { holdProofGate, releaseProofGate } from "../fixtures/proof-gate"
import {
	hashOf,
	type MintCtx,
	methodsAfter,
	prepareRoutedMint,
	type RouteSource,
	routeEvents,
	sendMint,
	txRow,
	WITNESS_READS,
} from "../fixtures/route-send"
import { RELAY_REPLIES, type RpcRelay, sendTxCount, startRpcRelay } from "../fixtures/rpc-relay"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const SPEC = "rpc-edit-mid-proof"
const step = (message: string) => console.log(`[${SPEC}] ${message}`)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** How long the send must stay unsent with the proof's read parked, longer than the whole proof. */
const OWNERSHIP_MS = 5_000
/** What an admission probe asks: the only methods a behind endpoint may receive. */
const PROBE = new Set(["aztec_getNodeInfo", "aztec_getChainTips"])

async function blockNumber(url: string): Promise<number> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "aztec_getBlockNumber", params: [] }),
	})
	return Number(((await res.json()) as { result?: unknown }).result)
}

/** One block mined straight on the node, past both relays. */
async function advanceChain(config: AztecTestConfig): Promise<void> {
	const { wallet, accounts, cleanup } = await createTestWallet(config.nodeUrl)
	try {
		const from = accounts[0]
		if (!from) throw new Error("expected a sandbox-deployed account")
		await mintPublicTokens(
			wallet,
			config.tokenAddress,
			from.toString(),
			1n,
			config.minterAddress,
			await createSponsoredFeeOptions(wallet),
		)
	} finally {
		await cleanup()
	}
}

/** Whether `relay` received `first` immediately followed by `then` before its first `sendTx`. */
function askedBeforeSend(relay: RpcRelay, first: string, then: string): boolean {
	const methods = relay.methods()
	const sent = methods.indexOf("aztec_sendTx")
	return methods.slice(0, sent < 0 ? undefined : sent).some((m, i, all) => m === first && all[i + 1] === then)
}

/**
 * B refuses one read made wholly of `methods`, `drive` makes a read of that kind in `source`'s
 * context, and A, behind the floor, is probed and marked behind there while serving nothing.
 */
async function behindAfterHandover(
	mint: { wallet: Page; routedSince: number; primaryId: string; fallbackId: string },
	relays: { a: RpcRelay; b: RpcRelay },
	control: { source: RouteSource; methods: string[]; drive: () => Promise<void> },
): Promise<void> {
	const { a, b } = relays
	const since = Date.now()
	const seenOnA = a.methods().length
	const refused = b.fail({ methods: control.methods, entries: "every", times: 1, fault: RELAY_REPLIES.refused })
	await control.drive()
	const events = await pollUntil(
		() => routeEvents(mint.wallet, since),
		(all) =>
			all.some((e) => e.source === control.source && e.event === "move" && e.endpointId === mint.fallbackId) &&
			all.some((e) => e.source === control.source && e.event === "state" && e.endpointId === mint.primaryId && e.state === "behind"),
		{ label: `the ${control.source} router moving B's refusal and finding A behind`, timeoutMs: 60_000, intervalMs: 500 },
	)
	b.clear()
	expect(refused.taken(), `B refused the ${control.source} read`).toBe(1)
	const onA = methodsAfter(a, seenOnA)
	step(`${control.source}: A received ${JSON.stringify(onA)}`)
	expect(
		onA.some((m) => PROBE.has(m)),
		`A was probed for the ${control.source} read`,
	).toBe(true)
	expect(
		onA.filter((m) => !PROBE.has(m)),
		`A served nothing for the ${control.source} context`,
	).toEqual([])
	expect(events.filter((e) => e.source === control.source && e.event === "active").map((e) => e.endpointId)).not.toContain(mint.primaryId)
}

test.skipIf(!aztecConfig || BROWSER === "firefox")(
	"rpc-edit-mid-proof — making the fallback primary inside a proof: one send on it, its hash read only there, the demoted endpoint kept out behind the floor",
	{ timeout: 900_000, retry: 0 },
	async ({ dappConnectedExtensionWithFirstTwoAccountsContractsCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const a = await startRpcRelay(config.nodeUrl, "rpc-relay-a")
		const b = await startRpcRelay(config.nodeUrl, "rpc-relay-b")
		try {
			const mint = await prepareRoutedMint(ctx, config, a, b)
			await setDebugMode(mint.wallet, true)

			step("A frozen, the chain one block past it")
			await a.freeze()
			await advanceChain(config)
			const [onA, onNode] = [await blockNumber(a.url), await blockNumber(config.nodeUrl)]
			expect(onNode, "the node is past A's frozen tip").toBeGreaterThan(onA)

			const settings = await openPopup(ctx)
			await waitForHash(settings, "#/popup/general", 30_000)
			await navigateToSettings(settings, "networks")
			await openNetworkDetail(settings, mint.networkName)
			const fallbackRow = `[data-testid="endpoint-row"][data-endpoint-id="${mint.fallbackId}"]`
			await settings.waitForSelector(fallbackRow, { visible: true, timeout: 15_000 })

			step("the proof's first witness read parked on A; B made primary while the send waits on it")
			await holdProofGate(mint.wallet)
			const sent = await (async () => {
				try {
					return await await sendMint(ctx as MintCtx, async () => {
						await waitForSendRecord(mint.wallet, (r) => r.kind === "dapp_execute" && r.stage === "proving", 90_000)
						a.fail({ methods: WITNESS_READS, times: 1, fault: { kind: "hold" } })
						await releaseProofGate(mint.wallet)
						await pollUntil(
							async () => a.held(),
							(n) => n >= 1,
							{ label: "the proof's witness read parked on A", timeoutMs: 60_000, intervalMs: 50 },
						)
						const heldAt = Date.now()
						await settings.evaluate((sel: string) => document.querySelector<HTMLElement>(sel)?.click(), fallbackRow)
						await waitForToast(settings, "Primary endpoint updated", 15_000)
						step(`B primary ${Date.now() - heldAt} ms into the hold`)
						await sleep(Math.max(0, heldAt + OWNERSHIP_MS - Date.now()))
						expect(sendTxCount(a) + sendTxCount(b), "nothing is sent while the proof's read is parked").toBe(0)
						const stages = (await readSendRecords(mint.wallet)).filter((r) => r.kind === "dapp_execute").map((r) => r.stage)
						expect(stages, "the send waits on the parked read").toContain("proving")
						await a.release()
					})
				} finally {
					await releaseProofGate(mint.wallet)
				}
			})()
			await assertPgOk(ctx.playgroundPage, sent, "the mint")
			const hash = hashOf(sent)

			expect([sendTxCount(a), sendTxCount(b)], "one submission, on the new primary").toEqual([0, 1])
			expect(askedBeforeSend(b, "aztec_getNodeInfo", "aztec_getBlockData"), "the pick asked B for the anchor").toBe(true)
			await waitForTxMined(config, hash, 240_000)
			const row = await pollUntil(
				() => txRow(mint.wallet, hash),
				(r) => (r?.status ?? -1) >= 2,
				{ label: "the wallet's row for the mint in a block", timeoutMs: 180_000, intervalMs: 500 },
			)
			expect(row?.submittedEndpointUrl).toBe(b.url)
			expect(a.carried(hash), "the hash is read only on B").toBe(0)

			step("A behind the floor in each context, one at a time")
			const dapp = ctx.playgroundPage
			await behindAfterHandover(
				mint,
				{ a, b },
				{
					source: "pxe",
					methods: ["getPrivateLogsByTags", "findLeavesIndexes"],
					drive: async () => {
						await setPgInput(dapp, "phase-recipient", "")
						await callExpectingNoPopup(ctx, dapp, "phase.balance", () => clickByTestId(dapp, "pg-btn-phase-balance"), 90_000)
					},
				},
			)
			await behindAfterHandover(
				mint,
				{ a, b },
				{
					source: "wallet",
					methods: ["getContract"],
					drive: async () => {
						await setPgInput(dapp, "tokenAddress", config.tokenAddress)
						await callExpectingNoPopup(
							ctx,
							dapp,
							"getContractMetadata",
							() => clickByTestId(dapp, "pg-btn-getContractMetadata"),
							90_000,
						)
					},
				},
			)
			expect(a.carried(hash), "the hash stays off A").toBe(0)
			await settings.close()
		} finally {
			a.unfreeze()
			await a.close()
			await b.close()
		}
	},
)
