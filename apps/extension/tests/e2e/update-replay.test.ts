/**
 * The release storage the live update scenario recorded, written into the release build and updated
 * in place to the candidate offline, against the stand-in node. Opt-in, as the live scenario is:
 * `NULO_E2E_UPDATE_FROM=<tag>` with `NULO_E2E_UPDATE_TO=<candidate>`.
 *
 * Failure mode: once the candidate's Testnet seed has moved, release rows meet the network reset
 * through the real boot and the reset does not carry them over, or, where the candidate binds
 * another address regime, does not re-create them at the addresses it derives. Only a recording can show it: a
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
import { CHAIN_IDS, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { BACKUP_MAC_FIELD } from "@/utils/full-backup-helpers"
import { FPC_SERVICE_NAME } from "@/wallet/services/fpc/spec"
import { INCOMING_TRANSFER_SERVICE_NAME, IncomingTransferRecordSchema } from "@/wallet/services/incoming-transfer/spec"
import { OPERATION_JOURNAL_SERVICE_NAME } from "@/wallet/services/operation-journal/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { parseEnvelope } from "@/wallet/storage/sealed-entity-storage"
import { STORES } from "@/wallet/storage/stores"
import { BROWSER } from "./fixtures/browser"
import { type ExtensionContext, clickByTestId, launchExtension, openPopup, test, waitForHash } from "./fixtures/extension"
import { captureSoleProfileId, contactRow, ensureUnlocked, navigateByHash, waitForSelectedAccount } from "./fixtures/helpers"
import { pollUntil } from "./fixtures/poll"
import { callService } from "./fixtures/session"
import { registerPasskeyProfile, setupPasskeyVirtualAuth } from "./fixtures/passkey"
import {
	inPlaceUpdate,
	readLocalStorage,
	type UpdateBuilds,
	updateBuilds,
	updateCandidate,
	writeLocalStorage,
} from "./fixtures/update/in-place"
import { expectReleasePreferences } from "./fixtures/update/preferences"
import { type PinnedBackup, type Recording, readRecording, writePinnedBackup } from "./fixtures/update/recording"
import { unreadRows } from "./fixtures/update/stored-rows"
import { BARRIERS, missingFamilies, shownOverlays, updateProblems } from "./fixtures/update/verify"
import { exportImportedAccountBody, previewImport } from "./helpers/account-io"
import { accountRows, accountScope, readNetworkRows } from "./helpers/identity-rows"
import { downloadPlainPasskeyBackup, exportBackupFile, openEncryptedBackup } from "./helpers/backup-export"
import { answerArrival } from "./helpers/network-arrival"
import { BACKUP_SLICE_REGISTRY } from "@/wallet/services/backup/backup-migration-registry"
import { backupProblems } from "@/wallet/storage/stored-shapes/backups"
import {
	PREVIOUS_TESTNET_CHAIN_ID,
	type ChainSnapshot,
	type StoredAccount,
	readAccounts,
	readNetwork,
	readyToastSaysMoved,
	rederive,
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

const testnetNetworkId = (recording: Recording): string => {
	const row = rowsOf(recording.entries, "nulo:core:networks").find((network) => network.kind === "testnet")
	if (!row) throw new Error(`the recording of ${recording.tag} holds no Testnet network`)
	return row.id as string
}

const otherChains = (recording: Recording): Array<{ id: string; chainId: number }> =>
	rowsOf(recording.entries, "nulo:core:networks")
		.filter((network) => network.kind !== "testnet")
		.map((network) => ({ id: network.id as string, chainId: network.chainId as number }))

/** What the wallet reads of each network but Testnet: its row and accounts as their services read
 *  them, and every other stored row naming its chain id or, for the incoming roots, its network id.
 *  A sealed root's stored rows are left out: the unlock seals them, which changes how they are
 *  stored, and {@link expectHistory} reads them back. */
