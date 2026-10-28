import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { type AztecTestConfig, deployDelegatedPullRig } from "../fixtures/aztec"
import {
	clickByTestId,
	clickSelector,
	type ExtensionContext,
	grantCapBundle,
	openPopup,
	replaceInputValue,
	test,
	waitForHash,
} from "../fixtures/extension"
import { reloadExtensionPage, setViewport } from "../fixtures/browser"
import { navigateByHash } from "../fixtures/navigation"
import { PLAYGROUND_TEST_URL, requestPgBundle, setPgInput, setPgTextarea, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { closeReview, openReviewFromStrip, shotSend } from "../fixtures/send-page"
import { enterSendForm, setActiveSendType } from "../fixtures/transfers"
import { readScopeIdentity, seedPendingTrust } from "../helpers/activity-seeds"
import {
	approveExecute,
	openConnectedApp,
	openExecuteDetails,
	rejectCapabilities,
	rejectExecute,
	waitCapabilitiesReady,
	waitForExecuteContent,
	waitForPopup,
	waitForPopupClosed,
} from "../fixtures/popups"
import { readSealedRows } from "../fixtures/sealed-rows"
import { serializeInstance } from "../fixtures/selfpay-phase"
import { trimAddress } from "@/utils/string"
import {
	coverageOf,
	expectFitsNarrow,
	expectLaidOut,
	expectSitesClean,
	expectSweepClean,
	type IdentifierObservation,
	identifierSites,
	observeIdentifierSites,
	siteSuite,
	sweepTypeRoles,
} from "../fixtures/type-roles"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * The type-role sweep in the approval windows a dApp opens and the wallet pages a dApp's requests
 * reach: every role-bearing element computes to its role, and each identifier site a state renders
 * carries its own, an `AddressDisplay` read both as an account's name (`name`) and, pressed, as its
 * address (`meta`); no text runs past its box, the longest payload a dApp can send included. Every
 * window is rejected but a `registerToken`, whose token the requests after it read. The last test
 * fails on any site this file owns that no state read.
 */

type Connected = ExtensionContext & { playgroundPage: Page }

const sel = (testid: string) => `[data-testid="${testid}"]`
const WINDOW = { width: 400, height: 800 }
const AMOUNT = "5000000000000000000"
const NONCE = "0x0f3c7a91e24b6d08c5f1a39e7b2d40c86e9a1f53b7d20c4e8a6f91b3d5c07e2a"

const SITES = identifierSites()

/** Every observation a test made after its sites passed, for the file's last test. */
const observed: IdentifierObservation[] = []

/**
 * Resolves once some element at each live site of `state` has a box. An AddressDisplay paints its
 * text only after its contact lookup settles, so a site read sooner is empty. A site that never shows
 * is left to the observation, which names it.
 */
async function waitForStateSites(win: Page, surface: string, state: string): Promise<void> {
	const selectors = SITES.filter((site) => site.surface === surface && site.state === state && site.role !== "none" && !site.unreachable)
	for (const { selector } of selectors) {
		await win
			.waitForFunction(
				(s: string) =>
					Array.from(document.querySelectorAll(s)).some((el) => {
						const box = el.getBoundingClientRect()
						return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden"
					}),
				{ timeout: 10_000 },
				selector,
			)
			.catch(() => undefined)
	}
}

/** The faces and roles of the window, then the identifier sites of each state it renders. */
async function sweepWindow(win: Page, surface: string, states: readonly string[]): Promise<IdentifierObservation[]> {
	for (const state of states) await waitForStateSites(win, surface, state)
	expectSweepClean(await sweepTypeRoles(win), surface)
	await expectLaidOut(win, surface)
	await expectFitsNarrow(win, surface)
	const observations: IdentifierObservation[] = []
	for (const state of states) observations.push(await observeState(win, surface, state))
	// A name is judged as `name`, never the site's mono role. Each one shown is pressed to its address
	// and read again.
	if (await revealAddresses(win, surface, states)) for (const state of states) await observeState(win, surface, state)
	return observations
}

async function observeState(win: Page, surface: string, state: string): Promise<IdentifierObservation> {
	const observation = await observeIdentifierSites(win, surface, state, { sites: SITES })
	expectSitesClean(observation)
	observed.push(observation)
	return observation
}

/** Presses every `AddressDisplay` of `states` that shows a name, until each shows its address; whether any did. */
async function revealAddresses(win: Page, surface: string, states: readonly string[]): Promise<boolean> {
	let pressed = false
	for (const site of SITES.filter((s) => s.surface === surface && states.includes(s.state) && s.role !== "none" && !s.unreachable)) {
		const named = `${site.selector}[data-address-shows="name"]`
		for (let left = await win.$$(named); left.length > 0; left = await win.$$(named)) {
			await left[0]!.click()
			await win.waitForFunction(
				(sel: string, n: number) => document.querySelectorAll(sel).length < n,
				{ timeout: 5_000 },
				named,
				left.length,
			)
			pressed = true
		}
	}
	return pressed
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
		await setViewport(win, WINDOW)
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

	// The connected app's page reads back what the dApp was granted: its account and each listed scope.
	await setPgInput(pg, "tokenAddress", aztecConfig!.tokenAddress)
	await setPgInput(pg, "classId", aztecConfig!.tokenClassId)
	await grantCapBundle(ctx, pg, "contractClasses-listed", async (ids) => [ids[0]!])
	const wallet = await openPopup(ctx)
	try {
		await waitForHash(wallet, "#/popup/general")
		await openConnectedApp(wallet, new URL(PLAYGROUND_TEST_URL).host, sel("connected-app-account-row"))
		for (const type of ["contracts", "contractClasses"]) {
			await clickSelector(wallet, `${sel("granted-capability-toggle")}[data-capability-type="${type}"]`)
		}
		await sweepWindow(wallet, "popup-settings-connected-apps-id", [
			"a connected dApp (network)",
			"a connected app whose grant holds a contract scope (network)",
			"a connected app whose grant holds a class scope (network)",
		])
	} finally {
		await wallet.close()
	}
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
	/** A send: its value rows open under the summary before `ready` is awaited. */
	details?: true
	/** Approved, not rejected: what it registers, the requests after it read. */
	approve?: true
	/** Light and dark shots of the window, focused on this testid, when `NULO_E2E_SHOT_DIR` is set. */
	shot?: { name: string; focus: string }
	/** The grant's arguments, printed whole, each under its name: each name and its value's length in glyphs. */
	fullArguments?: Readonly<Record<string, number>>
}

function requests({ tokenAddress, minterAddress }: AztecTestConfig, accountAddress: string): Request[] {
	return [
		{
			// The token is not imported, so the transfer shows as its decoded arguments: `from`, the
			// wallet's account, by name, `to` by address, and `_nonce` as a field.
			method: "sendTx",
			button: "pg-btn-sendTx-default",
			inputs: { tokenAddress, recipient: minterAddress, amount: AMOUNT },
			ready: `${sel("execute-op-decoded-param-value")}[data-address-shows="name"]`,
			states: [
				"an aztec_sendTx request (network)",
				"an aztec_sendTx request with all details open (network)",
				"a decoded call with an address parameter (network)",
				"a decoded call with a field parameter (network)",
			],
			contained: true,
			details: true,
			shot: { name: "execute-fee-card", focus: "fee-settings-card" },
		},
		{
			method: "createAuthWit",
			button: "pg-btn-createAuthWit-callIntent",
			inputs: { tokenAddress, consumer: "", authwitAmount: AMOUNT, authwitNonce: NONCE },
			ready: sel("execute-authwit-target"),
			states: ["an aztec_createAuthWit request for a call (network)", "an operation other than a send, with an account (network)"],
		},
		{
			method: "createAuthWit",
			button: "pg-btn-createAuthWit-innerHash",
			inputs: { consumer: tokenAddress, innerHash: NONCE },
			ready: sel("execute-authwit-inner-hash-value"),
			states: ["an aztec_createAuthWit request for an intent (network)", "an operation other than a send, with an account (network)"],
		},
		{
			// The token is not imported, so the grant reads as its decoded parameters, each printed
			// whole: two addresses and a 32-byte nonce, the longest unbroken strings the card holds.
			method: "grantPublicAuthwit",
			button: "pg-btn-grantPublicAuthwit",
			inputs: { tokenAddress, authwitOwner: accountAddress, authwitCaller: minterAddress, authwitAmount: "1", authwitNonce: "7" },
			ready: `${sel("execute-grant-decoded-param")}[data-param="amount"] ${sel("execute-grant-decoded-param-value")}`,
			states: ["a grantPublicAuthwit request (network)"],
			contained: true,
			shot: { name: "grant", focus: "execute-grant-args" },
			fullArguments: { from: 66, to: 66, amount: 1, _nonce: 66 },
		},
		{
			method: "registerToken",
			button: "pg-btn-registerToken",
			inputs: { tokenAddress, accountAddress },
			ready: sel("register-token-symbol"),
			states: ["a registerToken request (network)", "an operation other than a send, with an account (network)"],
			approve: true,
		},
		{
			// The token is the wallet's now, so the call reads as its transfer: spent from an address the
			// wallet does not know, with the authwit nonce that lets the account do it.
			method: "sendTx",
			button: "pg-btn-consumeAuthwit",
			inputs: { tokenAddress, authwitOwner: minterAddress, authwitAmount: AMOUNT, authwitNonce: NONCE },
			ready: sel("execute-op-transfer-nonce-value"),
			states: [
				"a transfer the wallet reads, from a named sender (network)",
				"a transfer the wallet reads (network)",
				"a transfer from an address the wallet does not know (network)",
				"a transfer (network)",
				"a transfer carrying an authwit nonce (network)",
			],
			details: true,
		},
		{
			method: "grantPublicAuthwit",
			button: "pg-btn-grantPublicAuthwit",
			inputs: { tokenAddress, authwitOwner: accountAddress, authwitCaller: minterAddress, authwitAmount: "1", authwitNonce: "7" },
			ready: sel("execute-grant-transfer-to"),
			states: ["a grant on a registered token (network)"],
			shot: { name: "grant-registered", focus: "execute-grant-args" },
		},
	]
}

/** Every element that holds dApp-supplied payload text: the summary's calls, the call or action rows and the argument rows. */
const PAYLOAD_TEXT = [
	"execute-op-summary-call",
	"execute-op-payload-row",
	"execute-op-decoded-param",
	"execute-op-arg",
	"execute-op-transfer-nonce",
	"execute-grant-decoded-param",
].map(sel)

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
		set('[data-testid="execute-op-summary-call-title"]', `I${"i".repeat(63)}`)
		set('[data-testid="execute-op-call-to"]', "W".repeat(25))
		set('[data-testid="execute-op-summary-call-to"]', "W".repeat(25))
		set('[data-testid="execute-op-decoded-param"] > :first-child', `${"W".repeat(32)}:`)
		set('[data-testid="execute-op-decoded-param-value"]', "i".repeat(64))
		set('[data-testid="execute-grant-decoded-param"] > :first-child', `${"W".repeat(32)}:`)
	})
}
async function grantArguments(
	win: Page,
): Promise<{ param: string | null; glyphs: number; below: boolean; indent: number | null; lines: number }[]> {
	return win.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-testid="execute-grant-decoded-param"]')].map((row) => {
			const name = row.querySelector('[data-testid="execute-grant-decoded-param-name"]')
			const value = row.querySelector('[data-testid="execute-grant-decoded-param-value"]')
			const range = document.createRange()
			if (value) range.selectNodeContents(value)
			const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
			return {
				param: row.getAttribute("data-param"),
				glyphs: value?.textContent?.trim().length ?? 0,
				below: !!name && !!value && value.getBoundingClientRect().top >= name.getBoundingClientRect().bottom,
				indent: rects[0] ? Math.round(rects[0].left - row.getBoundingClientRect().left) : null,
				lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
			}
		}),
	)
}

