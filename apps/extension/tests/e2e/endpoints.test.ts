import { expect } from "vitest"
import type { Page } from "puppeteer"
import { RELAY_LABEL, RELAY_RPC_URLS } from "@/wallet/services/network/seeds"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { unlockAfterBackgroundDeath } from "./fixtures/auth"
import { isFirefox, setViewport, stopBackground } from "./fixtures/browser"
import { RELAY_NODE_HOSTS } from "./fixtures/egress-guard"
import { type ExtensionContext, test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "./fixtures/extension"
import { navigateByHash, navigateToSettings, openNetworkDetail, rewriteActiveNetwork } from "./fixtures/helpers"
import { pollUntil } from "./fixtures/poll"
import { shotSend } from "./fixtures/send-page"
import { callService } from "./fixtures/session"
import { readSeedOffers } from "./helpers/network-arrival"
import { readNetwork } from "./helpers/stale-network"

// Scope note: `addEndpoint` / `updateEndpoint` probe the candidate URL
// via Aztec `getNodeInfo()` and reject on chainId mismatch — the
// "happy path" tests below cover form validation + popup UX + page
// wiring without hitting the network. The full
// add → setPrimary → delete cycle requires a live Aztec node and
// lives in the network suite.

async function openFirstNetworkDetail(page: Page): Promise<void> {
	await navigateToSettings(page, "networks")
	await page.waitForSelector('[data-testid="network-row"]', { visible: true, timeout: 5_000 })
	const firstName = await page.evaluate(() => {
		const row = document.querySelector('[data-testid="network-row"]') as HTMLElement | null
		return row?.getAttribute("data-network-name") ?? null
	})
	expect(firstName).toBeTruthy()
	await openNetworkDetail(page, firstName as string)
}

test("network detail page renders chain info + endpoints section", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await openFirstNetworkDetail(page)

	// Chain section: rename row + chain-id row
	await page.waitForSelector('[data-testid="network-detail-rename"]', { visible: true, timeout: 5_000 })

	// Endpoints section: at least one endpoint row + add-endpoint CTA
	await page.waitForSelector('[data-testid="endpoint-row"]', { visible: true, timeout: 5_000 })
	await page.waitForSelector('[data-testid="endpoint-add-btn"]', { visible: true, timeout: 5_000 })

	const endpointCount = (await page.$$('[data-testid="endpoint-row"]')).length
	expect(endpointCount).toBeGreaterThanOrEqual(1)
	await shotSend(page, "network-detail", "network-detail-rename")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("NewEndpointPopup keeps submit disabled with empty URL", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await openFirstNetworkDetail(page)
	await clickByTestId(page, "endpoint-add-btn")
	await page.waitForSelector('[data-testid="add-endpoint-submit"]', { visible: true, timeout: 5_000 })

	// Default URL field is empty → submit must be disabled
	const disabled = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="add-endpoint-submit"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(disabled).toBe(true)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("EditEndpointPopup pre-fills with current values + isDirty guard keeps save disabled", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await openFirstNetworkDetail(page)

	// Click the edit icon on the first endpoint row. The icon is rendered
	// inside the `#right` slot Tooltip, so click via dispatchEvent on the
	// scoped testid to bypass tooltip hover-show timing.
	await page.waitForSelector('[data-testid="endpoint-edit-btn"]', { visible: true, timeout: 5_000 })
	await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="endpoint-edit-btn"]') as HTMLElement | null
		btn?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
	})

	await page.waitForSelector('[data-testid="edit-endpoint-submit"]', { visible: true, timeout: 5_000 })

	// Verify URL field pre-filled with the current endpoint URL (non-empty)
	const initialUrl = await page.evaluate(() => {
		const input = document.querySelector('[data-testid="endpoint-rpc-input"] input') as HTMLInputElement | null
		return input?.value ?? ""
	})
	expect(initialUrl.length).toBeGreaterThan(5)

	// Save must be disabled because nothing changed (isDirty === false)
	const disabledFresh = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="edit-endpoint-submit"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(disabledFresh).toBe(true)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("Single-endpoint network hides the delete-endpoint icon (last-endpoint guard)", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "networks")
	await openNetworkDetail(page, "Local Network")
	await page.waitForSelector('[data-testid="endpoint-row"]', { visible: true, timeout: 5_000 })

	const endpointCount = (await page.$$('[data-testid="endpoint-row"]')).length
	const deleteCount = (await page.$$('[data-testid="endpoint-delete-btn"]')).length

	// The Local Network seeds one endpoint. The delete icon is
	// rendered v-if="not-primary AND endpoints.length > 1" — so on a single-
	// endpoint network, no delete icon appears anywhere.
	expect(endpointCount).toBe(1)
	expect(deleteCount).toBe(0)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("NewEndpointPopup invalid URL surfaces inline RPC-didn't-respond error", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await openFirstNetworkDetail(page)
	await clickByTestId(page, "endpoint-add-btn")
	await page.waitForSelector('[data-testid="add-endpoint-submit"]', { visible: true, timeout: 5_000 })

	// A reachable-but-non-aztec URL: addEndpoint will fail at probe time.
	// "http://localhost:1" reliably refuses the connection cross-platform,
	// short-circuiting before any 30s aztec-rpc timeout.
	await replaceInputValue(page, '[data-testid="endpoint-rpc-input"] input', "http://localhost:1")

	await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="add-endpoint-submit"]') as HTMLButtonElement | null
		btn?.click()
	})

	// Wait for the "Something went wrong." / "RPC didn't respond." error to
	// surface in the input's #right slot (any text-error suffices — exact
	// copy varies by failure mode and is asserted in unit tests).
	await page.waitForFunction(
		() => {
			const slotErrors = document.querySelectorAll('[data-testid="endpoint-rpc-input"] .fade')
			if (slotErrors.length > 0) return true
			// Fallback: probe the body text for either of the two error messages
			// the popup surfaces on probe failure.
			const txt = (document.body.textContent ?? "").toLowerCase()
			return txt.includes("rpc didn't respond") || txt.includes("something went wrong")
		},
		{ timeout: 30_000, polling: 500 },
	)

	// Submit stays disabled (errorText is non-empty)
	const disabledAfterError = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="add-endpoint-submit"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(disabledAfterError).toBe(true)

	expect(registeredExtension.pageErrors).toEqual([])
})

