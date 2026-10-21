/**
 * The release storage the live update scenario recorded, written into the release build and updated
 * in place to the candidate offline, against the stand-in node. Opt-in, as the live scenario is:
 * `NULO_E2E_UPDATE_FROM=<tag>` with `NULO_E2E_UPDATE_TO=<candidate>`.
 *
 * Failure mode: once the candidate's Testnet seed has moved, release rows meet the network reset
 * through the real boot and the reset does not carry them over. Only a recording can show it: a
 * sandbox on the candidate's Aztec line cannot serve the release build, so no live run populates a
 * release install there. While the seed has not moved, the update must open with no takeover.
 *
 * The second case moves the recorded Testnet rows off this build's seed, as that bump will, so the
 * reset runs over release rows before the bump lands. Its moved imported key no longer opens (the
 * key's seal binds the chain it was sealed on), so that reset names the account unmovable, which
 * the bump's own reset does not.
 *
 * The first case also exports the updated profile's full backup, encrypted, and the third registers
 * a passkey profile on the candidate and exports its backup, passkey check included. Failure mode: a
 * backup the candidate writes drops rows or does not import into it. The stored-shape guard's R5
 * reads only the pinned files; only here does a real export, and a real passkey ceremony, make one.
 *
 * Runtime: estimated 2 min per case per browser; measured 12 to 47 s, with the release cached.
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { BACKUP_MAC_FIELD } from "@/utils/full-backup-helpers"
import { BROWSER } from "./fixtures/browser"
import { type ExtensionContext, clickByTestId, launchExtension, openPopup, test, waitForHash } from "./fixtures/extension"
import { contactRow, ensureUnlocked, navigateByHash, waitForToast } from "./fixtures/helpers"
import { registerPasskeyProfile, setupPasskeyVirtualAuth } from "./fixtures/passkey"
import {
	inPlaceUpdate,
	readLocalStorage,
	type UpdateBuilds,
	updateBuilds,
	updateCandidate,
	writeLocalStorage,
} from "./fixtures/update/in-place"
import { type PinnedBackup, type Recording, readRecording, writePinnedBackup } from "./fixtures/update/recording"
import { unreadRows } from "./fixtures/update/stored-rows"
import { BARRIERS, missingFamilies, shownOverlays, updateProblems } from "./fixtures/update/verify"
import { exportImportedAccountBody, previewImport } from "./helpers/account-io"
import { downloadPlainPasskeyBackup, exportBackupFile, openEncryptedBackup } from "./helpers/backup-export"
import { BACKUP_SLICE_REGISTRY } from "@/wallet/services/backup/backup-migration-registry"
import { backupProblems } from "@/wallet/storage/stored-shapes/backups"
import {
	PREVIOUS_TESTNET_CHAIN_ID,
	type StoredAccount,
	readAccounts,
	readNetwork,
	seedStaleNetwork,
	snapshotChain,
	storeActiveNetwork,
	takeoverScreen,
} from "./helpers/stale-network"

type Row = Record<string, unknown>

function rowsOf(entries: Record<string, unknown>, root: string): Row[] {
	return Object.entries(entries)
		.filter(([key, raw]) => key.startsWith(`${root}@`) && typeof raw === "string")
		.map(([, raw]) => JSON.parse(raw as string) as Row)
}

function recordingFor(): Recording {
	const tag = process.env.NULO_E2E_UPDATE_FROM as string
	const recording = readRecording(tag)
	if (!recording) throw new Error(`no recording of ${tag}: run the live scenario with NULO_E2E_UPDATE_RECORD=1`)
	const missing = missingFamilies(recording.entries)
	if (missing.length > 0) throw new Error(`the recording of ${tag} holds no ${missing.join(", ")}: record it again`)
	// The wallet drops an expired session before any check can read it.
	for (const { expiry } of rowsOf(recording.entries, "nulo:core:dappSessions")) {
		if ((expiry as number) < Date.now() + 600_000) {
			throw new Error(`the recording's dApp session expires ${new Date(expiry as number).toISOString()}: record ${tag} again`)
		}
	}
	return recording
}

function builds(): UpdateBuilds {
	const pair = updateBuilds(BROWSER)
	if (!pair) throw new Error("unreachable: skipIf guards")
	return pair
}

/** Each row slice that carries fewer rows than `stored`, read before the export, held under its
 *  root. A backup that drops rows still imports, so only this count catches it; the install holds
 *  one profile. */
