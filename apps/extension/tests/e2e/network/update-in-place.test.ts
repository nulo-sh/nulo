/**
 * A populated release install, updated in place to the candidate build, still opens and reads
 * everything it held. Opt-in: `NULO_E2E_UPDATE_FROM=<tag>` with `NULO_E2E_UPDATE_TO=<candidate>`
 * (`scripts/e2e/build-update-candidate.sh`); `NULO_E2E_UPDATE_RECORD=1` also writes the release's
 * storage as the replay's recording.
 *
 * Failure mode: rows the released code wrote, not rows a fixture wrote, stop reading under the
 * candidate's boot (gate, engine, integrity coordinator, classifier) after the browser's own update,
 * so a person updating loses a row or meets a barrier. A unit or composition test reads only rows
 * someone wrote by hand, and only an in-place update keeps the profile, the id and the storage.
 *
 * Testnet is the stand-in node, so it holds only what a person can hold there without one: derived
 * and imported accounts. Everything that needs a chain lives on a network added on the run's sandbox.
 *
 * On the sandbox it also pins the token, picks a Send fee payer and an app window's fee payer, so
 * the release's own maps meet the candidate's unlock, which seals them in place.
 *
 * A release that seals its rows is read through its own services, as it reads them, and ends on
 * Testnet with its second account selected: the popup opens there only on a selection it read,
 * since without one it opens on the network's first account. Its endpoints move first onto loopback
 * nodes that report each network's chain, through its own service, since its recording cannot be
 * rewritten offline and must name no outside endpoint.
 *
 * Not populated: the auth registry, a deleted profile, a restore, and the token list and prices
 * (the egress guard blocks both).
 *
 * Runtime: estimated 6 min on Chrome, 9 min on Firefox; measured 102 to 162 s and 182 to 186 s, the
 * release's real proof of the account's deployment included.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { LEGACY_SELECTED_ACCOUNT_KEY } from "@/wallet/services/ui-preference/spec"
import { STORES } from "@/wallet/storage/stores"
import { walletChainId } from "@nulo/wallet-core/chain-id"
import type { AztecTestConfig } from "../fixtures/aztec"
import { BROWSER } from "../fixtures/browser"
import {
	type ExtensionContext,
	clickByTestId,
	connectPlayground,
	grantCapBundle,
	launchExtension,
	openPopup,
	registerProfile,
	replaceInputValue,
	test,
	waitForHash,
} from "../fixtures/extension"
import {
	addContact,
	captureBalanceBaseline,
	captureSoleProfileId,
	closeStuckPopup,
	contactRow,
	createAccount,
	ensureUnlocked,
	getAccountAddress,
	getTokenDetailBalances,
	importToken,
	navigateByHash,
	navigateToTokenDetail,
	pinFromTokenPage,
	selectFeeMethod,
	selectedAccount,
	setDeveloperMode,
	switchAccount,
	switchToNetwork,
	waitForFreshBalanceRow,
	waitForShownAccount,
	waitForToast,
} from "../fixtures/helpers"
import { openPlayground, setPgInputs, txHashOf } from "../fixtures/playground"
import { openSend } from "../fixtures/send-page"
import { pollUntil } from "../fixtures/poll"
import { reconnectPlayground, runApprovedPgCall } from "../fixtures/send"
import { inPlaceUpdate, readLocalStorage, updateBuilds } from "../fixtures/update/in-place"
import { moveEndpointsToLoopback } from "../fixtures/update/loopback-endpoints"
import { expectReleasePreferences, plaintextPreferences } from "../fixtures/update/preferences"
import { recordingProblems, writeRecording } from "../fixtures/update/recording"
import { type ReleaseTraits, releaseTraits } from "../fixtures/update/release"
import { readRelease } from "../fixtures/update/read-release"
import { isLoopbackUrl, loopbackOrigins, namedHostCount, type ReleasePreferences } from "../fixtures/update/release-reads"
import { approveReleaseConnect } from "../fixtures/update/release-ui"
import { BARRIERS, missingFamilies, shownOverlays, updateProblems } from "../fixtures/update/verify"
import {
	confirmImport,
	exportAccountBody,
	exportImportedAccountBody,
	FIRST_ACCOUNT_NAME,
	gotoAccounts,
	previewImport,
} from "../helpers/account-io"
import { accountRows, readNetworkRows } from "../helpers/identity-rows"
import { answerUpdatedTerms } from "../helpers/legal-drivers"
import { answerArrival } from "../helpers/network-arrival"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const D = 10n ** 18n
const PUBLIC = 10n * D
const PRIVATE = 25n * D
const SENT = D
const SANDBOX = "Sandbox"
const TESTNET_ACCOUNTS = [FIRST_ACCOUNT_NAME, "Second", "Imported"]
const CONTACTS = ["Alice", "Bob"]
const PROFILES = `${STORES.profiles.ref.root}@`
/** The loopback nodes a sealing release's endpoints moved onto, stopped when the test ends. */
const standIns: Array<{ stop: () => Promise<void> }> = []

