import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { type AztecTestConfig, deployDelegatedPullRig } from "../fixtures/aztec"
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
import { serializeInstance } from "../fixtures/selfpay-phase"
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

/** The faces and roles of the window, then the identifier sites of each state it renders. */
async function sweepWindow(win: Page, surface: string, states: readonly string[]): Promise<IdentifierObservation[]> {
	expectSweepClean(await sweepTypeRoles(win), surface)
	const observations: IdentifierObservation[] = []
	for (const state of states) {
		const observation = await observeIdentifierSites(win, surface, state, { sites: SITES })
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
		await clickByTestId(win, "cap-detail-toggle")
		await win.waitForSelector(sel("capability-address"), { visible: true, timeout: 10_000 })
		const [details] = await sweepWindow(win, "windows-capabilities", ["a contract scope with its details open (network)"])
		expect(details!.sites.filter(({ mode }) => mode === "asserted").map(({ site }) => site.selector)).toContain(
			sel("capability-address"),
		)
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
	/** The payload must stay inside the card and every hex string in a mono role. */
	contained?: true
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
			contained: true,
		},
		{
			method: "createAuthWit",
			button: "pg-btn-createAuthWit-callIntent",
			inputs: { tokenAddress, authwitAmount: AMOUNT, authwitNonce: NONCE },
			ready: sel("execute-authwit-target"),
			states: ["an aztec_createAuthWit request for a call (network)"],
		},
		{
			// Its hex arguments are the longest unbroken strings a generic dApp puts in the payload.
			method: "grantPublicAuthwit",
			button: "pg-btn-grantPublicAuthwit",
			inputs: { tokenAddress, authwitCaller: minterAddress, authwitAmount: "1", authwitNonce: "7" },
			ready: sel("execute-authwit-args"),
			states: ["a grantPublicAuthwit request (network)"],
			contained: true,
		},
	]
}

/** Every element that holds dApp-supplied payload text: the call or action rows and the argument rows. */
const PAYLOAD_TEXT = ["execute-op-payload-row", "execute-op-decoded-param", "execute-op-arg", "execute-op-transfer-nonce"].map(sel)

/** How far the payload's text reaches past the card's right edge, in px; 0 or less is inside. */
async function payloadPastCard(win: Page): Promise<number> {
	return win.evaluate((selectors: string[]) => {
		const card = document.querySelector('[data-testid="execute-op-item"]')
		if (!card) throw new Error("no execute-op-item")
		const nodes: Node[] = []
		for (const holder of document.querySelectorAll(selectors.join(", "))) {
			const text = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT)
			for (let node = text.nextNode(); node; node = text.nextNode()) nodes.push(node)
		}
		const rights = nodes.flatMap((node) => {
			const range = document.createRange()
			range.selectNodeContents(node)
			return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => rect.right)
		})
		if (rights.length === 0) throw new Error("no payload text")
		return Math.max(...rights) - card.getBoundingClientRect().right
	}, PAYLOAD_TEXT)
}

/**
 * Writes the longest strings a dApp can make the card show into the rendered window: a 64-glyph
 * function name, a 25-glyph contact name for its contract, 32-glyph parameter names and 64-glyph
 * values. The playground sends real calls only, so this is the one way to reach them.
 */
async function stretchPayload(win: Page): Promise<void> {
	await win.evaluate(() => {
		const set = (selector: string, text: string) => {
			for (const el of document.querySelectorAll(selector)) el.textContent = text
		}
		set('[data-testid="execute-op-payload-row"] > :first-child', `I${"i".repeat(63)}`)
		set('[data-testid="execute-op-call-to"]', "W".repeat(25))
		set('[data-testid="execute-op-decoded-param"] > :first-child', `${"W".repeat(32)}:`)
		set('[data-testid="execute-op-decoded-param-value"]', "i".repeat(64))
	})
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
		const shown = new Set<string>()
		for (const request of requests(aztecConfig!)) {
			const seq = await snapshotResultSeq(pg)
			const win = await openExecute(ctx, request)
			try {
				const observations = await sweepWindow(win, "windows-execute", request.states)
				if (request.contained) {
					expect(await payloadPastCard(win)).toBeLessThanOrEqual(0)
					await stretchPayload(win)
					expect(await payloadPastCard(win)).toBeLessThanOrEqual(0)
					expect(observations.flatMap(({ hexOutsideMono }) => hexOutsideMono)).toEqual([])
				}
				const asserted = observations.flatMap(({ sites }) => sites.filter(({ mode }) => mode === "asserted"))
				// Only an `AddressDisplay` states what it shows; every other site reads `null`.
				for (const { readings } of asserted) for (const { addressShows } of readings) if (addressShows) shown.add(addressShows)
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
	return serializeInstance(instance)
}

/** Fills the playground's delegated send but leaves the consumer instance unset: registering it is what lets the wallet decode the call. */
async function rigDelegatedSend(ctx: Connected): Promise<{ consumerAddress: string }> {
	const pg = ctx.playgroundPage
	const [account] = await grantCapBundle(ctx, pg, "transaction-contracts", async (ids) => [ids[0]!])
	const { pullTokenAddress, consumerAddress } = await deployDelegatedPullRig(aztecConfig!, account!)
	await setPgInput(pg, "consumerAddress", consumerAddress)
	await setPgInput(pg, "amount", "100")
	await setPgTextarea(pg, "delegatedTokenInstance", await instanceJson(pullTokenAddress))
	return { consumerAddress }
}

test.skipIf(!hasConfig)(
	"the execute window holds its roles on a send whose simulation discovers an authwit",
	{ timeout: 600_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const pg = ctx.playgroundPage
		const { consumerAddress } = await rigDelegatedSend(ctx)
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
			await clickByTestId(win, "execute-discovered-authwit-toggle")
			await win.waitForSelector(sel("execute-discovered-authwit-details"), { visible: true, timeout: 10_000 })
			const [open] = await sweepWindow(win, "windows-execute", ["a discovered authwit with its details open (network)"])
			expect(open!.sites.filter(({ mode }) => mode === "asserted").map(({ site }) => site.selector)).toContain(
				sel("execute-discovered-inner-hash"),
			)
		} finally {
			await dismiss(win, rejectExecute)
		}
		expect((await waitForPgResult(pg, "sendTx", seq, 30_000)).status).toBe("error")
	},
)

test.skipIf(!hasConfig)(
	"the execute window holds its roles on the raw fields of a call it cannot decode",
	{ timeout: 600_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const pg = ctx.playgroundPage
		// The consumer stays unregistered, so the wallet has no interface for `donate` and its field stays raw.
		await rigDelegatedSend(ctx)
		const seq = await snapshotResultSeq(pg)
		const win = await openExecute(ctx, {
			method: "sendTx",
			button: "pg-btn-sendTx-delegated",
			inputs: {},
			ready: sel("execute-op-raw-toggle"),
			states: [],
		})
		try {
			await clickByTestId(win, "execute-op-raw-toggle")
			await win.waitForSelector(sel("execute-op-arg-field"), { visible: true, timeout: 10_000 })
			const [raw] = await sweepWindow(win, "windows-execute", ["an undecodable call with execute-op-raw-toggle clicked (network)"])
			expect(raw!.sites.filter(({ mode }) => mode === "asserted").map(({ site }) => site.selector)).toContain(
				sel("execute-op-arg-field"),
			)
		} finally {
			await dismiss(win, rejectExecute)
		}
		expect((await waitForPgResult(pg, "sendTx", seq, 30_000)).status).toBe("error")
	},
)
