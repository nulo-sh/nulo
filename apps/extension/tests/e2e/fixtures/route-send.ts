/**
 * A playground private mint on a network whose endpoints are two fault relays in front of the local
 * node, A the primary and B the fallback: the setup and reads the specs share that fail an endpoint
 * around a send.
 *
 * The mint is the playground's phase section, `mint_to_private` from the minter X, self-paid from
 * X's public Fee Juice, to R. The router's own events are read from the stored log trail, which
 * needs Developer Mode (set here): the background's under the `wallet` source, the offscreen's
 * under `pxe`; a moved call is a debug line, stored only with Debug Mode on.
 */
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import type { Page } from "puppeteer"
import { type AztecTestConfig, createTestWallet, fundPublicFeeJuice } from "./aztec"
import { clickByTestId, type ExtensionContext, openPopup, waitForHash } from "./extension"
import { readSwLogTrail } from "./journal"
import { rewriteActiveNetwork } from "./networks"
import {
	assertPgOk,
	callExpectingNoPopup,
	type PgResult,
	setPgInput,
	setPgTextarea,
	snapshotResultSeq,
	waitForPgResult,
} from "./playground"
import { approveExecute, waitForExecuteContent, waitForPopup } from "./popups"
import type { RpcRelay } from "./rpc-relay"
import { readSealedRows } from "./sealed-rows"
import { deployMinterToken } from "./selfpay-phase"
import { setDeveloperMode } from "./settings"

export type MintCtx = ExtensionContext & { playgroundPage: Page; accountAddresses: string[] }

export interface RoutedMint {
	/** An extension page with Developer Mode on, for storage and log reads. */
	wallet: Page
	minter: string
	recipient: string
	/** The network's row id and display name, and its endpoints' ids: A's, then B's. */
	networkId: string
	networkName: string
	primaryId: string
	fallbackId: string
	/** When the endpoints moved onto the relays: every router event of the run comes after it. */
	routedSince: number
}

/** The node methods the PXE's proof reads a witness through, and no other work of these specs does. */
export const WITNESS_READS = [
	"getNullifierMembershipWitness",
	"getLowNullifierMembershipWitness",
	"getPublicDataWitness",
	"getNoteHashMembershipWitness",
] as const

export const hashOf = (r: PgResult): string => {
	const h = (r.resultJson as { txHash?: string } | undefined)?.txHash
	if (typeof h !== "string") throw new Error(`send result carries no txHash: ${JSON.stringify(r.resultJson).slice(0, 200)}`)
	return h.toLowerCase()
}

/** The relay's methods received after the first `from` (its `methods().length` at some moment). */
export const methodsAfter = (relay: RpcRelay, from: number): string[] => relay.methods().slice(from)

/**
 * A token X mints with X's public Fee Juice, the active Local Network's endpoints rewritten to
 * `[a, b]`, and the phase section filled and registered, with `recipient` R (the config's minter).
 * Both contexts rebuild their routes from the rewritten row.
 */