function droppedRows(envelope: unknown, stored: Record<string, unknown>): string[] {
	const data = (envelope as { data?: Record<string, unknown> }).data ?? {}
	return Object.entries(BACKUP_SLICE_REGISTRY).flatMap(([name, slice]) => {
		if (slice.kind !== "root") return []
		const held = Object.keys(stored).filter((key) => key.startsWith(`${slice.root}@`)).length
		const rows = data[name]
		const carried = Array.isArray(rows) ? rows.length : 0
		return carried < held ? [`${name}: ${carried} of ${held} rows`] : []
	})
}

/** `file`, a full backup's content as the candidate wrote it, with every row `stored` held, must
 *  import into this build. `NULO_E2E_BACKUP_RECORD=1` on Chrome also writes it for the stored-shape guard's R5. */
async function expectBackupImports(name: PinnedBackup, file: string, stored: Record<string, unknown>): Promise<void> {
	const envelope: unknown = name === "password" ? await openEncryptedBackup(file) : JSON.parse(file)
	expect(droppedRows(envelope, stored)).toEqual([])
	expect(await backupProblems(envelope)).toEqual([])
	if (process.env.NULO_E2E_BACKUP_RECORD !== "1") return
	const { path, pin } = writePinnedBackup(name, BROWSER, file)
	console.log(`[update-replay] wrote ${path}; copy it to stored-shapes/backups/ and pin ${pin}`)
}

const recordedTestnet = (recording: Recording): number => {
	const row = rowsOf(recording.entries, "nulo:core:networks").find((network) => network.kind === "testnet")
	if (!row) throw new Error(`the recording of ${recording.tag} holds no Testnet network`)
	return row.chainId as number
}

const otherChains = (recording: Recording): Array<{ id: string; chainId: number }> =>
	rowsOf(recording.entries, "nulo:core:networks")
		.filter((network) => network.kind !== "testnet")
		.map((network) => ({ id: network.id as string, chainId: network.chainId as number }))

/** Every stored row of each network but Testnet: the rows naming its chain id, and the incoming
 *  rows, whose keys name its network id instead. */
function otherNetworks(page: Page, recording: Recording): Promise<Array<Record<string, unknown>>> {
	return Promise.all(
		otherChains(recording).map(async ({ id, chainId }) => ({
			...(await snapshotChain(page, chainId, id)),
			...(await page.evaluate(async (network: string) => {
				const all = await chrome.storage.local.get(null)
				return Object.fromEntries(
					Object.entries(all).filter(([key]) => key.startsWith("nulo:core:incoming-") && key.includes(`|${network}|`)),
				)
			}, id)),
		})),
	)
}

const identity = ({ address, name, index, type, visible }: StoredAccount) => ({ address, name, index, type, visible })
const derived = (rows: StoredAccount[]) => rows.filter((a) => a.type === 0).map(identity)
const imported = (rows: StoredAccount[]) => rows.filter((a) => a.type === 1).map((a) => a.address)

/** No process without root can listen here, so no build reaches whichever run now holds a port
 *  the recording's sandbox or playground had. */
const UNREACHABLE = "http://127.0.0.1:9"

const offlineUrl = (url: string): string => {
	const { hostname } = new URL(url)
	return hostname === "localhost" || hostname === "127.0.0.1" ? UNREACHABLE : url
}

/** `entries` with every loopback URL a build dials moved to {@link UNREACHABLE}: each network
 *  endpoint, and the endpoint a transaction was sent to, which the finality watch reads. */
