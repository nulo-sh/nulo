/**
 * A fake `@/wallet/services/price/client` for a component that owns its price client and runs the real
 * `usePrices`: every client answers with one fresh Fee Juice quote at `priceFake.usd` (none while it is
 * undefined) and the list's flagged keys in `priceFake.flagged`, and is kept in `priceFake.clients`, so
 * a test counts the refreshes and cache reads a screen began. `hold()` keeps every answer back until
 * `release()`.
 *
 *   vi.mock("@/wallet/services/price/client", async () => (await import("<path>/price-client-fake")).priceClientModule())
 */
import { vi } from "vitest"

export function feeJuiceSnapshot(usd: number | undefined, flaggedTokens: readonly string[] = []) {
	return {
		quotes: usd === undefined ? {} : { aztec: { coingeckoId: "aztec", usd, fetchedAt: Date.now(), providerUpdatedAt: null } },
		pricedTokens: {},
		flaggedTokens: [...flaggedTokens],
	}
}

let held: Promise<void> | undefined
let release: (() => void) | undefined

const answer = async () => {
	await held
	return feeJuiceSnapshot(priceFake.usd, priceFake.flagged)
}

type Listeners = { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }

const added = (event: Listeners): ((arg?: unknown) => void)[] => {
	const removed = new Set(event.remove.mock.calls.map(([listener]) => listener))
	return event.add.mock.calls.map(([listener]) => listener).filter((listener) => !removed.has(listener))
}

function createClient() {
	const client = {
		connect: vi.fn(),
		disconnect: vi.fn(),
		onQuotesUpdated: { add: vi.fn(), remove: vi.fn() },
		onConnected: { add: vi.fn(), remove: vi.fn() },
		getQuotes: vi.fn(answer),
		refreshIfStale: vi.fn(answer),
	}
	priceFake.clients.push(client)
	return client
}

export const priceFake = {
	usd: undefined as number | undefined,
	/** The flagged pairs every answer carries, as `flaggedKeysOf` keys them. */
	flagged: [] as string[],
	clients: [] as ReturnType<typeof createClient>[],
	reset(usd: number | undefined) {
		priceFake.usd = usd
		priceFake.flagged = []
		priceFake.clients.length = 0
		priceFake.release()
	},
	hold() {
		held = new Promise((resolve) => {
			release = resolve
		})
	},
	release() {
		release?.()
		held = release = undefined
	},
	/** A new snapshot, as the worker broadcasts it, to every listener still added. */
	broadcast() {
		const snapshot = feeJuiceSnapshot(priceFake.usd, priceFake.flagged)
		for (const client of priceFake.clients) for (const listener of added(client.onQuotesUpdated)) listener(snapshot)
	},
	/** A port reopened after a worker restart, as every client still listening hears it. */
	reconnect() {
		for (const client of priceFake.clients) for (const listener of added(client.onConnected)) listener()
	},
	/** Every `refreshIfStale` the clients created so far received. */
	refreshes: () => priceFake.clients.reduce((n, c) => n + c.refreshIfStale.mock.calls.length, 0),
	/** Every `getQuotes` the clients created so far received. */
	reads: () => priceFake.clients.reduce((n, c) => n + c.getQuotes.mock.calls.length, 0),
}

// Vitest 4 constructs a mock with `new`, so its implementation is a function, never an arrow.
export const priceClientModule = () => ({ PriceServiceClient: vi.fn(createClient) })