test("seeded dRPC endpoint row is titled 'dRPC', never the raw provider URL", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "networks")
	// Testnet is the one dRPC-backed seed.
	await page.waitForSelector('[data-testid="network-row"][data-network-name="Testnet"]', { visible: true, timeout: 5_000 })
	await openNetworkDetail(page, "Testnet")

	await page.waitForSelector('[data-testid="endpoint-row"]', { visible: true, timeout: 5_000 })
	const rowText = await page.evaluate(() => document.querySelector('[data-testid="endpoint-row"]')?.textContent ?? "")
	expect(rowText).toContain("dRPC")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

// A stored URL the transport rule refuses (plain HTTP to [::1]) must not stop the popup from
// starting: the person fixes it in Settings, which they could not reach otherwise.
test("a saved http://[::1] node URL leaves the popup starting and the endpoint listed", async ({ registeredExtensionPerTest }) => {
	const first = await openPopup(registeredExtensionPerTest)
	await waitForHash(first, "#/popup/general")
	const rewritten = await rewriteActiveNetwork(first, (row) => {
		const primary = row.endpoints.find((e) => e.id === row.primaryEndpointId)
		if (!primary) return false
		primary.rpcUrl = "http://[::1]:8080"
		return true
	})
	expect(rewritten?.name).toBeTruthy()
	await first.close()

	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	await navigateToSettings(page, "networks")
	await openNetworkDetail(page, rewritten?.name as string)
	await page.waitForSelector('[data-testid="endpoint-row"]', { visible: true, timeout: 5_000 })
	const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="endpoint-row"]')].map((r) => r.textContent ?? ""))
	expect(rows.some((text) => text.includes("http://[::1]:8080"))).toBe(true)

	expect(registeredExtensionPerTest.pageErrors).toEqual([])
})

/** The endpoints of the network of `kind` as stored and as its detail page lists them. Carries no
 *  URL, so neither an assertion nor a poll's timeout prints a provider's. */
async function relayView(page: Page, kind: "testnet" | "mainnet") {
	const row = await readNetwork(page, kind)
	const relay = RELAY_RPC_URLS[kind]
	return {
		profileId: row.profileId,
		ids: row.endpoints.map((endpoint) => endpoint.id),
		labels: row.endpoints.map((endpoint) => endpoint.label),
		relayAt: row.endpoints.findIndex((endpoint) => endpoint.rpcUrl === relay),
	}
}

async function shownEndpointIds(page: Page, name: string): Promise<(string | null)[]> {
	await navigateByHash(page, "#/popup/general")
	await navigateToSettings(page, "networks")
	await openNetworkDetail(page, name)
	await page.waitForSelector('[data-testid="endpoint-row"]', { visible: true, timeout: 5_000 })
	return page.$$eval('[data-testid="endpoint-row"]', (rows) => rows.map((row) => row.getAttribute("data-endpoint-id")))
}

/** A frame shows the relay's URL only: every other endpoint URL line is blurred before the shot. */
async function shotEndpoints(page: Page, name: string): Promise<void> {
	if (!process.env.NULO_E2E_SHOT_DIR) return
	await page.$$eval(
		'[data-testid="endpoint-row"] span',
		(spans, relayHosts) => {
			for (const span of spans as HTMLElement[]) {
				const text = span.textContent ?? ""
				const url = span.children.length === 0 && /^https?:\/\//.test(text)
				if (url && !relayHosts.some((host) => text.startsWith(`https://${host}`))) span.style.filter = "blur(8px)"
			}
		},
		RELAY_NODE_HOSTS,
	)
	await shotSend(page, name, "endpoint-row")
}

const VIEWPORT = isFirefox ? { width: 360, height: 600 } : { width: 360, height: 600, deviceScaleFactor: 2 }