function offline(entries: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(entries).map(([key, raw]) => {
			if (typeof raw !== "string") return [key, raw]
			if (key.startsWith("nulo:core:networks@")) {
				const row = JSON.parse(raw) as { endpoints?: Array<{ rpcUrl: string }> }
				const endpoints = row.endpoints?.map((endpoint) => ({ ...endpoint, rpcUrl: offlineUrl(endpoint.rpcUrl) }))
				return [key, JSON.stringify({ ...row, endpoints })]
			}
			if (key.startsWith("nulo:core:txs@")) {
				const row = JSON.parse(raw) as { submittedEndpointUrl?: string }
				const sent = row.submittedEndpointUrl
				return [key, JSON.stringify(sent ? { ...row, submittedEndpointUrl: offlineUrl(sent) } : row)]
			}
			return [key, raw]
		}),
	)
}

async function install(ctx: ExtensionContext, recording: Recording): Promise<Record<string, unknown>> {
	const entries = offline(recording.entries)
	await writeLocalStorage(ctx, entries)
	const before = await readLocalStorage(ctx)
	expect(Object.fromEntries(Object.keys(entries).map((key) => [key, before[key]]))).toEqual(entries)
	return before
}

/** The updated wallet, locked, on Testnet: its rows read, and it shows no barrier. */
async function openUpdated(ctx: ExtensionContext, before: Record<string, unknown>): Promise<Page> {
	expect(await updateProblems(before, await readLocalStorage(ctx))).toEqual([])
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/auth", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	// The recording's active network is its sandbox, which is gone, and the takeover shows only for
	// the active network.
	await storeActiveNetwork(page, "testnet")
	return page
}

/** The connected-apps list reads every session through its MAC, under the key the unlock derives. */
async function expectConnectedApps(page: Page, recording: Recording): Promise<void> {
	await navigateByHash(page, "#/popup/settings/connected-apps", 15_000)
	for (const { dappMetadata } of rowsOf(recording.entries, "nulo:core:dappSessions")) {
		const host = new URL((dappMetadata as { url: string }).url).host
		await page.waitForSelector(`[data-testid="connected-app-row"][data-app-host="${host}"]`, { visible: true, timeout: 15_000 })
	}
}

/** The re-export preview re-derives the address from the decrypted key: only a key that opens passes. */
async function expectImportedKeyOpens(page: Page, address: string): Promise<void> {
	expect(await previewImport(page, await exportImportedAccountBody(page, false))).toBe(address)
}

async function expectContacts(page: Page, recording: Recording): Promise<void> {
	await navigateByHash(page, "#/popup/settings/contacts", 15_000)
	for (const { name } of rowsOf(recording.entries, "nulo:core:contacts")) {
		await page.waitForSelector(contactRow(name as string), { visible: true, timeout: 15_000 })
	}
}

async function opensWithoutTakeover(ctx: ExtensionContext, page: Page, recording: Recording, stored: Record<string, unknown>) {
	const chain = recordedTestnet(recording)
	const before = await readAccounts(page, chain)
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	expect((await readAccounts(page, chain)).map(identity)).toEqual(before.map(identity))
	await expectImportedKeyOpens(page, imported(before)[0] ?? "")
	await expectConnectedApps(page, recording)
	await expectContacts(page, recording)
	expect(await shownOverlays(page)).toEqual([])
	expect(await updateProblems(stored, await readLocalStorage(ctx))).toEqual([])
}

/**
 * Drives the takeover's reset from `oldChain` and checks it carried every derived account at its
 * name, index and address, the imported one too when its key opens, left nothing on `oldChain`, and
 * left every other chain's rows as they were.
 */