export async function prepareRoutedMint(ctx: MintCtx, config: AztecTestConfig, a: RpcRelay, b: RpcRelay): Promise<RoutedMint> {
	const dapp = ctx.playgroundPage
	const minter = ctx.accountAddresses[0] as string
	const token = await deployMinterToken(config, minter)
	const scripted = await createTestWallet(config.nodeUrl)
	try {
		const scriptAccount = scripted.accounts[0]
		if (!scriptAccount) throw new Error("expected a sandbox-deployed account")
		await fundPublicFeeJuice(scripted.wallet, createAztecNodeClient(config.nodeUrl), scriptAccount, config, minter)
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
	const routedSince = Date.now()

	await setPgTextarea(dapp, "phase-tokenInstance", token.instanceJson)
	await setPgInput(dapp, "phase-from", minter)
	await setPgInput(dapp, "phase-feePayer", minter)
	await setPgInput(dapp, "phase-amount", "1")
	const registered = await callExpectingNoPopup(ctx, dapp, "phase.register", () => clickByTestId(dapp, "pg-btn-phase-register"), 90_000)
	await assertPgOk(dapp, registered, "phase.register")
	await setPgInput(dapp, "phase-recipient", config.minterAddress)
	return {
		wallet,
		minter,
		recipient: config.minterAddress,
		networkId: network.id,
		networkName: network.name,
		primaryId: network.primaryEndpointId,
		fallbackId,
		routedSince,
	}
}

/** Clicks the phase section's send, approves its execute window, runs `approved`, then waits for
 *  the result row. */
export async function sendMint(ctx: MintCtx, approved?: () => Promise<void>): Promise<PgResult> {
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

/** The phase section's balance read of X, a utility call the offscreen's PXE serves. It clears the
 *  recipient first: a read scoped to R, an account outside the session, is refused. */
export async function readPhaseBalance(ctx: MintCtx): Promise<void> {
	const dapp = ctx.playgroundPage
	await setPgInput(dapp, "phase-recipient", "")
	const read = await callExpectingNoPopup(ctx, dapp, "phase.balance", () => clickByTestId(dapp, "pg-btn-phase-balance"), 90_000)
	await assertPgOk(dapp, read, "phase.balance")
}

export async function txRow(wallet: Page, hash: string): Promise<{ status?: number; submittedEndpointUrl?: string } | undefined> {
	const rows = await readSealedRows<{ status?: number; submittedEndpointUrl?: string }>(wallet, "txs")
	return rows.find((r) => r.naturalId.toLowerCase() === hash)?.row
}

/** The header's network status once startup's syncs settle, read in the evaluation that sees it:
 *  `active` means the background's route served the status read. */
export async function settledStatus(page: Page): Promise<string> {
	const settled = await page.waitForFunction(
		() => {
			const status = document.querySelector('[data-testid="network-button"]')?.getAttribute("data-status")
			return status && status !== "sync" ? status : false
		},
		{ timeout: 60_000 },
	)
	return (await settled.jsonValue()) as string
}

export type RouteSource = "wallet" | "pxe"

export type RouteEvent = {
	source: RouteSource
	timestamp: number
	event: "state" | "active" | "move"
	endpointId?: string
	state?: string
	method?: string
}

/** How many lines the logger keeps in session storage, the oldest dropped first. */
const STORED_LINES = 2_000

/** The router's stored events since `since`, oldest first. Throws when the stored log has dropped
 *  lines from after `since`, rather than answer from part of the run. */
export async function routeEvents(wallet: Page, since: number): Promise<RouteEvent[]> {
	const read = await readSwLogTrail(wallet, { limit: STORED_LINES })
	const stored = Array.isArray(read) ? (read as { source?: string; timestamp?: number; data?: unknown }[]) : []
	if (stored.length >= STORED_LINES && Number(stored[0]?.timestamp) > since) {
		throw new Error(`the stored log starts after ${since}: its oldest router lines are gone`)
	}
	const lines = stored.filter((line) => JSON.stringify(line.data ?? []).includes("[route]"))
	return lines.flatMap((line) => {
		const source = line.source === "pxe" || line.source === "wallet" ? line.source : undefined
		const timestamp = Number(line.timestamp)
		const data = Array.isArray(line.data) ? line.data : []
		const body = data.find((d): d is Record<string, unknown> => typeof d === "object" && d !== null && "event" in d)
		if (!source || timestamp < since || !body) return []
		const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined)
		return [
			{
				source,
				timestamp,
				event: body.event as RouteEvent["event"],
				endpointId: text("endpointId"),
				state: text("state"),
				method: text("method"),
			},
		]
	})
}

/** The endpoint `source`'s router holds the role on, by its last `active` event, when that
 *  endpoint's last `state` event reads `ready`; undefined otherwise. */
export function readyHolder(events: readonly RouteEvent[], source: RouteSource): string | undefined {
	const own = events.filter((e) => e.source === source)
	const holder = own.findLast((e) => e.event === "active")?.endpointId
	const state = own.findLast((e) => e.event === "state" && e.endpointId === holder)?.state
	return holder !== undefined && state === "ready" ? holder : undefined
}
