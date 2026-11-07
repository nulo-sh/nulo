/**
 * A seeded fault on a network's primary around a send. The playground's private mint goes through
 * two relays in front of the local node, A the primary and B the fallback, and at a point the seed
 * draws A is killed for a span or answers JSON 429s. Whatever the point, the submission goes out
 * once, on one endpoint; its hash is read only there; the mint is mined; and each context ends
 * serving through a ready endpoint.
 *
 * Failure mode: a fault on the primary's reads duplicates or moves the submission, loses its
 * receipt pin, or leaves a context with no endpoint to serve it. The unit and sandbox layers drive
 * one router; only the real background and offscreen, paced by a real proof, meet the fault together.
 *
 * The onset is an event, never a time, so the seed fixes what the router has seen: the proof's k-th
 * witness read on A, parked until the send is seen waiting on it, then reset or answered 429, so A
 * has failed before the send's endpoint is picked; or, with mining held, A's k-th receipt read
 * carrying the accepted hash. A fault on the submission itself meets the pinned client's same-URL
 * retry, which may deliver it twice by design, and is outside this file.
 *
 * Runs only with `NULO_E2E_CHAOS=1`, as `send-chaos.test.ts`: the seed is `NULO_E2E_CHAOS_SEED`
 * when set, else random, and is always logged so a failure replays.
 *
 * @requires-proverless — the proof gate parks the send; the agent runner refuses this file without
 * `NULO_E2E_PROVERLESS=1`. Run it with `NULO_E2E_RETRY=0`: it spends on-chain and PXE state.
 */
import { AztecNodeApiSchema } from "@aztec-labs/stdlib/interfaces/client"
import type { Page } from "puppeteer"
import { afterEach, expect, inject } from "vitest"
import { type AztecTestConfig, waitForTxMined } from "../fixtures/aztec"
import { chaosSeed, prng } from "../fixtures/chaos-seed"
import { openPopup, test, waitForHash } from "../fixtures/extension"
import { readSendRecords, waitForSendRecord } from "../fixtures/journal"
import { holdMining, releaseMining, waitForEmptyMempool } from "../fixtures/mining-hold"
import { assertPgOk, type PgResult } from "../fixtures/playground"
import { pollUntil } from "../fixtures/poll"
import { holdProofGate, releaseProofGate } from "../fixtures/proof-gate"
import {
	hashOf,
	type MintCtx,
	prepareRoutedMint,
	readPhaseBalance,
	readyHolder,
	routeEvents,
	sendMint,
	settledStatus,
	txRow,
	WITNESS_READS,
} from "../fixtures/route-send"
import {
	callsOf,
	RELAY_REPLIES,
	type RelayRuleHandle,
	type RpcRelay,
	receiptReads,
	sendTxCount,
	startRpcRelay,
} from "../fixtures/rpc-relay"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const enabled = aztecConfig !== undefined && process.env.NULO_E2E_CHAOS === "1"
/** Read at load, so a value that is not a seed fails the file before anything is funded. */
const seed = enabled ? chaosSeed(process.env.NULO_E2E_CHAOS_SEED) : 0

const SPEC = "rpc-failover-chaos"
const step = (message: string) => console.log(`[${SPEC}] ${message}`)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The witness reads of the mint's proof the onset may land on, and the receipt reads before mining. */
const PROOF_ONSETS = 2
const RECEIPT_ONSETS = 3
/** How long the send must stay unsent with the proof's read parked. A heuristic: what ties the send
 *  to the parked read is that only a proof makes a witness read. */
const OWNERSHIP_MS = 5_000
/** A 429 span ends after its requests or this long, whichever comes first. */
const SPAN_LIMIT_MS = 60_000
/** Every node method but the submission: a 429 span never takes a batch that carries one. */
const READS = Object.keys(AztecNodeApiSchema).filter((m) => m !== "sendTx")

type Fault = { kind: "kill"; spanMs: number } | { kind: "overloaded"; requests: number }
type Draw = { fault: Fault; onset: { phase: "proof" | "receipt"; k: number } }

