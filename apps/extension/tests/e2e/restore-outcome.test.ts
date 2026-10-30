/**
 * The reminder of a full-backup restore that left networks unrestored, end to end in a real build:
 * the record the import arms, the Home banner that reads it across pages, and Restore again, which
 * takes only the backup that armed it.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { expect } from "vitest"
import {
	RESTORE_AGAIN_OTHER_BACKUP,
	restoreAgainIntroText,
	restoreWarningText,
	retryResultText,
} from "@/components/composite/import/restore-warning"
import { LOCAL_L1_CHAIN_ID } from "@/utils/chain-ids"
import { interceptRpc, type RpcInterception } from "./fixtures/browser"
import { clickByTestId, type ExtensionContext, launchExtension, openPopup, pickFileByTestId, test, waitForHash } from "./fixtures/extension"
import { expectFitsNarrow } from "./fixtures/type-roles"
import { ensureUnlocked, readSessionRow } from "./fixtures/helpers"
import { readNetworkRows } from "./helpers/identity-rows"
import {
	buildSyntheticBackup,
	deriveNuloAccountAddress,
	gotoPopupImport,
	makeRecoveryTriple,
	POPUP_IMPORT_SHELL,
	submitFullBackupImport,
	submitWhenEnabled,
	TEST_PASSWORD,
	setInputs,
	writeBackupToTemp,
} from "./helpers/import-drivers"
import { startStub } from "./helpers/rpc-stub"

const LOCAL_RPC = process.env.VITE_LOCAL_NETWORK_RPC_URL ?? "http://localhost:8080"
const RECORD_PREFIX = "nulo:ui:restoreOutcome@"

type StoredRecord = { run: string; backup: string; networkIds: string[]; leaseUntil: number }

/** A synthetic backup; with `localItem`, its account state names a sender on the local chain, the
 *  one item whose restore dials the (intercepted) local node. */
async function backupJson(opts: { localItem?: boolean; profileName?: string } = {}): Promise<string> {
	const { masterBase64, entropyBase64 } = await makeRecoveryTriple()
	const address = await deriveNuloAccountAddress(masterBase64, LOCAL_L1_CHAIN_ID)
	const accountState = [{ networkId: "syn-local", chainId: 0, senders: [{ address }], contracts: [] }]
	return buildSyntheticBackup({
		masterBase64,
		entropyBase64,
		accountAddress: address,
		profileName: opts.profileName,
		extraData: opts.localItem ? { "account-state": accountState } : {},
	})
}

async function withExtension(mode: RpcInterception | undefined, fn: (ctx: ExtensionContext) => Promise<void>): Promise<void> {
	const profileDir = mkdtempSync(join(tmpdir(), "nulo-restore-outcome-"))
	const ctx = await launchExtension({ userDataDir: profileDir })
	let armed: Awaited<ReturnType<typeof interceptRpc>> | undefined
	try {
		if (mode) armed = await interceptRpc(ctx.browser, ctx.extensionId, LOCAL_RPC, mode)
		await fn(ctx)
		if (armed) expect(await armed.failures(), "rpc interception failures").toEqual([])
	} finally {
		await armed?.stop()
		try {
			await ctx.close()
		} finally {
			rmSync(profileDir, { recursive: true, force: true })
		}
	}
}

async function textOf(page: Page, testId: string, timeout = 10_000): Promise<string> {
	const shown = await page.waitForFunction(
		(id) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText.trim() || false,
		{ timeout, polling: 100 },
		testId,
	)
	return (await shown.jsonValue()) as string
}

async function waitForText(page: Page, testId: string, expected: string, timeout = 10_000): Promise<void> {
	await page
		.waitForFunction(
			(id, want) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText.includes(want) ?? false,
			{ timeout, polling: 100 },
			testId,
			expected,
		)
		.catch(async (error) => {
			throw new Error(`${testId} never read "${expected}" (read "${await textOf(page, testId, 100).catch(() => "")}"): ${error}`)
		})
}

async function waitForGone(page: Page, testId: string, timeout = 10_000): Promise<void> {
	await page.waitForFunction((id) => !document.querySelector(`[data-testid="${id}"]`), { timeout, polling: 100 }, testId)
}

const bannerSentence = (...names: string[]) =>
	`${names.join(" and ")} didn't finish restoring. Restore the backup again to bring ${names.length === 1 ? "it" : "them"} back.`

