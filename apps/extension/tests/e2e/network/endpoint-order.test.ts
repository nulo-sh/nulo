/**
 * The Local Network's endpoint list on two relays in front of the local node, A first and B second,
 * with the network page left open throughout. B is dragged to the first place: the order is written,
 * the account engine's rebuilt route reaches B on its next reads and B's dot turns green on the open
 * page. B is then killed: its dot turns red and A's green, still without reopening the page, and B's
 * edit sheet shows the error line.
 *
 * Failure mode: a reorder written to the row that never reaches the routed runtime, or a page whose
 * dots never follow the router once it is open. The unit and component layers fake one side of each:
 * the write and the router run in two contexts and the dots cross three, which only the extension
 * has. Account-engine reads come from a second popup page entering Home, never from the network page.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import type { AztecTestConfig } from "../fixtures/aztec"
import { bringToFront, isFirefox, setViewport } from "../fixtures/browser"
import { openPopup, test, waitForHash } from "../fixtures/extension"
import { navigateToSettings, openNetworkDetail, waitForToast } from "../fixtures/helpers"
import { rewriteActiveNetwork, type StoredNetwork } from "../fixtures/networks"
import { pollUntil } from "../fixtures/poll"
import { readyHolder, routeEvents } from "../fixtures/route-send"
import { startRpcRelay } from "../fixtures/rpc-relay"
import { callService } from "../fixtures/session"
import { setDeveloperMode } from "../fixtures/settings"
import { shotSend } from "../fixtures/shots"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const SPEC = "endpoint-order"
const step = (message: string) => console.log(`[${SPEC}] ${message}`)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** The popup's size; Firefox's resize takes no scale factor. */
const VIEWPORT = isFirefox ? { width: 360, height: 600 } : { width: 360, height: 600, deviceScaleFactor: 2 }

const row = (id: string) => `[data-testid="endpoint-row"][data-endpoint-id="${id}"]`

/** Each endpoint's dot on the open page, by id; read by interval, never by frame, so a page behind
 *  another tab still answers. */
async function waitForTones(page: Page, want: Record<string, string>, label: string, between: () => Promise<unknown>) {
	const read = () =>
		page.evaluate(
			(ids: string[]) =>
				Object.fromEntries(
					ids.map((id) => [id, document.querySelector(`[data-endpoint-id="${id}"]`)?.getAttribute("data-endpoint-tone") ?? null]),
				),
			Object.keys(want),
		)
	return pollUntil(read, (tones) => Object.entries(want).every(([id, tone]) => tones[id] === tone), {
		label,
		timeoutMs: 180_000,
		intervalMs: 1_000,
		between,
	})
}

/** The account engine's router events since `since` once they show `id` holding the role, ready.
 *  The logger stores its lines a little after the dot can change, so the read is polled. */
const routerHolds = (page: Page, since: number, id: string, label: string) =>
	pollUntil(
		() => routeEvents(page, since),
		(events) => readyHolder(events, "pxe") === id,
		{ label, timeoutMs: 30_000, intervalMs: 1_000 },
	)

/** Another popup page entering Home, whose balance reads go through the account engine. */
async function nudge(driver: Page): Promise<void> {
	await driver.evaluate(() => {
		window.location.hash = "#/popup/settings"
	})
	await sleep(300)
	await driver.evaluate(() => {
		window.location.hash = "#/popup/general"
	})
	await sleep(2_000)
}

/** Presses `id`'s handle and moves the pointer `rows` rows; the button stays down. */
async function liftBy(page: Page, id: string, rows: number): Promise<void> {
	const at = await page.$eval(row(id), (el) => {
		const handle = el.querySelector('[data-testid="endpoint-drag-handle"]')?.getBoundingClientRect()
		return handle && { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2, height: el.getBoundingClientRect().height }
	})
	if (!at) throw new Error("the row has no drag handle")
	await page.mouse.move(at.x, at.y)
	await page.mouse.down()
	await page.mouse.move(at.x, at.y + rows * at.height, { steps: 12 })
}

const places = (page: Page) =>
	page.$$eval('[data-testid="endpoint-row"]', (rows) =>
		rows.map((r) => [r.getAttribute("data-endpoint-id"), r.querySelector('[data-testid="endpoint-position"]')?.textContent?.trim()]),
	)

