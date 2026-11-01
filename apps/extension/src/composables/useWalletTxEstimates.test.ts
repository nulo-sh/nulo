import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { effectScope, ref } from "vue"
import { useToast } from "@/composables/toast"
import type { TransferFeeEstimate } from "@/wallet/services/execution/spec"
import { useWalletTxEstimates } from "./useWalletTxEstimates"

type P = { network: string; fee: number }

const estimateFor = (p: P) => ({ maxFee: `${p.network}:${p.fee}`, gasDetails: {} }) as unknown as TransferFeeEstimate

function setup(initial: Record<number, P | undefined> = { 0: { network: "A", fee: 1 } }) {
	const inputs = ref<Record<number, P | undefined>>({ ...initial })
	const scope = ref(0)
	const estimate = vi.fn(async (p: P, _token: string, _flowKey: string) => estimateFor(p))
	const cancel = vi.fn(async (_token: string) => {})
	const onError = vi.fn()
	const effect = effectScope()
	const estimates = effect.run(() =>
		useWalletTxEstimates<P>({
			estimate,
			cancel,
			paramsOf: (key) => inputs.value[key],
			keys: () => Object.keys(inputs.value).map(Number),
			scope: () => scope.value,
			onError,
		}),
	)!
	return { inputs, scope, estimate, cancel, onError, estimates, stop: () => effect.stop() }
}

const lands = () => vi.advanceTimersByTimeAsync(500)
const { toast, openToast, closeToast } = useToast()
const FAILURE = "Couldn't estimate fee. Try again."

beforeEach(() => {
	vi.useFakeTimers()
})
afterEach(() => {
	closeToast()
	vi.useRealTimers()
})

