/**
 * A release install updated in place to a candidate that seeds one more default network meets that
 * network's arrival once: with no barrier raised, after the reset's takeover and the Terms sheet,
 * never beside one, and never again once answered. Opt-in, as the other update scenarios:
 * `NULO_E2E_UPDATE_FROM=<tag>` with `NULO_E2E_UPDATE_TO` the candidate
 * `build-update-candidate.sh <browser> --extra-seed` wrote. Run it by file: the other update
 * scenarios refuse that candidate, and this one refuses theirs.
 *
 * Failure mode: rows the released code wrote, read by the candidate's real boot after the browser's
 * own update, give the wrong arrival: none, one beside or ahead of a more urgent surface, one that
 * brings back a default the person deleted, or one that returns after Stay. A composition test runs
 * neither the popup shell's arbitration nor address derivation, and the arrival smoke plants the
 * record on a fresh profile and never runs the old build.
 *
 * Node-free, as the replay is: Testnet is the stand-in node, so the release's own UI populates it on
 * whichever Aztec line the checkout is. The older Terms version and the moved Testnet are planted
 * after the update, while the candidate is still locked, as the replay moves its Testnet: what is
 * proven is the first unlock over them, not a candidate boot that found them already in place.
 * Once the candidate's Testnet seed has moved, the release's own rows are the moved ones, so both
 * cases meet the reset, and its accounts come back at the addresses the candidate derives.
 *
 * Runtime: estimated 3 min on Chrome, 5 min on Firefox; measured 38 s and 49 s, the release cached.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { E2E_EXTRA_SEED } from "@/e2e/extra-seed"
import { readyToast } from "@/components/stale-network/copy"
import { CHAIN_IDS, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import type { StoredShapeName } from "@/wallet/storage/stored-shapes"
import { BROWSER, openScratchPage } from "./fixtures/browser"
import { type ExtensionContext, clickByTestId, openPopup, registerProfile, test, waitForHash } from "./fixtures/extension"
import { createAccount, deleteNetworkRow, ensureUnlocked, navigateByHash, waitForToastGone } from "./fixtures/helpers"
import { inPlaceUpdate, readLocalStorage, type UpdateBuilds, updateBuilds } from "./fixtures/update/in-place"
import { shapeOfKey } from "./fixtures/update/stored-rows"
import { BARRIERS, TAKEOVER, updateProblems } from "./fixtures/update/verify"
import { seedLegalAcceptance } from "./fixtures/wallet-pages"
import { FIRST_ACCOUNT_NAME, gotoAccounts } from "./helpers/account-io"
import { pointerClick, waitForSheet } from "./helpers/legal-drivers"
import { ARRIVAL, readSurfaceTrace, type Surfaces, traceSurfaces } from "./helpers/network-arrival"
import { ACCOUNTS, accountRows, accountScope, readNetworkRows, storedEntries } from "./helpers/identity-rows"
import { readyToastSaysMoved, rederive, seedStaleNetwork, takeoverScreen } from "./helpers/stale-network"

const HOME = '[data-testid="tokens-menu-trigger"]'
const SURFACES: Surfaces = {
	barrier: BARRIERS,
	// The progress screen is the takeover's own, nested inside it.
	takeover: [TAKEOVER, "stale-progress"],
	sheet: ["legal-sheet"],
	arrival: ["network-arrival-takeover"],
}
/** The record once the arrival is answered: every kind the release was offered, and the new one. */
const OFFERED = { offered: ["local", E2E_EXTRA_SEED.kind, "testnet"].sort() }
const ANNOUNCED = { ...OFFERED, announce: [E2E_EXTRA_SEED.kind] }

type Entries = Record<string, unknown>
type Row = Record<string, unknown>

function builds(): UpdateBuilds {
	const pair = updateBuilds(BROWSER, { extraSeed: true })
	if (!pair) throw new Error("unreachable: skipIf guards")
	return pair
}