type ChainInfo = { chainId: string; version: string }
type Populated = {
	release: ReleaseTraits
	before: Record<string, unknown>
	chainInfo: ChainInfo
	account: string
	imported: string
	incoming: number
	/** The release's account selection and preference maps, as it reads them. */
	selection: string
	preferences: ReleasePreferences
	/** A sealing release's loopback origins, which the replay's recording names. */
	dials?: string[]
}

function randomAddress(): string {
	for (;;) {
		let hex = ""
		while (hex.length < 64) hex += Math.floor(Math.random() * 16).toString(16)
		if (isValidAztecAddress(`0x${hex}`)) return `0x${hex}`
	}
}

/** An account file from another profile, so the imported row is genuinely foreign. */
async function foreignAccountFile(): Promise<string> {
	const donor = await launchExtension()
	try {
		await registerProfile(donor)
		const page = await openPopup(donor)
		await waitForHash(page, "#/popup/general", 30_000)
		return await exportAccountBody(page, FIRST_ACCOUNT_NAME, false)
	} finally {
		await donor.close()
	}
}

/** Resolves with the imported account's address. A release whose new profile opens on another
 *  network (Mainnet, once it seeds one) is switched to Testnet first. */
async function populateTestnet(page: Page, accountFile: string): Promise<string> {
	const header = await page.waitForFunction(
		() => document.querySelector('[data-testid="network-button"]')?.textContent?.trim() || undefined,
		{ timeout: 15_000 },
	)
	if ((await header.jsonValue()) !== "Testnet") await switchToNetwork(page, "Testnet")
	await createAccount(page, "Second")
	const imported = await previewImport(page, accountFile)
	if (!imported) throw new Error("the release refused the foreign account file")
	await confirmImport(page, "Imported")
	await closeStuckPopup(page)
	await navigateByHash(page, "#/popup/settings/contacts", 15_000)
	await page.waitForSelector('[data-testid="contacts-new-btn"]', { visible: true, timeout: 15_000 })
	for (const name of CONTACTS) await addContact(page, name, randomAddress())
	return imported
}

async function sandboxChainInfo(nodeUrl: string): Promise<ChainInfo> {
	const { createAztecNodeClient } = await import("@aztec-labs/aztec.js/node")
	const info = await createAztecNodeClient(nodeUrl).getNodeInfo()
	return { chainId: String(info.l1ChainId), version: String(info.rollupVersion) }
}

/** The release's selection, read as it keeps it: a plaintext release stores it in plaintext and has
 *  no service to read it through; a sealing one reads it through its UI-preference service. */
async function releaseSelection(page: Page, storage: ReleaseTraits["storage"]): Promise<string | undefined> {
	if (storage === "sealed") return selectedAccount(page)
	return page.evaluate(
		async (key: string) => (await chrome.storage.local.get(key))[key] as string | undefined,
		LEGACY_SELECTED_ACCOUNT_KEY,
	)
}

/** Adds the sandbox as a network, which activates it, and resolves with the account the switch
 *  derives there. */