describe("useWalletTxEstimates", () => {
	test("refresh asks with the key's inputs after the debounce, and the answer lands under that key", async () => {
		const { estimate, estimates } = setup()
		estimates.refresh(0)
		expect(estimate).not.toHaveBeenCalled()
		await lands()
		expect(estimate).toHaveBeenCalledWith({ network: "A", fee: 1 }, expect.any(String), expect.any(String), expect.any(AbortSignal))
		expect(estimates.results.value[0]?.maxFee).toBe("A:1")
		expect(estimates.landed()).toBe(true)
	})

	test("each key estimates on its own slot", async () => {
		const { estimate, estimates } = setup({ 0: { network: "A", fee: 1 }, 1: { network: "A", fee: 2 } })
		estimates.refreshAll()
		await lands()
		const flowKeys = estimate.mock.calls.map((c) => c[2])
		expect(new Set(flowKeys).size).toBe(2)
		expect([estimates.results.value[0]?.maxFee, estimates.results.value[1]?.maxFee]).toEqual(["A:1", "A:2"])
	})

	test("landed holds only once every key has an answer, and never for no keys", async () => {
		const empty = setup({})
		expect(empty.estimates.landed()).toBe(false)

		const { inputs, estimates } = setup({ 0: { network: "A", fee: 1 }, 1: undefined })
		estimates.refreshAll()
		await lands()
		expect(estimates.landed()).toBe(false)
		inputs.value[1] = { network: "A", fee: 2 }
		estimates.refresh(1)
		await lands()
		expect(estimates.landed()).toBe(true)
	})

	test("short holds while any key's payer was read short of its fee", async () => {
		const { estimate, estimates } = setup({ 0: { network: "A", fee: 1 }, 1: { network: "A", fee: 2 } })
		estimate.mockImplementation(async (p: P) => ({
			...estimateFor(p),
			...(p.fee === 2 ? { feeJuiceShortfall: { maxFee: "2", balance: "1" } } : {}),
		}))
		estimates.refreshAll()
		await lands()
		expect(estimates.landed()).toBe(true)
		expect(estimates.short()).toBe(true)
	})

	test("a refresh drops the key's answer at once, before the new one is asked", async () => {
		const { inputs, estimates } = setup()
		estimates.refresh(0)
		await lands()
		inputs.value[0] = { network: "A", fee: 3 }
		estimates.refresh(0)
		expect(estimates.landed()).toBe(false)
		await lands()
		expect(estimates.results.value[0]?.maxFee).toBe("A:3")
	})

	test("inputs that cannot be estimated cancel the key and clear its answer", async () => {
		const { inputs, estimate, estimates } = setup()
		estimates.refresh(0)
		await lands()
		inputs.value[0] = undefined
		estimates.refresh(0)
		await lands()
		expect(estimate).toHaveBeenCalledTimes(1)
		expect(estimates.results.value[0]).toBeNull()
	})

	test("a scope change re-asks every key synchronously", async () => {
		const { inputs, scope, estimates } = setup()
		estimates.refresh(0)
		await lands()
		inputs.value[0] = { network: "B", fee: 1 }
		scope.value += 1
		expect(estimates.landed()).toBe(false)
		await lands()
		expect(estimates.results.value[0]?.maxFee).toBe("B:1")
	})

	test("an answer for the network just left is dropped, and its run is cancelled remotely", async () => {
		const { inputs, scope, estimate, cancel, estimates } = setup()
		let resolveA!: (v: TransferFeeEstimate) => void
		estimate.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
		estimates.refresh(0)
		await lands()
		const tokenA = estimate.mock.calls[0]?.[1]
		inputs.value[0] = { network: "B", fee: 1 }
		scope.value += 1
		expect(cancel).toHaveBeenCalledWith(tokenA)
		resolveA(estimateFor({ network: "A", fee: 1 }))
		await vi.advanceTimersByTimeAsync(0)
		expect(estimates.results.value[0] ?? null).toBeNull()
		await lands()
		expect(estimates.results.value[0]?.maxFee).toBe("B:1")
	})

	test("a failure marks its key and opens one snack, which closes once no key stands failed", async () => {
		const { estimate, onError, estimates } = setup({ 0: { network: "A", fee: 1 }, 1: { network: "A", fee: 2 } })
		const down = new Error("node down")
		const slow = new Error("node slow")
		estimate.mockRejectedValueOnce(down).mockRejectedValueOnce(slow)
		estimates.refreshAll()
		await lands()
		expect(estimates.failed.value).toEqual({ 0: true, 1: true })
		expect(onError.mock.calls).toEqual([[down], [slow]])
		expect(toast.value).toMatchObject({ kind: "error", label: FAILURE })
		expect(estimates.landed()).toBe(false)

		estimates.refresh(0)
		expect(toast.value?.label).toBe(FAILURE)
		estimates.refresh(1)
		expect(toast.value).toBeNull()
		await lands()
		expect(estimates.landed()).toBe(true)
	})

	test("a snack opened after the failure survives its refresh; cancelAll closes the failure's own snack", async () => {
		const { estimate, estimates } = setup()
		estimate.mockRejectedValueOnce(new Error("node down")).mockRejectedValueOnce(new Error("node down"))
		estimates.refresh(0)
		await lands()
		const later = openToast({ kind: "info", label: "Another report" })
		estimates.refresh(0)
		expect(toast.value?.id).toBe(later)

		closeToast()
		await lands()
		expect(toast.value?.label).toBe(FAILURE)
		estimates.cancelAll()
		expect(toast.value).toBeNull()
		expect(estimates.failed.value).toEqual({})
	})

	test("cancelAll cancels a run in flight and clears every answer", async () => {
		const { estimate, cancel, estimates } = setup({ 0: { network: "A", fee: 1 }, 1: { network: "A", fee: 2 } })
		estimate.mockImplementationOnce(() => new Promise(() => {}))
		estimates.refreshAll()
		await lands()
		estimates.cancelAll()
		expect(cancel).toHaveBeenCalledWith(estimate.mock.calls[0]?.[1])
		expect(estimates.landed()).toBe(false)
	})

	test("a remote cancel that fails is swallowed", async () => {
		const { estimate, cancel, estimates } = setup()
		cancel.mockRejectedValueOnce(new Error("port closed"))
		estimate.mockImplementationOnce(() => new Promise(() => {}))
		estimates.refresh(0)
		await lands()
		expect(() => estimates.cancelAll()).not.toThrow()
		await vi.advanceTimersByTimeAsync(0)
	})

	test("after dispose a scope change asks nothing", async () => {
		const { scope, estimate, estimates } = setup()
		estimates.dispose()
		scope.value += 1
		await lands()
		expect(estimate).not.toHaveBeenCalled()
	})
})