const keysOf = (entries: Entries, name: StoredShapeName): string[] =>
	Object.keys(entries)
		.filter((key) => shapeOfKey(key) === name)
		.sort()
const valuesOf = (entries: Entries, name: StoredShapeName): Entries =>
	Object.fromEntries(keysOf(entries, name).map((key) => [key, entries[key]]))
const rowsOf = (entries: Entries, name: StoredShapeName): Row[] =>
	keysOf(entries, name).map((key) => JSON.parse(entries[key] as string) as Row)

const networks = (entries: Entries): Row[] => rowsOf(entries, "networks")
const offerRecords = (entries: Entries): Row[] => rowsOf(entries, "networkSeeded")
const chainOf = (entries: Entries, kind: string) => networks(entries).find((row) => row.kind === kind)?.chainId as number | undefined

/** Every account as the person sees it, by the chain it lives on. */
function accountsByChain(entries: Entries): Record<string, Row[]> {
	const byChain: Record<string, Row[]> = {}
	for (const { chainId, address, name, index, type, visible } of rowsOf(entries, "accounts")) {
		byChain[String(chainId)] ??= []
		byChain[String(chainId)]?.push({ address, name, index, type, visible })
	}
	return byChain
}

/** The networks the unlocked wallet reads, by id, as the release's stored rows sort. */
const readNetworks = async (page: Page): Promise<Row[]> => (await readNetworkRows(page)).sort((a, b) => a.id.localeCompare(b.id))

/** {@link accountsByChain} as the unlocked wallet reads them, once the update has sealed the rows. */
async function readAccountsByChain(page: Page): Promise<Record<string, Row[]>> {
	const chains = new Set(Object.keys(await storedEntries(page, [ACCOUNTS])).flatMap((key) => accountScope(key)?.chainId ?? []))
	const byChain: Record<string, Row[]> = {}
	for (const chainId of chains) {
		const rows = (await accountRows(page, chainId)).sort((a, b) => a.address.localeCompare(b.address))
		if (rows.length > 0)
			byChain[String(chainId)] = rows.map(({ address, name, index, type, visible }) => ({ address, name, index, type, visible }))
	}
	return byChain
}

/** The release's Testnet accounts, all derived, as this build holds them after the reset: on the
 *  seed's chain, each at the address the build derives for its index, by address; and whether any
 *  address moved. Leaves the popup on the recovery phrase. */
async function carriedAccounts(page: Page, before: Entries): Promise<{ byChain: Record<string, Row[]>; moved: boolean }> {
	const released = (accountsByChain(before)[String(chainOf(before, "testnet"))] ?? []) as Array<Row & { index: number; address: string }>
	expect(released.map((row) => row.type)).toEqual(released.map(() => 0))
	const rows = (await rederive(page, released, TESTNET_L1_CHAIN_ID)).sort((a, b) => a.address.localeCompare(b.address))
	const moved = rows.some((row) => !released.some((old) => old.address === row.address))
	return { byChain: { [CHAIN_IDS.TESTNET]: rows }, moved }
}

/** Drives the reset's takeover and returns whether its ready toast says the addresses moved, once
 *  the toast is gone: the shell lays its toasts over the Terms sheet, and the toast closes itself. */
async function throughTheReset(page: Page): Promise<boolean> {
	expect(await takeoverScreen(page)).toBe("network-reset")
	await clickByTestId(page, "stale-network-reset")
	await page.waitForSelector('[data-testid="stale-confirm-submit"]', { visible: true, timeout: 10_000 })
	await clickByTestId(page, "stale-confirm-submit")
	const moved = await readyToastSaysMoved(page, "Testnet")
	await waitForToastGone(page, readyToast("Testnet", moved).sub, 15_000)
	return moved
}

type Identity = { name?: unknown; chainId?: unknown; l1ChainId?: unknown; kind?: unknown }
const identity = ({ name, chainId, l1ChainId, kind }: Identity) => ({ name, chainId, l1ChainId, kind })