async function addSandboxNetwork(page: Page, nodeUrl: string, chainInfo: ChainInfo, release: ReleaseTraits): Promise<string> {
	await setDeveloperMode(page, true)
	await navigateByHash(page, "#/popup/settings/networks", 15_000)
	await clickByTestId(page, "network-new-btn")
	await page.waitForSelector('[data-testid="network-name-input"] input', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="network-name-input"] input', SANDBOX)
	await replaceInputValue(page, '[data-testid="network-rpc-input"] input', nodeUrl)
	await clickByTestId(page, "new-network-submit")
	await waitForToast(page, "Network is created", 60_000)
	const chainId = walletChainId(Number(chainInfo.chainId), Number(chainInfo.version))
	return pollUntil(
		async () => {
			const active = await releaseSelection(page, release.storage)
			const onSandbox = (await accountRows(page, chainId)).some((row) => row.address === active)
			return onSandbox ? active : undefined
		},
		(address) => address !== undefined,
		{ label: `an active account on the sandbox chain ${chainId}`, timeoutMs: 60_000, intervalMs: 500 },
	) as Promise<string>
}

/** The minter, an outside account, sends `to` a public and a private transfer of the run's token. */
async function receiveOnSandbox(cfg: AztecTestConfig, to: string): Promise<void> {
	const fixtures = await import("../fixtures/aztec")
	const { wallet, node, cleanup } = await fixtures.createTestWallet(cfg.nodeUrl)
	try {
		const fee = await fixtures.createSponsoredFeeOptions(wallet)
		const minter = cfg.minterAddress
		await fixtures.mintPublicTokens(wallet, cfg.tokenAddress, minter, PUBLIC, minter, fee)
		await fixtures.mintPrivateTokens(wallet, node, cfg.tokenAddress, minter, PRIVATE, minter, fee)
		await fixtures.transferPublicTokens(wallet, cfg.tokenAddress, minter, to, PUBLIC, fee)
		await fixtures.transferPrivateTokens(wallet, node, cfg.tokenAddress, minter, to, PRIVATE, fee)
	} finally {
		await cleanup()
	}
}

async function incomingCards(page: Page, atLeast: number): Promise<number> {
	await navigateByHash(page, "#/popup/activity", 15_000)
	// The count the wait saw: the list re-renders as its sync settles, so a later read can meet it empty.
	const shown = await page.waitForFunction(
		(n: number) => {
			const cards = document.querySelectorAll('[data-testid="tx-incoming-card"]').length
			return cards >= n ? cards : false
		},
		{ timeout: 180_000, polling: 1_000 },
		atLeast,
	)
	return (await shown.jsonValue()) as number
}

async function populate(ctx: ExtensionContext, cfg: AztecTestConfig, accountFile: string, release: ReleaseTraits): Promise<Populated> {
	await registerProfile(ctx)
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	const imported = await populateTestnet(page, accountFile)

	const chainInfo = await sandboxChainInfo(cfg.nodeUrl)
	const account = await addSandboxNetwork(page, cfg.nodeUrl, chainInfo, release)
	await navigateByHash(page, "#/popup/general", 15_000)
	const baseline = await captureBalanceBaseline(page, account, cfg.tokenAddress)
	await importToken(page, cfg.tokenAddress)
	await receiveOnSandbox(cfg, account)
	await waitForFreshBalanceRow(page, {
		account,
		tokenContract: cfg.tokenAddress,
		expectedPublicRaw: PUBLIC.toString(),
		expectedPrivateRaw: PRIVATE.toString(),
		baselineUpdatedAt: baseline,
		timeoutMs: 180_000,
	})
	const incoming = await incomingCards(page, 2)
	await pickPreferences(page)
	await page.close()

	const dapp = await connectPlayground(ctx, { chainInfo }, release.connect === "replaces-page" ? approveReleaseConnect : undefined)
	await grantCapBundle(ctx, dapp, "transaction", async (ids) => {
		if (!ids.includes(account)) throw new Error(`the capabilities window offers ${ids.join(", ")}, not ${account}`)
		return [account]
	})
	await sendFromWallet(ctx, dapp, cfg, account)
	await dapp.close()
	const sealed = release.storage === "sealed" ? await endOnSecondAccount(ctx) : undefined
	const before = await readLocalStorage(ctx)
	expect(missingFamilies(before, release.storage)).toEqual([])
	const selection = sealed?.selection ?? before[LEGACY_SELECTED_ACCOUNT_KEY]
	if (typeof selection !== "string") throw new Error(`the release stores no account selection: ${String(selection)}`)
	const preferences = sealed?.preferences ?? plaintextPreferences(before, soleProfileId(before))
	return { release, before, chainInfo, account, imported, incoming, selection, preferences, dials: sealed?.dials }
}

