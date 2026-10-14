import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { type AztecTestConfig, deployDelegatedPullRig, ensureStandardPublicChecks } from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, grantCapBundle, test } from "../fixtures/extension"
import { requestPgBundle, setPgInput, setPgTextarea, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import {
	rejectCapabilities,
	rejectExecute,
	waitCapabilitiesReady,
	waitForExecuteContent,
	waitForPopup,
	waitForPopupClosed,
} from "../fixtures/popups"
import {
	expectSitesClean,
	expectSweepClean,
	type IdentifierObservation,
	identifierSites,
	observeIdentifierSites,
	sweepTypeRoles,
} from "../fixtures/type-roles"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * The type-role sweep in the approval windows a dApp opens: every role-bearing element of the
 * capabilities and execute windows computes to its role, and each identifier site the request
 * renders carries its own, an `AddressDisplay` showing an address (`data`) and one showing an
 * account's name (`name`) among them. Every window is rejected.
 */

type Connected = ExtensionContext & { playgroundPage: Page }

const sel = (testid: string) => `[data-testid="${testid}"]`
const WINDOW = { width: 400, height: 800 }
const AMOUNT = "5000000000000000000"
const NONCE = "0x0f3c7a91e24b6d08c5f1a39e7b2d40c86e9a1f53b7d20c4e8a6f91b3d5c07e2a"

/**
 * A decoded argument's address branch. A field or integer argument renders the same testid on the
 * sibling branch, and the row's `data-value-kind` is the condition that picks this one.
 */
const ADDRESS_ARGUMENT = `${sel("execute-op-decoded-param")}[data-value-kind="address"] ${sel("execute-op-decoded-param-value")}`
const SITES = identifierSites().map((site) =>
	site.selector === sel("execute-op-decoded-param-value") && site.expression === "p.value.value"
		? { ...site, selector: ADDRESS_ARGUMENT }
		: site,
)

/** Sweep steps 1 and 2, then the identifier sites of each state the window renders. */
async function sweepWindow(win: Page, surface: string, states: readonly string[]): Promise<IdentifierObservation[]> {
	expectSweepClean(await sweepTypeRoles(win), surface)
	const observations: IdentifierObservation[] = []
	for (const state of states) {
		const observation = await observeIdentifierSites(win, surface, state, { arc: 2, sites: SITES })
		expectSitesClean(observation)
		observations.push(observation)
	}
	return observations
}

/** Rejects the window and waits for it to close; a window a failed assertion left behind is closed outright. */
async function dismiss(win: Page, reject: (page: Page) => Promise<void>): Promise<void> {
	if (win.isClosed()) return
	await reject(win).catch(() => undefined)
	await waitForPopupClosed(win, 15_000).catch(() => undefined)
	if (!win.isClosed()) await win.close().catch(() => undefined)
}

test.skipIf(!hasConfig)("the capabilities window holds its roles", { timeout: 180_000 }, async ({ dappConnectedExtensionPerTest: ctx }) => {
	const pg = ctx.playgroundPage
	const seq = await snapshotResultSeq(pg)
	const opened = waitForPopup(ctx, "capabilities", { timeout: 60_000 })
	await requestPgBundle(pg, "transaction-listed", { tokenAddress: aztecConfig!.tokenAddress })
	const win = await opened
	try {
		await win.setViewport(WINDOW)
		await waitCapabilitiesReady(win)
		await sweepWindow(win, "windows-capabilities", [
			"a connect request (network)",
			"a connect request with an account to choose (network)",
		])
	} finally {
		await dismiss(win, rejectCapabilities)
	}
	expect((await waitForPgResult(pg, "requestCapabilities", seq, 30_000)).status).toBe("error")
})

type Request = {
	method: string
	button: string
	inputs: Record<string, string>
	/** Shown once the window has decoded the request and named what it can. */
	ready: string
	states: readonly string[]
}

function requests({ tokenAddress, minterAddress }: AztecTestConfig): Request[] {
	return [
		{
			// The token is not imported, so the transfer shows as its decoded arguments: `from`, the
			// wallet's account, by name, and `to` by address.
			method: "sendTx",
			button: "pg-btn-sendTx-default",
			inputs: { tokenAddress, recipient: minterAddress, amount: AMOUNT },
			ready: `${sel("execute-op-decoded-param-value")}[data-address-shows="name"]`,
			states: ["an aztec_sendTx request (network)", "a decoded call with an address parameter (network)"],
		},
		{
			method: "createAuthWit",
			button: "pg-btn-createAuthWit-callIntent",
			inputs: { tokenAddress, authwitAmount: AMOUNT, authwitNonce: NONCE },
			ready: sel("execute-authwit-target"),
			states: ["an aztec_createAuthWit request for a call (network)"],
		},
	]
}

async function openExecute(ctx: Connected, { button, inputs, ready }: Request): Promise<Page> {
	for (const [name, value] of Object.entries(inputs)) await setPgInput(ctx.playgroundPage, name, value)
	const opened = waitForPopup(ctx, "execute", { timeout: 60_000 })
	await clickByTestId(ctx.playgroundPage, button)
	const win = await opened
	try {
		await win.setViewport(WINDOW)
		await waitForExecuteContent(win, 60_000)
		await win.waitForSelector(ready, { visible: true, timeout: 60_000 })
	} catch (err) {
		await dismiss(win, rejectExecute)
		throw err
	}
	return win
}

test.skipIf(!hasConfig)(
	"the execute window holds its roles, with an AddressDisplay showing an address and one showing a name",
	{ timeout: 300_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const pg = ctx.playgroundPage
		const shown = new Set<string | null>()
		for (const request of requests(aztecConfig!)) {
			const seq = await snapshotResultSeq(pg)
			const win = await openExecute(ctx, request)
			try {
				const observations = await sweepWindow(win, "windows-execute", request.states)
				const asserted = observations.flatMap(({ sites }) => sites.filter(({ mode }) => mode === "asserted"))
				for (const { readings } of asserted) for (const { addressShows } of readings) shown.add(addressShows)
			} finally {
				await dismiss(win, rejectExecute)
			}
			expect((await waitForPgResult(pg, request.method, seq, 30_000)).status).toBe("error")
		}
		expect([...shown].sort()).toEqual(["address", "name"])
	},
)

/** A contract instance as the playground's textareas take it: bigints and field-likes as strings. */
async function instanceJson(address: string): Promise<string> {
	const { createAztecNodeClient } = await import("@aztec-labs/aztec.js/node")
	const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses")
	const instance = await createAztecNodeClient(aztecConfig!.nodeUrl).getContract(AztecAddress.fromStringUnsafe(address))
	if (!instance) throw new Error(`no contract instance at ${address}`)
	return JSON.stringify(instance, (_k, x) => {
		if (typeof x === "bigint") return x.toString()
		const ctor = x && typeof x === "object" ? Object.getPrototypeOf(x)?.constructor?.name : undefined
		return ctor === "Fr" || ctor === "AztecAddress" || ctor === "EthAddress" ? x.toString() : x
	})
}

test.skipIf(!hasConfig)(
	"the execute window holds its roles on a send whose simulation discovers an authwit",
	{ timeout: 600_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const pg = ctx.playgroundPage
		const [account] = await grantCapBundle(ctx, pg, "transaction-contracts", async (ids) => [ids[0]!])
		await ensureStandardPublicChecks(aztecConfig!)
		const { pullTokenAddress, consumerAddress } = await deployDelegatedPullRig(aztecConfig!, account!)
		await setPgInput(pg, "consumerAddress", consumerAddress)
		await setPgInput(pg, "amount", "100")
		await setPgTextarea(pg, "delegatedTokenInstance", await instanceJson(pullTokenAddress))
		await setPgTextarea(pg, "delegatedConsumerInstance", await instanceJson(consumerAddress))
		const seq = await snapshotResultSeq(pg)
		const win = await openExecute(ctx, {
			method: "sendTx",
			button: "pg-btn-sendTx-delegated",
			inputs: {},
			ready: sel("execute-discovered-caller"),
			states: [],
		})
		try {
			const [observation] = await sweepWindow(win, "windows-execute", ["a send with a discovered authwit (network)"])
			const asserted = observation!.sites.filter(({ mode }) => mode === "asserted").map(({ site }) => site.selector)
			expect(asserted).toEqual(expect.arrayContaining([sel("execute-discovered-consumer"), sel("execute-discovered-caller")]))
		} finally {
			await dismiss(win, rejectExecute)
		}
		expect((await waitForPgResult(pg, "sendTx", seq, 30_000)).status).toBe("error")
	},
)
