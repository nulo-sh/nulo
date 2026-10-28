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
 * The third registers a passkey profile on the release and updates it. Failure mode: the candidate
 * rewrites that row, offers a retired one an unlock instead of Set up again, or retires one its
 * passkey still opens (the release's `passkey` trait says which it is); only a real update carries
 * a row the release itself wrote.
 *
 * The first case also exports the updated profile's full backup, encrypted, and the fourth registers
 * a passkey profile on the candidate and exports its backup under a file password. Failure mode: a
 * backup the candidate writes drops rows or does not import into it. The stored-shape guard's R5
 * reads only the pinned files; only here does a real export, and a real passkey ceremony, make one.
 *
 * A release that seals its rows is read through its own services in an install of its own, the
 * recording written in and unlocked, before the case's install, which it never unlocks, updates:
 * what the candidate must read back is what the release itself read. Its Testnet and Mainnet rows sit
 * on loopback stand-ins the replay refuses, so a reset there takes the branch for an endpoint the
 * user moved (probed, refused, the seed's added), where a plaintext release's keeps the seed's, the
 * branch a default install takes. Its second case moves the network and account rows only: a sealed
 * row of another root names its chain inside its envelope, so the reset's purge never meets one.
 *
 * Runtime: estimated 2 min per case per browser; measured 8 to 47 s, with the release cached.
 */
import { createHash } from "node:crypto"
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { CHAIN_IDS, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { FPC_SERVICE_NAME } from "@/wallet/services/fpc/spec"
import { INCOMING_TRANSFER_SERVICE_NAME, IncomingTransferRecordSchema } from "@/wallet/services/incoming-transfer/spec"
import { OPERATION_JOURNAL_SERVICE_NAME } from "@/wallet/services/operation-journal/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { LEGACY_SELECTED_ACCOUNT_KEY } from "@/wallet/services/ui-preference/spec"
import { parseEnvelope } from "@/wallet/storage/sealed-entity-storage"
import { STORES } from "@/wallet/storage/stores"
import { BROWSER, extensionUrl, gotoExtensionPage } from "./fixtures/browser"
import { TEST_PASSWORD } from "./fixtures/constants"
import type { HeldNode } from "./fixtures/egress-guard"
import { type ExtensionContext, clickByTestId, launchExtension, openPopup, test, waitForHash } from "./fixtures/extension"
import {
	captureSoleProfileId,
	contactRow,
	ensureUnlocked,
	navigateByHash,
	waitForSelectedAccount,
	waitForShownAccount,
	waitForToastGone,
} from "./fixtures/helpers"
import { pollUntil } from "./fixtures/poll"
import { callService } from "./fixtures/session"
import { holdNodeStubs } from "./fixtures/node-stub"
import { registerPasskeyProfile, setupPasskeyVirtualAuth } from "./fixtures/passkey"
import {
	inPlaceUpdate,
	readLocalStorage,
	type UpdateBuilds,
	updateBuilds,
	updateCandidate,
	writeLocalStorage,
} from "./fixtures/update/in-place"
import { expectReleasePreferences, plaintextPreferences } from "./fixtures/update/preferences"
import { type PinnedBackup, type Recording, readRecording, recordingProblems, writePinnedBackup } from "./fixtures/update/recording"
import { type ReleaseTraits, releaseTraits } from "./fixtures/update/release"
import { readSealedRelease } from "./fixtures/update/read-release"
import {
	firstAccount,
	type ReadRoot,
	type ReleasePreferences,
	type ReleaseReads,
	readsProblems,
	SESSION_MARGIN_MS,
} from "./fixtures/update/release-reads"
import { unreadRows } from "./fixtures/update/stored-rows"
import { BARRIERS, shownOverlays, updateProblems } from "./fixtures/update/verify"
import { exportImportedAccountBody, previewImport } from "./helpers/account-io"
import { type AccountRow, accountRows, accountScope, type NetworkRow, readNetworkRows } from "./helpers/identity-rows"
import { downloadPasskeyBackup, exportBackupFile, openEncryptedBackup } from "./helpers/backup-export"
import { answerUpdatedTerms } from "./helpers/legal-drivers"
import { readyToast } from "@/components/stale-network/copy"
import { answerArrival } from "./helpers/network-arrival"
import { authSubmitReady } from "./helpers/profile-chaos/ui"
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
	const problems = recordingProblems(recording, tag, releaseTraits(tag).storage)
	if (problems.length > 0) throw new Error(problems.join("; "))
	return recording
}

function builds(): UpdateBuilds {
	const pair = updateBuilds(BROWSER)
	if (!pair) throw new Error("unreachable: skipIf guards")
	return pair
}

type ExpectedRoot = "networks" | "accounts" | ReadRoot | (typeof PROJECTIONS)[number]

/**
 * What the candidate must read of the recorded release: its rows, its selection and its preference
 * maps, as the release reads them. A release that seals them is read through its own services, which
 * also hand the locked candidate the networks and accounts it cannot open before its first unlock.
 */
type Expected = {
	networks: NetworkRow[]
	accounts: AccountRow[]
	rows: (root: ExpectedRoot) => Row[]
	selection: string | undefined
	preferences: ReleasePreferences
	locked?: { networks: NetworkRow[]; accounts: AccountRow[] }
}

const PROFILES = `${STORES.profiles.ref.root}@`

function plaintextExpected(recording: Recording): Expected {
	const entries = offline(recording.entries)
	const rows = (root: ExpectedRoot) => rowsOf(entries, STORES[root].ref.root)
	// The wallet drops an expired session before any check can read it.
	for (const { expiry } of rows("dappSessions")) {
		if ((expiry as number) < Date.now() + SESSION_MARGIN_MS) {
			throw new Error(
				`the recording's dApp session expires ${new Date(expiry as number).toISOString()}: record ${recording.tag} again`,
			)
		}
	}
	const [profileId] = Object.keys(entries).flatMap((key) => (key.startsWith(PROFILES) ? [key.slice(PROFILES.length)] : []))
	const selection = entries[LEGACY_SELECTED_ACCOUNT_KEY]
	return {
		networks: rows("networks") as NetworkRow[],
		accounts: rows("accounts") as AccountRow[],
		rows,
		selection: typeof selection === "string" ? selection : undefined,
		preferences: plaintextPreferences(entries, profileId ?? ""),
	}
}

let sealedReads: Promise<ReleaseReads<NetworkRow, AccountRow>> | undefined

/** The release's reads of `recording`, once per run: every case of a run replays the one recording. */
async function sealedExpected(recording: Recording, from: string): Promise<Expected> {
	sealedReads ??= readSealedRelease(from, recording.entries, recording.dials ?? [])
	const reads = await sealedReads
	const problems = readsProblems(reads, recording.entries, recording.dials ?? [])
	if (problems.length > 0) throw new Error(`the release's reads of the recording of ${recording.tag}: ${problems.join("; ")}`)
	const read = reads.rows as Partial<Record<ExpectedRoot, Row[]>>
	return {
		networks: reads.networks,
		accounts: reads.accounts,
		rows: (root) => read[root] ?? [],
		selection: reads.selection,
		preferences: reads.preferences,
		locked: { networks: reads.networks, accounts: reads.accounts },
	}
}

const expectedOf = (recording: Recording, from: string): Promise<Expected> =>
	releaseTraits(recording.tag).storage === "sealed" ? sealedExpected(recording, from) : Promise.resolve(plaintextExpected(recording))

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
	const envelope: unknown = await openEncryptedBackup(file)
	expect(droppedRows(envelope, stored)).toEqual([])
	expect(await backupProblems(envelope)).toEqual([])
	if (process.env.NULO_E2E_BACKUP_RECORD !== "1") return
	const { path, pin } = writePinnedBackup(name, BROWSER, file)
	console.log(`[update-replay] wrote ${path}; copy it to stored-shapes/backups/ and pin ${pin}`)
}

const recordedNetwork = (expected: Expected): NetworkRow => {
	const row = expected.networks.find((network) => network.kind === "testnet")
	if (!row) throw new Error("the recorded release holds no Testnet network")
	return row
}

const recordedTestnet = (expected: Expected): number => recordedNetwork(expected).chainId

const testnetNetworkId = (expected: Expected): string => recordedNetwork(expected).id

const otherChains = (expected: Expected): Array<{ id: string; chainId: number }> =>
	expected.networks.filter((network) => network.kind !== "testnet").map(({ id, chainId }) => ({ id, chainId }))

/** A network row with each endpoint's URL as a digest: equal rows stay equal, and a failed
 *  comparison prints no endpoint, some of which carry a provider's key. */
const masked = (network: NetworkRow | undefined) =>
	network && {
		...network,
		endpoints: network.endpoints.map((endpoint) => ({
			...endpoint,
			rpcUrl: createHash("sha256").update(endpoint.rpcUrl).digest("hex"),
		})),
	}

/** What the wallet reads of each network but Testnet: its row and accounts as their services read
 *  them, and every other stored row naming its chain id or, for the incoming roots, its network id.
 *  A sealed root's stored rows are left out: the unlock seals them, which changes how they are
 *  stored, and {@link expectHistory} reads them back. `locked` stands in for the rows a locked
 *  candidate cannot open. */
function otherNetworks(page: Page, expected: Expected, locked?: Expected["locked"]): Promise<ChainSnapshot[]> {
	return Promise.all(
		otherChains(expected).map(async ({ id, chainId }) => {
			const { rows, network, accounts, ...read } = await snapshotChain(page, chainId, id, locked?.networks, locked?.accounts)
			const incoming = await page.evaluate(async (network: string) => {
				const all = await chrome.storage.local.get(null)
				return Object.fromEntries(
					Object.entries(all).filter(([key]) => key.startsWith("nulo:core:incoming-") && key.includes(`|${network}|`)),
				)
			}, id)
			const stored = Object.entries({ ...rows, ...incoming }).filter(
				([key]) => !SEALED_ROOTS.some((root) => key.startsWith(`${root}@`)),
			)
			const byAddress = [...accounts].sort((a, b) => a.address.localeCompare(b.address))
			return { ...read, network: masked(network), accounts: byAddress, rows: Object.fromEntries(stored) as Record<string, string> }
		}),
	)
}

const SEALED_ROOTS = Object.values(STORES).flatMap((store) => ("sealed" in store ? [store.ref.root] : []))
const HISTORY_ROOTS = [STORES.txs.ref.root, STORES.journal.ref.root]

/**
 * The recorded transactions and journal records read back through the wallet as recorded, and are
 * stored sealed once the unlock has converted them, at keys that name no transaction hash.
 */
async function expectHistory(ctx: ExtensionContext, page: Page, expected: Expected): Promise<void> {
	const hashes = expected.rows("txs").map((tx) => tx.hash as string)
	expect(hashes).not.toEqual([])
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
	for (const tx of expected.rows("txs")) {
		expect(await callService(page, TRANSACTION_SERVICE_NAME, "getTransaction", [tx.hash])).toEqual(tx)
	}
	expect(expected.rows("journal")).not.toEqual([])
	for (const record of expected.rows("journal")) {
		expect(await callService(page, OPERATION_JOURNAL_SERVICE_NAME, "getOperation", [record.id])).toEqual(record)
	}
}

const PROJECTIONS = [
	"tokenBalances",
	"authRegistry",
	"authRegistryEnabled",
	"incomingTransfers",
	"incomingTrust",
	"incomingPublicCursors",
	"incomingBalanceOutbox",
	"incomingArrivals",
] as const
const PROJECTION_ROOTS = PROJECTIONS.map((name) => STORES[name].ref.root)

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
async function expectProjections(ctx: ExtensionContext, page: Page, expected: Expected, resetNetwork?: string): Promise<void> {
	const named = namedHex(PROJECTIONS.flatMap((name) => expected.rows(name)))
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
	const records = expected.rows("incomingTransfers").filter(kept)
	const trust = expected.rows("incomingTrust").filter(kept)
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
async function expectIdentity(ctx: ExtensionContext, page: Page, expected: Expected, resetChain?: number): Promise<void> {
	const addresses = expected.accounts.map((row) => row.address.slice(2).toLowerCase())
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
	const kept = (root: "tokens" | "fpcs") => ids(expected.rows(root).filter((row) => row.chainId !== resetChain))
	expect(ids(networks)).toEqual(expect.arrayContaining(ids(expected.networks)))
	expect(ids(tokens)).toEqual(expect.arrayContaining(kept("tokens")))
	expect(ids(fpcs)).toEqual(expect.arrayContaining(kept("fpcs")))
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

/**
 * Writes the recording into the release. A plaintext release's endpoints are moved offline in its
 * rows; a sealed row cannot be rewritten, so each origin the recording dials answers with a refusal
 * instead, for the install's life, through the update.
 */
async function install(ctx: ExtensionContext, recording: Recording): Promise<{ before: Record<string, unknown>; held: HeldNode[] }> {
	const sealed = releaseTraits(recording.tag).storage === "sealed"
	const entries = sealed ? recording.entries : offline(recording.entries)
	const held = sealed ? await holdNodeStubs(ctx.browser, ctx.extensionId, recording.dials ?? []) : []
	try {
		await writeLocalStorage(ctx, entries)
		const before = await readLocalStorage(ctx)
		expect(Object.fromEntries(Object.keys(entries).map((key) => [key, before[key]]))).toEqual(entries)
		return { before, held }
	} catch (error) {
		await Promise.all(held.map((node) => node.stop()))
		throw error
	}
}

/**
 * Updates an install of `recording` in place and runs `verify` over it. What the install holds
 * stops on every path, and a run that verified also checks it answered every request it met, read
 * while the browser is open.
 */
async function replay(
	pair: UpdateBuilds,
	recording: Recording,
	verify: (ctx: ExtensionContext, before: Record<string, unknown>) => Promise<void>,
): Promise<void> {
	const held: HeldNode[] = []
	try {
		await inPlaceUpdate({
			builds: pair,
			populate: async (ctx) => {
				const installed = await install(ctx, recording)
				held.push(...installed.held)
				return installed.before
			},
			verify: async (ctx, before) => {
				await verify(ctx, before)
				expect((await Promise.all(held.map((node) => node.failures()))).flat()).toEqual([])
			},
		})
	} finally {
		await Promise.all(held.map((node) => node.stop()))
	}
}

/** The updated wallet, locked, on Testnet: its rows read, and it shows no barrier. */
async function openUpdated(ctx: ExtensionContext, before: Record<string, unknown>, expected: Expected): Promise<Page> {
	expect(await updateProblems(before, await readLocalStorage(ctx))).toEqual([])
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/auth", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	// The recording's active network may be its sandbox, which is gone, and the takeover shows only
	// for the active network.
	await storeActiveNetwork(page, "testnet", expected.locked?.networks)
	return page
}

/** The connected-apps list reads every session through its MAC, under the key the unlock derives. */
async function expectConnectedApps(page: Page, expected: Expected): Promise<void> {
	await navigateByHash(page, "#/popup/settings/connected-apps", 15_000)
	expect(expected.rows("dappSessions")).not.toEqual([])
	for (const { dappMetadata } of expected.rows("dappSessions")) {
		const host = new URL((dappMetadata as { url: string }).url).host
		await page.waitForSelector(`[data-testid="connected-app-row"][data-app-host="${host}"]`, { visible: true, timeout: 15_000 })
	}
}

/** The re-export preview re-derives the address from the decrypted key: only a key that opens passes. */
async function expectImportedKeyOpens(page: Page, address: string): Promise<void> {
	expect(await previewImport(page, await exportImportedAccountBody(page, false))).toBe(address)
}

async function expectContacts(page: Page, expected: Expected): Promise<void> {
	await navigateByHash(page, "#/popup/settings/contacts", 15_000)
	expect(expected.rows("contacts")).not.toEqual([])
	for (const { name } of expected.rows("contacts")) {
		await page.waitForSelector(contactRow(name as string), { visible: true, timeout: 15_000 })
	}
}

/** The popup opens on the release's selection while `chain` holds it, and otherwise on the chain's
 *  first account, as before the seal: a release that selected a sandbox account opens on Testnet's
 *  first, and one that selected a Testnet account other than the first opens there only if the
 *  candidate read the selection. Both the stored selection and the header must name it. */
async function expectSelection(page: Page, chain: number, selection: string | undefined): Promise<void> {
	const rows = await readAccounts(page, chain)
	const kept = rows.find((row) => row.address === selection)
	const want = (kept ?? firstAccount(rows.map((row) => ({ ...row, chainId: chain }))))?.address
	const label = kept ? "the selection is the release's" : "the selection is Testnet's first account"
	expect(await waitForSelectedAccount(page, (address) => address === want, label, 30_000)).toBe(want)
	await waitForShownAccount(page, want ?? "", `${label}, in the header`)
}

/** `chain`'s accounts as {@link readAccounts} orders them, from rows read before the update. */
const asStored = (rows: AccountRow[], chain: number): StoredAccount[] =>
	rows
		.filter((row) => row.chainId === chain)
		.map(({ address, name, index, type, visible }) => ({ address, name, index, type, visible }))
		.sort((a, b) => a.index - b.index || a.type - b.type || a.address.localeCompare(b.address))

/** `chain`'s accounts before the candidate's first unlock: read through it, or, for rows it cannot
 *  open while locked, as the release read them. */
const accountsBefore = async (page: Page, expected: Expected, chain: number): Promise<StoredAccount[]> =>
	expected.locked ? asStored(expected.locked.accounts, chain) : readAccounts(page, chain)

async function opensWithoutTakeover(
	ctx: ExtensionContext,
	page: Page,
	recording: Recording,
	expected: Expected,
	stored: Record<string, unknown>,
) {
	const chain = recordedTestnet(expected)
	const before = await accountsBefore(page, expected, chain)
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	await answerUpdatedTerms(page, recording.entries)
	await answerArrival(page, recording.entries)
	expect((await readAccounts(page, chain)).map(identity)).toEqual(before.map(identity))
	await expectSelection(page, chain, expected.selection)
	await expectImportedKeyOpens(page, imported(before)[0] ?? "")
	await expectConnectedApps(page, expected)
	await expectContacts(page, expected)
	await expectHistory(ctx, page, expected)
	await expectProjections(ctx, page, expected)
	await expectIdentity(ctx, page, expected)
	await expectReleasePreferences(ctx, page, expected.preferences, await captureSoleProfileId(page))
	expect(await shownOverlays(page)).toEqual([])
	expect(await updateProblems(stored, await readLocalStorage(ctx))).toEqual([])
}

/**
 * Drives the takeover's reset from `oldChain` and checks it carried every derived account at its
 * name, index and visibility to the address this build derives for it, the imported one too when its
 * key opens, at the address its key derives, left nothing on `oldChain`, and left every other
 * chain's rows as they were. The ready toast says the addresses moved exactly when one did.
 */
async function throughTheReset(
	ctx: ExtensionContext,
	page: Page,
	recording: Recording,
	expected: Expected,
	reset: { oldChain: number; before: StoredAccount[]; importedOpens: boolean },
) {
	const { oldChain, before, importedOpens } = reset
	expect(derived(before)).not.toEqual([])
	expect(imported(before)).not.toEqual([])
	const others = await otherNetworks(page, expected, expected.locked)

	await ensureUnlocked(page)
	expect(await takeoverScreen(page)).toBe("network-reset")
	expect(await shownOverlays(page, BARRIERS)).toEqual([])
	await clickByTestId(page, "stale-network-reset")
	await page.waitForSelector('[data-testid="stale-confirm-submit"]', { visible: true, timeout: 10_000 })
	expect(await page.$('[data-testid="stale-confirm-unmovable"]')).toEqual(importedOpens ? null : expect.anything())
	await clickByTestId(page, "stale-confirm-submit")
	const saidMoved = await readyToastSaysMoved(page, "Testnet")
	await waitForHash(page, "#/popup/general", 30_000)
	// The shell lays its toasts over the Terms sheet.
	await waitForToastGone(page, readyToast("Testnet", saidMoved).sub, 15_000)
	await answerUpdatedTerms(page, recording.entries)
	await answerArrival(page, recording.entries)

	const testnet = await readNetwork(page, "testnet")
	expect([testnet.chainId, testnet.l1ChainId]).toEqual([CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID])
	const after = await readAccounts(page, CHAIN_IDS.TESTNET)
	await expectSelection(page, CHAIN_IDS.TESTNET, expected.selection)
	const rederived = await rederive(page, derived(before), TESTNET_L1_CHAIN_ID)
	expect(derived(after)).toEqual(rederived)
	const moved = rederived.some((row, i) => row.address !== derived(before)[i]?.address)
	expect(saidMoved).toBe(moved)
	expect(imported(after)).toHaveLength(importedOpens ? imported(before).length : 0)
	expect(imported(after).filter((address) => imported(before).includes(address))).toEqual(moved ? [] : imported(after))
	expect(await readAccounts(page, oldChain)).toEqual([])
	const keysLeft = await page.evaluate(async (chain: number) => {
		const all = await chrome.storage.local.get(null)
		return Object.keys(all).filter((key) => key.startsWith("nulo:core:imported-account-keys@") && key.includes(`,${chain},`))
	}, oldChain)
	expect(keysLeft).toEqual([])
	expect(await otherNetworks(page, expected)).toEqual(others)
	if (importedOpens) await expectImportedKeyOpens(page, imported(after)[0] ?? "")
	await expectConnectedApps(page, expected)
	await expectContacts(page, expected)
	await expectHistory(ctx, page, expected)
	await expectProjections(ctx, page, expected, testnetNetworkId(expected))
	await expectIdentity(ctx, page, expected, oldChain)
	await expectReleasePreferences(ctx, page, expected.preferences, await captureSoleProfileId(page))
	expect(await shownOverlays(page)).toEqual([])
	expect(await unreadRows(await readLocalStorage(ctx))).toEqual([])
}

const profileRows = (stored: Record<string, unknown>) => rowsOf(stored, STORES.profiles.ref.root)

async function expectPasskeyOpening(
	ctx: ExtensionContext,
	anchor: Page,
	before: Record<string, unknown>,
	passkey: ReleaseTraits["passkey"],
) {
	if (passkey === "retired") {
		await anchor.close()
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/auth", 30_000)
		await page.waitForSelector('[data-testid="auth-setup-again"]', { visible: true, timeout: 30_000 })
		expect(await page.$('[data-testid="auth-submit"]')).toBeNull()
		expect(await shownOverlays(page)).toEqual([])
		await page.close()
		return
	}
	await gotoExtensionPage(anchor, extensionUrl(ctx.extensionId, "/src/popup/index.html"))
	await waitForHash(anchor, "#/popup/auth", 30_000)
	await authSubmitReady(anchor)
	expect(await anchor.$('[data-testid="auth-setup-again"]')).toBeNull()
	expect(await shownOverlays(anchor)).toEqual([])
	await clickByTestId(anchor, "auth-submit")
	await waitForHash(anchor, "#/popup/general", 60_000)
	expect(profileRows(await readLocalStorage(ctx))).toEqual(profileRows(before))
	await anchor.close()
}

describe.skipIf(!process.env.NULO_E2E_UPDATE_FROM)("update replay", () => {
	test("the recorded release storage updates in place, through the reset once Testnet's seed has moved", {
		timeout: 300_000,
		retry: 0,
	}, async () => {
		const recording = recordingFor()
		const pair = builds()
		const expected = await expectedOf(recording, pair.from)
		const chain = recordedTestnet(expected)
		await replay(pair, recording, async (ctx, before) => {
			const page = await openUpdated(ctx, before, expected)
			if (chain === CHAIN_IDS.TESTNET) await opensWithoutTakeover(ctx, page, recording, expected, before)
			else {
				const reset = { oldChain: chain, before: await accountsBefore(page, expected, chain), importedOpens: true }
				await throughTheReset(ctx, page, recording, expected, reset)
			}
			await page.close()
			const stored = await readLocalStorage(ctx)
			await expectBackupImports("password", await exportBackupFile(ctx), stored)
		})
	})

	test("the recorded release storage, its Testnet rows moved off this build's seed, updates through the reset", {
		timeout: 300_000,
		retry: 0,
	}, async ({ skip }) => {
		const recording = recordingFor()
		const pair = builds()
		const expected = await expectedOf(recording, pair.from)
		if (recordedTestnet(expected) !== CHAIN_IDS.TESTNET) skip("the seed has moved: the first case resets the recording itself")
		await replay(pair, recording, async (ctx, before) => {
			const page = await openUpdated(ctx, before, expected)
			await seedStaleNetwork(page, "network-reset", expected.locked)
			const moved = await readAccounts(page, PREVIOUS_TESTNET_CHAIN_ID)
			await throughTheReset(ctx, page, recording, expected, {
				oldChain: PREVIOUS_TESTNET_CHAIN_ID,
				before: moved,
				importedOpens: false,
			})
			await page.close()
		})
	})

	test("a passkey profile the release made opens, after the update, on Set up again if retired, else on its passkey", {
		timeout: 300_000,
		retry: 0,
	}, async () => {
		const pair = builds()
		await inPlaceUpdate({
			builds: pair,
			populate: async (ctx) => {
				const anchor = await openPopup(ctx)
				await setupPasskeyVirtualAuth(ctx.browser, anchor)
				await registerPasskeyProfile(anchor)
				// Chrome's credential dies with this tab and the update closes every extension page, so the
				// tab waits off the extension until the candidate runs.
				await anchor.goto("about:blank")
				return { anchor, before: await readLocalStorage(ctx) }
			},
			verify: async (ctx, { anchor, before }) => {
				const after = await readLocalStorage(ctx)
				expect(await updateProblems(before, after)).toEqual([])
				expect(profileRows(after)).toEqual(profileRows(before))
				await expectPasskeyOpening(ctx, anchor, before, releaseTraits(pair.tag).passkey)
			},
		})
	})

	test("a passkey profile on the candidate exports a full backup, protected with a file password, that imports", {
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
			// The fixture password, so the stored-shape guard opens both pinned files with one password.
			const file = await downloadPasskeyBackup(page, TEST_PASSWORD)
			await expectBackupImports("passkey", file, stored)
		} finally {
			await ctx.close()
		}
	})
})