/** Removes the relay of the network of `kind` through its detail page, as a person does. */
async function deleteRelay(page: Page, kind: "testnet" | "mainnet", name: string): Promise<void> {
	await shownEndpointIds(page, name)
	const view = await relayView(page, kind)
	await page.$eval(`[data-endpoint-id="${view.ids[view.relayAt]}"] [data-testid="endpoint-delete-btn"]`, (button) =>
		button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
	)
	await clickByTestId(page, "confirm-submit")
	await pollUntil(
		() => relayView(page, kind),
		(next) => next.relayAt === -1,
		{ label: `the ${name} relay deleted`, timeoutMs: 15_000, intervalMs: 200 },
	)
}

/** The offer record as a build before the relay left it for `kind`: no relay offer named. */
async function forgetRelayOffer(page: Page, profileId: string, kind: string): Promise<void> {
	await page.evaluate(
		async (key: string, forgotten: string) => {
			const record = JSON.parse((await chrome.storage.local.get(key))[key] as string)
			const relay = (record.relay ?? []).filter((offered: string) => offered !== forgotten)
			// An empty list is left out, as the wallet writes the record.
			record.relay = relay.length > 0 ? relay : undefined
			await chrome.storage.local.set({ [key]: JSON.stringify(record) })
		},
		`nulo:core:network-seeded@${profileId}`,
		kind,
	)
}

async function restartAndUnlock(extension: ExtensionContext, page: Page): Promise<Page> {
	await page.close()
	await stopBackground(extension)
	const next = await openPopup(extension)
	await unlockAfterBackgroundDeath(next)
	return next
}

// Nulo's relay in the real popup and worker: a new profile lists it after dRPC on Alpha and Testnet,
// a profile whose record predates it is given it, last, by the unlock of a restarted worker, and a
// relay the person removes after that stays removed across the next one. The conversion's rules are
// proven by the network service's tests; what only this run shows is the seed and the unlock path
// the shipped build takes, every writer of the real boot included. No request reaches the relay:
// the launch's guard holds both hosts. Estimated 20 s on Chrome and 35 s on Firefox.
test("Nulo's relay is each default network's second endpoint, and is given once to an earlier profile", async ({
	registeredExtensionPerTest: extension,
}) => {
	let page = await openPopup(extension)
	await setViewport(page, VIEWPORT)
	await waitForHash(page, "#/popup/general")

	for (const [kind, name] of [
		["mainnet", "Alpha"],
		["testnet", "Testnet"],
	] as const) {
		const seeded = await relayView(page, kind)
		expect(seeded.labels).toEqual(["dRPC", RELAY_LABEL])
		expect(seeded.relayAt).toBe(1)
		expect(await shownEndpointIds(page, name)).toEqual(seeded.ids)
	}
	await shotEndpoints(page, "p112-04-built-01")

	// A profile made before the relay holds no relay endpoint and a record that names no relay offer.
	const { profileId } = await relayView(page, "testnet")
	await deleteRelay(page, "testnet", "Testnet")
	await forgetRelayOffer(page, profileId, "testnet")

	page = await restartAndUnlock(extension, page)
	const converted = await pollUntil(
		() => relayView(page, "testnet"),
		(view) => view.relayAt !== -1,
		{ label: "the Testnet relay given at unlock", timeoutMs: 30_000, intervalMs: 250 },
	)
	expect(converted.labels).toEqual(["dRPC", RELAY_LABEL])
	expect(converted.relayAt).toBe(converted.ids.length - 1)
	expect((await readSeedOffers(page, profileId))?.relay).toEqual(["mainnet", "testnet"])
	// The popup reads its networks once at unlock, which can precede the conversion's write and hears
	// no later one, so the person meets the relay at their next open, as this one does.
	await page.close()
	page = await openPopup(extension)
	await setViewport(page, VIEWPORT)
	await waitForHash(page, "#/popup/general")
	expect(await shownEndpointIds(page, "Testnet")).toEqual(converted.ids)
	await shotEndpoints(page, "p112-04-built-02")

	// Removed again, it stays removed. Alpha's relay, removed with its offer forgotten, is the
	// control: its return shows the pass ran, and the next locked read waits for the pass to end.
	await deleteRelay(page, "testnet", "Testnet")
	await deleteRelay(page, "mainnet", "Alpha")
	await forgetRelayOffer(page, profileId, "mainnet")
	page = await restartAndUnlock(extension, page)
	await pollUntil(
		() => relayView(page, "mainnet"),
		(view) => view.relayAt !== -1,
		{ label: "the Alpha relay given back with its offer", timeoutMs: 30_000, intervalMs: 250 },
	)
	await callService(page, NETWORK_SERVICE_NAME, "getOrInitNetworks")
	expect((await relayView(page, "testnet")).relayAt).toBe(-1)
	expect((await readSeedOffers(page, profileId))?.relay).toEqual(["mainnet", "testnet"])

	expect(extension.pageErrors).toEqual([])
}, 150_000)