function draw(seed: number): Draw {
	const next = prng(seed)
	const kill = next() < 0.5
	const phase = next() < 0.5 ? "proof" : "receipt"
	const k = 1 + Math.floor(next() * (phase === "proof" ? PROOF_ONSETS : RECEIPT_ONSETS))
	const fault: Fault = kill
		? { kind: "kill", spanMs: 2_000 + Math.floor(next() * 38_001) }
		: { kind: "overloaded", requests: 1 + Math.floor(next() * 30) }
	return { fault, onset: { phase, k } }
}

afterEach(releaseMining)

/** The fault after its onset: a span dead, or a span of 429s on every read; resolves once it ends. */
async function endSpan(a: RpcRelay, fault: Fault, span: RelayRuleHandle | undefined): Promise<void> {
	if (fault.kind === "kill") {
		await sleep(fault.spanMs)
		await a.restore()
		step(`A restored after ${fault.spanMs} ms`)
		return
	}
	const took = await pollUntil(
		async () => span?.taken() ?? 0,
		(n) => n >= fault.requests,
		{ label: "the 429 span's requests", timeoutMs: SPAN_LIMIT_MS, intervalMs: 250 },
	).catch(() => span?.taken() ?? 0)
	a.clear()
	step(`A answered ${took} of ${fault.requests} requests 429`)
}

const overloadSpan = (a: RpcRelay, fault: Fault): RelayRuleHandle | undefined =>
	fault.kind === "overloaded"
		? a.fail({ methods: READS, entries: "every", times: fault.requests, fault: RELAY_REPLIES.overloaded })
		: undefined

/** The mint with the onset on the proof's k-th witness read on A, parked until the send is seen
 *  waiting on it. */
async function sendWithProofOnset(
	ctx: MintCtx,
	wallet: Page,
	relays: { a: RpcRelay; b: RpcRelay },
	plan: Draw,
): Promise<{ sent: PgResult; onset: RelayRuleHandle }> {
	const { a, b } = relays
	let onset: RelayRuleHandle | undefined
	let ended: Promise<void> | undefined
	await holdProofGate(wallet)
	try {
		const sent = await sendMint(ctx, async () => {
			await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "proving", 90_000)
			onset = a.fail({ methods: WITNESS_READS, after: plan.onset.k - 1, times: 1, fault: { kind: "hold" } })
			await releaseProofGate(wallet)
			await pollUntil(
				async () => a.held(),
				(n) => n >= 1,
				{ label: "the proof's witness read parked on A", timeoutMs: 60_000, intervalMs: 50 },
			)
			await sleep(OWNERSHIP_MS)
			expect(sendTxCount(a) + sendTxCount(b), "nothing is sent while the proof's read is parked").toBe(0)
			const records = await readSendRecords(wallet)
			expect(
				records.filter((r) => r.kind === "dapp_execute").map((r) => r.stage),
				"the send waits on the parked read",
			).toContain("proving")
			const span = overloadSpan(a, plan.fault)
			if (plan.fault.kind === "kill") await a.kill()
			else await a.release(RELAY_REPLIES.overloaded)
			step(`onset: the proof's witness read ${plan.onset.k} on A, ${plan.fault.kind}`)
			ended = endSpan(a, plan.fault, span)
			ended.catch(() => {})
		})
		await ended
		return { sent, onset: onset as RelayRuleHandle }
	} finally {
		// A failed send, or a failed release, must not leave a restore pending past the relays' teardown.
		try {
			await releaseProofGate(wallet)
		} finally {
			await ended?.catch(() => {})
		}
	}
}

/** The mint accepted with mining held, then the onset on A's k-th receipt read. The rule is armed
 *  before the send, when no receipt is pending, so k counts from the submission; the read it took
 *  must carry the accepted hash. */