test.skipIf(!aztecConfig)(
	"endpoint-order — a dragged first endpoint is used at once, and the open page's dots follow the router",
	{ timeout: 600_000, retry: 0 },
	async ({ tokenReadyExtension: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const a = await startRpcRelay(config.nodeUrl, "endpoint-order-a")
		const b = await startRpcRelay(config.nodeUrl, "endpoint-order-b")
		try {
			const startedAt = Date.now()
			const setup = await openPopup(ctx)
			await waitForHash(setup, "#/popup/general", 30_000)
			await setDeveloperMode(setup, true)
			const [idA, idB] = [crypto.randomUUID().slice(0, 8), crypto.randomUUID().slice(0, 8)]
			const network = (await rewriteActiveNetwork(setup, (n) => {
				const primary = n.endpoints.find((e) => e.id === n.primaryEndpointId)
				if (n.kind !== "local" || !primary) return false
				n.endpoints = [
					{ ...primary, id: idA, rpcUrl: a.url },
					{ ...primary, id: idB, rpcUrl: b.url },
				]
				n.primaryEndpointId = idA
				return true
			})) as StoredNetwork
			expect(network, "the active network is the Local Network").toBeDefined()
			await setup.close()

			const driver = await openPopup(ctx)
			await waitForHash(driver, "#/popup/general", 30_000)
			const page = await openPopup(ctx)
			await setViewport(page, VIEWPORT)
			await waitForHash(page, "#/popup/general", 30_000)
			await navigateToSettings(page, "networks")
			await openNetworkDetail(page, network.name)
			await page.evaluate(() => {
				;(window as unknown as { __opened?: number }).__opened = 1
			})
			const opened = () => page.evaluate(() => (window as unknown as { __opened?: number }).__opened)

			step("at rest: the account engine on A, B never asked")
			await waitForTones(page, { [idA]: "green", [idB]: "gray" }, "A green, B grey", () => nudge(driver))
			await bringToFront(page)
			await shotSend(page, "endpoint-order-rest", "endpoint-add-btn")

			step("B dragged to the first place")
			await liftBy(page, idB, -1)
			expect(await places(page), "the numbers show the places a drop would give").toEqual([
				[idA, "2"],
				[idB, "1"],
			])
			await shotSend(page, "endpoint-order-mid-drag", "endpoint-add-btn")
			const droppedAt = Date.now()
			await page.mouse.up()
			await waitForToast(page, "Primary endpoint updated", 15_000)
			const stored = await callService<{ id: string; endpoints: { id: string }[]; primaryEndpointId: string }[]>(
				page,
				NETWORK_SERVICE_NAME,
				"getNetworks",
			)
			const written = stored.find((n) => n.id === network.id)
			expect(
				written?.endpoints.map((e) => e.id),
				"the stored order",
			).toEqual([idB, idA])
			expect(written?.primaryEndpointId).toBe(idB)

			step("the next account-engine reads reach B, and its dot turns green on the open page")
			await waitForTones(page, { [idB]: "green" }, "B green", () => nudge(driver))
			await routerHolds(page, droppedAt, idB, "the account engine's router holds B ready")
			expect(await opened(), "the page was never reloaded").toBe(1)

			step("B killed: B red and A green, the page still open")
			const killedAt = Date.now()
			await b.kill()
			await waitForTones(page, { [idB]: "red", [idA]: "green" }, "B red, A green", () => nudge(driver))
			const events = await routerHolds(page, droppedAt, idA, "the account engine's router holds A ready")
			expect(
				events.some(
					(e) =>
						e.source === "pxe" && e.event === "state" && e.endpointId === idB && e.state === "down" && e.timestamp >= killedAt,
				),
				"the account engine's router took B down after the kill",
			).toBe(true)
			expect(await opened(), "the page was never reloaded").toBe(1)
			await bringToFront(page)
			await shotSend(page, "endpoint-order-primary-killed", "endpoint-add-btn")

			step("B's edit sheet: the red dot, its word and the error line")
			await page.$eval(row(idB), (el) => el.querySelector<HTMLElement>('[data-testid="endpoint-edit-btn"]')?.click())
			await page.waitForSelector('[data-testid="endpoint-edit-status"][data-tone="red"]', { visible: true, timeout: 10_000 })
			const line = await page.$eval('[data-testid="endpoint-edit-status-detail"]', (el) => el.textContent?.trim())
			expect(line).toMatch(/^No answer since \d+ (s|min) ago\. The connection failed\.$/)
			await shotSend(page, "endpoint-order-failing-sheet", "endpoint-edit-status")
			step(`done in ${Math.round((Date.now() - startedAt) / 1000)} s after the fixture`)
		} finally {
			await a.close()
			await b.close()
		}
	},
)
