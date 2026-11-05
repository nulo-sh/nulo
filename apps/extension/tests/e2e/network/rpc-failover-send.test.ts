/**
 * A dApp's send on a network with two endpoints, A the primary and B the fallback, each a relay in
 * front of the local node: with A dead the send is built, submitted and polled through B, and every
 * later read of its receipt, the wallet's and its account engine's, stays on B after A is back.
 *
 * The playground mints a token from its minter X (a wallet account) to R. A first mint, mined, sets
 * up the X→R handshake; the second is held at the proof gate, A is killed, and the gate released.
 * The node's mining is held, so the second mint stays pending while A is restored. The offscreen
 * router's own `active` event naming A, stored under the `pxe` log source, is the control: from
 * then on an unpinned receipt read would go to A. B then holds every request carrying the hash and
 * the playground simulates the same mint, whose sender sync reads the pending mint's receipt. The
 * background's poll of the hash is one request at a time, so a second held request is the
 * offscreen's: the simulation must wait on it and finish once B releases it. A must never see the
 * hash. The relays' request peak per 10 s, through a send, an unlock's catch-up and an idle minute,
 * is logged as a local lower bound.
 *
 * @requires-proverless — the proof gate parks the send; the agent runner refuses this file without
 * `NULO_E2E_PROVERLESS=1`. Run it with `NULO_E2E_RETRY=0`: it spends on-chain and PXE state that a
 * retry would find half-consumed.
 */
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import type { Page } from "puppeteer"
import { afterEach, expect, inject } from "vitest"
import { type AztecTestConfig, createTestWallet, fundPublicFeeJuice, waitForTxMined } from "../fixtures/aztec"
import { ensureUnlocked, lockWallet } from "../fixtures/auth"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import { readSwLogTrail, waitForSendRecord } from "../fixtures/journal"
import { holdMining, releaseMining, waitForEmptyMempool } from "../fixtures/mining-hold"
import { rewriteActiveNetwork } from "../fixtures/networks"
import {
	assertPgOk,
	callExpectingNoPopup,
	type PgResult,
	setPgInput,
	setPgTextarea,
	snapshotResultSeq,
	waitForPgResult,
} from "../fixtures/playground"
import { pollUntil } from "../fixtures/poll"
import { approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { PROOF_GATE_HOLD_MS, holdProofGate, releaseProofGate } from "../fixtures/proof-gate"
import { type RpcRelay, startRpcRelay } from "../fixtures/rpc-relay"
import { readSealedRows } from "../fixtures/sealed-rows"
import { deployMinterToken } from "../fixtures/selfpay-phase"
import { setDeveloperMode } from "../fixtures/settings"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const SPEC = "rpc-failover-send"
const step = (message: string) => console.log(`[${SPEC}] ${message}`)

/** How long the simulation must stay unfinished once B holds a read the background cannot account for. */
const HELD_SIMULATION_MS = 10_000
const PEAK_WINDOW_MS = 10_000
const IDLE_MS = 60_000

type Ctx = ExtensionContext & { playgroundPage: Page }

afterEach(releaseMining)

const hashOf = (r: PgResult): string => {
	const h = (r.resultJson as { txHash?: string } | undefined)?.txHash
	if (typeof h !== "string") throw new Error(`send result carries no txHash: ${JSON.stringify(r.resultJson).slice(0, 200)}`)
	return h.toLowerCase()
}

const sendTxCount = (relay: RpcRelay) => relay.methods().filter((m) => m.endsWith("_sendTx")).length

/** Most requests the relay received in any `windowMs` from `since` on. */
function peakPer(relay: RpcRelay, since: number, windowMs: number): number {
	const times = relay.arrivals().filter((t) => t >= since)
	let peak = 0
	let start = 0
	for (let end = 0; end < times.length; end++) {
		while ((times[end] as number) - (times[start] as number) >= windowMs) start++
		peak = Math.max(peak, end - start + 1)
	}
	return peak
}

/** Clicks the phase section's send, approves its execute window, and returns the result row. */
async function sendMint(ctx: Ctx, approved?: () => Promise<void>): Promise<Promise<PgResult>> {
	const page = ctx.playgroundPage
	const seq = await snapshotResultSeq(page)
	const result = waitForPgResult(page, "phase.send", seq, 300_000)
	result.catch(() => {})
	const popup = waitForPopup(ctx, "execute", { timeout: 90_000 })
	await clickByTestId(page, "pg-btn-phase-send")
	const execute = await popup
	await waitForExecuteContent(execute)
	await approveExecute(execute, { approvableTimeoutMs: 120_000 })
	await approved?.()
	return result
}

async function txRow(wallet: Page, hash: string): Promise<{ status?: number; submittedEndpointUrl?: string } | undefined> {
	const rows = await readSealedRows<{ status?: number; submittedEndpointUrl?: string }>(wallet, "txs")
	return rows.find((r) => r.naturalId.toLowerCase() === hash)?.row
}

/** The offscreen's logged reason for a simulation that failed since `since`; the dApp sees only the
 *  wallet's unclassified envelope. */
async function simulateFailure(wallet: Page, since: number): Promise<string | undefined> {
	const read = await readSwLogTrail(wallet, { match: "simulateTx failed", limit: 20 })
	const lines = Array.isArray(read) ? (read as { source?: string; timestamp?: number; data?: unknown }[]) : []
	const line = lines.find((l) => l.source === "pxe" && Number(l.timestamp) >= since)
	return line ? JSON.stringify(line.data ?? []) : undefined
}

/** Whether the offscreen's router has logged `endpointId` taking the active role since `since`. */
async function offscreenActive(wallet: Page, endpointId: string, since: number): Promise<boolean> {
	const read = await readSwLogTrail(wallet, { match: "endpoint routing changed", limit: 500 })
	const lines = Array.isArray(read) ? (read as { source?: string; timestamp?: number; data?: unknown }[]) : []
	return lines.some((line) => {
		if (line.source !== "pxe" || Number(line.timestamp) < since) return false
		const text = JSON.stringify(line.data ?? [])
		return text.includes('"event":"active"') && text.includes(`"endpointId":"${endpointId}"`)
	})
}

test.skipIf(!hasConfig)(
	"rpc-failover-send — with the primary dead a send goes out through the fallback and its receipt is read only there",
	{ timeout: 1_200_000, retry: 0 },
	async ({ dappConnectedExtensionWithFirstTwoAccountsContractsCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const { playgroundPage: dapp, accountAddresses } = ctx
		const X = accountAddresses[0] as string
		const R = config.minterAddress
		const a = await startRpcRelay(config.nodeUrl, "rpc-relay-a")
		const b = await startRpcRelay(config.nodeUrl, "rpc-relay-b")
		try {
			step("setup: a token X mints, and public Fee Juice for X")
			const token = await deployMinterToken(config, X)
			const scripted = await createTestWallet(config.nodeUrl)
			try {
				const scriptAccount = scripted.accounts[0]
				if (!scriptAccount) throw new Error("expected a sandbox-deployed account")
				await fundPublicFeeJuice(scripted.wallet, createAztecNodeClient(config.nodeUrl), scriptAccount, config, X)
			} finally {
				await scripted.cleanup()
			}

			const wallet = await openPopup(ctx)
			await waitForHash(wallet, "#/popup/general", 30_000)
			await setDeveloperMode(wallet, true)
			const fallbackId = crypto.randomUUID()
			const network = await rewriteActiveNetwork(wallet, (row) => {
				const primary = row.endpoints.find((e) => e.id === row.primaryEndpointId)
				if (row.kind !== "local" || !primary) return false
				primary.rpcUrl = a.url
				row.endpoints = [primary, { ...primary, id: fallbackId, rpcUrl: b.url }]
				return true
			})
			if (!network) throw new Error("the active network is not the Local Network")
			const primaryId = network.primaryEndpointId
			const routedSince = Date.now()

			await setPgTextarea(dapp, "phase-tokenInstance", token.instanceJson)
			await setPgInput(dapp, "phase-from", X)
			await setPgInput(dapp, "phase-feePayer", X)
			await setPgInput(dapp, "phase-amount", "1")
			const registered = await callExpectingNoPopup(
				ctx,
				dapp,
				"phase.register",
				() => clickByTestId(dapp, "pg-btn-phase-register"),
				90_000,
			)
			await assertPgOk(dapp, registered, "phase.register")

			step("a first mint X→R, mined: the handshake the next one reuses")
			await setPgInput(dapp, "phase-recipient", R)
			const warm = await await sendMint(ctx)
			await assertPgOk(dapp, warm, "warm-up mint")
			await waitForTxMined(config, hashOf(warm), 240_000)

			step("the second mint held at the proof gate, A killed, the gate released")
			await waitForEmptyMempool(config.nodeUrl)
			await holdMining()
			const sendsOnB = sendTxCount(b)
			await holdProofGate(wallet)
			let killedAt = 0
			let sent: PgResult
			try {
				const result = await sendMint(ctx, async () => {
					const held = await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "proving", 90_000)
					await a.kill()
					killedAt = Date.now()
					expect(killedAt, "A must die while the gate still holds the proof").toBeLessThan(
						(held.enteredProveAt ?? Number.NaN) + PROOF_GATE_HOLD_MS,
					)
					await releaseProofGate(wallet)
				})
				sent = await result
			} finally {
				await releaseProofGate(wallet)
			}
			await assertPgOk(dapp, sent, "held mint")
			const hash = hashOf(sent)
			const recorded = await pollUntil(
				() => txRow(wallet, hash),
				(row) => row?.submittedEndpointUrl !== undefined,
				{ label: "the held mint's transaction row", timeoutMs: 60_000, intervalMs: 500 },
			)
			expect(recorded?.submittedEndpointUrl, "the send is recorded on B").toBe(b.url)
			expect(recorded?.status, "the mint is still pending").toBe(0)
			expect(sendTxCount(b) - sendsOnB, "the submission went to B").toBe(1)
			await a.restore()
			const restoredAt = Date.now()

			step("the background polls the hash on B, on its own")
			const polled = b.carried(hash)
			await pollUntil(
				async () => b.carried(hash) - polled,
				(n) => n >= 3,
				{ label: "three more receipt polls of the hash on B", timeoutMs: 15_000, intervalMs: 250 },
			)
			expect(a.carried(hash), "A never sees the hash").toBe(0)

			step("offscreen reads until its router hands the active role back to A")
			await setPgInput(dapp, "phase-recipient", "")
			await pollUntil(
				async () => {
					const read = await callExpectingNoPopup(
						ctx,
						dapp,
						"phase.balance",
						() => clickByTestId(dapp, "pg-btn-phase-balance"),
						90_000,
					)
					await assertPgOk(dapp, read, "phase.balance")
					return offscreenActive(wallet, primaryId, restoredAt)
				},
				(back) => back,
				{ label: "the offscreen router's active event naming A", timeoutMs: 240_000, intervalMs: 1_000 },
			)
			expect(a.carried(hash), "A never sees the hash").toBe(0)

			step("B holds the hash; the playground simulates the same mint")
			await setPgInput(dapp, "phase-recipient", R)
			b.fail({ carrying: hash, fault: { kind: "hold" } })
			const seq = await snapshotResultSeq(dapp)
			const simulated = waitForPgResult(dapp, "phase.simulate", seq, 180_000)
			let finishedAt = 0
			simulated.then(
				() => {
					finishedAt = Date.now()
				},
				() => {},
			)
			const clickedAt = Date.now()
			await clickByTestId(dapp, "pg-btn-phase-simulate")
			await pollUntil(
				async () => b.held(),
				(held) => held >= 2,
				{ label: "B holding a hash read the background's one poll cannot account for", timeoutMs: 90_000, intervalMs: 100 },
			)
			const heldAt = Date.now()
			await new Promise((resolve) => setTimeout(resolve, HELD_SIMULATION_MS))
			expect(finishedAt, "the simulation waits on B's held receipt read").toBe(0)
			b.clear()
			const releasedAt = Date.now()
			await b.release()
			const outcome = await simulated
			step(`simulation: held ${releasedAt - heldAt} ms, finished ${finishedAt - releasedAt} ms after the release, ${outcome.status}`)
			expect(finishedAt - releasedAt, "the simulation finishes once B answers").toBeLessThan(30_000)
			if (outcome.status !== "ok") {
				const reason = await pollUntil(
					() => simulateFailure(wallet, clickedAt),
					(found) => found !== undefined,
					{ label: "the offscreen's reason for the refused simulation", timeoutMs: 15_000, intervalMs: 1_000 },
				)
				step(`simulation refused: ${reason?.slice(0, 300)}`)
				expect(reason, "a refused simulation is the kernel's, after its sender sync").toMatch(/nullifier/i)
			}
			expect(a.carried(hash), "A never sees the hash").toBe(0)

			step("mining released: the mint is mined, and recorded on B")
			await releaseMining()
			await waitForTxMined(config, hash, 240_000)
			const mined = await pollUntil(
				() => txRow(wallet, hash),
				(row) => (row?.status ?? -1) >= 2,
				{ label: "the wallet's row for the mint in a block", timeoutMs: 120_000, intervalMs: 500 },
			)
			expect(mined?.submittedEndpointUrl).toBe(b.url)

			step("an unlock's catch-up and an idle minute, for the relays' peak")
			await lockWallet(wallet)
			await ensureUnlocked(wallet)
			await waitForHash(wallet, "#/popup/general", 60_000)
			await new Promise((resolve) => setTimeout(resolve, IDLE_MS))
			expect(a.carried(hash), "A never sees the hash").toBe(0)
			const peakA = peakPer(a, routedSince, PEAK_WINDOW_MS)
			const peakB = peakPer(b, routedSince, PEAK_WINDOW_MS)
			step(
				`peak requests per 10 s: A ${peakA}, B ${peakB}; totals A ${a.requests()}, B ${b.requests()} over ${Math.round((Date.now() - routedSince) / 1000)} s`,
			)
		} finally {
			await releaseMining()
			await a.close()
			await b.close()
		}
	},
)