async function sendWithReceiptOnset(ctx: MintCtx, a: RpcRelay, plan: Draw): Promise<{ sent: PgResult; onset: RelayRuleHandle }> {
	await holdMining()
	const fault = plan.fault.kind === "kill" ? ({ kind: "kill" } as const) : RELAY_REPLIES.overloaded
	const onset = a.fail({ methods: ["getTxReceipt"], after: plan.onset.k - 1, times: 1, fault })
	const sent = await sendMint(ctx)
	await pollUntil(
		async () => onset.taken(),
		(n) => n >= 1,
		{ label: `A's receipt read ${plan.onset.k} of the accepted hash`, timeoutMs: 90_000, intervalMs: 50 },
	)
	const [took] = onset.took()
	expect(
		took && callsOf(took).some((c) => c.method === "aztec_gettxreceipt" && c.params.includes(hashOf(sent))),
		"the onset read the accepted hash",
	).toBe(true)
	step(`onset: A's receipt read ${plan.onset.k} of the hash, ${plan.fault.kind}`)
	await endSpan(a, plan.fault, overloadSpan(a, plan.fault))
	await releaseMining()
	return { sent, onset }
}

test.skipIf(!enabled)(
	"rpc-failover-chaos — a seeded fault on the primary around a send: one submission, its hash read only where it went, every context served",
	{ timeout: 900_000, retry: 0 },
	async ({ dappConnectedExtensionWithFirstTwoAccountsContractsCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const plan = draw(seed)
		console.log(`[${SPEC}] seed=${seed} (replay: NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=${seed}) draw=${JSON.stringify(plan)}`)
		const a = await startRpcRelay(config.nodeUrl, "rpc-relay-a")
		const b = await startRpcRelay(config.nodeUrl, "rpc-relay-b")
		try {
			const mint = await prepareRoutedMint(ctx, config, a, b)
			await waitForEmptyMempool(config.nodeUrl)
			const startedAt = Date.now()
			const { sent, onset } =
				plan.onset.phase === "proof"
					? await sendWithProofOnset(ctx, mint.wallet, { a, b }, plan)
					: await sendWithReceiptOnset(ctx, a, plan)
			await assertPgOk(ctx.playgroundPage, sent, "the mint")
			expect(onset.taken(), "the seed's onset came").toBe(1)
			const hash = hashOf(sent)

			await waitForTxMined(config, hash, 240_000)
			const row = await pollUntil(
				() => txRow(mint.wallet, hash),
				(r) => (r?.status ?? -1) >= 2,
				{ label: "the wallet's row for the mint in a block", timeoutMs: 180_000, intervalMs: 500 },
			)
			const sends = { a: sendTxCount(a), b: sendTxCount(b) }
			step(`mined ${Math.round((Date.now() - startedAt) / 1000)} s after the send began; sendTx A ${sends.a}, B ${sends.b}`)
			expect(sends.a + sends.b, "one submission across both endpoints").toBe(1)
			const [carrier, other] = sends.a === 1 ? [a, b] : [b, a]
			expect(row?.submittedEndpointUrl, "recorded on the endpoint that carried it").toBe(carrier.url)
			expect(receiptReads(carrier, hash), "its receipt is read where it went").toBeGreaterThan(0)
			expect(other.carried(hash), "and nowhere else").toBe(0)

			step("a served read in each context, then each router's holder")
			await readPhaseBalance(ctx)
			const header = await openPopup(ctx)
			await waitForHash(header, "#/popup/general", 30_000)
			expect(await settledStatus(header), "the background's route serves the status read").toBe("active")
			await header.close()
			const events = await routeEvents(mint.wallet, mint.routedSince)
			for (const source of ["wallet", "pxe"] as const) {
				expect([mint.primaryId, mint.fallbackId], `the ${source} router ends on a ready endpoint`).toContain(
					readyHolder(events, source),
				)
			}
			expect(other.carried(hash), "the hash stays off the other endpoint").toBe(0)
		} finally {
			await releaseMining()
			await a.close()
			await b.close()
		}
	},
)