function otherNetworks(page: Page, recording: Recording): Promise<ChainSnapshot[]> {
	return Promise.all(
		otherChains(recording).map(async ({ id, chainId }) => {
			const { rows, ...read } = await snapshotChain(page, chainId, id)
			const incoming = await page.evaluate(async (network: string) => {
				const all = await chrome.storage.local.get(null)
				return Object.fromEntries(
					Object.entries(all).filter(([key]) => key.startsWith("nulo:core:incoming-") && key.includes(`|${network}|`)),
				)
			}, id)
			const stored = Object.entries({ ...rows, ...incoming }).filter(
				([key]) => !SEALED_ROOTS.some((root) => key.startsWith(`${root}@`)),
			)
			return { ...read, rows: Object.fromEntries(stored) as Record<string, string> }
		}),
	)
}

const SEALED_ROOTS = Object.values(STORES).flatMap((store) => ("sealed" in store ? [store.ref.root] : []))
const HISTORY_ROOTS = [STORES.txs.ref.root, STORES.journal.ref.root]

/**
 * The recorded transactions and journal records read back through the wallet as recorded, and are
 * stored sealed once the unlock has converted them, at keys that name no transaction hash.
 */
async function expectHistory(ctx: ExtensionContext, page: Page, recording: Recording): Promise<void> {
	const entries = offline(recording.entries)
	const hashes = rowsOf(entries, STORES.txs.ref.root).map((tx) => tx.hash as string)
	await pollUntil(
		() => readLocalStorage(ctx),
		(all) =>
			Object.entries(all).every(([key, raw]) => {
				if (!HISTORY_ROOTS.some((root) => key.startsWith(`${root}@`))) return true
				return (
					typeof raw === "string" &&
					parseEnvelope(JSON.parse(raw)) !== undefined &&
					!hashes.some((hash) => key.includes(hash.slice(2)))
				)
			}),
		{ label: "the recorded history sealed", timeoutMs: 30_000, intervalMs: 500 },
	)
	for (const tx of rowsOf(entries, STORES.txs.ref.root)) {
		expect(await callService(page, TRANSACTION_SERVICE_NAME, "getTransaction", [tx.hash])).toEqual(tx)
	}
	for (const record of rowsOf(entries, STORES.journal.ref.root)) {
		expect(await callService(page, OPERATION_JOURNAL_SERVICE_NAME, "getOperation", [record.id])).toEqual(record)
	}
}

const PROJECTION_ROOTS = (
	[
		"tokenBalances",
		"authRegistry",
		"authRegistryEnabled",
		"incomingTransfers",
		"incomingTrust",
		"incomingPublicCursors",
		"incomingBalanceOutbox",
		"incomingArrivals",
	] as const
).map((name) => STORES[name].ref.root)

/** The 32-byte values a recorded projection row names: accounts, contracts, notes, transactions. */
function namedHex(rows: Row[]): string[] {
	const fields = ["account", "accountAddress", "owner", "from", "contract", "noteHash", "txHash"]
	const values = rows.flatMap((row) => [...fields.map((field) => row[field]), String(row.id ?? "").split("|")[2]])
	return [...new Set(values.filter((v): v is string => typeof v === "string" && /^0x[0-9a-f]{64}$/i.test(v)))].map((v) =>
		v.slice(2).toLowerCase(),
	)
}

/**
 * The recorded balances, authorizations and incoming rows are stored sealed once the unlock has
 * converted them, at keys that name none of their accounts, contracts, notes or transactions, and
 * the recorded receipts and trust of every network the update kept read back through the wallet.
 */
