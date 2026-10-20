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
 * Runtime: estimated 2 min per case per browser.
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { type ExtensionContext, clickByTestId, openPopup, test, waitForHash } from "./fixtures/extension"
import { contactRow, ensureUnlocked, navigateByHash, waitForToast } from "./fixtures/helpers"
import { inPlaceUpdate, readLocalStorage, updateBuilds, writeLocalStorage } from "./fixtures/update/in-place"
import { type Recording, readRecording } from "./fixtures/update/recording"
import { BARRIERS, shownOverlays, updateProblems } from "./fixtures/update/verify"
import { exportImportedAccountBody, previewImport } from "./helpers/account-io"
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

function recordingFor(): { from: string; to: string; recording: Recording } {
	const builds = updateBuilds()
	if (!builds) throw new Error("unreachable: skipIf guards")
	const recording = readRecording(builds.tag)
	if (!recording) throw new Error(`no recording of ${builds.tag}: run the live scenario with NULO_E2E_UPDATE_RECORD=1`)
	return { from: builds.from, to: builds.to, recording }
}

const recordedTestnet = (recording: Recording): number => {
	const row = rowsOf(recording.entries, "nulo:core:networks").find((network) => network.kind === "testnet")
	if (!row) throw new Error(`the recording of ${recording.tag} holds no Testnet network`)
	return row.chainId as number
}

/** Every network row but Testnet's, as `snapshotChain` keys them. */
const otherChains = (recording: Recording): Array<{ id: string; chainId: number }> =>
	rowsOf(recording.entries, "nulo:core:networks")
		.filter((network) => network.kind !== "testnet")
		.map((network) => ({ id: network.id as string, chainId: network.chainId as number }))

const identity = ({ address, name, index, type, visible }: StoredAccount) => ({ address, name, index, type, visible })
const derived = (rows: StoredAccount[]) => rows.filter((a) => a.type === 0).map(identity)
const imported = (rows: StoredAccount[]) => rows.filter((a) => a.type === 1).map((a) => a.address)

async function install(ctx: ExtensionContext, recording: Recording): Promise<Record<string, unknown>> {
	await writeLocalStorage(ctx, recording.entries)
	const before = await readLocalStorage(ctx)
	expect(Object.keys(recording.entries).filter((key) => !(key in before))).toEqual([])
	return before
}

/** The updated wallet, locked, on Testnet: its rows read, and it shows no barrier. */
async function openUpdated(ctx: ExtensionContext, before: Record<string, unknown>): Promise<Page> {
	expect(await updateProblems(before, await readLocalStorage(ctx))).toEqual([])
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/auth", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	await storeActiveNetwork(page, "testnet")
	return page
}

async function expectContacts(page: Page, recording: Recording): Promise<void> {
	await navigateByHash(page, "#/popup/settings/contacts", 15_000)
	for (const { name } of rowsOf(recording.entries, "nulo:core:contacts")) {
		await page.waitForSelector(contactRow(name as string), { visible: true, timeout: 15_000 })
	}
}

async function opensWithoutTakeover(page: Page, recording: Recording): Promise<void> {
	const chain = recordedTestnet(recording)
	const before = await readAccounts(page, chain)
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general", 30_000)
	expect(await shownOverlays(page)).toEqual([])
	expect((await readAccounts(page, chain)).map(identity)).toEqual(before.map(identity))
	await expectContacts(page, recording)
}

/**
 * Drives the takeover's reset from `oldChain` and checks it carried every derived account at its
 * name, index and address, the imported one too when its key opens, left nothing on `oldChain`, and
 * left every other chain's rows as they were.
 */
async function throughTheReset(page: Page, recording: Recording, oldChain: number, importedOpens: boolean): Promise<void> {
	const before = await readAccounts(page, oldChain)
	expect(derived(before)).not.toEqual([])
	expect(imported(before)).not.toEqual([])
	const others = await Promise.all(otherChains(recording).map(({ id, chainId }) => snapshotChain(page, chainId, id)))

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
	expect(await Promise.all(otherChains(recording).map(({ id, chainId }) => snapshotChain(page, chainId, id)))).toEqual(others)
	// The re-export preview re-derives the address from the decrypted key: only a key that opens passes.
	if (importedOpens) expect(await previewImport(page, await exportImportedAccountBody(page, false))).toBe(imported(before)[0])
	await expectContacts(page, recording)
}

describe.skipIf(!process.env.NULO_E2E_UPDATE_FROM)("update replay", () => {
	test("the recorded release storage updates in place, through the reset once Testnet's seed has moved", {
		timeout: 300_000,
		retry: 0,
	}, async () => {
		const { from, to, recording } = recordingFor()
		const chain = recordedTestnet(recording)
		await inPlaceUpdate({
			from,
			to,
			populate: (ctx) => install(ctx, recording),
			verify: async (ctx, before) => {
				const page = await openUpdated(ctx, before)
				if (chain === CHAIN_IDS.TESTNET) await opensWithoutTakeover(page, recording)
				else await throughTheReset(page, recording, chain, true)
				await page.close()
			},
		})
	})

	test("the recorded release storage, its Testnet rows moved off this build's seed, updates through the reset", {
		timeout: 300_000,
		retry: 0,
	}, async ({ skip }) => {
		const { from, to, recording } = recordingFor()
		if (recordedTestnet(recording) !== CHAIN_IDS.TESTNET) skip("the seed has moved: the first case resets the recording itself")
		await inPlaceUpdate({
			from,
			to,
			populate: (ctx) => install(ctx, recording),
			verify: async (ctx, before) => {
				const page = await openUpdated(ctx, before)
				await seedStaleNetwork(page, "network-reset")
				await throughTheReset(page, recording, PREVIOUS_TESTNET_CHAIN_ID, false)
				await page.close()
			},
		})
	})
})