async function expectFullArguments(win: Page, expected: Readonly<Record<string, number>>): Promise<void> {
	const args = await grantArguments(win)
	expect(args.map(({ param, glyphs }) => [param, glyphs])).toEqual(Object.entries(expected))
	for (const arg of args) {
		const at = JSON.stringify(arg)
		expect.soft(arg.below, `${arg.param} sits under its name: ${at}`).toBe(true)
		expect.soft(arg.indent, `${arg.param} starts at the row's left edge: ${at}`).toBe(0)
		expect.soft(arg.lines, `${arg.param} lines: ${at}`).toBeLessThanOrEqual(2)
	}
}

async function openExecute(ctx: Connected, { button, inputs, ready, details }: Request): Promise<Page> {
	for (const [name, value] of Object.entries(inputs)) await setPgInput(ctx.playgroundPage, name, value)
	const opened = waitForPopup(ctx, "execute", { timeout: 60_000 })
	await clickByTestId(ctx.playgroundPage, button)
	const win = await opened
	try {
		await setViewport(win, WINDOW)
		await waitForExecuteContent(win, 60_000)
		if (details) {
			await win.waitForSelector(sel("execute-op-summary"), { visible: true, timeout: 60_000 })
			expect(await win.$(sel("execute-op-details"))).toBeNull()
			await openExecuteDetails(win)
		}
		await win.waitForSelector(ready, { visible: true, timeout: 60_000 })
		// The fee readout swaps its rows when the estimate lands, which the narrow pass would read as text
		// gone: the sweep starts once it has landed or failed.
		await win.waitForFunction(feeSettled, { timeout: 60_000, polling: 200 })
	} catch (err) {
		await dismiss(win, rejectExecute)
		throw err
	}
	return win
}