async function expectProjections(ctx: ExtensionContext, page: Page, recording: Recording, resetNetwork?: string): Promise<void> {
	const entries = offline(recording.entries)
	const named = namedHex(PROJECTION_ROOTS.flatMap((root) => rowsOf(entries, root)))
	expect(named).not.toEqual([])
	await pollUntil(
		() => readLocalStorage(ctx),
		(all) =>
			Object.entries(all).every(([key, raw]) => {
				if (!PROJECTION_ROOTS.some((root) => key.startsWith(`${root}@`))) return true
				const lower = key.toLowerCase()
				return typeof raw === "string" && parseEnvelope(JSON.parse(raw)) !== undefined && !named.some((hex) => lower.includes(hex))
			}),
		{ label: "the recorded projections sealed", timeoutMs: 30_000, intervalMs: 500 },
	)
	const kept = (row: Row) => row.networkId !== resetNetwork
	const records = rowsOf(entries, STORES.incomingTransfers.ref.root).filter(kept)
	const trust = rowsOf(entries, STORES.incomingTrust.ref.root).filter(kept)
	expect(records.length + trust.length).toBeGreaterThan(0)
	for (const record of records) {
		const read = await callService(page, INCOMING_TRANSFER_SERVICE_NAME, "getIncomingTransferById", [record.id])
		expect(read).toEqual(IncomingTransferRecordSchema.parse(record))
	}
	for (const row of trust) {
		const state = await callService(page, INCOMING_TRANSFER_SERVICE_NAME, "getTrustState", [row.profileId, row.networkId, row.contract])
		expect(state).toBe(row.state)
	}
}

const IDENTITY_ROOTS = (["accounts", "importedAccountKeys", "networks", "tokens", "fpcs"] as const).map((name) => STORES[name].ref.root)

/**
 * The recorded accounts, imported keys, networks, tokens and fee payers are stored sealed once the
 * unlock has converted them, at keys that name no recorded account, and each of these roots stores
 * as many rows as the wallet reads from it, so a plaintext twin the conversion left, or a row no key
 * opens, shows as a difference. Every recorded network, and each recorded token and fee payer off
 * `resetChain`, still reads.
 */
async function expectIdentity(ctx: ExtensionContext, page: Page, recording: Recording, resetChain?: number): Promise<void> {
	const entries = offline(recording.entries)
	const addresses = rowsOf(entries, STORES.accounts.ref.root).map((row) => (row.address as string).slice(2).toLowerCase())
	expect(addresses).not.toEqual([])
	const stored = await pollUntil(
		() => readLocalStorage(ctx),
		(all) =>
			Object.entries(all).every(([key, raw]) => {
				if (!IDENTITY_ROOTS.some((root) => key.startsWith(`${root}@`))) return true
				const lower = key.toLowerCase()
				return (
					typeof raw === "string" && parseEnvelope(JSON.parse(raw)) !== undefined && !addresses.some((hex) => lower.includes(hex))
				)
			}),
		{ label: "the recorded identity rows sealed", timeoutMs: 30_000, intervalMs: 500 },
	)
	const held = (name: (typeof IDENTITY_ROOTS)[number]) => Object.keys(stored).filter((key) => key.startsWith(`${name}@`)).length
	const chains = [...new Set(Object.keys(stored).flatMap((key) => accountScope(key)?.chainId ?? []))]
	const accounts = (await Promise.all(chains.map((chain) => accountRows(page, chain)))).flat()
	const networks = await readNetworkRows(page)
	const tokens = await callService<Row[]>(page, TOKEN_SERVICE_NAME, "getTokens")
	const fpcs = await callService<Row[]>(page, FPC_SERVICE_NAME, "getFpcs")
	expect(IDENTITY_ROOTS.map(held)).toEqual([
		accounts.length,
		accounts.filter((account) => account.type === 1).length,
		networks.length,
		tokens.length,
		fpcs.length,
	])
	const ids = (rows: Row[]) => rows.map((row) => row.id)
	const kept = (root: string) => ids(rowsOf(entries, root).filter((row) => row.chainId !== resetChain))
	expect(ids(networks)).toEqual(expect.arrayContaining(ids(rowsOf(entries, STORES.networks.ref.root))))
	expect(ids(tokens)).toEqual(expect.arrayContaining(kept(STORES.tokens.ref.root)))
	expect(ids(fpcs)).toEqual(expect.arrayContaining(kept(STORES.fpcs.ref.root)))
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

/** The recording selected a sandbox account, which Testnet does not hold, so the popup opens on
 *  Testnet's first account in the account list's order (index, then address), as before the seal. */
async function expectFirstAccountSelected(page: Page, chain: number): Promise<void> {
	const rows = await readAccounts(page, chain)
	const [first] = [...rows].sort((a, b) => a.index - b.index || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0))
	const label = "the selection is Testnet's first account"
	expect(await waitForSelectedAccount(page, (address) => address === first?.address, label, 30_000)).toBe(first?.address)
}