/** The release's state as the candidate first meets it. A release that predates the offer record
 *  holds none; a later one may hold one, but never offering the new default. */
async function released(ctx: ExtensionContext): Promise<Entries> {
	const before = await readLocalStorage(ctx)
	expect(offerRecords(before).flatMap((record) => record.offered as string[])).not.toContain(E2E_EXTRA_SEED.kind)
	expect(networks(before).map((row) => row.kind)).not.toContain(E2E_EXTRA_SEED.kind)
	return before
}

const textOf = (page: Page, testid: string) => page.$eval(`[data-testid="${testid}"]`, (el) => el.textContent?.trim())

/** The Terms sheet reads its status once, as the popup mounts, so a value planted through an open
 *  popup can miss it: plant first, through a page of its own. */
async function openAndUnlock(ctx: ExtensionContext, plant: (page: Page) => Promise<void>): Promise<Page> {
	const scratch = await openScratchPage(ctx.browser, ctx.extensionId)
	try {
		await plant(scratch)
	} finally {
		await scratch.close().catch(() => {})
	}
	const page = await openPopup(ctx)
	await traceSurfaces(page, SURFACES)
	await waitForHash(page, "#/popup/auth", 30_000)
	await ensureUnlocked(page)
	return page
}

async function acceptTerms(page: Page): Promise<void> {
	await waitForSheet(page, "changed")
	await pointerClick(page, "legal-consent-checkbox")
	await pointerClick(page, "legal-continue")
}

async function expectArrival(page: Page, current: string): Promise<void> {
	await page.waitForSelector(ARRIVAL, { visible: true, timeout: 30_000 })
	expect(await textOf(page, "network-arrival-title")).toBe(`${E2E_EXTRA_SEED.name} is in your wallet`)
	expect(await textOf(page, "network-arrival-stay")).toBe(`STAY ON ${current.toUpperCase()}`)
}

/** The caller waits for what the popup shows, the arrival or Home: the shell renders no route while
 *  the arrival is up, so the start route moves on to Home only if it rendered before the arrival. */
async function reopen(ctx: ExtensionContext, page: Page): Promise<Page> {
	await page.close()
	const next = await openPopup(ctx)
	await traceSurfaces(next, SURFACES)
	return next
}

async function stay(page: Page): Promise<void> {
	await pointerClick(page, "network-arrival-stay")
	await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
}

