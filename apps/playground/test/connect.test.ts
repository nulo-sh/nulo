/**
 * `connect()` against a scripted wallet-sdk manager: each press runs one discovery, and only the
 * latest press may write the page's state. The fake discovery ends its wallet stream at once on
 * `cancel`, as the SDK's does.
 */
import { beforeEach, expect, mock, test } from "bun:test"

type Pending = { verificationHash: string; confirm: () => Promise<unknown>; cancel: () => void }

function fakeDiscovery() {
	let settle!: (provider: unknown) => void
	const found = new Promise<unknown>((resolve) => {
		settle = resolve
	})
	const cancel = mock(() => settle(undefined))
	async function* wallets() {
		const provider = await found
		if (provider) yield provider
	}
	return { session: { wallets: wallets(), done: found.then(() => {}), cancel }, find: settle, timeOut: () => settle(undefined), cancel }
}

function fakeProvider(name: string) {
	let establish!: () => void
	const established = new Promise<void>((resolve) => {
		establish = resolve
	})
	const wallet = { name }
	const pending: Pending = { verificationHash: `0x${name}`, confirm: mock(async () => wallet), cancel: mock(() => {}) }
	const provider = {
		name,
		establishSecureChannel: mock(async () => {
			await established
			return pending
		}),
		disconnect: mock(async () => {}),
	}
	return { provider, pending, wallet, establish }
}

const discoveries: ReturnType<typeof fakeDiscovery>[] = []
mock.module("@aztec-labs/wallet-sdk/manager", () => ({
	WalletManager: { configure: () => ({ getAvailableWallets: () => discoveries.shift()?.session }) },
}))
mock.module("@nulo/wallet-sdk-schema-patch/register", () => ({}))
// Under NODE_ENV=test the real module registers a field equality on `expect`, which Bun's lacks.
mock.module("@aztec-labs/foundation/curves/bn254", () => ({ Fr: { ZERO: 0, fromString: (value: string) => value } }))
Object.assign(globalThis, { window: { location: { href: "http://localhost/" } } })

const { connect, disconnect, getProvider, getWallet } = await import("../src/lib/wallet")
const { getState, setState } = await import("../src/state")

const turn = () => new Promise((resolve) => setTimeout(resolve, 0))

function presses(count: number) {
	const queued = Array.from({ length: count }, fakeDiscovery)
	discoveries.push(...queued)
	return queued
}

beforeEach(async () => {
	discoveries.length = 0
	await disconnect()
	setState({ status: "idle", lastError: null, verificationHash: null })
})

test("a superseded press whose discovery ends empty leaves the newer connection standing", async () => {
	const [first, second] = presses(2)
	const run1 = connect()
	const run2 = connect()
	const wallet = fakeProvider("b")
	second.find(wallet.provider)
	wallet.establish()
	await run2
	first.timeOut()

	await expect(run1).resolves.toBeUndefined()
	expect(first.cancel).toHaveBeenCalled()
	expect(getState().status).toBe("connected")
	expect(getProvider()).toBe(wallet.provider as never)
})

test("a press superseded while its channel is being established cancels that channel and writes nothing", async () => {
	const [first, second] = presses(2)
	const run1 = connect()
	const stale = fakeProvider("a")
	first.find(stale.provider)
	await turn()
	expect(stale.provider.establishSecureChannel).toHaveBeenCalled()

	const run2 = connect()
	const current = fakeProvider("b")
	second.find(current.provider)
	current.establish()
	await run2
	stale.establish()

	await expect(run1).resolves.toBeUndefined()
	expect(stale.pending.cancel).toHaveBeenCalled()
	expect(stale.pending.confirm).not.toHaveBeenCalled()
	expect(getState()).toMatchObject({ status: "connected", verificationHash: "0xb" })
	expect(getWallet()).toBe(current.wallet as never)
})

test("a lone press whose discovery ends empty reports no wallet", async () => {
	const [only] = presses(1)
	const run = connect()
	only.timeOut()

	await expect(run).rejects.toThrow("No wallet discovered")
})