/** No fee card, its estimate or its Fee Juice nudge shown, or the page's "Couldn't estimate fee" snack. */
function feeSettled(): boolean {
	const card = document.querySelector('[data-testid="fee-settings-card"]')
	if (!card || card.querySelector('[data-testid="fee-estimate"], [data-testid="send-fee-nudge"]')) return true
	return [...document.querySelectorAll('[data-testid="snackbar"]')].some((snack) => /estimate fee/i.test(snack.textContent ?? ""))
}

async function runRequest(ctx: Connected, request: Request, shown: Set<string>): Promise<void> {
	const pg = ctx.playgroundPage
	const seq = await snapshotResultSeq(pg)
	const win = await openExecute(ctx, request)
	try {
		const observations = await sweepWindow(win, "windows-execute", request.states)
		if (request.shot) await shotSend(win, request.shot.name, request.shot.focus)
		if (request.fullArguments) await expectFullArguments(win, request.fullArguments)
		if (request.contained) {
			expect(await payloadPastCard(win)).toBeLessThanOrEqual(0)
			await stretchPayload(win)
			expect(await payloadPastCard(win)).toBeLessThanOrEqual(0)
			await expectLaidOut(win, `${request.method}, the longest payload`)
			expect(observations.flatMap(({ hexOutsideMono }) => hexOutsideMono)).toEqual([])
		}
		const asserted = observations.flatMap(({ sites }) => sites.filter(({ mode }) => mode === "asserted"))
		// Only an `AddressDisplay` states what it shows; every other site reads `null`.
		for (const { readings } of asserted) for (const { addressShows } of readings) if (addressShows) shown.add(addressShows)
		if (request.approve) {
			await approveExecute(win, { approvableTimeoutMs: 60_000 })
			await waitForPopupClosed(win, 15_000)
		}
	} finally {
		await dismiss(win, rejectExecute)
	}
	expect((await waitForPgResult(pg, request.method, seq, 30_000)).status).toBe(request.approve ? "ok" : "error")
}