async function opensWithoutTakeover(ctx: ExtensionContext, page: Page, recording: Recording, stored: Record<string, unknown>) {
	const chain = recordedTestnet(recording)
	const before = await readAccounts(page, chain)
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	await answerArrival(page, recording.entries)
	expect((await readAccounts(page, chain)).map(identity)).toEqual(before.map(identity))
	await expectFirstAccountSelected(page, chain)
	await expectImportedKeyOpens(page, imported(before)[0] ?? "")
	await expectConnectedApps(page, recording)
	await expectContacts(page, recording)
	await expectHistory(ctx, page, recording)
	await expectProjections(ctx, page, recording)
	await expectIdentity(ctx, page, recording)
	await expectReleasePreferences(ctx, page, recording.entries, await captureSoleProfileId(page))
	expect(await shownOverlays(page)).toEqual([])
	expect(await updateProblems(stored, await readLocalStorage(ctx))).toEqual([])
}

/**
 * Drives the takeover's reset from `oldChain` and checks it carried every derived account at its
 * name, index and visibility to the address this build derives for it, the imported one too when its
 * key opens, at the address its key derives, left nothing on `oldChain`, and left every other
 * chain's rows as they were. The ready toast says the addresses moved exactly when one did.
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
	const saidMoved = await readyToastSaysMoved(page, "Testnet")
	await waitForHash(page, "#/popup/general", 30_000)
	await answerArrival(page, recording.entries)

	const testnet = await readNetwork(page, "testnet")
	expect([testnet.chainId, testnet.l1ChainId]).toEqual([CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID])
	const after = await readAccounts(page, CHAIN_IDS.TESTNET)
	await expectFirstAccountSelected(page, CHAIN_IDS.TESTNET)
	const expected = await rederive(page, derived(before), TESTNET_L1_CHAIN_ID)
	expect(derived(after)).toEqual(expected)
	const moved = expected.some((row, i) => row.address !== derived(before)[i]?.address)
	expect(saidMoved).toBe(moved)
	expect(imported(after)).toHaveLength(importedOpens ? imported(before).length : 0)
	expect(imported(after).filter((address) => imported(before).includes(address))).toEqual(moved ? [] : imported(after))
	expect(await readAccounts(page, oldChain)).toEqual([])
	const keysLeft = await page.evaluate(async (chain: number) => {
		const all = await chrome.storage.local.get(null)
		return Object.keys(all).filter((key) => key.startsWith("nulo:core:imported-account-keys@") && key.includes(`,${chain},`))
	}, oldChain)
	expect(keysLeft).toEqual([])
	expect(await otherNetworks(page, recording)).toEqual(others)
	if (importedOpens) await expectImportedKeyOpens(page, imported(after)[0] ?? "")
	await expectConnectedApps(page, recording)
	await expectContacts(page, recording)
	await expectHistory(ctx, page, recording)
	await expectProjections(ctx, page, recording, testnetNetworkId(recording))
	await expectIdentity(ctx, page, recording, oldChain)
	await expectReleasePreferences(ctx, page, recording.entries, await captureSoleProfileId(page))
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