test.skipIf(!process.env.NULO_E2E_UPDATE_FROM)(
	"a populated release install meets the new default's arrival once, after the Terms sheet, and never after Stay",
	{ timeout: 600_000, retry: 0 },
	async () => {
		await inPlaceUpdate({
			builds: builds(),
			populate: async (ctx) => {
				await registerProfile(ctx)
				const page = await openPopup(ctx)
				await waitForHash(page, "#/popup/general", 30_000)
				await createAccount(page, "Second")
				await navigateByHash(page, "#/popup/settings/networks", 15_000)
				await deleteNetworkRow(page, "Local Network")
				await page.close()
				const before = await released(ctx)
				expect(networks(before).map((row) => row.kind)).toEqual(["testnet"])
				return before
			},
			verify: async (ctx, before) => {
				const reset = chainOf(before, "testnet") !== CHAIN_IDS.TESTNET
				let page = await openAndUnlock(ctx, (scratch) => seedLegalAcceptance(scratch, "stale"))
				const saidMoved = reset && (await throughTheReset(page))
				await acceptTerms(page)
				await expectArrival(page, "Testnet")
				expect(await readSurfaceTrace(page)).toEqual({ shown: [...(reset ? ["takeover"] : []), "sheet", "arrival"], arrivals: 1 })

				const arrived = await readLocalStorage(ctx)
				expect(offerRecords(arrived)).toEqual([ANNOUNCED])
				const read = await readNetworks(page)
				const added = read.filter((row) => row.kind === E2E_EXTRA_SEED.kind)
				expect(added.map(identity)).toEqual([identity(E2E_EXTRA_SEED)])
				// The deleted default stays deleted, and the release's own row is left as it was, but for
				// the chain the reset moves it to.
				expect(read.filter((row) => row.kind !== E2E_EXTRA_SEED.kind)).toEqual(
					networks(before).map((row) => ({ ...row, chainId: CHAIN_IDS.TESTNET })),
				)

				// Closed unanswered, it is back at the next open.
				page = await reopen(ctx, page)
				await expectArrival(page, "Testnet")
				await stay(page)
				expect(await readSurfaceTrace(page)).toEqual({ shown: ["arrival"], arrivals: 1 })

				const answered = await readLocalStorage(ctx)
				expect(offerRecords(answered)).toEqual([OFFERED])
				expect(valuesOf(answered, "activeNetwork")).toEqual(valuesOf(before, "activeNetwork"))
				expect(await updateProblems(before, answered)).toEqual([])
				const carried = await carriedAccounts(page, before)
				expect(await readAccountsByChain(page)).toEqual(carried.byChain)
				expect(saidMoved).toBe(carried.moved)
				await navigateByHash(page, "#/popup/settings/networks", 15_000)
				for (const name of [E2E_EXTRA_SEED.name, "Testnet"]) {
					await page.waitForSelector(`[data-testid="network-row"][data-network-name="${name}"]`, {
						visible: true,
						timeout: 15_000,
					})
				}
				expect(await page.$('[data-testid="network-row"][data-network-name="Local Network"]')).toBeNull()
				await gotoAccounts(page)
				for (const name of [FIRST_ACCOUNT_NAME, "Second"]) {
					await page.waitForSelector(`[data-testid="manage-accounts-row"][data-account-name="${name}"]`, {
						visible: true,
						timeout: 15_000,
					})
				}

				// The stored record is what keeps it answered; this is what the shell shows once Home is up.
				page = await reopen(ctx, page)
				await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
				expect(await readSurfaceTrace(page)).toEqual({ shown: [], arrivals: 0 })
				await page.close()
			},
		})
	},
)

test.skipIf(!process.env.NULO_E2E_UPDATE_FROM)(
	"a release install whose Testnet moved meets the reset's takeover, then the Terms sheet, then the arrival",
	{ timeout: 600_000, retry: 0 },
	async () => {
		await inPlaceUpdate({
			builds: builds(),
			populate: async (ctx) => {
				await registerProfile(ctx)
				return released(ctx)
			},
			verify: async (ctx, before) => {
				const releaseTestnet = chainOf(before, "testnet")
				const page = await openAndUnlock(ctx, async (scratch) => {
					// Once this build's Testnet seed has moved, the release's own rows are the moved ones.
					if (releaseTestnet === CHAIN_IDS.TESTNET) await seedStaleNetwork(scratch, "network-reset")
					await seedLegalAcceptance(scratch, "stale")
				})
				const saidMoved = await throughTheReset(page)
				await acceptTerms(page)
				await expectArrival(page, "Testnet")
				expect(await readSurfaceTrace(page)).toEqual({ shown: ["takeover", "sheet", "arrival"], arrivals: 1 })

				const arrived = await readLocalStorage(ctx)
				expect(offerRecords(arrived)).toEqual([ANNOUNCED])
				expect((await readNetworks(page)).find((row) => row.kind === "testnet")?.chainId).toBe(CHAIN_IDS.TESTNET)
				await stay(page)
				expect(offerRecords(await readLocalStorage(ctx))).toEqual([OFFERED])
				const carried = await carriedAccounts(page, before)
				expect(await readAccountsByChain(page)).toEqual(carried.byChain)
				expect(saidMoved).toBe(carried.moved)
				await page.close()
			},
		})
	},
)