test.skipIf(!hasConfig)(
	"the execute window holds its roles, with an AddressDisplay showing an address and one showing a name",
	{ timeout: 300_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const shown = new Set<string>()
		for (const request of requests(aztecConfig!, ctx.accountAddress)) {
			await runRequest(ctx, request, shown)
		}
		expect([...shown].sort()).toEqual(["address", "name"])

		// A first receipt of a token the wallet holds, still waiting on the person's trust.
		const wallet = await openPopup(ctx)
		try {
			await waitForHash(wallet, "#/popup/general")
			await seedPendingTrust(wallet, await readScopeIdentity(wallet), await tokenRowOf(wallet, aztecConfig!.tokenAddress))
			await reloadExtensionPage(wallet)
			await waitForHash(wallet, "#/popup/general")
			await wallet.waitForSelector(sel("incoming-trust-contract"), { visible: true, timeout: 15_000 })
			await sweepWindow(wallet, "popup:incoming_trust", ["an incoming transfer from an unknown sender (network)"])
		} finally {
			await wallet.close()
		}
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

type Rig = { account: string; pullTokenAddress: string; consumerAddress: string }

/** Fills the playground's delegated send but leaves the consumer instance unset: registering it is what lets the wallet decode the call. */
async function rigDelegatedSend(ctx: Connected): Promise<Rig> {
	const pg = ctx.playgroundPage
	const [account] = await grantCapBundle(ctx, pg, "transaction-contracts", async (ids) => [ids[0]!])
	const { pullTokenAddress, consumerAddress } = await deployDelegatedPullRig(aztecConfig!, account!)
	await setPgInput(pg, "consumerAddress", consumerAddress)
	await setPgInput(pg, "amount", "100")
	await setPgTextarea(pg, "delegatedTokenInstance", await instanceJson(pullTokenAddress))
	return { account: account!, pullTokenAddress, consumerAddress }
}

async function tokenRowOf(page: Page, contract: string): Promise<{ id: number; contract: string }> {
	const row = (await readSealedRows<{ id: number; contract: string }>(page, "tokens")).find(
		(r) => r.row.contract.toLowerCase() === contract.toLowerCase(),
	)?.row
	if (!row) throw new Error(`no token row for ${contract}`)
	return { id: row.id, contract: row.contract }
}

test.skipIf(!hasConfig)(
	"the execute window holds its roles on a send whose simulation discovers an authwit",
	{ timeout: 600_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const pg = ctx.playgroundPage
		const rig = await rigDelegatedSend(ctx)
		await setPgTextarea(pg, "delegatedConsumerInstance", await instanceJson(rig.consumerAddress))
		const seq = await snapshotResultSeq(pg)
		const win = await openExecute(ctx, {
			method: "sendTx",
			button: "pg-btn-sendTx-delegated",
			inputs: {},
			ready: sel("execute-discovered-line-consumer"),
			states: [],
		})
		const assertedIn = (observation: IdentifierObservation | undefined) =>
			observation!.sites.filter(({ mode }) => mode === "asserted").map(({ site }) => site.selector)
		try {
			// At rest the summary names who the authorization lets act, and on what, before any press.
			expect(await win.$(sel("execute-op-details"))).toBeNull()
			const [rest] = await sweepWindow(win, "windows-execute", ["a send with a discovered authwit (network)"])
			expect(assertedIn(rest)).toEqual(
				expect.arrayContaining([sel("execute-discovered-line-caller"), sel("execute-discovered-line-consumer")]),
			)
			await shotSend(win, "authwit-summary", "execute-op-summary-authwits-section")
			await openExecuteDetails(win)
			await win.waitForSelector(sel("execute-discovered-authwit-details"), { visible: true, timeout: 10_000 })
			await shotSend(win, "authwit-details", "execute-op-discovered-authwits")
			const [rows, open] = await sweepWindow(win, "windows-execute", [
				"a send with a discovered authwit, all details open (network)",
				"a discovered authwit with its details open (network)",
			])
			expect(assertedIn(rows)).toEqual(expect.arrayContaining([sel("execute-discovered-consumer"), sel("execute-discovered-caller")]))
			expect(assertedIn(open)).toContain(sel("execute-discovered-inner-hash"))
		} finally {
			await dismiss(win, rejectExecute)
		}
		expect((await waitForPgResult(pg, "sendTx", seq, 30_000)).status).toBe("error")

		// The minter is a known sender before the pull token is the wallet's, so the token's first
		// balance read finds the notes the minter sent the account.
		const pull = rig.pullTokenAddress
		const minter = aztecConfig!.minterAddress
		const wallet = await openPopup(ctx)
		try {
			await waitForHash(wallet, "#/popup/general")
			await navigateByHash(wallet, "#/popup/settings/developer/account-state/senders", 10_000)
			await wallet.waitForSelector(sel("senders-add-btn"), { visible: true, timeout: 10_000 })
			await clickByTestId(wallet, "senders-add-btn")
			await wallet.waitForSelector(sel("new-sender-submit"), { visible: true, timeout: 5_000 })
			await replaceInputValue(wallet, sel("new-sender-address-input"), minter)
			await clickByTestId(wallet, "new-sender-submit")
			await wallet.waitForSelector(`${sel("sender-row")}[data-sender-address="${minter}"]`, { visible: true, timeout: 30_000 })
			await sweepWindow(wallet, "popup-settings-developer-account-state-senders", ["a registered sender (network)"])

			// The pull token becomes the wallet's own: the authorization it needs then reads as a move of
			// its tokens, and a transfer that names no sender as one from this account.
			const shown = new Set<string>()
			await runRequest(
				ctx,
				{
					method: "registerToken",
					button: "pg-btn-registerToken",
					inputs: { tokenAddress: pull, accountAddress: rig.account },
					ready: sel("register-token-symbol"),
					states: [],
					approve: true,
				},
				shown,
			)
			await runRequest(
				ctx,
				{
					method: "sendTx",
					button: "pg-btn-sendTx-delegated",
					inputs: {},
					ready: sel("execute-discovered-line-from"),
					states: ["a discovered token authorization the wallet reads (network)"],
				},
				shown,
			)
			await pg.select(sel("pg-select-transferFn"), "transfer")
			await runRequest(
				ctx,
				{
					method: "sendTx",
					button: "pg-btn-sendTx-default",
					inputs: { tokenAddress: pull, recipient: minter, amount: "1" },
					ready: `${sel("execute-op-transfer-sender")}[data-sender-kind="account"]`,
					states: ["a transfer from one of the wallet's accounts (network)"],
					details: true,
				},
				shown,
			)

			// The account's pull notes: spendable on Send, listed on the notes page.
			await navigateByHash(wallet, `#/popup/send?tokenId=${(await tokenRowOf(wallet, pull)).id}`, 10_000)
			await wallet.waitForSelector(sel("send-from-type"), { visible: true, timeout: 10_000 })
			await setActiveSendType(wallet, "send-from-type", "private")
			await enterSendForm(wallet, { amount: "1", destination: minter })
			await openReviewFromStrip(wallet)
			await sweepWindow(wallet, "popup-send", ["recipient and amount typed, review sheet open (network)"])
			await closeReview(wallet)
			await navigateByHash(wallet, "#/popup/settings/developer/account-state/notes", 10_000)
			await wallet.waitForFunction(
				(s: string, text: string) => [...document.querySelectorAll(s)].some((el) => el.textContent?.trim() === text),
				{ timeout: 60_000 },
				sel("note-contract"),
				trimAddress(pull, 4, 4),
			)
			await sweepWindow(wallet, "popup-settings-developer-account-state-notes", ["a note (network)", "a note exists (network)"])
			await navigateByHash(wallet, "#/popup/settings/developer/account-state/contracts", 10_000)
			await wallet.waitForSelector(sel("address-display"), { visible: true, timeout: 15_000 })
			await sweepWindow(wallet, "popup-settings-developer-account-state-contracts", ["a registered contract (network)"])
		} finally {
			await wallet.close()
		}
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
			details: true,
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

test.skipIf(!hasConfig)("every identifier site the network suite owns was read in its role", () => {
	const coverage = coverageOf(observed, { sites: SITES.filter((site) => siteSuite(site) === "network") })
	console.log(`[type-roles] identifier sites: ${coverage.live} network-owned live`)
	expect(coverage.live).toBeGreaterThan(0)
	expect(coverage.unobserved).toEqual([])
	// Every AddressDisplay here can be pressed to its address, so none may be read only as a name.
	const forms = new Map<string, Set<string>>()
	for (const { sites } of observed) {
		for (const { key, readings } of sites) {
			for (const { addressShows } of readings) if (addressShows) forms.set(key, (forms.get(key) ?? new Set()).add(addressShows))
		}
	}
	expect([...forms].filter(([, shown]) => !shown.has("address")).map(([key]) => key)).toEqual([])
})