async function activeProfileId(page: Page): Promise<string> {
	const profile = (await readSessionRow(page))?.profile
	if (!profile) throw new Error("no unlocked profile")
	return profile
}

/** The active profile's networks, by id and name. */
async function profileNetworks(page: Page): Promise<Array<{ id: string; name: string }>> {
	await activeProfileId(page)
	return (await readNetworkRows(page)).map(({ id, name }) => ({ id, name }))
}

async function readRecord(page: Page, profileId: string): Promise<StoredRecord | undefined> {
	return page.evaluate(async (key) => (await chrome.storage.local.get(key))[key] as StoredRecord | undefined, RECORD_PREFIX + profileId)
}

async function writeRecord(page: Page, profileId: string, record: StoredRecord): Promise<void> {
	await page.evaluate(async (key, value) => chrome.storage.local.set({ [key]: value }), RECORD_PREFIX + profileId, record)
}

async function renameNetwork(page: Page, from: string, to: string): Promise<void> {
	await clickByTestId(page, "network-button")
	const row = `[data-testid="network-row"][data-network-name="${from}"]`
	await page.waitForSelector(row, { visible: true, timeout: 5_000 })
	// A SettingItem row is an <a> whose href may be null; a raw click does not always fire on it.
	await page.evaluate(
		(sel) => document.querySelector(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
		row,
	)
	await clickByTestId(page, "network-detail-rename")
	await page.waitForSelector('[data-testid="network-name-input"] input', { visible: true, timeout: 5_000 })
	await setInputs(page, { '[data-testid="network-name-input"] input': to })
	await submitWhenEnabled(page, "edit-network-submit")
	await page.waitForFunction(
		(name) => document.querySelector('[data-testid="network-detail-rename"]')?.textContent?.includes(name),
		{ timeout: 10_000, polling: 100 },
		to,
	)
	await page.evaluate(() => {
		window.location.hash = "/popup/general"
	})
	await waitForHash(page, "#/popup/general", 5_000)
}

/** One word as long as the network name field allows: wider than the reminder and the intro at the narrow width. */
const LONG_NAME = "W".repeat(25)

/** Picks `file` on the Restore again page and presses Restore. */
async function restoreAgainWith(page: Page, file: string): Promise<void> {
	await pickFileByTestId(page, "import-full-backup-pick-file", file)
	await submitWhenEnabled(page, "restore-again-submit-btn")
}

test("SE1: the banner follows renames and other pages; Restore again refuses another valid backup and a tampered one", {
	timeout: 120_000,
	retry: 0,
}, async () => {
	const restored = await backupJson()
	const restoredFile = writeBackupToTemp(restored, "restored.json")
	await withExtension(undefined, async (ctx) => {
		const page = await gotoPopupImport(ctx)
		await submitFullBackupImport(page, restoredFile, TEST_PASSWORD, POPUP_IMPORT_SHELL)
		await waitForHash(page, "#/popup/general", 60_000)

		const profileId = await activeProfileId(page)
		const networks = await profileNetworks(page)
		const local = networks.find((network) => network.name === "Local Network")
		const testnet = networks.find((network) => network.name === "Testnet")
		if (!local || !testnet) throw new Error(`built-in networks missing: ${JSON.stringify(networks)}`)
		// An id no network has stands for a deleted one: it is never named.
		const seeded: StoredRecord = {
			run: "ab".repeat(16),
			backup: (JSON.parse(restored) as { checksum: string }).checksum,
			networkIds: [local.id, testnet.id, "0badc0de"],
			leaseUntil: 0,
		}
		await writeRecord(page, profileId, seeded)
		const bannerNames = () => textOf(page, "restore-outcome-banner")
		await waitForText(page, "restore-outcome-banner", "didn't finish restoring")
		const first = await bannerNames()
		expect(
			[bannerSentence("Local Network", "Testnet"), bannerSentence("Testnet", "Local Network")].some((s) => first.includes(s)),
		).toBe(true)

		await renameNetwork(page, "Testnet", LONG_NAME)
		await waitForText(page, "restore-outcome-banner", LONG_NAME)
		expect(await bannerNames()).not.toContain("Testnet")
		await expectFitsNarrow(page, "the restore outcome banner")

		const second = await openPopup(ctx)
		await waitForText(second, "restore-outcome-banner", LONG_NAME)
		await clickByTestId(second, "restore-outcome-dismiss")
		await waitForGone(page, "restore-outcome-banner")
		expect(await readRecord(page, profileId)).toBeUndefined()
		await second.close()

		await writeRecord(page, profileId, seeded)
		await waitForText(page, "restore-outcome-banner", LONG_NAME)
		await clickByTestId(page, "restore-outcome-restore")
		await waitForHash(page, "#/popup/restore-again", 5_000)
		const intro = await textOf(page, "restore-again-intro")
		expect(
			[
				["Local Network", LONG_NAME],
				[LONG_NAME, "Local Network"],
			].map(restoreAgainIntroText),
		).toContain(intro)
		await expectFitsNarrow(page, "Restore again")

		await restoreAgainWith(page, writeBackupToTemp(await backupJson({ profileName: "Other" }), "other.json"))
		await waitForText(page, "import-full-backup-error", RESTORE_AGAIN_OTHER_BACKUP.title)

		const tampered = { ...(JSON.parse(restored) as Record<string, unknown>), "wallet-version": "tampered" }
		await restoreAgainWith(page, writeBackupToTemp(JSON.stringify(tampered), "tampered.json"))
		await waitForText(page, "import-full-backup-error", "Backup Integrity Check Failed")

		expect(await readRecord(page, profileId)).toEqual(seeded)
		expect(await page.evaluate(() => window.location.hash)).toBe("#/popup/restore-again")
	})
})

test("SE2: with the local node refused, the import arms the banner; Restore again and its Retry fail again with the line", {
	timeout: 180_000,
	retry: 0,
}, async () => {
	const file = writeBackupToTemp(await backupJson({ localItem: true }), "local.json")
	await withExtension({ kind: "refuse" }, async (ctx) => {
		const page = await gotoPopupImport(ctx)
		await submitFullBackupImport(page, file, TEST_PASSWORD, POPUP_IMPORT_SHELL)
		// One tail: 45 s at most, plus margin.
		await page.waitForSelector('[data-testid="import-full-backup-continue-btn"]', { visible: true, timeout: 90_000 })
		await clickByTestId(page, "import-full-backup-continue-btn")
		await waitForHash(page, "#/popup/general", 30_000)

		const profileId = await activeProfileId(page)
		const local = (await profileNetworks(page)).find((network) => network.name === "Local Network")
		await waitForText(page, "restore-outcome-banner", bannerSentence("Local Network"))
		const armed = await readRecord(page, profileId)
		expect(armed).toMatchObject({ networkIds: [local?.id], leaseUntil: 0 })

		await clickByTestId(page, "restore-outcome-restore")
		await waitForHash(page, "#/popup/restore-again", 5_000)
		expect(await textOf(page, "restore-again-intro")).toBe(restoreAgainIntroText(["Local Network"]))
		await restoreAgainWith(page, file)
		await waitForText(page, "import-full-backup-warning", restoreWarningText(["Local Network"], false), 90_000)

		await clickByTestId(page, "restore-again-retry-btn")
		expect(await textOf(page, "restore-again-retry-result", 90_000)).toBe(retryResultText(["Local Network"]))

		await clickByTestId(page, "restore-again-continue-btn")
		await waitForHash(page, "#/popup/general", 10_000)
		await waitForText(page, "restore-outcome-banner", bannerSentence("Local Network"))
		expect(await readRecord(page, profileId)).toEqual(armed)
	})
})

test("SE3: an import page closed mid-tail leaves its armed record, which a reopened popup names", {
	timeout: 120_000,
	retry: 0,
}, async () => {
	const file = writeBackupToTemp(await backupJson({ localItem: true }), "held.json")
	const blackhole = await startStub(() => undefined)
	try {
		await withExtension({ kind: "redirect", to: blackhole.url }, async (ctx) => {
			const page = await gotoPopupImport(ctx)
			await submitFullBackupImport(page, file, TEST_PASSWORD, POPUP_IMPORT_SHELL)
			await page.waitForSelector('[data-testid="import-page"][data-restore-stage="chain-sync"]', { timeout: 60_000 })
			const profileId = await activeProfileId(page)
			const armed = await readRecord(page, profileId)
			expect(armed?.leaseUntil, "the tail holds the reminder").toBeGreaterThan(Date.now())
			await page.close()

			const reopened = await openPopup(ctx)
			await ensureUnlocked(reopened)
			await waitForHash(reopened, "#/popup/general", 30_000)
			await writeRecord(reopened, profileId, { ...(armed as StoredRecord), leaseUntil: 0 })
			await waitForText(reopened, "restore-outcome-banner", bannerSentence("Local Network"))
		})
	} finally {
		await blackhole.close()
	}
})