function soleProfileId(entries: Record<string, unknown>): string {
	const ids = Object.keys(entries).flatMap((key) => (key.startsWith(PROFILES) ? [key.slice(PROFILES.length)] : []))
	if (ids.length !== 1) throw new Error(`the release stores ${ids.length} profiles, not one`)
	return ids[0] as string
}

/** Moves the release's endpoints onto this machine and selects its second Testnet account, each
 *  through its own UI or service, then reads the release through its own services: its selection,
 *  its preference maps and the loopback origins its rows name. */
async function endOnSecondAccount(
	ctx: ExtensionContext,
): Promise<{ selection: string | undefined; preferences: ReleasePreferences; dials: string[] }> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	const networks = await readNetworkRows(page)
	const moved = networks.flatMap((network) => network.endpoints.map((endpoint) => endpoint.rpcUrl)).filter((url) => !isLoopbackUrl(url))
	standIns.push(await moveEndpointsToLoopback(page, networks))
	await switchToNetwork(page, "Testnet")
	await switchAccount(page, "Second")
	const reads = await readRelease(page, await captureSoleProfileId(page))
	await page.close()
	const stored = await readLocalStorage(ctx)
	if (namedHostCount({ reads, stored }, moved) > 0) throw new Error("the release still holds a host its endpoints moved off")
	const second = reads.accounts.find(
		(row) => row.name === "Second" && row.chainId === reads.networks.find((n) => n.kind === "testnet")?.chainId,
	)
	if (!second || reads.selection !== second.address) throw new Error("the release does not read its second Testnet account as selected")
	return { selection: reads.selection, preferences: reads.preferences, dials: loopbackOrigins({ reads, stored }) }
}

/** Pins the sandbox token and picks Send's fee payer for a private send, each through the release's
 *  own UI, which saves both maps; the app window's pick is the send's below. */
async function pickPreferences(page: Page): Promise<void> {
	await navigateByHash(page, "#/popup/general", 15_000)
	await navigateToTokenDetail(page)
	await pinFromTokenPage(page)
	await navigateByHash(page, "#/popup/general", 15_000)
	await openSend(page)
	await selectFeeMethod(page, "sponsored")
	await navigateByHash(page, "#/popup/general", 15_000)
}

/** The account's first send, which deploys it and leaves the wallet's transaction row; its fee
 *  payer is picked by hand, which saves the app window's pick. */
async function sendFromWallet(ctx: ExtensionContext, dapp: Page, cfg: AztecTestConfig, account: string): Promise<void> {
	const popup = await openPopup(ctx)
	await waitForHash(popup, "#/popup/general", 30_000)
	const baseline = await captureBalanceBaseline(popup, account, cfg.tokenAddress)
	await setPgInputs(dapp, { tokenAddress: cfg.tokenAddress, recipient: cfg.minterAddress, amount: SENT.toString() })
	// The first send pays the PXE's cold start and a real proof of the account's deployment.
	const sent = await runApprovedPgCall(ctx, dapp, {
		button: "sendTx-default",
		method: "sendTx",
		label: "update-in-place:send",
		popupTimeoutMs: 180_000,
		feeMethod: "sponsored",
	})
	const { waitForTxMined } = await import("../fixtures/aztec")
	await waitForTxMined(cfg, txHashOf(sent.resultJson), 300_000)
	await waitForFreshBalanceRow(popup, {
		account,
		tokenContract: cfg.tokenAddress,
		expectedPublicRaw: (PUBLIC - SENT).toString(),
		expectedPrivateRaw: PRIVATE.toString(),
		baselineUpdatedAt: baseline,
		timeoutMs: 180_000,
	})
	await popup.close()
}