async function throughTheReset(ctx: ExtensionContext, page: Page, recording: Recording, oldChain: number, importedOpens: boolean) {
	const before = await readAccounts(page, oldChain)
	expect(derived(before)).not.toEqual([])
	expect(imported(before)).not.toEqual([])
	const others = await otherNetworks(page, recording)

	await ensureUnlocked(page)
	expect(await takeoverScreen(page)).toBe("network-reset")
	expect(await shownOverlays(page, BARRIERS)).toEqual([])
	await clickByTestId(page, "stale-network-reset")
	await page.waitForSelector('[data-testid="stale-confirm-submit"]', { visible: true, timeout: 10_000 })
	expect(await page.$('[data-testid="stale-confirm-unmovable"]')).toEqual(importedOpens ? null : expect.anything())
	await clickByTestId(page, "stale-confirm-submit")
	await waitForToast(page, "Your accounts kept their addresses.", 120_000, { kind: "success" })
	await waitForHash(page, "#/popup/general", 30_000)

	expect((await readNetwork(page, "testnet")).chainId).toBe(CHAIN_IDS.TESTNET)
	const after = await readAccounts(page, CHAIN_IDS.TESTNET)
	expect(derived(after)).toEqual(derived(before))
	expect(imported(after)).toEqual(importedOpens ? imported(before) : [])
	expect(await readAccounts(page, oldChain)).toEqual([])
	const keysLeft = await page.evaluate(async (chain: number) => {
		const all = await chrome.storage.local.get(null)
		return Object.keys(all).filter((key) => key.startsWith("nulo:core:imported-account-keys@") && key.includes(`,${chain},`))
	}, oldChain)
	expect(keysLeft).toEqual([])
	expect(await otherNetworks(page, recording)).toEqual(others)
	if (importedOpens) await expectImportedKeyOpens(page, imported(before)[0] ?? "")
	await expectConnectedApps(page, recording)
	await expectContacts(page, recording)
	expect(await shownOverlays(page)).toEqual([])
	expect(await unreadRows(await readLocalStorage(ctx))).toEqual([])
}

describe.skipIf(!process.env.NULO_E2E_UPDATE_FROM)("update replay", () => {
	test("the recorded release storage updates in place, through the reset once Testnet's seed has moved", {
		timeout: 300_000,
		retry: 0,
	}, async () => {
		const recording = recordingFor()
		const chain = recordedTestnet(recording)
		await inPlaceUpdate({
			builds: builds(),
			populate: (ctx) => install(ctx, recording),
			verify: async (ctx, before) => {
				const page = await openUpdated(ctx, before)
				if (chain === CHAIN_IDS.TESTNET) await opensWithoutTakeover(ctx, page, recording, before)
				else await throughTheReset(ctx, page, recording, chain, true)
				await page.close()
				const stored = await readLocalStorage(ctx)
				await expectBackupImports("password", await exportBackupFile(ctx), stored)
			},
		})
	})

	test("the recorded release storage, its Testnet rows moved off this build's seed, updates through the reset", {
		timeout: 300_000,
		retry: 0,
	}, async ({ skip }) => {
		const recording = recordingFor()
		if (recordedTestnet(recording) !== CHAIN_IDS.TESTNET) skip("the seed has moved: the first case resets the recording itself")
		await inPlaceUpdate({
			builds: builds(),
			populate: (ctx) => install(ctx, recording),
			verify: async (ctx, before) => {
				const page = await openUpdated(ctx, before)
				await seedStaleNetwork(page, "network-reset")
				await throughTheReset(ctx, page, recording, PREVIOUS_TESTNET_CHAIN_ID, false)
				await page.close()
			},
		})
	})

	test("a passkey profile on the candidate exports a full backup that imports with its passkey check", {
		timeout: 300_000,
		retry: 0,
	}, async () => {
		const ctx = await launchExtension({ extensionPath: updateCandidate(BROWSER), cspRecorder: false })
		try {
			const page = await openPopup(ctx)
			await setupPasskeyVirtualAuth(ctx.browser, page)
			await registerPasskeyProfile(page)
			// Before the export: on Firefox a window opened during its passkey check takes the focus WebAuthn needs.
			const stored = await readLocalStorage(ctx)
			await navigateByHash(page, "#/popup/settings/security/export/full", 15_000)
			await clickByTestId(page, "agree-continue-btn")
			const file = await downloadPlainPasskeyBackup(page)
			expect(typeof (JSON.parse(file) as Record<string, unknown>)[BACKUP_MAC_FIELD]).toBe("string")
			await expectBackupImports("passkey", file, stored)
		} finally {
			await ctx.close()
		}
	})
})
