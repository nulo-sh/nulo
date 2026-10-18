/**
 * A fake `@/wallet/services/price/client` for a component that owns its price client and runs the real
 * `usePrices`: every client answers with one fresh Fee Juice quote at `priceFake.usd` (none while it is
 * undefined) and is kept in `priceFake.clients`, so a test counts the price reads a screen began.
 *
 *   vi.mock("@/wallet/services/price/client", async () => (await import("<path>/price-client-fake")).priceClientModule())
 */
import { vi } from "vitest"

export function feeJuiceSnapshot(usd: number | undefined) {
	return {
		quotes: usd === undefined ? {} : { aztec: { coingeckoId: "aztec", usd, fetchedAt: Date.now(), providerUpdatedAt: null } },
		pricedTokens: {},
		flaggedTokens: [],
	}
}

function createClient() {
	const client = {
		disconnect: vi.fn(),
		onQuotesUpdated: { add: vi.fn(), remove: vi.fn() },
		onConnected: { add: vi.fn(), remove: vi.fn() },
		getQuotes: vi.fn(async () => feeJuiceSnapshot(priceFake.usd)),
		refreshIfStale: vi.fn(async () => feeJuiceSnapshot(priceFake.usd)),
	}
	priceFake.clients.push(client)
	return client
}

export const priceFake = {
	usd: undefined as number | undefined,
	clients: [] as ReturnType<typeof createClient>[],
	reset(usd: number | undefined) {
		priceFake.usd = usd
		priceFake.clients.length = 0
	},
	/** Every `refreshIfStale` the clients created so far received. */
	refreshes: () => priceFake.clients.reduce((n, c) => n + c.refreshIfStale.mock.calls.length, 0),
}

// Vitest 4 constructs a mock with `new`, so its implementation is a function, never an arrow.
export const priceClientModule = () => ({ PriceServiceClient: vi.fn(createClient) })
