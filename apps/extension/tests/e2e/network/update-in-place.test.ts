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
 * Runtime: estimated 6 min on Chrome, 9 min on Firefox.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
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
	closeStuckPopup,
	contactRow,
	createAccount,
	ensureUnlocked,
	getAccountAddress,
	getTokenDetailBalances,
	importToken,
	navigateByHash,
	navigateToTokenDetail,
	setDeveloperMode,
	switchToNetwork,
	waitForFreshBalanceRow,
	waitForToast,
} from "../fixtures/helpers"
import { openPlayground } from "../fixtures/playground"
import { pollUntil } from "../fixtures/poll"
import { reconnectPlayground } from "../fixtures/send"
import { inPlaceUpdate, readLocalStorage, updateBuilds } from "../fixtures/update/in-place"
import { writeRecording } from "../fixtures/update/recording"
import { BARRIERS, shownOverlays, updateProblems } from "../fixtures/update/verify"
import { confirmImport, exportAccountBody, FIRST_ACCOUNT_NAME, gotoAccounts, previewImport } from "../helpers/account-io"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const D = 10n ** 18n
const PUBLIC = 10n * D
const PRIVATE = 25n * D
const SANDBOX = "Sandbox"
const TESTNET_ACCOUNTS = [FIRST_ACCOUNT_NAME, "Second", "Imported"]
const CONTACTS = ["Alice", "Bob"]

type ChainInfo = { chainId: string; version: string }
type Populated = { before: Record<string, unknown>; chainInfo: ChainInfo; account: string; incoming: number }

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

async function populateTestnet(page: Page, accountFile: string): Promise<void> {
	await createAccount(page, "Second")
	expect(await previewImport(page, accountFile)).toBeTruthy()
	await confirmImport(page, "Imported")
	await closeStuckPopup(page)
	await navigateByHash(page, "#/popup/settings/contacts", 15_000)
	await page.waitForSelector('[data-testid="contacts-new-btn"]', { visible: true, timeout: 15_000 })
	for (const name of CONTACTS) await addContact(page, name, randomAddress())
}

async function sandboxChainInfo(nodeUrl: string): Promise<ChainInfo> {
	const { createAztecNodeClient } = await import("@aztec-labs/aztec.js/node")
	const info = await createAztecNodeClient(nodeUrl).getNodeInfo()
	return { chainId: String(info.l1ChainId), version: String(info.rollupVersion) }
}

/** Adds the sandbox as a network, which activates it, and resolves with the account the switch
 *  derives there. */
async function addSandboxNetwork(page: Page, nodeUrl: string, chainInfo: ChainInfo): Promise<string> {
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
			const active = await getAccountAddress(page)
			const keys = Object.keys(await page.evaluate(() => chrome.storage.local.get(null)))
			const onSandbox = keys.some((key) => key.startsWith("nulo:core:accounts@") && key.includes(`,${chainId},"${active}"]`))
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
	await page.waitForFunction(
		(n: number) => document.querySelectorAll('[data-testid="tx-incoming-card"]').length >= n,
		{ timeout: 180_000, polling: 1_000 },
		atLeast,
	)
	return page.evaluate(() => document.querySelectorAll('[data-testid="tx-incoming-card"]').length)
}

async function populate(ctx: ExtensionContext, cfg: AztecTestConfig, accountFile: string): Promise<Populated> {
	await registerProfile(ctx)
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	await populateTestnet(page, accountFile)

	const chainInfo = await sandboxChainInfo(cfg.nodeUrl)
	const account = await addSandboxNetwork(page, cfg.nodeUrl, chainInfo)
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
	await page.close()

	const dapp = await connectPlayground(ctx, { chainInfo })
	await grantCapBundle(ctx, dapp, "accounts", async (ids) => {
		if (!ids.includes(account)) throw new Error(`the capabilities window offers ${ids.join(", ")}, not ${account}`)
		return [account]
	})
	await dapp.close()
	return { before: await readLocalStorage(ctx), chainInfo, account, incoming }
}

async function expectAccounts(page: Page, names: readonly string[]): Promise<void> {
	await gotoAccounts(page)
	const shown = await page.evaluate(() =>
		[...document.querySelectorAll('[data-testid="manage-accounts-row"]')].map((row) => row.getAttribute("data-account-name")),
	)
	expect(shown).toEqual(expect.arrayContaining([...names]))
}

async function verify(ctx: ExtensionContext, populated: Populated): Promise<void> {
	expect(await updateProblems(populated.before, await readLocalStorage(ctx))).toEqual([])

	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/auth", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general", 30_000)
	expect(await shownOverlays(page, BARRIERS)).toEqual([])
	expect(await getAccountAddress(page)).toBe(populated.account)

	await navigateToTokenDetail(page)
	const balances = await getTokenDetailBalances(page)
	expect(balances.publicBalance.replace(/[,\s]/g, "")).toBe("10")
	expect(balances.privateBalance.replace(/[,\s]/g, "")).toBe("25")
	expect(await incomingCards(page, populated.incoming)).toBeGreaterThanOrEqual(populated.incoming)

	const dapp = await openPlayground(ctx, { chainInfo: populated.chainInfo })
	await reconnectPlayground(ctx, dapp, "accounts", "update-in-place:stored-session")
	await dapp.close()

	await navigateByHash(page, "#/popup/settings/networks", 15_000)
	await page.waitForSelector(`[data-testid="network-row"][data-network-name="${SANDBOX}"]`, { visible: true, timeout: 15_000 })
	await navigateByHash(page, "#/popup/general", 15_000)
	await switchToNetwork(page, "Testnet")
	await expectAccounts(page, TESTNET_ACCOUNTS)
	await navigateByHash(page, "#/popup/settings/contacts", 15_000)
	for (const name of CONTACTS) await page.waitForSelector(contactRow(name), { visible: true, timeout: 15_000 })
	expect(await shownOverlays(page)).toEqual([])
	await page.close()

	expect(await updateProblems(populated.before, await readLocalStorage(ctx))).toEqual([])
}

test.skipIf(!process.env.NULO_E2E_UPDATE_FROM || !aztecConfig)(
	"a populated release install updates in place to the candidate and reads everything it held",
	{ timeout: 900_000, retry: 0 },
	async () => {
		const cfg = aztecConfig as AztecTestConfig
		const builds = updateBuilds()
		if (!builds) throw new Error("unreachable: skipIf guards")
		const accountFile = await foreignAccountFile()
		await inPlaceUpdate({
			from: builds.from,
			to: builds.to,
			populate: async (ctx) => {
				const populated = await populate(ctx, cfg, accountFile)
				if (process.env.NULO_E2E_UPDATE_RECORD === "1") writeRecording(builds.tag, BROWSER, populated.before)
				return populated
			},
			verify,
		})
	},
)