async function expectAccounts(page: Page, names: readonly string[]): Promise<void> {
	await gotoAccounts(page)
	const shown = await page.evaluate(() =>
		[...document.querySelectorAll('[data-testid="manage-accounts-row"]')].map((row) => row.getAttribute("data-account-name")),
	)
	expect(shown).toEqual(expect.arrayContaining([...names]))
}

async function verify(ctx: ExtensionContext, populated: Populated): Promise<void> {
	expect(await updateProblems(populated.before, await readLocalStorage(ctx), { balancesAsserted: true })).toEqual([])

	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/auth", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general", 30_000)
	expect(await shownOverlays(page, BARRIERS)).toEqual([])
	await answerUpdatedTerms(page, populated.before)
	await answerArrival(page, populated.before)
	if (populated.release.storage === "plaintext") expect(populated.selection, "the release's selection").toBe(populated.account)
	expect(await getAccountAddress(page)).toBe(populated.selection)
	await waitForShownAccount(page, populated.selection, "the header shows the release's selection")
	await expectReleasePreferences(ctx, page, populated.preferences, await captureSoleProfileId(page))
	if (populated.release.storage === "sealed") await switchToNetwork(page, SANDBOX)

	await navigateToTokenDetail(page)
	const balances = await getTokenDetailBalances(page)
	expect(balances.publicBalance.replace(/[,\s]/g, "")).toBe("9")
	expect(balances.privateBalance.replace(/[,\s]/g, "")).toBe("25")
	expect(await incomingCards(page, populated.incoming)).toBeGreaterThanOrEqual(populated.incoming)

	const dapp = await openPlayground(ctx, { chainInfo: populated.chainInfo })
	await reconnectPlayground(ctx, dapp, "transaction", "update-in-place:stored-session")
	await dapp.close()

	await navigateByHash(page, "#/popup/settings/networks", 15_000)
	await page.waitForSelector(`[data-testid="network-row"][data-network-name="${SANDBOX}"]`, { visible: true, timeout: 15_000 })
	await navigateByHash(page, "#/popup/general", 15_000)
	await switchToNetwork(page, "Testnet")
	await expectAccounts(page, TESTNET_ACCOUNTS)
	// The re-export preview re-derives the address from the decrypted key: only a key that opens passes.
	expect(await previewImport(page, await exportImportedAccountBody(page, false))).toBe(populated.imported)
	await navigateByHash(page, "#/popup/settings/contacts", 15_000)
	for (const name of CONTACTS) await page.waitForSelector(contactRow(name), { visible: true, timeout: 15_000 })
	expect(await shownOverlays(page)).toEqual([])
	await page.close()

	expect(await updateProblems(populated.before, await readLocalStorage(ctx), { balancesAsserted: true })).toEqual([])
}

test.skipIf(!process.env.NULO_E2E_UPDATE_FROM || !aztecConfig)(
	"a populated release install updates in place to the candidate and reads everything it held",
	{ timeout: 900_000, retry: 0 },
	async () => {
		const cfg = aztecConfig as AztecTestConfig
		const record = process.env.NULO_E2E_UPDATE_RECORD === "1"
		const builds = updateBuilds(BROWSER)
		if (!builds) throw new Error("unreachable: skipIf guards")
		const release = releaseTraits(builds.tag)
		const accountFile = await foreignAccountFile()
		try {
			await inPlaceUpdate({
				builds,
				populate: async (ctx) => {
					const populated = await populate(ctx, cfg, accountFile, release)
					const recording = { tag: builds.tag, browser: BROWSER, entries: populated.before, dials: populated.dials }
					expect(recordingProblems(recording, builds.tag, release.storage)).toEqual([])
					if (record) writeRecording(builds.tag, BROWSER, populated.before, populated.dials)
					return populated
				},
				verify,
			})
		} finally {
			await Promise.all(standIns.splice(0).map((standIn) => standIn.stop()))
		}
	},
)
